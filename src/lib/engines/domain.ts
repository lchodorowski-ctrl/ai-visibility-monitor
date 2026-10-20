import type { Citation } from "./types";

export function normalizeDomain(urlOrHost: string): string {
  const s = urlOrHost.trim().toLowerCase();
  if (!s) return "";
  const withProto = /^[a-z]+:\/\//.test(s) ? s : `https://${s}`;
  try {
    const host = new URL(withProto).hostname.replace(/\.$/, "");
    if (!host.includes(".")) return "";
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function domainMatches(domain: string, candidates: string[]): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  return candidates.some((c) => {
    const n = normalizeDomain(c);
    return n !== "" && (d === n || d.endsWith(`.${n}`));
  });
}

/** Hosts an engine routes its sources through (Gemini grounding: vertexaisearch/grounding-api-redirect/...); the real source domain is then in the title. */
export const REDIRECT_HOSTS = ["vertexaisearch.cloud.google.com"];

export function isRedirectHost(domain: string): boolean {
  return REDIRECT_HOSTS.includes(normalizeDomain(domain));
}

/** Source domain of a redirect citation, taken from a title that is a bare host ("comarch.pl"); "" when the title is anything else. */
export function domainFromTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t || /\s/.test(t)) return "";
  const d = normalizeDomain(t);
  return d && !isRedirectHost(d) ? d : "";
}

export function toCitation(url: string, title?: string): Citation | null {
  if (!/^https?:\/\//i.test(url)) return null;
  let domain = normalizeDomain(url);
  if (!domain) return null;
  if (isRedirectHost(domain)) domain = domainFromTitle(title) || domain;
  return title ? { url, domain, title } : { url, domain };
}

export function dedupeCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}
