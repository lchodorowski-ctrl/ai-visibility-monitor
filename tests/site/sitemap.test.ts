import { describe, it, expect } from "vitest";
import { parseSitemap, rewriteHost } from "@/lib/site/sitemap";
describe("parseSitemap", () => {
  it("urlset → urls", () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://polskaszkola.ai/</loc></url><url><loc> https://polskaszkola.ai/faq.html </loc><lastmod>2026-01-01</lastmod></url></urlset>`;
    expect(parseSitemap(xml)).toEqual({ urls: ["https://polskaszkola.ai/", "https://polskaszkola.ai/faq.html"], sitemaps: [] });
  });
  it("sitemapindex → sitemaps", () => {
    const xml = `<sitemapindex><sitemap><loc>https://x.pl/a.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({ urls: [], sitemaps: ["https://x.pl/a.xml"] });
  });
});
describe("rewriteHost", () => {
  it("podmienia host na host site_url, zachowuje ścieżkę i query", () => {
    expect(rewriteHost("https://polskaszkola.ai/szkolenia.html?x=1", "https://polskaszkolaai.netlify.app")).toBe("https://polskaszkolaai.netlify.app/szkolenia.html?x=1");
  });
  it("usuwa fragment", () => {
    expect(rewriteHost("https://a.pl/p#sekcja", "https://b.pl")).toBe("https://b.pl/p");
  });
});
