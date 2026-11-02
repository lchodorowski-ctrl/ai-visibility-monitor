/**
 * Search Console opportunities as pure functions (no I/O). Inputs mirror the rows of the SQL aggregate
 * functions; `position` is null when a row has no impressions, and such rows never qualify for
 * striking distance or low CTR. CTR is always clicks / impressions.
 */

export interface Metrics {
  clicks: number;
  impressions: number;
  position: number | null;
}

/** One query in the current window and in the previous one of the same length. */
export interface QueryWindow {
  query: string;
  cur: Metrics;
  prev: Metrics;
}

export interface PageMetrics extends Metrics {
  page: string;
}

/** One (query, page) row of the current window; assumed unique per pair. */
export interface QueryPage {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

export type Opportunity =
  | {
      kind: "striking" | "low_ctr" | "new" | "lost";
      query?: string;
      page?: string;
      clicks: number;
      impressions: number;
      position: number | null;
      ctr: number;
      potentialClicks: number;
    }
  | {
      kind: "cannibal";
      query: string;
      impressions: number;
      pages: { page: string; impressions: number; position: number | null }[];
      potentialClicks: number;
    };

type MetricOpportunity = Exclude<Opportunity, { kind: "cannibal" }>;

export const THRESHOLDS = {
  strikingMin: 4,
  strikingMax: 20,
  strikingMinImpressions: 50,
  lowCtrRatio: 0.5,
  lowCtrMinImpressions: 100,
  cannibalShare: 0.2,
  cannibalMinImpressions: 30,
  newLostMinImpressions: 10,
  curveMinImpressions: 200,
} as const;

/** Rough industry CTR for positions 1-10 (11-20: 0.01, further: 0.005); replaced by own data where there is enough of it. */
export const DEFAULT_CTR: readonly number[] = [0.28, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02];

/** Whole-number position bucket, never below 1. */
function bucket(position: number): number {
  return Math.max(1, Math.round(position));
}

/**
 * CTR curve for positions 1-10: the site's own CTR for a position when its rows add up to at least
 * `curveMinImpressions` impressions, the default curve otherwise.
 */
export function ctrCurve(rows: Metrics[]): number[] {
  const clicks = new Array<number>(DEFAULT_CTR.length).fill(0);
  const impressions = new Array<number>(DEFAULT_CTR.length).fill(0);
  for (const r of rows) {
    if (r.position === null) continue;
    const i = bucket(r.position) - 1;
    if (i >= DEFAULT_CTR.length) continue;
    clicks[i] += r.clicks;
    impressions[i] += r.impressions;
  }
  return DEFAULT_CTR.map((fallback, i) =>
    impressions[i] >= THRESHOLDS.curveMinImpressions ? clicks[i] / impressions[i] : fallback,
  );
}

/** Expected CTR at a position: the curve for 1-10, 0.01 for 11-20, 0.005 further; the position is rounded, minimum 1. */
export function expectedCtr(position: number, curve: readonly number[] = DEFAULT_CTR): number {
  const p = bucket(position);
  if (p <= DEFAULT_CTR.length) return curve[p - 1] ?? DEFAULT_CTR[p - 1];
  return p <= 20 ? 0.01 : 0.005;
}

function metricOpportunity(
  kind: MetricOpportunity["kind"],
  subject: { query: string } | { page: string },
  m: Metrics,
  potentialClicks: number,
): MetricOpportunity {
  return {
    kind,
    ...subject,
    clicks: m.clicks,
    impressions: m.impressions,
    position: m.position,
    ctr: m.clicks / m.impressions,
    potentialClicks,
  };
}

/** Largest potential first; more impressions first on a tie. */
function byPotential(a: Opportunity, b: Opportunity): number {
  return b.potentialClicks - a.potentialClicks || b.impressions - a.impressions;
}

/** Queries at positions 4-20 with enough impressions: clicks to gain by reaching the CTR of position 3. */
export function strikingDistance(rows: QueryWindow[], curve: readonly number[]): Opportunity[] {
  const top3 = expectedCtr(3, curve);
  const out: Opportunity[] = [];
  for (const { query, cur } of rows) {
    if (cur.position === null) continue;
    if (cur.position < THRESHOLDS.strikingMin || cur.position > THRESHOLDS.strikingMax) continue;
    if (cur.impressions < THRESHOLDS.strikingMinImpressions) continue;
    const ctr = cur.clicks / cur.impressions;
    out.push(metricOpportunity("striking", { query }, cur, cur.impressions * Math.max(0, top3 - ctr)));
  }
  return out.sort(byPotential);
}

const isQueryWindow = (item: QueryWindow | PageMetrics): item is QueryWindow => "cur" in item;

/** Queries or pages in the top 10 whose CTR is below half of the expected CTR for their position. */
export function lowCtr(items: (QueryWindow | PageMetrics)[], curve: readonly number[]): Opportunity[] {
  const out: Opportunity[] = [];
  for (const item of items) {
    const m: Metrics = isQueryWindow(item) ? item.cur : item;
    if (m.position === null || m.position > 10) continue;
    if (m.impressions < THRESHOLDS.lowCtrMinImpressions) continue;
    const ctr = m.clicks / m.impressions;
    const expected = expectedCtr(m.position, curve);
    if (!(ctr < THRESHOLDS.lowCtrRatio * expected)) continue;
    const subject = isQueryWindow(item) ? { query: item.query } : { page: item.page };
    out.push(metricOpportunity("low_ctr", subject, m, m.impressions * (expected - ctr)));
  }
  return out.sort(byPotential);
}

/**
 * Queries on which at least two of our pages each hold a share of the query's impressions
 * (`cannibalShare`). `pages` lists only those competing pages, largest first; `impressions`
 * is the total for the query. Potential: clicks to gain if one page ranked first with the default CTR.
 */
export function cannibalization(rows: QueryPage[]): Opportunity[] {
  const byQuery = new Map<string, QueryPage[]>();
  for (const r of rows) {
    const list = byQuery.get(r.query);
    if (list) list.push(r);
    else byQuery.set(r.query, [r]);
  }

  const out: Opportunity[] = [];
  for (const [query, list] of byQuery) {
    const impressions = list.reduce((s, r) => s + r.impressions, 0);
    if (impressions < THRESHOLDS.cannibalMinImpressions) continue;
    const pages = list
      .filter((r) => r.impressions / impressions >= THRESHOLDS.cannibalShare)
      .sort((a, b) => b.impressions - a.impressions)
      .map((r) => ({ page: r.page, impressions: r.impressions, position: r.position }));
    if (pages.length < 2) continue;
    const ctr = list.reduce((s, r) => s + r.clicks, 0) / impressions;
    out.push({ kind: "cannibal", query, impressions, pages, potentialClicks: impressions * Math.max(0, expectedCtr(1) - ctr) });
  }
  return out.sort(byPotential);
}

/**
 * Queries that appeared (no impressions before) or vanished (none now). The numbers are those of the window where the
 * query exists; `potentialClicks` is its clicks, but the list is ordered by that window's impressions (largest first):
 * a phrase without a single click is still worth showing, and there is no "potential" to rank it by.
 */
export function newAndLost(rows: QueryWindow[]): Opportunity[] {
  const min = THRESHOLDS.newLostMinImpressions;
  const out: MetricOpportunity[] = [];
  for (const { query, cur, prev } of rows) {
    if (prev.impressions === 0 && cur.impressions >= min) out.push(metricOpportunity("new", { query }, cur, cur.clicks));
    else if (cur.impressions === 0 && prev.impressions >= min) out.push(metricOpportunity("lost", { query }, prev, prev.clicks));
  }
  return out.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}
