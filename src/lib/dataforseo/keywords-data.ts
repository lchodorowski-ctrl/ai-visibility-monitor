import { dfsRequest, dfsLocationCode } from "@/lib/dataforseo/client";

const SEARCH_VOLUME_PATH = "/keywords_data/google_ads/search_volume/live";
// Google Ads przyjmuje najwyżej 1000 fraz w jednym zadaniu.
const BATCH_SIZE = 1000;

export interface VolumeItem {
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  competitionIndex: number | null;
  cpc: number | null;
  monthlySearches: { year: number; month: number; searchVolume: number | null }[];
}

interface RawVolumeResult {
  keyword: string;
  search_volume?: number | null;
  competition?: string | null;
  competition_index?: number | null;
  cpc?: number | null;
  monthly_searches?: { year: number; month: number; search_volume?: number | null }[] | null;
}

function toVolumeItem(raw: RawVolumeResult): VolumeItem {
  return {
    keyword: raw.keyword,
    searchVolume: raw.search_volume ?? null,
    competition: raw.competition ?? null,
    competitionIndex: raw.competition_index ?? null,
    cpc: raw.cpc ?? null,
    // Fraza bez danych w Google Ads ma `monthly_searches: null`.
    monthlySearches: (raw.monthly_searches ?? []).map((m) => ({ year: m.year, month: m.month, searchVolume: m.search_volume ?? null })),
  };
}

/** Miesięczne wolumeny wyszukiwań z Google Ads (live), paczkami po 1000 fraz, po kolei. Koszt to suma pól `cost` odpowiedzi. */
export async function searchVolume(keywords: string[]): Promise<{ items: VolumeItem[]; costUsd: number }> {
  const items: VolumeItem[] = [];
  let costUsd = 0;
  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const res = await dfsRequest("POST", SEARCH_VOLUME_PATH, [
      { keywords: keywords.slice(i, i + BATCH_SIZE), location_code: dfsLocationCode(), language_code: "pl" },
    ]);
    costUsd += res.cost ?? 0;
    for (const task of res.tasks ?? []) {
      for (const raw of (task.result ?? []) as RawVolumeResult[]) items.push(toVolumeItem(raw));
    }
  }
  return { items, costUsd };
}
