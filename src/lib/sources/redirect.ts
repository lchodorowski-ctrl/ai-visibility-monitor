/**
 * Stand-in for `REDIRECT_HOSTS` / `isRedirectHost` / `domainFromTitle` from `@/lib/engines/domain`, which are not on
 * this branch yet (Gemini citation fix). Same names and behaviour, so switching is an import change.
 */
import { normalizeDomain } from "@/lib/engines/domain";

/** Hosts an engine routes its sources through (Gemini grounding); the real source domain is then in the title. */
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
