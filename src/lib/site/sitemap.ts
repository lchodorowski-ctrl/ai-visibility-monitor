const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<(?:\w+:)?loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/(?:\w+:)?loc>/g)].map((m) => decodeXml(m[1]));
  const isIndex = /<(?:\w+:)?sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

export function rewriteHost(url: string, baseUrl: string): string {
  const u = new URL(url), b = new URL(baseUrl);
  u.protocol = b.protocol; u.host = b.host; u.hash = "";
  return u.toString();
}

/** Jak rewriteHost, ale zwraca null dla nieprawidłowego URL-a (względnego, śmieci). */
export function tryRewriteHost(url: string, baseUrl: string): string | null {
  try { return rewriteHost(url, baseUrl); } catch { return null; }
}
