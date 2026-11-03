/**
 * Pure logic of the "Kierunek" summary on the main overview (no I/O): is the brand going up, down or standing still
 * in AI assistants overall, in Google AI Overviews, in Google search results and in the positions of tracked phrases,
 * and the texts that say so.
 *
 * Every verdict is computed from the numbers as they are shown on screen (rounded points, whole percentages),
 * so a card never shows "-5 pp" next to a "no change" verdict.
 */
import type { Tables } from "@/lib/db-types";
import type { GscTotals } from "@/lib/seo/queries";
import type { RankDirectionRow } from "@/lib/seo/rank-queries";
import { shiftDate, WINDOW_DAYS } from "@/lib/seo/overview";
import { rankWeekStart } from "@/lib/seo/rank-check";
import { fmtDayMonth, fmtDecimal, fmtNumber, fmtSignedNumber, fmtSignedPercent, pct, positionChange, positionChangeText } from "@/lib/format/number";
import { pluralFmt } from "@/lib/format/plural";

export type Direction = "up" | "down" | "flat" | "unknown";

export const DIRECTION_THRESHOLDS = {
  /** AI Visibility Score change (0-100 scale) that counts as a move. */
  scorePoints: 3,
  /** Visibility rate change (0.05 = 5 percentage points). */
  ratePoints: 0.05,
  /** Relative change in Search Console clicks (0.1 = 10%). */
  clicksRelative: 0.1,
  /** Fewer clicks than this in the previous window is too small a base for a percentage. */
  clicksMinBase: 20,
  /** Average position change in places. */
  positionPlaces: 0.5,
  /** Relative rise in impressions that softens a worse average position from "down" to "flat" (0.1 = 10%). */
  impressionsGrowth: 0.1,
  /** Change of a phrase's position in places that counts as a move (better or worse). */
  rankPlaces: 3,
  /** Share of the compared phrases (0.1 = 10%) that must net move the same way for a verdict. */
  rankShare: 0.1,
  /** How far back the AI measurement used for comparison should be. */
  baselineDays: 28,
  /** Search Console data whose latest day is more than this many days old is stale (the sync stopped or fails). */
  staleDays: 7,
} as const;

const TH = DIRECTION_THRESHOLDS;

/** Absorbs floating point noise at the threshold: 0.45 - 0.40 is 0.04999999999999999, yet it is 5 pp. */
const EPSILON = 1e-9;

/**
 * The point to compare the latest one with: the newest one at least `days` before `latestDate`; without it the
 * oldest point earlier than `latestDate` (a short history still gives a comparison); without that, null.
 */
export function pickBaseline<T extends { date: string }>(points: T[], latestDate: string, days: number = DIRECTION_THRESHOLDS.baselineDays): T | null {
  const cutoff = shiftDate(latestDate, -days);
  let oldEnough: T | null = null;
  let oldest: T | null = null;
  for (const p of points) {
    if (p.date <= cutoff && (!oldEnough || p.date > oldEnough.date)) oldEnough = p;
    if (p.date < latestDate && (!oldest || p.date < oldest.date)) oldest = p;
  }
  return oldEnough ?? oldest;
}

/** A rise of at least `threshold` is "up", a fall of at least `threshold` is "down", anything smaller is "flat". */
export function higherIsBetter(cur: number, base: number, threshold: number): Direction {
  if (!Number.isFinite(cur) || !Number.isFinite(base)) return "unknown";
  const diff = cur - base;
  if (diff === 0 || Math.abs(diff) < threshold - EPSILON) return "flat";
  return diff > 0 ? "up" : "down";
}

/** The same for values where less is better (average position). */
export function lowerIsBetter(cur: number, base: number, threshold: number): Direction {
  return higherIsBetter(base, cur, threshold);
}

export interface ChannelSummary {
  key: "ai" | "aio" | "google" | "rank";
  label: string;
  direction: Direction;
  /** The number behind the verdict, with its change: "Score 54, +6 pkt". */
  headline: string;
  detail: string;
  /** ISO date of the measurement the change is counted from, or null. */
  since: string | null;
  /** What is compared, shown instead of the baseline date when there is none (Search Console compares two periods). */
  period?: string;
  href: string;
}

const NO_BASELINE = "brak wcześniejszego pomiaru do porównania";

interface MetricPoint { date: string; score: number; visibilityRate: number; citationRate: number }

/**
 * Overall points of one engine (null: all engines together), oldest first. Rows of single prompts are not part of the
 * overview, and a row without a valid response (responses_count 0) is no measurement. Numeric columns may arrive as strings.
 */
function seriesFor(rows: Tables<"daily_metrics">[], engineId: string | null): MetricPoint[] {
  const points: MetricPoint[] = [];
  for (const r of rows) {
    if (r.prompt_id !== null || r.engine_id !== engineId || !(Number(r.responses_count) > 0)) continue;
    const p = { date: r.date, score: Number(r.score), visibilityRate: Number(r.visibility_rate), citationRate: Number(r.citation_rate) };
    if (Number.isFinite(p.score) && Number.isFinite(p.visibilityRate) && Number.isFinite(p.citationRate)) points.push(p);
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function latestWithBaseline(points: MetricPoint[]): { latest: MetricPoint; base: MetricPoint | null } | null {
  const latest = points.at(-1);
  return latest ? { latest, base: pickBaseline(points, latest.date) } : null;
}

/** Change between two rates in whole percentage points, as the rounded percentages on screen differ. */
const ppChange = (cur: number, base: number) => Math.round(cur * 100) - Math.round(base * 100);
/** A rate rounded to a whole percent, so the verdict is based on the number that is shown. */
const wholePercent = (rate: number) => Math.round(rate * 100) / 100;
const change = (delta: number, unit: string) => (delta === 0 ? "bez zmian" : `${fmtSignedNumber(delta, 0)} ${unit}`);

const NO_MEASUREMENTS = { headline: "Brak pomiarów", detail: "Uruchom pomiar, żeby zobaczyć kierunek." };

export function aiSummary(rows: Tables<"daily_metrics">[]): ChannelSummary {
  const id = { key: "ai", label: "Asystenci AI (wszystkie silniki)", href: "/app/prompts" } as const;
  const found = latestWithBaseline(seriesFor(rows, null));
  if (!found) return { ...id, direction: "unknown", ...NO_MEASUREMENTS, since: null };
  const { latest, base } = found;
  const score = Math.round(latest.score);
  if (!base) {
    return { ...id, direction: "unknown", headline: `Score ${score}`, detail: `widoczność ${pct(latest.visibilityRate)}, ${NO_BASELINE}`, since: null };
  }
  const baseScore = Math.round(base.score);
  return {
    ...id,
    direction: higherIsBetter(score, baseScore, TH.scorePoints),
    headline: `Score ${score}, ${change(score - baseScore, "pkt")}`,
    detail: `widoczność ${pct(latest.visibilityRate)}, ${change(ppChange(latest.visibilityRate, base.visibilityRate), "pp")}`,
    since: base.date,
  };
}

export function aioSummary(rows: Tables<"daily_metrics">[]): ChannelSummary {
  const id = { key: "aio", label: "Google AI Overviews", href: "/app/prompts" } as const;
  const found = latestWithBaseline(seriesFor(rows, "google_ai_overview"));
  if (!found) return { ...id, direction: "unknown", ...NO_MEASUREMENTS, since: null };
  const { latest, base } = found;
  if (!base) {
    return { ...id, direction: "unknown", headline: `Widoczność ${pct(latest.visibilityRate)}`, detail: `cytowania ${pct(latest.citationRate)}, ${NO_BASELINE}`, since: null };
  }
  return {
    ...id,
    direction: higherIsBetter(wholePercent(latest.visibilityRate), wholePercent(base.visibilityRate), TH.ratePoints),
    headline: `Widoczność ${pct(latest.visibilityRate)}, ${change(ppChange(latest.visibilityRate, base.visibilityRate), "pp")}`,
    detail: `cytowania ${pct(latest.citationRate)}, ${change(ppChange(latest.citationRate, base.citationRate), "pp")}`,
    since: base.date,
  };
}

const CLICK_FORMS: [string, string, string] = ["kliknięcie", "kliknięcia", "kliknięć"];

/** "142 kliknięcia", with the thousands separated like everywhere else in the app ("12 345 kliknięć"). */
const clicksText = (n: number) => pluralFmt(n, CLICK_FORMS);

export interface GoogleSummaryContext {
  /** Latest day with data: names the end of the compared period and enables the stale-data check. */
  lastDate?: string | null;
  /** Earliest day with data: named when the history is too short for a comparison. */
  firstDate?: string | null;
  /** Current time (UTC day decides staleness); injected by tests. */
  now?: Date;
}

/**
 * `prev` null means there is no comparable previous window (the history is shorter than two windows); a `prev` whose
 * values are all null is a window with no data. Neither gives a percentage or a direction.
 */
export function googleSummary(cur: GscTotals | null, prev: GscTotals | null, configured: boolean, ctx: GoogleSummaryContext = {}): ChannelSummary {
  const id = { key: "google", label: "Google: wyniki wyszukiwania", href: "/app/google", since: null } as const;
  if (!configured) {
    return { ...id, direction: "unknown", headline: "Podłącz Search Console", detail: "Wpisz usługę w Ustawienia → Google." };
  }
  if (!cur || cur.clicks === null) {
    return { ...id, direction: "unknown", headline: "Brak danych z Search Console", detail: "Kliknij Synchronizuj na stronie Google." };
  }
  const { lastDate } = ctx;
  if (lastDate && shiftDate((ctx.now ?? new Date()).toISOString().slice(0, 10), -TH.staleDays) > lastDate) {
    return {
      ...id, direction: "unknown", headline: "Dane z Search Console są nieaktualne",
      detail: `ostatnie dane: ${fmtDayMonth(lastDate)}. Sprawdź synchronizację na stronie Google.`,
    };
  }

  const clicks = Math.round(cur.clicks);
  const prevClicks = prev?.clicks == null ? null : Math.round(prev.clicks);
  // a percentage of a handful of clicks is noise: below the minimum base the clicks do not decide and show no percentage
  const bigEnoughBase = prevClicks !== null && prevClicks >= TH.clicksMinBase;
  const rel = bigEnoughBase ? (clicks - prevClicks) / prevClicks : null;
  // like fmtSignedPercent, round the magnitude, so "+10%" on screen is always "up"
  const shownRel = rel === null ? null : Math.sign(rel) * Math.round(Math.abs(rel) * 100) / 100;

  const byClicks: Direction = shownRel === null ? "unknown" : higherIsBetter(shownRel, 0, TH.clicksRelative);
  // the change is rounded as the text "lepiej o X poz." shows it, so the verdict and the words cannot disagree
  const shownPositionChange = positionChange(cur.position, prev?.position ?? null);
  const byPosition: Direction = shownPositionChange === null ? "unknown" : lowerIsBetter(shownPositionChange, 0, TH.positionPlaces);
  // clear clicks decide; otherwise (no clear change or too small a base) the average position does
  const decidedByPosition = byClicks !== "up" && byClicks !== "down" && byPosition !== "unknown";
  let direction: Direction = decidedByPosition ? byPosition : byClicks;
  // on a young site long-tail impressions worsen the average position while visibility grows: not a fall
  const prevImpressions = prev?.impressions ?? 0;
  if (decidedByPosition && direction === "down" && prevImpressions > 0 && cur.impressions !== null
    && (cur.impressions - prevImpressions) / prevImpressions > TH.impressionsGrowth) {
    direction = "flat";
  }

  let headline: string;
  if (prevClicks === null) headline = clicksText(clicks);
  else if (shownRel === null) headline = `${clicksText(clicks)} (poprzednio ${fmtNumber(prevClicks)})`;
  else headline = `${clicksText(clicks)}, ${shownRel === 0 ? "bez zmian" : fmtSignedPercent(shownRel)}`;

  let detail: string;
  if (cur.position === null) detail = "brak danych o średniej pozycji";
  else if (prev === null) detail = `średnia pozycja ${fmtDecimal(cur.position)}`;
  else if (prevClicks === null) detail = `średnia pozycja ${fmtDecimal(cur.position)}, brak poprzednich ${WINDOW_DAYS} dni do porównania`;
  else {
    const positionText = positionChangeText(cur.position, prev.position);
    detail = `średnia pozycja ${fmtDecimal(cur.position)}${positionText ? ` (${positionText})` : ""}`;
  }
  if (prev === null) detail += `. Za krótka historia do porównania${ctx.firstDate ? ` (dane od ${fmtDayMonth(ctx.firstDate)})` : ""}`;

  const upTo = lastDate ? `${WINDOW_DAYS} dni do ${fmtDayMonth(lastDate)}` : `ostatnie ${WINDOW_DAYS} dni`;
  return { ...id, direction, headline, detail, period: prevClicks !== null ? `${upTo} wobec poprzednich ${WINDOW_DAYS}` : upTo };
}

/** A phrase outside the checked top 100 has no position; for the comparison it counts as the first place after it. */
const OUTSIDE_TOP_100 = 101;

/** The first ten organic results are the first page of Google. */
const TOP_10 = 10;

export interface RankSummaryContext {
  /** Active tracked phrases: tells "add phrases" from "run the check" when there are no positions yet. */
  activeKeywords: number;
  /** The read of the measurements failed: the card says so instead of hinting to add phrases. */
  readFailed?: boolean;
  /** Current time (the Warsaw week decides staleness); injected by tests. */
  now?: Date;
}

/** Weeks of the check are weekly: a newest week older than the previous one means the weekly check has stopped. */
const RANK_STALE_DAYS = 7;

/**
 * Direction of the tracked phrases: of the phrases checked both in the latest week and in the baseline week (28 days
 * earlier, or the oldest earlier one), count those that got at least `rankPlaces` places better and worse. The verdict
 * needs the net count (better minus worse) to reach `rankShare` of the compared phrases (at least one phrase), so the
 * counts in the text decide it and a lone phrase cannot swing a large list. The headline is the latest top 10 count.
 * A newest week older than the previous measurement week (7 days before the current one) is stale, like Search Console
 * data: no verdict, only the date of the last measurement.
 */
export function rankSummary(rows: RankDirectionRow[], ctx: RankSummaryContext): ChannelSummary {
  const id = { key: "rank", label: "Google: pozycje fraz", href: "/app/google/keywords" } as const;
  if (ctx.readFailed) {
    return { ...id, direction: "unknown", headline: "Brak danych o pozycjach", detail: "Nie udało się wczytać pomiarów pozycji.", since: null };
  }
  if (rows.length === 0) {
    return {
      ...id, direction: "unknown", headline: "Brak pomiarów pozycji", since: null,
      detail: ctx.activeKeywords > 0 ? "Kliknij Sprawdź pozycje w Google → Frazy." : "Dodaj frazy w Google → Frazy.",
    };
  }

  const weeks = new Map<string, Map<string, number | null>>();
  for (const r of rows) {
    const week = weeks.get(r.weekStart) ?? new Map<string, number | null>();
    week.set(r.keywordId, r.position);
    weeks.set(r.weekStart, week);
  }
  const latestWeek = [...weeks.keys()].reduce((a, b) => (a > b ? a : b));
  if (latestWeek < shiftDate(rankWeekStart(ctx.now ?? new Date()), -RANK_STALE_DAYS)) {
    return {
      ...id, direction: "unknown", headline: "Pozycje fraz są nieaktualne", since: null,
      detail: `ostatni pomiar: ${fmtDayMonth(latestWeek)}. Sprawdź pozycje w Google → Frazy.`,
    };
  }
  const latest = weeks.get(latestWeek)!;
  const inTop10 = [...latest.values()].filter((p) => p !== null && p <= TOP_10).length;
  const headline = `${fmtNumber(inTop10)} z ${fmtNumber(latest.size)} ${latest.size === 1 ? "frazy" : "fraz"} w top 10`;

  const base = pickBaseline([...weeks.keys()].map((date) => ({ date })), latestWeek, TH.baselineDays);
  if (!base) return { ...id, direction: "unknown", headline, detail: `pomiar z ${fmtDayMonth(latestWeek)}, ${NO_BASELINE}`, since: null };

  const before = weeks.get(base.date)!;
  let better = 0;
  let worse = 0;
  let same = 0;
  for (const [keywordId, position] of latest) {
    if (!before.has(keywordId)) continue;
    const moved = (before.get(keywordId) ?? OUTSIDE_TOP_100) - (position ?? OUTSIDE_TOP_100);
    if (moved >= TH.rankPlaces) better += 1;
    else if (moved <= -TH.rankPlaces) worse += 1;
    else same += 1;
  }
  const compared = better + worse + same;
  if (compared === 0) {
    return { ...id, direction: "unknown", headline, detail: "brak fraz sprawdzonych w obu tygodniach", since: null };
  }

  const needed = Math.max(1, Math.ceil(compared * TH.rankShare - EPSILON));
  const net = better - worse;
  const direction: Direction = net >= needed ? "up" : net <= -needed ? "down" : "flat";
  return { ...id, direction, headline, detail: `lepiej: ${better}, gorzej: ${worse}, bez zmian: ${same}`, since: base.date };
}

const SHORT_LABEL: Record<ChannelSummary["key"], string> = { ai: "AI", aio: "AI Overviews", google: "Google", rank: "pozycje fraz" };

/**
 * One sentence about the whole picture. A channel without data is not counted towards the direction, but it does not
 * vanish from the sentence either: "up everywhere" is said only when every channel has data and is up.
 */
export function overallHeadline(summaries: ChannelSummary[]): string {
  const names = (d: Direction) => summaries.filter((s) => s.direction === d).map((s) => SHORT_LABEL[s.key]);
  const up = names("up");
  const down = names("down");
  const flat = names("flat");
  const unknown = names("unknown");
  if (up.length + down.length + flat.length === 0) return "Za mało danych, żeby ocenić kierunek. Potrzebne są co najmniej dwa pomiary.";
  if (unknown.length === 0 && down.length === 0 && flat.length === 0) return "Idziemy w górę we wszystkich kanałach";
  if (unknown.length === 0 && up.length === 0 && flat.length === 0) return "Spadamy we wszystkich kanałach";
  return ([["W górę", up], ["W dół", down], ["Bez zmian", flat], ["Brak danych", unknown]] as const)
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => `${title}: ${list.join(", ")}.`)
    .join(" ");
}
