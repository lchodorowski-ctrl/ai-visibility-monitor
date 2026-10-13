import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { parseSitemap, tryRewriteHost } from "./sitemap";
import { extractPage } from "./extract";
import { isAllowedByRobots } from "./robots";

const UA = "PSAI-VisibilityBot/1.0 (+https://polskaszkola.ai)";
const MAX_PAGES = 200;

export interface CrawledPage { url: string; path: string; title: string | null; h1: string | null; description: string | null; excerpt: string; status: number }

async function getText(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    return { status: res.status, body: res.ok ? await res.text() : "" };
  } catch { return { status: 0, body: "" }; }
}

export async function discoverUrls(siteUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 15000): Promise<string[]> {
  const base = siteUrl.replace(/\/+$/, "");
  const seen = new Set<string>(); const out: string[] = [];
  const rootMap = `${base}/sitemap.xml`;
  const queue = [rootMap]; const visitedMaps = new Set<string>();
  while (queue.length && out.length < MAX_PAGES) {
    const mapUrl = queue.shift()!; if (visitedMaps.has(mapUrl)) continue; visitedMaps.add(mapUrl);
    const { status, body } = await getText(fetchImpl, mapUrl, timeoutMs);
    const ok = status >= 200 && status < 300;
    // błąd głównej sitemapy ma przerwać zadanie, a nie po cichu wyzerować mapę strony
    if (!ok && mapUrl === rootMap) throw new Error(`sitemap: ${status} ${mapUrl}`);
    if (!ok || !body) continue;
    const { urls, sitemaps } = parseSitemap(body);
    for (const s of sitemaps) { const r = tryRewriteHost(s, base); if (r) queue.push(r); }
    for (const u of urls) {
      const r = tryRewriteHost(u, base); // nieprawidłowy <loc> pomijamy
      if (r && !seen.has(r)) { seen.add(r); out.push(r); if (out.length >= MAX_PAGES) break; }
    }
  }
  return out;
}

export async function crawlSite(siteUrl: string, opts: { fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number; maxPages?: number } = {}): Promise<CrawledPage[]> {
  const fetchImpl = opts.fetchImpl ?? fetch, concurrency = opts.concurrency ?? 4, timeoutMs = opts.timeoutMs ?? 15000;
  const base = siteUrl.replace(/\/+$/, "");
  const robots = (await getText(fetchImpl, `${base}/robots.txt`, timeoutMs)).body;
  const urls = (await discoverUrls(base, fetchImpl, timeoutMs)).slice(0, opts.maxPages ?? MAX_PAGES)
    .filter((u) => isAllowedByRobots(robots, new URL(u).pathname));
  const pages: CrawledPage[] = new Array(urls.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const i = next++; const url = urls[i];
      const { status, body } = await getText(fetchImpl, url, timeoutMs);
      pages[i] = { url, path: new URL(url).pathname, status, ...extractPage(status === 200 ? body : "") };
    }
  }));
  return pages;
}

export async function persistSitePages(admin: SupabaseClient<Database>, projectId: string, pages: CrawledPage[]): Promise<{ upserted: number; retired: number }> {
  // pusty wynik crawla nie znaczy, że strony zniknęły — nie wygaszamy istniejących wierszy
  if (pages.length === 0) return { upserted: 0, retired: 0 };
  const { error: upsertError } = await admin.from("site_pages").upsert(
    pages.map((p) => ({ project_id: projectId, url: p.url, path: p.path, title: p.title, h1: p.h1, description: p.description, excerpt: p.excerpt, status: p.status, fetched_at: new Date().toISOString() })),
    { onConflict: "project_id,url" },
  );
  if (upsertError) throw new Error(`site_pages upsert: ${upsertError.message}`);
  const { data: stale, error: staleError } = await admin.from("site_pages").select("id, url").eq("project_id", projectId);
  if (staleError) throw new Error(staleError.message);
  const current = new Set(pages.map((p) => p.url));
  const retiredIds = (stale ?? []).filter((r) => !current.has(r.url)).map((r) => r.id);
  if (retiredIds.length) {
    const { error } = await admin.from("site_pages").update({ status: 410 }).in("id", retiredIds);
    if (error) throw new Error(error.message);
  }
  return { upserted: pages.length, retired: retiredIds.length };
}
