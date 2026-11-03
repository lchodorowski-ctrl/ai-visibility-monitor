import { describe, it, expect } from "vitest";
import { parseSerp, type RankReading } from "@/lib/seo/rank-parse";
import kursFixture from "../fixtures/dataforseo/serp-kurs-ai-z-certyfikatem-desktop.json";
import brandFixture from "../fixtures/dataforseo/serp-polska-szkola-ai-desktop.json";
import szkoleniaDesktopFixture from "../fixtures/dataforseo/serp-szkolenia-ai-desktop.json";
import szkoleniaMobileFixture from "../fixtures/dataforseo/serp-szkolenia-ai-mobile.json";

const ctx = {
  ownDomains: ["polskaszkola.ai"],
  competitors: [
    { name: "Kodołamacz", domains: ["kodolamacz.pl"] },
    { name: "Coders Lab", domains: ["coderslab.pl"] },
    { name: "Nieobecny", domains: ["nie-ma-mnie.example"] },
  ],
};
const resultOf = (fixture: { tasks: { result: unknown[] }[] }) => fixture.tasks[0].result[0];

const NO_FEATURES = {
  aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false,
  localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false,
};
const EMPTY: RankReading = {
  position: null, rankAbsolute: null, url: null, breadcrumb: null, features: NO_FEATURES, top10: [], competitors: [],
};

/** Wynik organiczny jak w odpowiedzi DataForSEO (tylko pola, które czyta parser). */
const organic = (rank: number, over: Record<string, unknown> = {}) => ({
  type: "organic", rank_group: rank, rank_absolute: rank + 1, domain: `site${rank}.example`,
  title: `Tytuł ${rank}`, url: `https://site${rank}.example/`, breadcrumb: `https://site${rank}.example`, is_featured_snippet: false, ...over,
});
const redirect = (rank: number, breadcrumb: string | null, over: Record<string, unknown> = {}) =>
  organic(rank, { domain: "google.com", url: `https://google.com/goto?url=CAES${rank}`, breadcrumb, ...over });
const serp = (items: unknown[]) => ({ keyword: "x", datetime: "2026-11-03 13:20:34 +00:00", items });
const reading = (items: unknown[], c = ctx) => parseSerp(serp(items), c);

describe("parseSerp: prawdziwe odpowiedzi", () => {
  it("„kurs ai z certyfikatem”: nasza pozycja 16 (absolutna 19) z adresem i breadcrumb", () => {
    const r = parseSerp(resultOf(kursFixture), ctx);
    expect(r.position).toBe(16);
    expect(r.rankAbsolute).toBe(19);
    expect(r.url).toBe("https://polskaszkola.ai/");
    expect(r.breadcrumb).toBe("https://polskaszkola.ai");
  });

  it("„kurs ai z certyfikatem”: wynik przekierowany ma domenę z breadcrumb i adres null", () => {
    const { top10 } = parseSerp(resultOf(kursFixture), ctx);
    expect(top10).toHaveLength(10);
    expect(top10[1]).toEqual({
      position: 2, domain: "imperiumszkoleniowe.pl", url: null, title: "Szkolenia AI - Warszawa",
      breadcrumb: "https://imperiumszkoleniowe.pl › szkolenia › ai",
    });
    expect(top10[0]).toMatchObject({ position: 1, domain: "kodolamacz.pl", url: "https://www.kodolamacz.pl/kurs/ai-machine-learning-engineering" });
    expect(top10.map((e) => e.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(top10.some((e) => e.domain === "google.com")).toBe(false);
  });

  it("„kurs ai z certyfikatem”: konkurenci po najlepszej pozycji, także z breadcrumb, bez nieobecnych", () => {
    const { competitors } = parseSerp(resultOf(kursFixture), ctx);
    // Kodołamacz jest na 1 (zwykły wynik) i na 12 (przekierowanie): liczy się lepsza pozycja.
    expect(competitors).toEqual([
      { name: "Kodołamacz", domain: "kodolamacz.pl", position: 1, url: "https://www.kodolamacz.pl/kurs/ai-machine-learning-engineering" },
      { name: "Coders Lab", domain: "coderslab.pl", position: 6, url: null },
    ]);
  });

  it("„kurs ai z certyfikatem”: jest AI Overview, ale nie cytuje nas; brak innych elementów", () => {
    const { features } = parseSerp(resultOf(kursFixture), ctx);
    expect(features).toEqual({ ...NO_FEATURES, aiOverview: true });
  });

  it("„polska szkoła ai”: naszej domeny nie ma w organicznych, ale jest w panelu wiedzy", () => {
    const r = parseSerp(resultOf(brandFixture), ctx);
    expect(r.position).toBeNull();
    expect(r.rankAbsolute).toBeNull();
    expect(r.url).toBeNull();
    expect(r.breadcrumb).toBeNull();
    expect(r.features.knowledgePanelOurs).toBe(true);
    expect(r.features.aiOverview).toBe(true);
    expect(r.features.aiOverviewCitesUs).toBe(false);
  });

  it("„polska szkoła ai”: przekierowania nigdy nie są domeną google.com", () => {
    const { top10 } = parseSerp(resultOf(brandFixture), ctx);
    expect(top10).toHaveLength(9);
    expect(top10[0]).toMatchObject({ position: 1, domain: "telewizjagorzow.pl", url: null, breadcrumb: "https://www.telewizjagorzow.pl › Artykuły › Wiadomości" });
    expect(top10[2]).toMatchObject({ position: 3, domain: "ai-katalog.pl", url: null });
    expect(top10[1]).toMatchObject({ position: 2, domain: "pfr.pl", url: "https://pfr.pl/centrum-kompetencji-ai" });
    expect(top10.some((e) => e.domain === "google.com")).toBe(false);
  });

  it("„szkolenia ai” na komputerze: pozycja 37 (absolutna 41) z adresem podstrony", () => {
    const r = parseSerp(resultOf(szkoleniaDesktopFixture), ctx);
    expect(r.position).toBe(37);
    expect(r.rankAbsolute).toBe(41);
    expect(r.url).toBe("https://polskaszkola.ai/szkolenia.html");
    expect(r.breadcrumb).toBe("https://polskaszkola.ai › szkolenia");
    expect(r.features).toEqual({ ...NO_FEATURES, aiOverview: true });
  });

  it("„szkolenia ai” na telefonie: nasz wynik przyszedł jako przekierowanie, więc adres jest nieznany", () => {
    const r = parseSerp(resultOf(szkoleniaMobileFixture), ctx);
    expect(r.position).toBe(45);
    expect(r.rankAbsolute).toBe(56);
    expect(r.url).toBeNull();
    expect(r.breadcrumb).toBe("https://polskaszkola.ai");
    expect(r.features.peopleAlsoAsk).toBe(true);
    expect(r.features.aiOverview).toBe(true);
    expect(r.features.aiOverviewCitesUs).toBe(false);
  });

  it("żaden wpis top 10 nie ma domeny google.com, a domena jest pusta albo wygląda na host", () => {
    for (const fixture of [kursFixture, brandFixture, szkoleniaDesktopFixture, szkoleniaMobileFixture]) {
      for (const entry of parseSerp(resultOf(fixture), ctx).top10) {
        expect(entry.domain).not.toBe("google.com");
        expect(entry.domain === "" || entry.domain.includes(".")).toBe(true);
      }
    }
  });

  it("telefon: breadcrumb z samym hostem (bez „ › ”) też daje domenę przekierowanego wyniku", () => {
    const { top10 } = parseSerp(resultOf(szkoleniaMobileFixture), ctx);
    expect(top10[0]).toMatchObject({ domain: "comarch.pl", url: "https://www.comarch.pl/szkolenia/ai/" });
    expect(top10[1]).toEqual({ position: 2, domain: "lekcjaai.pl", url: null, title: top10[1].title, breadcrumb: "https://lekcjaai.pl" });
  });

  it("breadcrumb bez adresu („Wyświetlenia: ponad 13 tys.”) daje pustą domenę, nie śmieć", () => {
    const r = reading([redirect(1, "Wyświetlenia: ponad 13 tys.")]);
    expect(r.top10).toEqual([{ position: 1, domain: "", url: null, title: "Tytuł 1", breadcrumb: "Wyświetlenia: ponad 13 tys." }]);
  });
});

describe("parseSerp: brak danych", () => {
  it("null daje pusty odczyt", () => {
    expect(parseSerp(null, ctx)).toEqual(EMPTY);
    expect(parseSerp(undefined, ctx)).toEqual(EMPTY);
  });

  it("wynik bez items albo z items null daje pusty odczyt", () => {
    expect(parseSerp({}, ctx)).toEqual(EMPTY);
    expect(parseSerp({ items: null }, ctx)).toEqual(EMPTY);
    expect(parseSerp({ items: [] }, ctx)).toEqual(EMPTY);
  });

  it("odczyt bez organicznych wyników, ale z elementami SERP, zachowuje cechy", () => {
    const r = reading([{ type: "people_also_ask", rank_group: 1 }, { type: "local_pack", rank_group: 1 }]);
    expect(r).toEqual({ ...EMPTY, features: { ...NO_FEATURES, peopleAlsoAsk: true, localPack: true } });
  });
});

describe("parseSerp: zepsute dane z dostawcy", () => {
  const OWN = { domain: "polskaszkola.ai", url: "https://polskaszkola.ai/" };

  it("element items, który nie jest obiektem (null, liczba, tekst, tablica), nie przerywa odczytu, a reszta jest czytana", () => {
    const r = reading([null, 7, "tekst", [organic(1)], undefined, true, organic(2, OWN), organic(3)]);
    expect(r.position).toBe(2);
    // lista zagnieżdżona w items to nie obiekt: jej wynik (pozycja 1) nie jest czytany
    expect(r.top10.map((e) => e.position)).toEqual([2, 3]);
  });

  it("same elementy niebędące obiektami dają pusty odczyt", () => {
    expect(reading([null, 3, "x", [], false])).toEqual(EMPTY);
  });

  it("przegląd AI z pustymi elementami w references i items nie przerywa odczytu, a cytowanie jest rozpoznane", () => {
    const r = reading([{ type: "ai_overview", references: [null, "x", { domain: "polskaszkola.ai" }], items: [null, 5, { references: [null] }] }]);
    expect(r.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: true });
    const other = reading([{ type: "ai_overview", references: [null], items: [null, { references: [null, 4] }] }]);
    expect(other.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: false });
  });

  it("references albo items przeglądu AI, które nie są listami, są pomijane", () => {
    const r = reading([{ type: "ai_overview", references: "brak", items: { a: 1 } }]);
    expect(r.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: false });
  });
});

describe("parseSerp: pozycje", () => {
  it("pozycja to rank_group pierwszego wyniku z naszej domeny, także z poddomeny", () => {
    const r = reading([organic(1), organic(2, { domain: "blog.polskaszkola.ai", url: "https://blog.polskaszkola.ai/a" }), organic(3, { domain: "www.polskaszkola.ai", url: "https://www.polskaszkola.ai/" })]);
    expect(r).toMatchObject({ position: 2, rankAbsolute: 3, url: "https://blog.polskaszkola.ai/a" });
  });

  it("domena z url, gdy brakuje pola domain", () => {
    const r = reading([organic(1, { domain: null, url: "https://www.polskaszkola.ai/x" })]);
    expect(r).toMatchObject({ position: 1, url: "https://www.polskaszkola.ai/x" });
  });

  it("kolejność wejścia nie ma znaczenia: liczy się rank_group", () => {
    const r = reading([organic(5, { domain: "polskaszkola.ai" }), organic(2, { domain: "polskaszkola.ai", url: "https://polskaszkola.ai/b" }), organic(1)]);
    expect(r).toMatchObject({ position: 2, url: "https://polskaszkola.ai/b" });
    expect(r.top10.map((e) => e.position)).toEqual([1, 2, 5]);
  });

  it("top 10 to najwyżej 10 pierwszych organicznych wyników, bez innych elementów SERP", () => {
    const items = [{ type: "ai_overview", rank_group: 1 }, ...Array.from({ length: 12 }, (_, i) => organic(i + 1)), { type: "related_searches", rank_group: 1 }];
    const { top10 } = reading(items);
    expect(top10).toHaveLength(10);
    expect(top10[9].position).toBe(10);
  });

  it("brak tytułu i breadcrumb daje pusty tytuł i breadcrumb null", () => {
    const { top10 } = reading([organic(1, { title: null, breadcrumb: undefined })]);
    expect(top10[0]).toMatchObject({ title: "", breadcrumb: null });
  });

  it("wynik przekierowany z naszą domeną w breadcrumb to nasza pozycja z adresem null", () => {
    const r = reading([organic(1), redirect(2, "https://polskaszkola.ai › szkolenia")]);
    expect(r).toMatchObject({ position: 2, rankAbsolute: 3, url: null, breadcrumb: "https://polskaszkola.ai › szkolenia" });
  });

  it("przekierowanie bez breadcrumb ma pustą domenę i nie pasuje do niczego", () => {
    const r = reading([redirect(1, null)]);
    expect(r.position).toBeNull();
    expect(r.top10).toEqual([{ position: 1, domain: "", url: null, title: "Tytuł 1", breadcrumb: null }]);
  });

  it("przekierowanie rozpoznawane także dla www.google.pl/goto", () => {
    const r = reading([organic(1, { domain: "www.google.pl", url: "https://www.google.pl/goto?url=ABC", breadcrumb: "https://polskaszkola.ai" })]);
    expect(r).toMatchObject({ position: 1, url: null });
  });

  it("zwykły wynik z domeną google.com bez goto nie jest przekierowaniem", () => {
    const { top10 } = reading([organic(1, { domain: "maps.google.com", url: "https://maps.google.com/x", breadcrumb: "https://polskaszkola.ai" })]);
    expect(top10[0]).toMatchObject({ domain: "maps.google.com", url: "https://maps.google.com/x" });
  });
});

describe("parseSerp: konkurenci", () => {
  it("najlepsza pozycja z kilku domen konkurenta, posortowani po pozycji", () => {
    const r = reading(
      [organic(1, { domain: "b.example", url: "https://b.example/" }), redirect(2, "https://www.a-alt.example › x"), organic(3, { domain: "www.a.example", url: "https://www.a.example/p" }), organic(4, { domain: "b.example", url: "https://b.example/2" })],
      { ownDomains: ["polskaszkola.ai"], competitors: [{ name: "A", domains: ["a.example", "a-alt.example"] }, { name: "B", domains: ["b.example"] }] },
    );
    expect(r.competitors).toEqual([
      { name: "B", domain: "b.example", position: 1, url: "https://b.example/" },
      { name: "A", domain: "a-alt.example", position: 2, url: null },
    ]);
  });

  it("konkurent bez domen albo bez konkurentów daje pustą listę", () => {
    expect(reading([organic(1)], { ownDomains: ["polskaszkola.ai"], competitors: [{ name: "Pusty", domains: [] }] }).competitors).toEqual([]);
    expect(reading([organic(1)], { ownDomains: ["polskaszkola.ai"], competitors: [] }).competitors).toEqual([]);
  });
});

describe("parseSerp: cechy SERP", () => {
  it("AI Overview cytuje nas przez references na poziomie przeglądu", () => {
    const r = reading([{ type: "ai_overview", references: [{ domain: "gov.pl" }, { domain: "www.polskaszkola.ai", url: "https://www.polskaszkola.ai/" }] }]);
    expect(r.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: true });
  });

  it("AI Overview cytuje nas przez references w items", () => {
    const r = reading([{ type: "ai_overview", references: [], items: [{ type: "ai_overview_element", references: [{ domain: null, url: "https://polskaszkola.ai/szkolenia.html" }] }] }]);
    expect(r.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: true });
  });

  it("AI Overview bez naszej domeny i z pustymi polami nie cytuje nas", () => {
    const r = reading([{ type: "ai_overview", references: null, items: [{ type: "x", references: null }, { type: "y" }] }]);
    expect(r.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: false });
  });

  it("wyróżniony fragment jako osobny element: nasz albo cudzy", () => {
    expect(reading([{ type: "featured_snippet", domain: "www.polskaszkola.ai", url: "https://www.polskaszkola.ai/" }]).features)
      .toMatchObject({ featuredSnippet: true, featuredSnippetOurs: true });
    expect(reading([{ type: "featured_snippet", domain: "inna.example", url: "https://inna.example/" }]).features)
      .toMatchObject({ featuredSnippet: true, featuredSnippetOurs: false });
  });

  it("wyróżniony fragment jako organiczny z is_featured_snippet (także przekierowany)", () => {
    expect(reading([organic(1, { is_featured_snippet: true, domain: "polskaszkola.ai", url: "https://polskaszkola.ai/" })]).features)
      .toMatchObject({ featuredSnippet: true, featuredSnippetOurs: true });
    expect(reading([redirect(1, "https://polskaszkola.ai › x", { is_featured_snippet: true })]).features)
      .toMatchObject({ featuredSnippet: true, featuredSnippetOurs: true });
    expect(reading([organic(1, { is_featured_snippet: true })]).features)
      .toMatchObject({ featuredSnippet: true, featuredSnippetOurs: false });
  });

  it("zwykły organiczny nie jest wyróżnionym fragmentem", () => {
    expect(reading([organic(1, { domain: "polskaszkola.ai" })]).features).toMatchObject({ featuredSnippet: false, featuredSnippetOurs: false });
  });

  it("lokalny pakiet i „Zadawane pytania”", () => {
    expect(reading([{ type: "local_pack" }]).features).toMatchObject({ localPack: true, peopleAlsoAsk: false });
    expect(reading([{ type: "people_also_ask" }]).features).toMatchObject({ localPack: false, peopleAlsoAsk: true });
  });

  it("panel wiedzy tylko z adresem naszej domeny", () => {
    expect(reading([{ type: "knowledge_graph", url: "https://polskaszkola.ai/" }]).features.knowledgePanelOurs).toBe(true);
    expect(reading([{ type: "knowledge_graph", url: "https://inna.example/" }]).features.knowledgePanelOurs).toBe(false);
    expect(reading([{ type: "knowledge_graph", url: null }]).features.knowledgePanelOurs).toBe(false);
  });

  it("bez własnych domen żadna cecha „nasza” nie jest prawdziwa", () => {
    const r = reading(
      [{ type: "ai_overview", references: [{ domain: "polskaszkola.ai" }] }, { type: "knowledge_graph", url: "https://polskaszkola.ai/" }, organic(1, { domain: "polskaszkola.ai" })],
      { ownDomains: [], competitors: [] },
    );
    expect(r.position).toBeNull();
    expect(r.features).toMatchObject({ aiOverview: true, aiOverviewCitesUs: false, knowledgePanelOurs: false });
  });
});
