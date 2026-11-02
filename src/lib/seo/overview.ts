/**
 * Pure helpers of the Google overview page (no I/O): 28-day comparison windows, relative change,
 * CTR, the page state and the list shaping used by the sections.
 */
import type { Opportunity, QueryWindow } from "./opportunities";

export const WINDOW_DAYS = 28;

export interface DateRange { from: string; to: string }
export interface GscWindows { cur: DateRange; prev: DateRange }

/** `iso` (YYYY-MM-DD) moved by a number of days; calendar arithmetic in UTC, so no DST surprises. */
export function shiftDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Current window: 28 days ending on `lastDate`; previous window: the 28 days right before it. */
export function gscWindows(lastDate: string): GscWindows {
  const curFrom = shiftDate(lastDate, -(WINDOW_DAYS - 1));
  return {
    cur: { from: curFrom, to: lastDate },
    prev: { from: shiftDate(curFrom, -WINDOW_DAYS), to: shiftDate(curFrom, -1) },
  };
}

/** Relative change (0.2 = +20%); null when either value is missing or the base is 0. */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / prev;
}

/** Clicks / impressions; null without impressions or without data. */
export function ctr(clicks: number | null, impressions: number | null): number | null {
  if (clicks === null || impressions === null || impressions === 0) return null;
  return clicks / impressions;
}

export type OverviewState = "no_property" | "no_data" | "error" | "ok";

/**
 * What the page shows: no Search Console property, no data yet, a failed first sync (error), or the data.
 * With data present a failed last sync is not a page-level error: the status line reports it.
 * A `skipped` job (no property at that time) is not an error either.
 */
export function overviewState(o: {
  gscProperty: string | null;
  lastDate: string | null;
  lastJob: { status: string; error: string | null } | null;
}): OverviewState {
  if (!o.gscProperty?.trim()) return "no_property";
  if (o.lastDate) return "ok";
  return o.lastJob?.status === "failed" ? "error" : "no_data";
}

/** Opportunities worth showing: potential above 0, in the given order, at most `max`. */
export function topOpportunities(items: Opportunity[], max = 5): Opportunity[] {
  return items.filter((o) => o.potentialClicks > 0).slice(0, max);
}

/** Queries with impressions in the current window, most clicks first (more impressions on a tie). */
export function topQueries(rows: QueryWindow[], max = 10): QueryWindow[] {
  return rows
    .filter((r) => r.cur.impressions > 0)
    .sort((a, b) => b.cur.clicks - a.cur.clicks || b.cur.impressions - a.cur.impressions)
    .slice(0, max);
}

export interface SiteDay { date: string; clicks: number; impressions: number; position: number | null }

/** Fills days without a row between the first and the last date with zeros (Search Console sends no row for a day without impressions). */
export function fillMissingDays(rows: SiteDay[]): SiteDay[] {
  const out: SiteDay[] = [];
  for (const row of rows) {
    const prev = out.at(-1);
    if (prev) for (let d = shiftDate(prev.date, 1); d < row.date; d = shiftDate(d, 1)) out.push({ date: d, clicks: 0, impressions: 0, position: null });
    out.push(row);
  }
  return out;
}
