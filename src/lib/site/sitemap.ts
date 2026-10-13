export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

export function rewriteHost(url: string, baseUrl: string): string {
  const u = new URL(url), b = new URL(baseUrl);
  u.protocol = b.protocol; u.host = b.host; u.hash = "";
  return u.toString();
}
