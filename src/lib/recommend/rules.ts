import type { GeneratedRecommendation } from "./generate";

async function head(fetchImpl: typeof fetch, url: string): Promise<number> {
  try {
    return (await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "PSAI-VisibilityBot/1.0" } })).status;
  } catch {
    return 0;
  }
}

export async function technicalRules(siteUrl: string, fetchImpl: typeof fetch = fetch): Promise<GeneratedRecommendation[]> {
  const base = siteUrl.replace(/\/+$/, "");
  const out: GeneratedRecommendation[] = [];
  if ((await head(fetchImpl, `${base}/llms.txt`)) !== 200) out.push({
    type: "technical", title: "Opublikuj plik llms.txt z opisem oferty", impact: 3, effort: 1, target_url: "/llms.txt", suggested_outline: null,
    summary: "Asystenci AI i ich crawlery czytają /llms.txt jako skrót tego, czym jest firma i co oferuje. Strona go nie ma.",
    action_steps: ["Utwórz plik tekstowy /llms.txt wg formatu llmstxt.org", "Wpisz: kim jesteście, dla kogo, główne programy z linkami, kontakt", "Dodaj link do llms.txt w stopce i w sitemapie"],
    rationale_pl: "Brak /llms.txt (odpowiedź inna niż 200).",
  });
  if ((await head(fetchImpl, `${base}/sitemap.xml`)) !== 200) out.push({
    type: "technical", title: "Opublikuj sitemap.xml i zgłoś ją w Search Console", impact: 3, effort: 1, target_url: "/sitemap.xml", suggested_outline: null,
    summary: "Bez sitemapy nowe podstrony są później odkrywane przez Google i asystentów opartych o jego indeks.",
    action_steps: ["Wygeneruj sitemap.xml ze wszystkimi podstronami", "Dodaj wpis Sitemap: do robots.txt", "Zgłoś w Google Search Console"],
    rationale_pl: "Brak /sitemap.xml (odpowiedź inna niż 200).",
  });
  return out;
}
