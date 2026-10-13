import { createHash } from "node:crypto";
import { foldText } from "@/lib/extract/normalize";
import { isConcreteUrl, normalizeTargetUrl } from "@/lib/recommend/target-url";

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

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/** Parses a concrete target (site path or absolute http(s) URL) or returns null; paths resolve against a dummy origin. */
function parseTarget(targetUrl: string | null): URL | null {
  const t = normalizeTargetUrl(targetUrl);
  if (!t || !isConcreteUrl(t)) return null;
  try {
    return new URL(t, "http://path.invalid");
  } catch {
    return null;
  }
}

/** Lowercase path without trailing slash, query or hash ("/" stays "/"); null when there is no usable target. */
function normalizedPath(targetUrl: string | null): string | null {
  const u = parseTarget(targetUrl);
  if (!u) return null;
  return u.pathname.toLowerCase().replace(/\/+$/, "") || "/";
}

/** Lowercase host without "www."; null unless the target is an absolute URL. */
function normalizedHost(targetUrl: string | null): string | null {
  const u = parseTarget(targetUrl);
  if (!u || u.hostname === "path.invalid") return null;
  return u.hostname.toLowerCase().replace(/^www\./, "") || null;
}

/** User-generated-content hosts: one host holds many unrelated pages, so offsite recommendations there key on the page, not the host. */
const UGC_HOSTS = ["linkedin.com", "facebook.com", "youtube.com", "youtu.be", "medium.com", "reddit.com", "wykop.pl", "x.com", "twitter.com", "instagram.com", "quora.com", "substack.com", "tiktok.com"];

/** Offsite key: host for directory-style sites, registered domain + path (+ video id) for UGC hosts ("pl.linkedin.com" = "www.linkedin.com"). */
function offsiteKey(targetUrl: string | null): string | null {
  const host = normalizedHost(targetUrl);
  if (host == null) return null;
  const d = UGC_HOSTS.find((h) => host === h || host.endsWith(`.${h}`));
  if (!d) return host;
  const u = parseTarget(targetUrl)!;
  // video ids are case-sensitive, so youtu.be paths and the youtube "v" param are not lowercased
  let page = d === "youtu.be" ? u.pathname.replace(/\/+$/, "") : (normalizedPath(targetUrl) ?? "");
  if (d === "youtube.com") {
    const v = u.searchParams.get("v");
    if (v) page += `?v=${v}`;
  }
  return `${d}${page}`;
}

/**
 * Dedup key of a recommendation. Titles vary run to run, the target does not, so it is the identity:
 * content_improve / content_new = target path, offsite = target host (different pages of one directory are one job) or, on UGC hosts like LinkedIn, the page,
 * technical / fact_fix and anything without a usable target = title.
 */
export function fingerprintFor(item: { type: string; title: string; target_url: string | null }): string {
  if (item.type === "content_improve" || item.type === "content_new") {
    const path = normalizedPath(item.target_url);
    if (path != null) return sha1(`${item.type}:${path}`);
  } else if (item.type === "offsite") {
    const key = offsiteKey(item.target_url);
    if (key != null) return sha1(`offsite:${key}`);
  }
  return fingerprint(item.type, item.title);
}

/**
 * Union of keys with the MAX count per key. Max (not sum) keeps the merge idempotent:
 * re-running the same day (retry, manual refresh) must not inflate the counts.
 */
function maxCounts<K extends string, T extends { count: number } & Record<K, string>>(key: K, a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) {
    const prev = m.get(x[key]);
    m.set(x[key], prev ? { ...prev, count: Math.max(prev.count, x.count) } : { ...x });
  }
  return [...m.values()];
}

/** Merges two evidence blobs describing the same recommendation (e.g. from two prompts); idempotent: merge(merge(a, b), b) = merge(a, b). */
export function mergeEvidence(a: Evidence, b: Evidence): Evidence {
  return {
    prompt_ids: [...new Set([...a.prompt_ids, ...b.prompt_ids])],
    visibility_by_engine: { ...a.visibility_by_engine, ...b.visibility_by_engine },
    cited_domains: maxCounts("domain", a.cited_domains, b.cited_domains),
    cited_urls: [...new Set([...a.cited_urls, ...b.cited_urls])].slice(0, MAX_URLS),
    competitors_mentioned: maxCounts("name", a.competitors_mentioned, b.competitors_mentioned),
    sample_quotes: [...new Set([...a.sample_quotes, ...b.sample_quotes])].slice(0, MAX_QUOTES),
  };
}

/** Prompt ids stored in a recommendation's evidence (jsonb, so validated defensively). */
export function evidencePromptIds(evidence: unknown): string[] {
  const ids = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? (evidence as { prompt_ids?: unknown }).prompt_ids : undefined;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}
