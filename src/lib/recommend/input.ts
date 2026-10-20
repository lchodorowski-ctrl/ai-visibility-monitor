import { foldText } from "@/lib/extract/normalize";
import type { TargetPresence } from "./target-presence";

export interface RecommendationInput {
  prompt: { id: string; text: string; intent: string; topic: string | null };
  visibility: { overall: number | null; byEngine: Record<string, number> };
  excerpts: { engineId: string; text: string }[];
  /** Short evidence quotes shown in the UI (one per engine), never sent to the model. */
  quotes: { engineId: string; responseId: string | null; text: string }[];
  citedDomains: { domain: string; count: number }[];
  /** Most cited first. */
  citedUrls: string[];
  /** Brand presence on the off-site cited pages; absent = not checked. */
  targets?: TargetPresence[];
  competitorsMentioned: { name: string; count: number }[];
  brand: { name: string; aliases: string[]; domains: string[]; facts: unknown; siteUrl: string };
  sitePages: { path: string; title: string | null; description: string | null }[];
  existing: { type: string; title: string }[];
}

const MAX_EXCERPTS_PER_ENGINE = 2;
const MAX_CITED_URLS = 10;
const MAX_SITE_PAGES = 120;
const EXCERPT_RADIUS = 400;
const FALLBACK_EXCERPT_CHARS = 800;
const QUOTE_RADIUS = 160;
const QUOTE_FALLBACK_CHARS = 320;

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

type Hit = { start: number; end: number };

/** Original-text range of the earliest competitor alias (case/diacritic-insensitive), or null. */
function firstHit(text: string, competitorAliases: string[]): Hit | null {
  const { folded, origIndex } = foldWithMap(text);
  let hit = -1;
  let hitLen = 0;
  for (const alias of competitorAliases) {
    const needle = foldText(alias).trim();
    if (!needle) continue;
    const i = folded.indexOf(needle);
    if (i >= 0 && (hit < 0 || i < hit)) { hit = i; hitLen = needle.length; }
  }
  if (hit < 0) return null;
  return { start: origIndex[hit], end: hit + hitLen < origIndex.length ? origIndex[hit + hitLen] : text.length };
}

function excerptAt(text: string, hit: Hit | null, radius: number, fallbackChars: number): string {
  if (!hit) return text.slice(0, fallbackChars);
  const start = Math.max(0, hit.start - radius);
  const end = Math.min(text.length, Math.max(hit.start + radius, hit.end));
  return text.slice(start, end);
}

/** Evidence quote: a window around the hit snapped to whole words, with "…" where the answer was cut. */
function quoteAt(text: string, hit: Hit | null): string {
  let start = hit ? Math.max(0, hit.start - QUOTE_RADIUS) : 0;
  let end = hit ? Math.min(text.length, Math.max(hit.start + QUOTE_RADIUS, hit.end)) : Math.min(text.length, QUOTE_FALLBACK_CHARS);
  if (start > 0) {
    const ws = text.slice(start, hit?.start ?? end).search(/\s/);
    if (ws >= 0) start += ws + 1;
  }
  if (end < text.length) {
    const tail = text.slice(hit?.end ?? start, end);
    const ws = Math.max(tail.lastIndexOf(" "), tail.lastIndexOf("\n"));
    if (ws >= 0) end = (hit?.end ?? start) + ws;
  }
  const body = text.slice(start, end).trim();
  return body && `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

export function buildExcerpt(text: string, competitorAliases: string[], radius = EXCERPT_RADIUS): string {
  return excerptAt(text, firstHit(text, competitorAliases), radius, FALLBACK_EXCERPT_CHARS);
}

const sortDesc = <T extends { count: number }>(x: T[]) => x.sort((a, b) => b.count - a.count);

export function buildRecommendationInput(args: {
  prompt: RecommendationInput["prompt"];
  visibility: RecommendationInput["visibility"];
  responses: {
    id?: string;
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
  const urls = new Map<string, number>();
  const comps = new Map<string, number>();
  // one quote per engine, preferring a response that names a competitor
  const quotes = new Map<string, { engineId: string; responseId: string | null; text: string; hit: boolean }>();
  for (const r of args.responses) {
    const hit = firstHit(r.text, args.competitorAliases);
    const n = perEngine.get(r.engineId) ?? 0;
    if (n < MAX_EXCERPTS_PER_ENGINE) {
      excerpts.push({ engineId: r.engineId, text: excerptAt(r.text, hit, EXCERPT_RADIUS, FALLBACK_EXCERPT_CHARS) });
      perEngine.set(r.engineId, n + 1);
    }
    const prev = quotes.get(r.engineId);
    if (!prev || (!prev.hit && hit)) {
      const text = quoteAt(r.text, hit);
      if (text) quotes.set(r.engineId, { engineId: r.engineId, responseId: r.id ?? null, text, hit: hit != null });
    }
    for (const c of r.citations) {
      domains.set(c.domain, (domains.get(c.domain) ?? 0) + 1);
      urls.set(c.url, (urls.get(c.url) ?? 0) + 1);
    }
    for (const m of r.mentions) if (m.kind === "competitor") comps.set(m.name, (comps.get(m.name) ?? 0) + 1);
  }
  return {
    prompt: args.prompt,
    visibility: args.visibility,
    excerpts,
    quotes: [...quotes.values()].map(({ engineId, responseId, text }) => ({ engineId, responseId, text })),
    citedDomains: sortDesc([...domains].map(([domain, count]) => ({ domain, count }))),
    // stable sort: equally cited URLs keep the order they were first seen in
    citedUrls: sortDesc([...urls].map(([url, count]) => ({ url, count }))).slice(0, MAX_CITED_URLS).map((u) => u.url),
    competitorsMentioned: sortDesc([...comps].map(([name, count]) => ({ name, count }))),
    brand: args.brand,
    sitePages: args.sitePages.slice(0, MAX_SITE_PAGES),
    existing: args.existing,
  };
}
