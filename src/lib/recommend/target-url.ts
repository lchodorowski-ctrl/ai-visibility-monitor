/** Shared target_url rules for the generator guard and the UI (no SDK imports, safe for components). */

const BARE_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i;
const ABSOLUTE = /^https?:\/\/\S+/i;

/** A site path ("/…", but not protocol-relative "//host") or an absolute http(s) URL. */
export function isConcreteUrl(u: string | null): boolean {
  const t = u?.trim() ?? "";
  return (t.startsWith("/") && !t.startsWith("//")) || ABSOLUTE.test(t);
}

/** Trims target_url and turns a bare domain ("parp.gov.pl/kurs") into a full https URL; other values are returned trimmed. */
export function normalizeTargetUrl(u: string | null): string | null {
  if (u == null) return null;
  const t = u.trim();
  return BARE_DOMAIN.test(t) ? `https://${t}` : t;
}

/**
 * Absolute URL to open for a recommendation's target: a path points at the brand's site
 * (`siteUrl`), never at this app. Returns null when the value is not a usable link.
 */
export function resolveTargetUrl(url: string, siteUrl: string): string | null {
  const t = normalizeTargetUrl(url) ?? "";
  if (ABSOLUTE.test(t)) return t;
  if (!isConcreteUrl(t)) return null;
  try {
    return new URL(t, siteUrl).toString();
  } catch {
    return null;
  }
}
