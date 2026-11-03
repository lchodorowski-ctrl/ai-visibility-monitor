/**
 * Pure helpers of the Google overview page (no I/O): 28-day comparison windows, relative change,
 * CTR, the page state and the list shaping used by the sections.
 */
import type { Opportunity, QueryWindow } from "./opportunities";
import { MAX_POLLS, POLL_INTERVAL_MS } from "./rank-check";

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

/** The previous window is complete only when the history reaches back to its first day; a shorter history inflates every comparison. */
export function hasPreviousWindow(firstDate: string | null, w: GscWindows): boolean {
  return firstDate !== null && firstDate <= w.prev.from;
}

/** A sync still `running` after this long has died without closing its ledger entry (the task limit is far shorter). */
const RUNNING_JOB_MAX_MS = 45 * 60_000;

/**
 * A rank check legitimately runs for the whole polling time (`MAX_POLLS` polls, one per `POLL_INTERVAL_MS`) plus the
 * time to post the tasks and to wait for the queue, so its limit is that polling time and 30 minutes of slack.
 */
const RANK_CHECK_MAX_MS = MAX_POLLS * POLL_INTERVAL_MS + 30 * 60_000;

const maxRunningMs = (kind: string | undefined): number => (kind === "rank_check" ? RANK_CHECK_MAX_MS : RUNNING_JOB_MAX_MS);

/**
 * A `running` job that outlived its limit (45 minutes; a rank check: the polling time plus 30 minutes): it was
 * interrupted, no result will come. Unreadable `started_at` is not an alarm.
 */
export function isInterruptedJob(job: { status: string; started_at: string; kind?: string }, now: Date): boolean {
  return job.status === "running" && now.getTime() - Date.parse(job.started_at) > maxRunningMs(job.kind);
}

export type OverviewState = "no_property" | "no_data" | "syncing" | "empty_result" | "error" | "ok";

/**
 * What the page shows: no Search Console property, no data yet (nothing synced, or a sync that died), a sync in
 * progress, a finished sync that returned no rows, a failed first sync (error), or the data.
 * With data present a failed or running last sync is not a page-level state: the status line reports it.
 * A `skipped` job (no property at that time) is not an error either.
 */
export function overviewState(o: {
  gscProperty: string | null;
  lastDate: string | null;
  lastJob: { status: string; error: string | null; started_at: string } | null;
  now?: Date;
}): OverviewState {
  if (!o.gscProperty?.trim()) return "no_property";
  if (o.lastDate) return "ok";
  const job = o.lastJob;
  if (job?.status === "failed") return "error";
  if (job?.status === "running" && !isInterruptedJob(job, o.now ?? new Date())) return "syncing";
  if (job?.status === "done") return "empty_result";
  return "no_data";
}

/**
 * Opportunities worth showing, in the given order, at most `max`. Striking distance, low CTR and cannibalization
 * need a potential above 0; new and lost phrases stay without clicks: that a phrase appeared or vanished is the news.
 */
export function topOpportunities(items: Opportunity[], max = 5): Opportunity[] {
  return items.filter((o) => o.kind === "new" || o.kind === "lost" || o.potentialClicks > 0).slice(0, max);
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
