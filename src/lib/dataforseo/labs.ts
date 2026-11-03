import { dfsRequest, dfsLocationCode } from "@/lib/dataforseo/client";

const SUGGESTIONS_PATH = "/dataforseo_labs/google/keyword_suggestions/live";
const RANKED_KEYWORDS_PATH = "/dataforseo_labs/google/ranked_keywords/live";

export interface LabsKeyword {
  keyword: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
}

export interface RankedKeyword extends LabsKeyword {
  position: number;
  url: string;
}

interface RawKeywordData {
  keyword: string;
  keyword_info?: { search_volume?: number | null; cpc?: number | null } | null;
  keyword_properties?: { keyword_difficulty?: number | null } | null;
}

interface RawRankedItem {
  keyword_data: RawKeywordData;
  ranked_serp_element?: { serp_item?: { type?: string; rank_group?: number; url?: string } | null } | null;
}

function toLabsKeyword(data: RawKeywordData): LabsKeyword {
  return {
    keyword: data.keyword,
    searchVolume: data.keyword_info?.search_volume ?? null,
    keywordDifficulty: data.keyword_properties?.keyword_difficulty ?? null,
    cpc: data.keyword_info?.cpc ?? null,
  };
}

const itemsOf = <T>(result: unknown[] | null | undefined): T[] => ((result?.[0] as { items?: T[] | null } | undefined)?.items ?? []);

/** Podpowiedzi fraz dla hasła (DataForSEO Labs, live), razem z samym hasłem. Koszt: zadanie plus wiersze zwrócone w odpowiedzi. */
export async function keywordSuggestions(seed: string, limit = 50): Promise<{ items: LabsKeyword[]; costUsd: number }> {
  const res = await dfsRequest("POST", SUGGESTIONS_PATH, [
    { keyword: seed, location_code: dfsLocationCode(), language_code: "pl", limit, include_seed_keyword: true },
  ]);
  return { items: itemsOf<RawKeywordData>(res.tasks?.[0]?.result).map(toLabsKeyword), costUsd: res.cost ?? 0 };
}

/** Frazy, na które domena widnieje w organicznych wynikach Google (DataForSEO Labs, live), od największego wolumenu. */
export async function rankedKeywords(target: string, limit = 100): Promise<{ items: RankedKeyword[]; costUsd: number }> {
  const res = await dfsRequest("POST", RANKED_KEYWORDS_PATH, [
    {
      target, location_code: dfsLocationCode(), language_code: "pl", limit,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
    },
  ]);
  const items: RankedKeyword[] = [];
  for (const raw of itemsOf<RawRankedItem>(res.tasks?.[0]?.result)) {
    const serp = raw.ranked_serp_element?.serp_item;
    if (serp?.type !== "organic" || typeof serp.rank_group !== "number" || typeof serp.url !== "string") continue;
    items.push({ ...toLabsKeyword(raw.keyword_data), position: serp.rank_group, url: serp.url });
  }
  return { items, costUsd: res.cost ?? 0 };
}
