/** Shared target_url rules for the generator guard and the UI (no SDK imports, safe for components). */

// host = at least one label plus a TLD ("parp.gov.pl"), optionally followed by a path
const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/.*)?$/i;
// "sitemap.xml" or "szkolenia-ai.html" look like host.tld but are files, not domains
const FILE_EXTENSION = /\.(?:txt|xml|html?|pdf|json|css|js|png|jpe?g|svg|webp)$/i;

function isBareDomain(t: string): boolean {
  if (!BARE_DOMAIN.test(t)) return false;
  const host = t.split("/")[0];
  return !FILE_EXTENSION.test(host);
}
const ABSOLUTE = /^https?:\/\/\S+/i;

/** A site path ("/…", but not protocol-relative "//host" or its "/\host" browser alias) or an absolute http(s) URL. */
export function isConcreteUrl(u: string | null): boolean {
  const t = u?.trim() ?? "";
  return (t.startsWith("/") && !/^\/[\\/]/.test(t)) || ABSOLUTE.test(t);
}

/** Trims target_url and turns a bare domain ("parp.gov.pl/kurs") into a full https URL; other values are returned trimmed. */
export function normalizeTargetUrl(u: string | null): string | null {
  if (u == null) return null;
  const t = u.trim();
  return isBareDomain(t) ? `https://${t}` : t;
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
