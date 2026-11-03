import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { KeywordDetail, KeywordRankDetail } from "@/lib/seo/rank-queries";
import type { KeywordRow } from "@/lib/seo/keyword-queries";
import type { SerpEntry } from "@/lib/seo/rank-parse";

const w = vi.hoisted(() => ({ getCurrentProject: vi.fn() }));
const r = vi.hoisted(() => ({ getKeywordDetail: vi.fn() }));
const nav = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/workspace", () => w);
vi.mock("@/lib/seo/rank-queries", () => r);
vi.mock("next/navigation", () => nav);
// the chart has its own test; here it is a stand-in that shows how many weeks it got
vi.mock("@/components/RankHistoryChart", () => ({
  RankHistoryChart: ({ points }: { points: unknown[] }) => <div data-chart-points={points.length} />,
}));

import KeywordDetailPage from "@/app/app/google/keywords/[id]/page";

const ID = "5b0f3c1e-0000-4000-8000-000000000001";
const NO_DASHES = /[\u2013\u2014]/;

const keyword = (over: Partial<KeywordRow> = {}): KeywordRow => ({
  id: ID, text: "szkolenia ai", key: "szkolenia ai", source: "manual", targetPath: null, active: true,
  searchVolume: 1900, competition: "HIGH", competitionIndex: 81, cpc: 2.4, monthlySearches: [], trend: [],
  volumeUpdatedAt: null, trendUpdatedAt: null, ...over,
});
const noFeatures = { aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false };
const reading = (over: Partial<KeywordRankDetail> = {}): KeywordRankDetail => ({
  weekStart: "2026-11-02", position: 37, url: "https://polskaszkola.ai/szkolenia.html", breadcrumb: null, features: noFeatures,
  competitors: [], top10: [], prevWeekStart: "2026-10-26", prevPosition: 41, ...over,
});
const entry = (over: Partial<SerpEntry> = {}): SerpEntry => ({
  position: 1, domain: "altkomakademia.pl", url: "https://altkomakademia.pl/ai", title: "Szkolenia AI | Altkom", breadcrumb: null, ...over,
});
const detail = (over: Partial<KeywordDetail> = {}): KeywordDetail => ({
  keyword: keyword(), history: [], latest: { desktop: reading() }, gsc: [], ...over,
});

async function page(d: KeywordDetail | null, id = ID) {
  w.getCurrentProject.mockResolvedValue({ id: "p", domains: ["polskaszkola.ai"] });
  r.getKeywordDetail.mockResolvedValue(d);
  return renderToStaticMarkup(await KeywordDetailPage({ params: Promise.resolve({ id }) }));
}

beforeEach(() => vi.clearAllMocks());

describe("KeywordDetailPage", () => {
  it("id, które nie jest UUID, albo fraza spoza projektu to 404; zapytanie dostaje projekt i id frazy", async () => {
    await expect(page(detail(), "nie-uuid")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(r.getKeywordDetail).not.toHaveBeenCalled();
    await expect(page(null)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(r.getKeywordDetail).toHaveBeenCalledWith("p", ID);
    await page(detail());
    expect(nav.notFound).toHaveBeenCalledTimes(2);
  });

  it("nagłówek z frazą i link powrotny do listy fraz", async () => {
    const html = await page(detail());
    expect(html).toContain("Polska Szkoła AI · Google");
    expect(html).toMatch(/<h1[^>]*>szkolenia ai<\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/app\/google\/keywords"[^>]*>← Wszystkie frazy<\/a>/);
  });

  it("pod nagłówkiem wolumen, docelowa strona i wstrzymanie", async () => {
    const html = await page(detail({ keyword: keyword({ targetPath: "/szkolenia", active: false }) }));
    expect(html).toContain("1900 / mies.");
    expect(html).toContain("docelowa strona: /szkolenia");
    expect(html).toContain("wstrzymana");
    const plain = await page(detail({ keyword: keyword({ searchVolume: null }) }));
    expect(plain).toContain("brak danych");
    expect(plain).not.toContain("docelowa strona");
    expect(plain).not.toContain("wstrzymana");
  });

  it("kafel urządzenia: pozycja, zmiana względem poprzedniego pomiaru, adres, tydzień pomiaru", async () => {
    const html = await page(detail());
    expect(html).toContain("Komputer");
    expect(html).toContain(">37<");
    expect(html).toContain("↑ 4");
    expect(html).toContain("wobec tygodnia od 26.10.2026");
    expect(html).toContain("https://polskaszkola.ai/szkolenia.html");
    expect(html).toContain("tydzień od 02.11.2026");
  });

  it("poza top 100: napis zamiast liczby, wypadnięcie z top 100 i breadcrumb zamiast ukrytego adresu", async () => {
    const html = await page(detail({
      latest: { desktop: reading({ position: null, url: null, breadcrumb: "https://polskaszkola.ai › szkolenia", prevPosition: 37 }) },
    }));
    expect(html).toContain("poza top 100");
    expect(html).toContain("wypadła z top 100");
    expect(html).toContain("https://polskaszkola.ai › szkolenia");
    expect(html).not.toContain("polskaszkola.ai/szkolenia.html");
  });

  it("pierwszy pomiar nie ma zmiany; urządzenie bez pomiaru mówi, że jeszcze nie sprawdzano", async () => {
    const html = await page(detail({ latest: { desktop: reading({ prevWeekStart: null, prevPosition: null }) } }));
    expect(html).toContain("Telefon");
    expect(html).toContain("Jeszcze nie sprawdzano.");
    expect(html).not.toContain("wobec tygodnia od");
    expect(html).not.toContain("↑");
    expect(html).not.toContain("↓");
  });

  it("odznaki: cechy SERP, blisko top 3 i inna strona niż docelowa", async () => {
    const html = await page(detail({
      keyword: keyword({ targetPath: "/oferta" }),
      latest: { desktop: reading({ position: 8, features: { ...noFeatures, aiOverview: true, peopleAlsoAsk: true } }) },
    }));
    expect(html).toContain("blisko top 3");
    expect(html).toContain("rankuje inna strona niż docelowa");
    expect(html).toContain("AI Overview: bez Was");
    expect(html).toContain("Pytania (PAA)");
    const calm = await page(detail({ keyword: keyword({ targetPath: "/szkolenia.html", searchVolume: 10 }), latest: { desktop: reading({ position: 8 }) } }));
    expect(calm).not.toContain("blisko top 3");
    expect(calm).not.toContain("rankuje inna strona");
  });

  it("wykres dostaje historię", async () => {
    const history = [{ weekStart: "2026-10-26", desktop: 41, mobile: null }, { weekStart: "2026-11-02", desktop: 37, mobile: 45 }];
    const html = await page(detail({ history }));
    expect(html).toContain("Historia pozycji");
    expect(html).toContain('data-chart-points="2"');
  });

  describe("Top 10 w Google", () => {
    const top10 = [
      entry({ position: 1, domain: "telewizjagorzow.pl", url: null, title: "Artykuły", breadcrumb: "https://www.telewizjagorzow.pl › Artykuły" }),
      entry({ position: 2, domain: "altkomakademia.pl", url: "https://altkomakademia.pl/ai", title: "Szkolenia AI | Altkom" }),
      entry({ position: 3, domain: "polskaszkola.ai", url: "https://polskaszkola.ai/szkolenia.html", title: "Szkolenia AI dla firm | PSAI" }),
    ];
    const withTop10 = (over: Partial<KeywordRankDetail> = {}) => detail({
      latest: { desktop: reading({
        top10, competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 2, url: "https://altkomakademia.pl/ai" }], ...over,
      }) },
    });

    it("lista z pozycjami; nasza domena pogrubiona i opisana, konkurent z nazwą", async () => {
      const html = await page(withTop10());
      expect(html).toContain("Top 10 w Google");
      expect(html).toContain("tydzień od 02.11.2026");
      expect(html).toMatch(/<p class="[^"]*font-bold[^"]*">Szkolenia AI dla firm \| PSAI<\/p>/);
      expect(html).not.toMatch(/<p class="[^"]*font-bold[^"]*">Szkolenia AI \| Altkom<\/p>/);
      expect(html).toContain("Wasza domena");
      expect(html).toContain("Altkom Akademia");
      expect([...html.matchAll(/Wasza domena/g)]).toHaveLength(1);
    });

    it("wynik przekierowany pokazuje breadcrumb zamiast adresu, a zwykły adres", async () => {
      const html = await page(withTop10());
      expect(html).toContain("https://www.telewizjagorzow.pl › Artykuły");
      expect(html).toContain("https://altkomakademia.pl/ai");
    });

    it("konkurent spoza top 10 nie przenosi nazwy na żaden wynik z listy", async () => {
      const html = await page(withTop10({ competitors: [{ name: "Coders Lab", domain: "coderslab.pl", position: 14, url: null }] }));
      expect(html).not.toContain("Coders Lab");
    });

    it("bez zapisanych wyników z komputera komunikat zamiast listy", async () => {
      const html = await page(detail({ latest: { mobile: reading({ top10 }) } }));
      expect(html).toContain("Top 10 w Google");
      expect(html).toContain("Brak zapisanych wyników z komputera.");
      expect(html).not.toContain("Artykuły");
    });
  });

  describe("Search Console, ostatnie 28 dni", () => {
    it("strony z kliknięciami, wyświetleniami i średnią pozycją", async () => {
      const html = await page(detail({
        gsc: [
          { page: "/szkolenia", clicks: 12, impressions: 1340, position: 8.44 },
          { page: "/blog/ai", clicks: 0, impressions: 25, position: null },
        ],
      }));
      expect(html).toContain("Search Console, ostatnie 28 dni");
      expect(html).toContain("/szkolenia");
      expect(html).toContain("kliknięcia 12 · wyświetlenia 1340 · pozycja 8,4");
      expect(html).toContain("/blog/ai");
      expect(html).toContain("kliknięcia 0 · wyświetlenia 25 · pozycja brak");
      expect(html).not.toContain("Brak wyświetleń tej frazy w Search Console.");
    });

    it("pusta tabela to komunikat", async () => {
      const html = await page(detail({ gsc: [] }));
      expect(html).toContain("Search Console, ostatnie 28 dni");
      expect(html).toContain("Brak wyświetleń tej frazy w Search Console.");
    });
  });

  it("żaden tekst strony nie zawiera półpauzy ani pauzy", async () => {
    const html = await page(detail({
      latest: { desktop: reading({ top10: [entry()] }), mobile: reading({ position: null }) },
      history: [{ weekStart: "2026-10-26", desktop: 41, mobile: null }, { weekStart: "2026-11-02", desktop: 37, mobile: 45 }],
      gsc: [{ page: "/szkolenia", clicks: 1, impressions: 2, position: 3 }],
    }));
    expect(html).not.toMatch(NO_DASHES);
  });
});
