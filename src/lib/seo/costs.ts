/** Ceny DataForSEO (USD) dla endpointów live, sprawdzone na prawdziwych odpowiedziach z 2026-11-03. */
export const DFS_PRICE = {
  searchVolumeTask: 0.09,
  trendsTask: 0.011,
  labsTask: 0.012,
  labsRow: 0.00012,
  // SERP (kolejka standard): cena strony wyników (10 wyników) i dopłata za AI Overview, obie za jedno zadanie.
  serpPage: 0.0006,
  serpAioSurcharge: 0.0006,
} as const;

/** Głębokość sprawdzenia pozycji: 100 wyników, czyli 10 stron. */
export const SERP_DEPTH = 100;

const VOLUME_BATCH_SIZE = 1000;
const TRENDS_PHRASES_PER_REQUEST = 4;
const DEFAULT_SUGGESTION_LIMIT = 50;
const DEFAULT_RANKED_LIMIT = 100;

/**
 * Szacunek kosztu miesięcznego pomiaru: jedno zadanie wolumenów na każde 1000 fraz
 * i jedno zapytanie Trends na każde 4 frazy (piąta w zapytaniu to kotwica).
 * Niepoprawna liczba daje NaN, więc bramka budżetu (`decideSeoSpend`) odmówi.
 */
export function estimateVolumesCost(keywords: number, trendKeywords: number): number {
  return (
    Math.ceil(keywords / VOLUME_BATCH_SIZE) * DFS_PRICE.searchVolumeTask +
    Math.ceil(trendKeywords / TRENDS_PHRASES_PER_REQUEST) * DFS_PRICE.trendsTask
  );
}

/** Szacunek kosztu badania na żądanie: podpowiedzi dla haseł i widoczność domen, cena zadania plus cena wiersza. */
export function estimateResearchCost(o: { seeds: number; domains: number; suggestionLimit?: number; rankedLimit?: number }): number {
  const suggestionLimit = o.suggestionLimit ?? DEFAULT_SUGGESTION_LIMIT;
  const rankedLimit = o.rankedLimit ?? DEFAULT_RANKED_LIMIT;
  return (
    o.seeds * (DFS_PRICE.labsTask + suggestionLimit * DFS_PRICE.labsRow) +
    o.domains * (DFS_PRICE.labsTask + rankedLimit * DFS_PRICE.labsRow)
  );
}

/**
 * Szacunek (górna granica) kosztu sprawdzenia pozycji: każde sprawdzenie to jedno zadanie SERP na urządzenie,
 * czyli 10 stron wyników plus dopłata za AI Overview (0,0066 USD). `task_post` pobiera tę granicę,
 * a `task_get` podaje koszt faktyczny po zwrocie. Niepoprawna liczba daje NaN, więc bramka budżetu odmówi.
 */
export function estimateRankCost(checks: number): number {
  return checks * ((SERP_DEPTH / 10) * DFS_PRICE.serpPage + DFS_PRICE.serpAioSurcharge);
}
