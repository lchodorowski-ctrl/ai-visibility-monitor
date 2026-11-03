import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Device } from "@/lib/dataforseo/serp";
import type { CompetitorRank, SerpFeatures } from "./rank-parse";

/*
 * Reads of Google positions, through the user-session client: `rank_latest` is security definer with a membership gate
 * on auth.uid(), so the admin client (no user) would get nothing. PostgREST may return numeric and bigint as strings,
 * and the generated rpc types claim non-null for columns that are null at runtime, so every number goes through `num`;
 * the jsonb columns (`features`, `competitors`) are parsed defensively: a malformed entry is dropped.
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
