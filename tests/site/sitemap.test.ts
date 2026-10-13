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
describe("parseSitemap — warianty XML", () => {
  it("CDATA w <loc>", () => {
    const xml = `<urlset><url><loc><![CDATA[https://a.pl/x.html]]></loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://a.pl/x.html"]);
  });
  it("tagi z prefiksem przestrzeni nazw", () => {
    const xml = `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>https://a.pl/y.html</sm:loc></sm:url></sm:urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://a.pl/y.html"]);
  });
  it("ignoruje <image:loc> i inne rozszerzenia wewnątrz <url>", () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://a.pl/page.html</loc><image:image><image:loc>https://cdn.a.pl/img.jpg</image:loc></image:image></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://a.pl/page.html"]);
  });
  it("prefiksowana sitemapa też ignoruje rozszerzenia", () => {
    const xml = `<sm:urlset xmlns:sm="s" xmlns:image="i"><sm:url><sm:loc>https://a.pl/p.html</sm:loc><image:image><image:loc>https://cdn.a.pl/i.jpg</image:loc></image:image></sm:url></sm:urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://a.pl/p.html"]);
  });
  it("dekoduje &amp; w query", () => {
    const xml = `<urlset><url><loc>https://a.pl/p?a=1&amp;b=2</loc></url></urlset>`;
    expect(parseSitemap(xml).urls).toEqual(["https://a.pl/p?a=1&b=2"]);
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
