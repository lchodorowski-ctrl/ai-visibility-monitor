import { describe, it, expect, vi } from "vitest";
import { discoverUrls, crawlSite } from "@/lib/site/crawl";
const SITE = "https://polskaszkolaai.netlify.app";
function fakeFetch(routes: Record<string, { status?: number; body: string }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const r = routes[url];
    if (!r) return new Response("nope", { status: 404 });
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}
describe("discoverUrls", () => {
  it("czyta sitemap.xml, przepisuje host, deduplikuje, limit 200", async () => {
    const locs = Array.from({ length: 205 }, (_, i) => `<url><loc>https://polskaszkola.ai/p${i}.html</loc></url>`).join("");
    const f = fakeFetch({ [`${SITE}/sitemap.xml`]: { body: `<urlset>${locs}<url><loc>https://polskaszkola.ai/p1.html</loc></url></urlset>` } });
    const urls = await discoverUrls(SITE, f);
    expect(urls).toHaveLength(200);
    expect(urls[0]).toBe(`${SITE}/p0.html`);
  });
  it("obsługuje sitemapindex", async () => {
    const f = fakeFetch({
      [`${SITE}/sitemap.xml`]: { body: `<sitemapindex><sitemap><loc>https://polskaszkola.ai/s1.xml</loc></sitemap></sitemapindex>` },
      [`${SITE}/s1.xml`]: { body: `<urlset><url><loc>https://polskaszkola.ai/a.html</loc></url></urlset>` },
    });
    expect(await discoverUrls(SITE, f)).toEqual([`${SITE}/a.html`]);
  });
  it("brak sitemapy → []", async () => { expect(await discoverUrls(SITE, fakeFetch({}))).toEqual([]); });
});
describe("crawlSite", () => {
  it("pobiera strony z sitemapy, respektuje robots, zapisuje status", async () => {
    const f = fakeFetch({
      [`${SITE}/robots.txt`]: { body: "User-agent: *\nDisallow: /tajne" },
      [`${SITE}/sitemap.xml`]: { body: `<urlset><url><loc>https://polskaszkola.ai/</loc></url><url><loc>https://polskaszkola.ai/tajne.html</loc></url><url><loc>https://polskaszkola.ai/brak.html</loc></url></urlset>` },
      [`${SITE}/`]: { body: `<html><head><title>Start</title></head><body><main><h1>PSAI</h1><p>Hej</p></main></body></html>` },
    });
    const pages = await crawlSite(SITE, { fetchImpl: f, concurrency: 2, timeoutMs: 1000 });
    expect(pages.map((p) => [p.path, p.status])).toEqual([["/", 200], ["/brak.html", 404]]);
    expect(pages[0]).toMatchObject({ title: "Start", h1: "PSAI", excerpt: "PSAI Hej" });
  });
});
