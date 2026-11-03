import { domainMatches, normalizeDomain } from "@/lib/engines/domain";

export interface SerpFeatures {
  aiOverview: boolean;
  aiOverviewCitesUs: boolean;
  featuredSnippet: boolean;
  featuredSnippetOurs: boolean;
  localPack: boolean;
  peopleAlsoAsk: boolean;
  knowledgePanelOurs: boolean;
}

export interface SerpEntry {
  position: number;
  domain: string;
  /** Adres wyniku; null, gdy Google ukrył go za przekierowaniem (wtedy widać tylko breadcrumb). */
  url: string | null;
  title: string;
  breadcrumb: string | null;
}

export interface CompetitorRank {
  name: string;
  domain: string;
  position: number;
  url: string | null;
}

export interface RankReading {
  /** Pozycja w wynikach organicznych (rank_group); null, gdy nas nie ma w sprawdzonej głębokości. */
  position: number | null;
  rankAbsolute: number | null;
  url: string | null;
  breadcrumb: string | null;
  features: SerpFeatures;
  top10: SerpEntry[];
  competitors: CompetitorRank[];
}

interface RawReference {
  domain?: string | null;
  url?: string | null;
}

interface RawItem {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  domain?: string | null;
  url?: string | null;
  title?: string | null;
  breadcrumb?: string | null;
  is_featured_snippet?: boolean | null;
  references?: RawReference[] | null;
  items?: RawItem[] | null;
}

/** Wynik, który Google pokazuje za przekierowaniem (`https://google.com/goto?url=…`): domena pola `domain` to wtedy google.com. */
const REDIRECT_URL = /^https?:\/\/(www\.)?google\.[a-z.]+\/goto\?/i;
const BREADCRUMB_SEPARATOR = " › ";

interface Resolved {
  domain: string;
  url: string | null;
  breadcrumb: string | null;
}

/**
 * Prawdziwa domena wyniku. Przy przekierowaniu jest tylko w breadcrumb („https://www.telewizjagorzow.pl › Artykuły”,
 * czasem sam host), adres jest wtedy nieznany. Breadcrumb bez hosta („Wyświetlenia: ponad 5,6 tys.”) daje pustą domenę.
 */
function resolve(item: RawItem): Resolved {
  const url = item.url ?? null;
  const breadcrumb = item.breadcrumb ?? null;
  if (url !== null && REDIRECT_URL.test(url)) {
    return { domain: normalizeDomain((breadcrumb ?? "").split(BREADCRUMB_SEPARATOR)[0]), url: null, breadcrumb };
  }
  return { domain: normalizeDomain(item.domain || url || ""), url, breadcrumb };
}

const referenceDomain = (ref: RawReference): string => normalizeDomain(ref.domain || ref.url || "");

/** The plain objects of a list from the provider: a missing list, a non-list, `null` or a scalar element is dropped, not thrown on. */
function objectsOf<T extends object>(list: unknown): T[] {
  return Array.isArray(list) ? list.filter((el): el is T => typeof el === "object" && el !== null && !Array.isArray(el)) : [];
}

function citesAnyOf(overview: RawItem, domains: string[]): boolean {
  const references = [
    ...objectsOf<RawReference>(overview.references),
    ...objectsOf<RawItem>(overview.items).flatMap((el) => objectsOf<RawReference>(el.references)),
  ];
  return references.some((ref) => domainMatches(referenceDomain(ref), domains));
}

const emptyFeatures = (): SerpFeatures => ({
  aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false,
  localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false,
});

function parseFeatures(items: RawItem[], ownDomains: string[]): SerpFeatures {
  const features = emptyFeatures();
  for (const item of items) {
    switch (item.type) {
      case "ai_overview":
        features.aiOverview = true;
        if (citesAnyOf(item, ownDomains)) features.aiOverviewCitesUs = true;
        break;
      case "local_pack":
        features.localPack = true;
        break;
      case "people_also_ask":
        features.peopleAlsoAsk = true;
        break;
      case "knowledge_graph":
        if (domainMatches(item.url ?? "", ownDomains)) features.knowledgePanelOurs = true;
        break;
    }
    // Wyróżniony fragment to osobny element albo wynik organiczny z flagą.
    if (item.type === "featured_snippet" || (item.type === "organic" && item.is_featured_snippet)) {
      features.featuredSnippet = true;
      if (domainMatches(resolve(item).domain, ownDomains)) features.featuredSnippetOurs = true;
    }
  }
  return features;
}

/**
 * Odczyt pozycji z wyniku SERP (`tasks[0].result[0]` z DataForSEO): nasza pozycja organiczna, top 10, konkurenci
 * i elementy SERP. Domena wyniku przekierowanego pochodzi z breadcrumb, więc nigdy nie liczy się jako google.com.
 * Brak wyniku albo `items` daje pusty odczyt (pozycja null); element listy, który nie jest obiektem (`null`, liczba),
 * jest pomijany.
 */
export function parseSerp(
  result: unknown,
  ctx: { ownDomains: string[]; competitors: { name: string; domains: string[] }[] },
): RankReading {
  const items = objectsOf<RawItem>((result as { items?: unknown } | null | undefined)?.items);

  const organic = items
    .filter((item) => item.type === "organic" && typeof item.rank_group === "number")
    .sort((a, b) => (a.rank_group as number) - (b.rank_group as number))
    .map((item) => ({ item, position: item.rank_group as number, ...resolve(item) }));

  const own = organic.find((o) => domainMatches(o.domain, ctx.ownDomains));
  const competitors: CompetitorRank[] = [];
  for (const competitor of ctx.competitors) {
    const best = organic.find((o) => domainMatches(o.domain, competitor.domains));
    if (best) competitors.push({ name: competitor.name, domain: best.domain, position: best.position, url: best.url });
  }

  return {
    position: own?.position ?? null,
    rankAbsolute: own?.item.rank_absolute ?? null,
    url: own?.url ?? null,
    breadcrumb: own?.breadcrumb ?? null,
    features: parseFeatures(items, ctx.ownDomains),
    top10: organic.slice(0, 10).map((o) => ({ position: o.position, domain: o.domain, url: o.url, title: o.item.title ?? "", breadcrumb: o.breadcrumb })),
    competitors: competitors.sort((a, b) => a.position - b.position),
  };
}
