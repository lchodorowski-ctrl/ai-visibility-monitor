const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  // tylko <loc> w przestrzeni nazw sitemapy (prefiks z tagu <urlset>/<sitemapindex>, najczęściej brak);
  // dzięki temu <image:loc>, <video:loc>, <news:…> z rozszerzeń nie trafiają na listę stron
  const root = xml.match(/<(?:(\w+):)?(urlset|sitemapindex)[\s>]/i);
  const prefix = root?.[1] ? `${root[1]}:` : "";
  const loc = new RegExp(`<${prefix}loc>\\s*(?:<!\\[CDATA\\[)?\\s*([^<\\s\\]]+)\\s*(?:\\]\\]>)?\\s*<\\/${prefix}loc>`, "g");
  const locs = [...xml.matchAll(loc)].map((m) => decodeXml(m[1]));
  const isIndex = root?.[2].toLowerCase() === "sitemapindex";
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
