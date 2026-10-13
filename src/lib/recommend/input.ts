import { foldText } from "@/lib/extract/normalize";

export interface RecommendationInput {
  prompt: { id: string; text: string; intent: string; topic: string | null };
  visibility: { overall: number | null; byEngine: Record<string, number> };
  excerpts: { engineId: string; text: string }[];
  citedDomains: { domain: string; count: number }[];
  citedUrls: string[];
  competitorsMentioned: { name: string; count: number }[];
  brand: { name: string; aliases: string[]; domains: string[]; facts: unknown; siteUrl: string };
  sitePages: { path: string; title: string | null; description: string | null }[];
  existing: { type: string; title: string }[];
}

const MAX_EXCERPTS_PER_ENGINE = 2;
const MAX_CITED_URLS = 10;
const MAX_SITE_PAGES = 120;
const FALLBACK_EXCERPT_CHARS = 800;

/**
 * Folds text for case/diacritic-insensitive search and returns, for every UTF-16 unit
 * of the folded string, the index of the original character it came from. This keeps
 * offsets valid even when folding changes the length (NFD input, combining marks).
 */
function foldWithMap(text: string): { folded: string; origIndex: number[] } {
  let folded = "";
  const origIndex: number[] = [];
  let pos = 0;
  for (const ch of text) {
    const f = foldText(ch);
    for (let k = 0; k < f.length; k++) origIndex.push(pos);
    folded += f;
    pos += ch.length;
  }
  return { folded, origIndex };
}

export function buildExcerpt(text: string, competitorAliases: string[], radius = 400): string {
  const { folded, origIndex } = foldWithMap(text);
  let hit = -1;
  let hitLen = 0;
  for (const alias of competitorAliases) {
    const needle = foldText(alias).trim();
    if (!needle) continue;
    const i = folded.indexOf(needle);
    if (i >= 0 && (hit < 0 || i < hit)) { hit = i; hitLen = needle.length; }
  }
  if (hit < 0) return text.slice(0, FALLBACK_EXCERPT_CHARS);
  const origStart = origIndex[hit];
  const origEnd = hit + hitLen < origIndex.length ? origIndex[hit + hitLen] : text.length;
  const start = Math.max(0, origStart - radius);
  const end = Math.min(text.length, Math.max(origStart + radius, origEnd));
  return text.slice(start, end);
}

const sortDesc = <T extends { count: number }>(x: T[]) => x.sort((a, b) => b.count - a.count);

export function buildRecommendationInput(args: {
  prompt: RecommendationInput["prompt"];
  visibility: RecommendationInput["visibility"];
  responses: {
    engineId: string;
    text: string;
    citations: { url: string; domain: string }[];
    mentions: { kind: "own" | "competitor"; name: string }[];
  }[];
  brand: RecommendationInput["brand"];
  sitePages: RecommendationInput["sitePages"];
  existing: RecommendationInput["existing"];
  competitorAliases: string[];
}): RecommendationInput {
  const perEngine = new Map<string, number>();
  const excerpts: { engineId: string; text: string }[] = [];
  const domains = new Map<string, number>();
  const urls = new Set<string>();
  const comps = new Map<string, number>();
  for (const r of args.responses) {
    const n = perEngine.get(r.engineId) ?? 0;
    if (n < MAX_EXCERPTS_PER_ENGINE) {
      excerpts.push({ engineId: r.engineId, text: buildExcerpt(r.text, args.competitorAliases) });
      perEngine.set(r.engineId, n + 1);
    }
    for (const c of r.citations) {
      domains.set(c.domain, (domains.get(c.domain) ?? 0) + 1);
      if (urls.size < MAX_CITED_URLS) urls.add(c.url);
    }
    for (const m of r.mentions) if (m.kind === "competitor") comps.set(m.name, (comps.get(m.name) ?? 0) + 1);
  }
  return {
    prompt: args.prompt,
    visibility: args.visibility,
    excerpts,
    citedDomains: sortDesc([...domains].map(([domain, count]) => ({ domain, count }))),
    citedUrls: [...urls],
    competitorsMentioned: sortDesc([...comps].map(([name, count]) => ({ name, count }))),
    brand: args.brand,
    sitePages: args.sitePages.slice(0, MAX_SITE_PAGES),
    existing: args.existing,
  };
}
