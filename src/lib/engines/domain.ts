import type { Citation } from "./types";

export function normalizeDomain(urlOrHost: string): string {
  const s = urlOrHost.trim().toLowerCase();
  if (!s) return "";
  const withProto = /^[a-z]+:\/\//.test(s) ? s : `https://${s}`;
  try {
    const host = new URL(withProto).hostname;
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

export function toCitation(url: string, title?: string): Citation | null {
  if (!/^https?:\/\//i.test(url)) return null;
  const domain = normalizeDomain(url);
  if (!domain) return null;
  return title ? { url, domain, title } : { url, domain };
}

export function dedupeCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}
