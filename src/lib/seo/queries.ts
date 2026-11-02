import { cache } from "react";
import type { Tables } from "@/lib/db-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { monthSpend } from "@/lib/budget";
import { seoMonthSpend } from "./budget";
import { THRESHOLDS, type Metrics, type PageMetrics, type QueryPage, type QueryWindow } from "./opportunities";
import { shiftDate, type GscWindows, type SiteDay } from "./overview";

/*
 * The aggregate functions are security definer and gated on auth.uid(): they are called only with the
 * user-session client (`createServerSupabase`); the admin client has no user and gets empty results.
 * PostgREST may return numeric and bigint as strings, and the generated rpc types claim non-null for
 * columns that are null at runtime, so every value goes through `num`.
 */

/** Numeric value or null (never 0 for a missing value). */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const count = (v: unknown): number => num(v) ?? 0;

/** Position is null whenever there are no impressions (a position without impressions means nothing). */
function metrics(clicks: unknown, impressions: unknown, position: unknown): Metrics {
  const imp = count(impressions);
  return { clicks: count(clicks), impressions: imp, position: imp > 0 ? num(position) : null };
}

export interface GscTotals { clicks: number | null; impressions: number | null; position: number | null }

/** Latest day with data in `gsc_site_daily`, or null before the first sync. */
export const getGscLastDate = cache(async (projectId: string): Promise<string | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("gsc_site_daily").select("date").eq("project_id", projectId).order("date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Nie udało się pobrać ostatniej daty z Search Console: ${error.message}`);
  return data?.date ?? null;
});

/** Site totals in a date window; all null when there is no data. */
export const getGscTotals = cache(async (projectId: string, from: string, to: string): Promise<GscTotals> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gsc_totals", { p_project: projectId, p_from: from, p_to: to });
  if (error) throw new Error(`Nie udało się pobrać sumy z Search Console: ${error.message}`);
  const row = data?.[0];
  return { clicks: num(row?.clicks), impressions: num(row?.impressions), position: num(row?.position) };
});

/** Daily site rows of the last `days` days up to the latest day with data (at most `days` rows, one per date). */
export const getGscSeries = cache(async (projectId: string, days = 90): Promise<SiteDay[]> => {
  const last = await getGscLastDate(projectId);
  if (!last) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("gsc_site_daily").select("date, clicks, impressions, position")
    .eq("project_id", projectId).gte("date", shiftDate(last, -(days - 1))).order("date");
  if (error) throw new Error(`Nie udało się pobrać trendu z Search Console: ${error.message}`);
  return (data ?? []).map((r) => ({ date: r.date, clicks: count(r.clicks), impressions: count(r.impressions), position: num(r.position) }));
});

// `cache` compares arguments by identity, so the windows object is flattened to strings to share one rpc between sections.
const queryWindows = cache(async (projectId: string, curFrom: string, curTo: string, prevFrom: string, prevTo: string, limit: number): Promise<QueryWindow[]> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gsc_query_windows", {
    p_project: projectId, p_cur_from: curFrom, p_cur_to: curTo, p_prev_from: prevFrom, p_prev_to: prevTo, p_limit: limit,
  });
  if (error) throw new Error(`Nie udało się pobrać fraz z Search Console: ${error.message}`);
  return (data ?? []).map((r) => ({
    query: r.query,
    cur: metrics(r.cur_clicks, r.cur_impressions, r.cur_position),
    prev: metrics(r.prev_clicks, r.prev_impressions, r.prev_position),
  }));
});

/** Queries of the current and the previous window (flat SQL rows mapped to nested `cur` / `prev`), largest by impressions first. */
export const getQueryWindows = (projectId: string, w: GscWindows, limit = 500): Promise<QueryWindow[]> =>
  queryWindows(projectId, w.cur.from, w.cur.to, w.prev.from, w.prev.to, limit);

/** Best pages by clicks in a date window. */
export const getTopPages = cache(async (projectId: string, from: string, to: string, limit = 10): Promise<PageMetrics[]> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gsc_top_pages", { p_project: projectId, p_from: from, p_to: to, p_limit: limit });
  if (error) throw new Error(`Nie udało się pobrać stron z Search Console: ${error.message}`);
  return (data ?? []).map((r) => ({ page: r.page, ...metrics(r.clicks, r.impressions, r.position) }));
});

const queryPages = cache(async (projectId: string, from: string, to: string, minImpressions: number): Promise<QueryPage[]> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("gsc_query_pages", { p_project: projectId, p_from: from, p_to: to, p_min_impressions: minImpressions });
  if (error) throw new Error(`Nie udało się pobrać fraz według stron z Search Console: ${error.message}`);
  return (data ?? []).map((r) => ({ query: r.query, page: r.page, ...metrics(r.clicks, r.impressions, r.position) }));
});

/** (query, page) rows of queries that two or more pages rank for; input of the cannibalization check. */
export const getQueryPages = (projectId: string, from: string, to: string, minImpressions: number = THRESHOLDS.cannibalMinImpressions): Promise<QueryPage[]> =>
  queryPages(projectId, from, to, minImpressions);

/** Last Search Console sync plus month-to-date spend: SEO (`seo_jobs`) and AI (`runs`). */
export const getSeoStatus = cache(async (projectId: string): Promise<{ lastSync: Tables<"seo_jobs"> | null; seoSpent: number; aiSpent: number }> => {
  const supabase = await createServerSupabase();
  const [last, seoSpent, aiSpent] = await Promise.all([
    supabase.from("seo_jobs").select("*").eq("project_id", projectId).eq("kind", "gsc_sync").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    seoMonthSpend(supabase, projectId),
    monthSpend(supabase, projectId),
  ]);
  if (last.error) throw new Error(`Nie udało się pobrać ostatniej synchronizacji: ${last.error.message}`);
  return { lastSync: last.data ?? null, seoSpent, aiSpent };
});
