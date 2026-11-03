import { dfsRequest, dfsLocationCode } from "@/lib/dataforseo/client";
import { normalizeKeyword } from "@/lib/seo/keywords";

const EXPLORE_PATH = "/keywords_data/google_trends/explore/live";
// Google Trends porównuje w jednym zapytaniu najwyżej 5 fraz; 4 nasze plus kotwica.
const MAX_KEYWORDS_PER_REQUEST = 5;
const PHRASES_PER_BATCH = MAX_KEYWORDS_PER_REQUEST - 1;

export interface TrendPoint {
  week: string;
  value: number | null;
}

export interface TrendSeries {
  keyword: string;
  points: TrendPoint[];
}

interface RawTrendsItem {
  type: string;
  keywords?: string[];
  data?: { date_from: string; values?: (number | null)[] | null }[] | null;
}

/**
 * Jedno zapytanie Google Trends (live, ostatnie 12 miesięcy, wyszukiwarka web): seria tygodniowa na każdą frazę.
 * Wartości są względne w obrębie zapytania (0 do 100), więc zapytania łączy dopiero `normalizeTrends`.
 * Odpowiedź bez wykresu daje pustą listę serii, a koszt zostaje.
 */
export async function trendsExplore(keywords: string[]): Promise<{ series: TrendSeries[]; costUsd: number }> {
  if (keywords.length < 1 || keywords.length > MAX_KEYWORDS_PER_REQUEST) {
    throw new Error(`Google Trends przyjmuje od 1 do ${MAX_KEYWORDS_PER_REQUEST} fraz w jednym zapytaniu (podano ${keywords.length}).`);
  }
  const res = await dfsRequest("POST", EXPLORE_PATH, [
    { keywords, location_code: dfsLocationCode(), language_code: "pl", time_range: "past_12_months", type: "web" },
  ]);
  const result = res.tasks?.[0]?.result?.[0] as { items?: RawTrendsItem[] | null } | undefined;
  const graph = result?.items?.find((item) => item.type === "google_trends_graph");
  // `values[j]` odpowiada `graph.keywords[j]`.
  const series: TrendSeries[] = (graph?.keywords ?? []).map((keyword, j) => ({
    keyword,
    points: (graph?.data ?? []).map((d) => ({ week: d.date_from, value: d.values?.[j] ?? null })),
  }));
  return { series, costUsd: res.cost ?? 0 };
}

/**
 * Paczki fraz do `trendsExplore`: po 4 frazy i kotwica (fraza odniesienia) na końcu każdej paczki.
 * Kotwica z listy fraz oraz powtórzenia (po `normalizeKeyword`) są pomijane.
 */
export function trendBatches(keywords: string[], anchor: string): string[][] {
  const seen = new Set([normalizeKeyword(anchor)]);
  const others: string[] = [];
  for (const keyword of keywords) {
    const key = normalizeKeyword(keyword);
    if (seen.has(key)) continue;
    seen.add(key);
    others.push(keyword);
  }
  const batches: string[][] = [];
  for (let i = 0; i < others.length; i += PHRASES_PER_BATCH) batches.push([...others.slice(i, i + PHRASES_PER_BATCH), anchor]);
  return batches;
}

const sumOf = (points: TrendPoint[]) => points.reduce((sum, p) => sum + (p.value ?? 0), 0);

/**
 * Mnożnik, który sprowadza kotwicę z paczki do skali kotwicy odniesienia: suma odniesienia podzielona przez sumę kotwicy w paczce.
 * Tygodnie łączymy po polu `week`, więc liczą się tylko tygodnie obecne w obu seriach.
 * Brak kotwicy, brak wspólnych tygodni albo zerowa suma daje null.
 */
function scaleFactor(ref: TrendSeries, own: TrendSeries): number | null {
  const refByWeek = new Map(ref.points.map((p) => [p.week, p.value ?? 0]));
  let refSum = 0;
  let ownSum = 0;
  for (const p of own.points) {
    const refValue = refByWeek.get(p.week);
    if (refValue === undefined) continue;
    refSum += refValue;
    ownSum += p.value ?? 0;
  }
  return refSum > 0 && ownSum > 0 ? refSum / ownSum : null;
}

/**
 * Zszywa serie z kilku zapytań (każde z tą samą kotwicą) w jedną skalę: skalą jest kotwica z pierwszej paczki,
 * w której ma jakikolwiek ruch. Wartości pozostałych paczek mnożymy przez sumę(kotwica odniesienia) / sumę(kotwica paczki),
 * zaokrąglone do 0,1. Paczka bez ruchu kotwicy albo bez kotwicy daje null (nie zero: nie wiemy, ile to jest).
 * Klucze wyniku to `normalizeKeyword(fraza)`; kotwica jest w wyniku raz, z paczki odniesienia.
 */
export function normalizeTrends(batches: TrendSeries[][], anchor: string): Map<string, TrendPoint[]> {
  const anchorKey = normalizeKeyword(anchor);
  const anchorOf = (batch: TrendSeries[]) => batch.find((s) => normalizeKeyword(s.keyword) === anchorKey);
  const anchors = batches.map(anchorOf);
  const ref = anchors.find((a) => a !== undefined && sumOf(a.points) > 0);

  const result = new Map<string, TrendPoint[]>();
  batches.forEach((batch, i) => {
    const own = anchors[i];
    const factor = ref && own ? scaleFactor(ref, own) : null;
    for (const s of batch) {
      const key = normalizeKeyword(s.keyword);
      if (key === anchorKey) continue;
      result.set(key, s.points.map((p) => ({
        week: p.week,
        value: factor === null || p.value === null ? null : Math.round(p.value * factor * 10) / 10,
      })));
    }
  });

  // Bez żadnej kotwicy z ruchem zostaje kotwica z pierwszej paczki, która ją ma (prawdziwe zera).
  const anchorSeries = ref ?? anchors.find((a) => a !== undefined);
  if (anchorSeries) result.set(anchorKey, anchorSeries.points.map((p) => ({ ...p })));
  return result;
}
