import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Device } from "@/lib/dataforseo/serp";
import { toKeywordRow, type KeywordRow } from "./keyword-queries";
import { gscWindows, shiftDate } from "./overview";
import { getGscLastDate } from "./queries";
import type { CompetitorRank, SerpEntry, SerpFeatures } from "./rank-parse";

/*
 * Reads of Google positions, through the user-session client: `rank_latest` is security definer with a membership gate
 * on auth.uid(), so the admin client (no user) would get nothing. PostgREST may return numeric and bigint as strings,
 * and the generated rpc types claim non-null for columns that are null at runtime, so every number goes through `num`;
 * the jsonb columns (`features`, `competitors`, `top10`) are parsed defensively: a malformed entry is dropped.
 */

/** Numeric value or null (never 0 for a missing value). */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** One finished check of a phrase on one device, with the previous finished check for the week-to-week change. */
export interface RankView {
  /** Monday of the checked week (YYYY-MM-DD). */
  weekStart: string;
  /** Position in the organic results; null when the domain is outside the checked top 100. */
  position: number | null;
  rankAbsolute: number | null;
  /** Ranking address; null when the domain is outside the top 100 or Google hid the address behind a redirect. */
  url: string | null;
  breadcrumb: string | null;
  features: SerpFeatures;
  /** Rivals found in the results, best (lowest) position first. */
  competitors: CompetitorRank[];
  checkedAt: string | null;
  /** The earlier finished check, null at the first one. Its position is null when we were outside the top 100 then. */
  prevWeekStart: string | null;
  prevPosition: number | null;
}

/** A flag counts only when it is exactly `true`: a missing or odd value means "not present". */
function parseFeatures(json: unknown): SerpFeatures {
  const f = isRecord(json) ? json : {};
  return {
    aiOverview: f.aiOverview === true,
    aiOverviewCitesUs: f.aiOverviewCitesUs === true,
    featuredSnippet: f.featuredSnippet === true,
    featuredSnippetOurs: f.featuredSnippetOurs === true,
    localPack: f.localPack === true,
    peopleAlsoAsk: f.peopleAlsoAsk === true,
    knowledgePanelOurs: f.knowledgePanelOurs === true,
  };
}

function parseCompetitors(json: unknown): CompetitorRank[] {
  if (!Array.isArray(json)) return [];
  const rivals: CompetitorRank[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const position = num(item.position);
    const name = str(item.name);
    if (position === null || name === null) continue;
    rivals.push({ name, domain: str(item.domain) ?? "", position, url: str(item.url) });
  }
  return rivals.sort((a, b) => a.position - b.position);
}

const isDevice = (v: unknown): v is Device => v === "desktop" || v === "mobile";

/**
 * The newest finished check of every phrase and device of the project (a phrase never checked, or only pending or
 * failed, is not in the map), keyed by keyword id.
 */
export const getLatestRanks = cache(async (projectId: string): Promise<Map<string, Partial<Record<Device, RankView>>>> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("rank_latest", { p_project: projectId });
  if (error) throw new Error(`Nie udało się pobrać pozycji: ${error.message}`);
  const ranks = new Map<string, Partial<Record<Device, RankView>>>();
  for (const r of data ?? []) {
    const weekStart = str(r.week_start);
    if (!isDevice(r.device) || weekStart === null) continue;
    const view: RankView = {
      weekStart,
      position: num(r.position),
      rankAbsolute: num(r.rank_absolute),
      url: str(r.url),
      breadcrumb: str(r.breadcrumb),
      features: parseFeatures(r.features),
      competitors: parseCompetitors(r.competitors),
      checkedAt: str(r.checked_at),
      prevWeekStart: str(r.prev_week_start),
      prevPosition: num(r.prev_position),
    };
    ranks.set(r.keyword_id, { ...ranks.get(r.keyword_id), [r.device]: view });
  }
  return ranks;
});

// --- Szczegóły frazy ----------------------------------------------------------------------------------------------

/** One week of the history chart: the position on each device, null when outside the top 100 or not checked that week. */
export interface RankHistoryPoint {
  /** Monday of the checked week (YYYY-MM-DD). */
  weekStart: string;
  desktop: number | null;
  mobile: number | null;
}

/** The newest finished check of a phrase on one device, with its snapshot of the results. */
export interface KeywordRankDetail
  extends Pick<RankView, "weekStart" | "position" | "url" | "breadcrumb" | "features" | "competitors" | "prevWeekStart" | "prevPosition"> {
  /** The ten best organic results of that check, best first. */
  top10: SerpEntry[];
}

/** One page of the site that Google showed for the phrase. */
export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  /** Average position weighted by impressions. */
  position: number | null;
}

export interface KeywordDetail {
  keyword: KeywordRow;
  /** Finished checks, oldest week first. */
  history: RankHistoryPoint[];
  /** A device that was never checked has no entry. */
  latest: Partial<Record<Device, KeywordRankDetail>>;
  /** Pages ranking for the phrase in the last 28 days of Search Console data; empty without impressions. */
  gsc: GscPageRow[];
}

function parseTop10(json: unknown): SerpEntry[] {
  if (!Array.isArray(json)) return [];
  const entries: SerpEntry[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const position = num(item.position);
    if (position === null) continue;
    entries.push({ position, domain: str(item.domain) ?? "", url: str(item.url), title: str(item.title) ?? "", breadcrumb: str(item.breadcrumb) });
  }
  return entries.sort((a, b) => a.position - b.position);
}

type Db = Awaited<ReturnType<typeof createServerSupabase>>;

const byWeek = (a: { weekStart: string }, b: { weekStart: string }) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0);

/** Every finished check of the phrase, oldest week first; the snapshot columns are parsed only for the newest check of a device. */
async function readChecks(supabase: Db, projectId: string, keywordId: string): Promise<{ history: RankHistoryPoint[]; latest: KeywordDetail["latest"] }> {
  const { data, error } = await supabase
    .from("rank_checks").select("device, week_start, position, url, breadcrumb, features, top10, competitors")
    .eq("project_id", projectId).eq("keyword_id", keywordId).eq("status", "done")
    .order("week_start", { ascending: true });
  if (error) throw new Error(`Nie udało się pobrać pozycji frazy: ${error.message}`);
  const checks = (data ?? []).flatMap((r) => {
    const weekStart = str(r.week_start);
    return isDevice(r.device) && weekStart !== null ? [{ device: r.device, weekStart, row: r }] : [];
  }).sort(byWeek);

  const points = new Map<string, RankHistoryPoint>();
  for (const { device, weekStart, row } of checks) {
    const point = points.get(weekStart) ?? { weekStart, desktop: null, mobile: null };
    point[device] = num(row.position);
    points.set(weekStart, point);
  }

  const latest: KeywordDetail["latest"] = {};
  for (const device of ["desktop", "mobile"] as const) {
    const own = checks.filter((c) => c.device === device);
    const last = own[own.length - 1];
    if (!last) continue;
    const prev = own[own.length - 2];
    latest[device] = {
      weekStart: last.weekStart,
      position: num(last.row.position),
      url: str(last.row.url),
      breadcrumb: str(last.row.breadcrumb),
      features: parseFeatures(last.row.features),
      competitors: parseCompetitors(last.row.competitors),
      top10: parseTop10(last.row.top10),
      prevWeekStart: prev?.weekStart ?? null,
      prevPosition: prev ? num(prev.row.position) : null,
    };
  }
  return { history: [...points.values()], latest };
}

/** Pages ranking for the phrase in the 28 days up to the last day with Search Console data (most impressions first). */
async function readGscPages(supabase: Db, projectId: string, query: string): Promise<GscPageRow[]> {
  const lastDate = await getGscLastDate(projectId);
  if (lastDate === null) return [];
  const { from, to } = gscWindows(lastDate).cur;
  const { data, error } = await supabase.rpc("gsc_query_detail", { p_project: projectId, p_query: query, p_from: from, p_to: to });
  if (error) throw new Error(`Nie udało się pobrać frazy z Search Console: ${error.message}`);
  return (data ?? []).map((r) => ({ page: r.page, clicks: num(r.clicks) ?? 0, impressions: num(r.impressions) ?? 0, position: num(r.position) }));
}

/**
 * A tracked phrase with its rank history, the newest check of each device and the pages Search Console shows for it.
 * Null when the phrase is not in the project (the user-session client sees only its own organization's rows). The
 * phrase is looked up by the normalized `key`, which is how Search Console spells a query.
 */
export const getKeywordDetail = cache(async (projectId: string, keywordId: string): Promise<KeywordDetail | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("keywords").select("*").eq("id", keywordId).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`Nie udało się pobrać frazy: ${error.message}`);
  if (!data) return null;
  const keyword = toKeywordRow(data);
  const [{ history, latest }, gsc] = await Promise.all([
    readChecks(supabase, projectId, keywordId),
    readGscPages(supabase, projectId, keyword.key),
  ]);
  return { keyword, history, latest, gsc };
});

// --- Kierunek na przeglądzie ----------------------------------------------------------------------------------------

/** One finished desktop check of a phrase: what the "Kierunek" card on the overview compares week to week. */
export interface RankDirectionRow {
  keywordId: string;
  /** Monday of the checked week (YYYY-MM-DD). */
  weekStart: string;
  /** Position in the organic results; null when the domain is outside the checked top 100. */
  position: number | null;
}

/** How far back from the newest checked week the direction card reads: six weeks cover the 28-day baseline. */
const DIRECTION_WINDOW_DAYS = 42;

/**
 * Finished desktop checks (ruling M2-R6: the direction counts desktop positions only) of the 42 days up to the newest
 * checked week, in the user's session. Empty without a finished check. At most `MAX_RANK_KEYWORDS` phrases are checked
 * per week, so seven weeks stay under the 1000 rows PostgREST returns per request.
 */
export const getRankDirectionRows = cache(async (projectId: string): Promise<RankDirectionRow[]> => {
  const supabase = await createServerSupabase();
  const { data: newest, error: newestError } = await supabase
    .from("rank_checks").select("week_start")
    .eq("project_id", projectId).eq("status", "done").eq("device", "desktop")
    .order("week_start", { ascending: false }).limit(1).maybeSingle();
  if (newestError) throw new Error(`Nie udało się pobrać pozycji do podsumowania: ${newestError.message}`);
  const latest = str(newest?.week_start);
  if (latest === null) return [];

  const { data, error } = await supabase
    .from("rank_checks").select("keyword_id, week_start, position")
    .eq("project_id", projectId).eq("status", "done").eq("device", "desktop")
    .gte("week_start", shiftDate(latest, -DIRECTION_WINDOW_DAYS))
    .order("week_start", { ascending: true });
  if (error) throw new Error(`Nie udało się pobrać pozycji do podsumowania: ${error.message}`);
  return (data ?? []).flatMap((r) => {
    const keywordId = str(r.keyword_id);
    const weekStart = str(r.week_start);
    return keywordId !== null && weekStart !== null ? [{ keywordId, weekStart, position: num(r.position) }] : [];
  });
});

/** Number of active tracked phrases of the project: tells "add phrases" from "run the check" when there are no positions yet. */
export const countActiveKeywords = cache(async (projectId: string): Promise<number> => {
  const supabase = await createServerSupabase();
  const { count, error } = await supabase
    .from("keywords").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("active", true);
  if (error) throw new Error(`Nie udało się policzyć fraz: ${error.message}`);
  return count ?? 0;
});
