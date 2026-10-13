import { createHash } from "node:crypto";
import { foldText } from "@/lib/extract/normalize";

export interface Evidence {
  prompt_ids: string[];
  visibility_by_engine: Record<string, number>;
  cited_domains: { domain: string; count: number }[];
  cited_urls: string[];
  competitors_mentioned: { name: string; count: number }[];
  sample_quotes: string[];
}

const MAX_URLS = 20;
const MAX_QUOTES = 6;

/** Diacritics-free, lowercase, punctuation-free, single-spaced title without brand tokens. */
export function normalizeTitle(t: string): string {
  return foldText(t)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    // Brand tokens as whole words; applied twice so adjacent tokens ("psai psai") share no consumed space.
    .replace(/(^| )(polska szkola ai|psai)(?= |$)/g, " ")
    .replace(/(^| )(polska szkola ai|psai)(?= |$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprint(type: string, title: string): string {
  return createHash("sha1").update(`${type}:${normalizeTitle(title)}`).digest("hex");
}

function sumCounts<K extends string, T extends { count: number } & Record<K, string>>(key: K, a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const prev = m.get(x[key]);
    m.set(x[key], prev ? { ...prev, count: prev.count + x.count } : { ...x });
  }
  return [...m.values()];
}

/** Merges two evidence blobs describing the same recommendation (e.g. from two prompts). */
export function mergeEvidence(a: Evidence, b: Evidence): Evidence {
  return {
    prompt_ids: [...new Set([...a.prompt_ids, ...b.prompt_ids])],
    visibility_by_engine: { ...a.visibility_by_engine, ...b.visibility_by_engine },
    cited_domains: sumCounts("domain", a.cited_domains, b.cited_domains),
    cited_urls: [...new Set([...a.cited_urls, ...b.cited_urls])].slice(0, MAX_URLS),
    competitors_mentioned: sumCounts("name", a.competitors_mentioned, b.competitors_mentioned),
    sample_quotes: [...a.sample_quotes, ...b.sample_quotes].slice(0, MAX_QUOTES),
  };
}
