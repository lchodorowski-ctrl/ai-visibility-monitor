import { cache } from "react";
import type { Tables } from "@/lib/db-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeDomainInput } from "@/lib/validation/settings";
import { MAX_TRACKED } from "./keyword-volumes";
import { pickRivals } from "./keyword-research";

/*
 * Reads for the "Frazy" page, all through the user-session client (RLS limits them to the user's organization).
 * PostgREST may return numeric and bigint columns as strings, so every number goes through `num`; the jsonb columns
 * (`monthly_searches`, `trend`, `competitor_positions`) are parsed defensively: a malformed entry is dropped.
 */

/** Numeric value or null (never 0 for a missing value). */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** One month of Google Ads volume; `searchVolume` is null when Google gave no number for that month. */
export interface MonthlySearch { year: number; month: number; searchVolume: number | null }
/** One complete week of Google Trends (0-100 relative to the anchor phrase); null when the week has no reading. */
export interface TrendPoint { week: string; value: number | null }
export interface CompetitorPosition { name: string; domain: string; position: number; url: string }

export interface KeywordRow {
  id: string;
  text: string;
  key: string;
  source: string;
  targetPath: string | null;
  active: boolean;
  searchVolume: number | null;
  competition: string | null;
  competitionIndex: number | null;
  /** USD. */
  cpc: number | null;
  /** Oldest month first (stored newest first), ready for a sparkline. */
  monthlySearches: MonthlySearch[];
  /** Oldest week first. */
  trend: TrendPoint[];
  volumeUpdatedAt: string | null;
  trendUpdatedAt: string | null;
}

export interface SuggestionRow {
  id: string;
  key: string;
  text: string;
  seed: string | null;
  source: "labs" | "ranked" | "gap";
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  ownPosition: number | null;
  ownUrl: string | null;
  /** Rivals ranking for the phrase, best (lowest) position first. */
  competitors: CompetitorPosition[];
  /** When the research last refreshed the row (ISO timestamp). */
  updatedAt: string;
  /** The phrase is in `keywords` already; only the `ranked` list can hold such rows. */
  tracked: boolean;
}

/** Months from `monthly_searches` (stored newest first), oldest first. */
function parseMonthly(json: unknown): MonthlySearch[] {
  if (!Array.isArray(json)) return [];
  const months: MonthlySearch[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const year = num(item.year);
    const month = num(item.month);
    if (year === null || month === null) continue;
    months.push({ year, month, searchVolume: num(item.searchVolume) });
  }
  return months.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
}

/** Weekly points of `trend`, oldest first (ISO dates sort as text). */
function parseTrend(json: unknown): TrendPoint[] {
  if (!Array.isArray(json)) return [];
  const points: TrendPoint[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const week = str(item.week);
    if (week === null) continue;
    points.push({ week, value: num(item.value) });
  }
  return points.sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
}

function parseCompetitors(json: unknown): CompetitorPosition[] {
  if (!Array.isArray(json)) return [];
  const rivals: CompetitorPosition[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const position = num(item.position);
    const name = str(item.name);
    if (position === null || name === null) continue;
    rivals.push({ name, domain: str(item.domain) ?? "", position, url: str(item.url) ?? "" });
  }
  return rivals.sort((a, b) => a.position - b.position);
}

/** Tracked phrases, largest monthly volume first and the ones without a volume last (at most `MAX_TRACKED`). */
export const getKeywords = cache(async (projectId: string): Promise<KeywordRow[]> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("keywords").select("*").eq("project_id", projectId)
    .order("search_volume", { ascending: false, nullsFirst: false })
    .order("text", { ascending: true })
    .limit(MAX_TRACKED);
  if (error) throw new Error(`Nie udało się pobrać fraz: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    text: r.text,
    key: r.key,
    source: r.source,
    targetPath: r.target_path,
    active: r.active,
    searchVolume: num(r.search_volume),
    competition: r.competition,
    competitionIndex: num(r.competition_index),
    cpc: num(r.cpc),
    monthlySearches: parseMonthly(r.monthly_searches),
    trend: parseTrend(r.trend),
    volumeUpdatedAt: r.volume_updated_at,
    trendUpdatedAt: r.trend_updated_at,
  }));
});

/** The default row cap of PostgREST; a longer list of phrases is cut here. */
const KEY_ROWS = 1000;

/** Keys of every phrase in `keywords` (active or not): what a suggestion must not repeat. */
const getTrackedKeys = cache(async (projectId: string): Promise<Set<string>> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("keywords").select("key").eq("project_id", projectId).limit(KEY_ROWS);
  if (error) throw new Error(`Nie udało się pobrać śledzonych fraz: ${error.message}`);
  return new Set((data ?? []).map((r) => r.key));
});

/**
 * Suggestions of one source. The inbox lists (`labs`, `gap`) hold only new rows without phrases that are already
 * tracked: a phrase added by hand after a research run stays in the inbox with status `new`, and offering "Śledź" for
 * it again would be a duplicate. `ranked` is a view, not an inbox: it lists every row of the project (any status,
 * tracked or not, marked with `tracked`), because it answers "where do we already rank". It goes by our position
 * (best first), the others by monthly volume; phrases without a number come last. The tracked ones of an inbox are
 * filtered after reading, so the query asks for that many extra rows and `limit` is still reached.
 */
export const getSuggestions = cache(async (projectId: string, source: SuggestionRow["source"], limit = 100): Promise<SuggestionRow[]> => {
  const supabase = await createServerSupabase();
  const tracked = await getTrackedKeys(projectId);
  const view = source === "ranked";
  const rows = supabase.from("keyword_suggestions").select("*").eq("project_id", projectId).eq("source", source);
  const inbox = view ? rows : rows.eq("status", "new");
  const byVolume = { ascending: false, nullsFirst: false };
  const ordered = view
    ? inbox.order("own_position", { ascending: true, nullsFirst: false }).order("search_volume", byVolume)
    : inbox.order("search_volume", byVolume);
  const { data, error } = await ordered
    .order("text", { ascending: true })
    .limit(view ? limit : Math.min(limit + tracked.size, KEY_ROWS));
  if (error) throw new Error(`Nie udało się pobrać podpowiedzi fraz: ${error.message}`);
  return (data ?? [])
    .filter((r) => view || !tracked.has(r.key))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      key: r.key,
      text: r.text,
      seed: r.seed,
      source,
      searchVolume: num(r.search_volume),
      keywordDifficulty: num(r.keyword_difficulty),
      cpc: num(r.cpc),
      ownPosition: num(r.own_position),
      ownUrl: r.own_url,
      competitors: parseCompetitors(r.competitor_positions),
      updatedAt: r.updated_at,
      tracked: tracked.has(r.key),
    }));
});

/** The latest volume measurement and the latest phrase research of a project (null before the first run). */
export const getKeywordJobs = cache(async (projectId: string): Promise<{ volumes: Tables<"seo_jobs"> | null; research: Tables<"seo_jobs"> | null }> => {
  const supabase = await createServerSupabase();
  const latest = (kind: "keyword_volumes" | "keyword_research") =>
    supabase.from("seo_jobs").select("*").eq("project_id", projectId).eq("kind", kind)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
  const [volumes, research] = await Promise.all([latest("keyword_volumes"), latest("keyword_research")]);
  if (volumes.error) throw new Error(`Nie udało się pobrać zadań fraz: ${volumes.error.message}`);
  if (research.error) throw new Error(`Nie udało się pobrać zadań fraz: ${research.error.message}`);
  return { volumes: volumes.data ?? null, research: research.data ?? null };
});

/**
 * Domains a phrase research checks, by the same rules as `runKeywordResearch`: our own (the first of the project's
 * domains) and the rivals, chosen by the very same `pickRivals` (same order, same dedupe), so the cost shown here is
 * the one the job charges. Rivals count only with an own domain: without it every rival phrase would look like a gap.
 */
export const getResearchTargets = cache(async (projectId: string, ownDomain: string): Promise<{ own: string | null; rivals: number }> => {
  const own = normalizeDomainInput(ownDomain) || null;
  if (!own) return { own: null, rivals: 0 };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("competitors").select("name, domains").eq("project_id", projectId).order("name", { ascending: true });
  if (error) throw new Error(`Nie udało się pobrać konkurentów: ${error.message}`);
  return { own, rivals: pickRivals(data ?? [], own).length };
});
