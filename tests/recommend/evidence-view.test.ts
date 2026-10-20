import { describe, it, expect } from "vitest";
import { viewDomains, viewCompetitors, viewQuotes, plainExcerpt, highlight, targetHost, TOP_ROWS } from "@/lib/recommend/evidence-view";

const d = (domain: string, count: number) => ({ domain, count });

describe("targetHost", () => {
  it("host tylko dla adresu bezwzględnego, ścieżka strony nie ma hosta", () => {
    expect(targetHost("https://www.aiprzewodnik.pl/szkolenia-ai-biznes.html")).toBe("aiprzewodnik.pl");
    expect(targetHost("/szkolenia.html")).toBeNull();
    expect(targetHost(null)).toBeNull();
  });
});

describe("viewDomains", () => {
  const opts = { targetUrl: "https://aiprzewodnik.pl/szkolenia-ai-biznes.html", ownDomains: ["polskaszkola.ai"] };

  it("sortuje malejąco (stare rekordy po scaleniu nie były posortowane) i pomija przekierowania Gemini", () => {
    const v = viewDomains([d("ican.pl", 18), d("vertexaisearch.cloud.google.com", 30), d("akademia.beck.pl", 6), d("comarch.pl", 18), d("noldeprog.pl", 11)], opts);
    expect(v.top.map((r) => r.label)).toEqual(["comarch.pl", "ican.pl", "noldeprog.pl", "akademia.beck.pl"]);
    expect(v.top.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(v).toMatchObject({ max: 18, total: 4, sum: 53, rest: [] });
  });

  it("pokazuje top 10, resztę chowa, a cel i własną domenę przypina do góry z ich miejscem", () => {
    const raw = [...Array.from({ length: 15 }, (_, i) => d(`d${String(i).padStart(2, "0")}.pl`, 50 - i)), d("aiprzewodnik.pl", 3), d("blog.polskaszkola.ai", 2), d("x.pl", 1)];
    const v = viewDomains(raw, opts);
    expect(v.top).toHaveLength(TOP_ROWS + 2);
    expect(v.top.slice(-2)).toEqual([
      { label: "aiprzewodnik.pl", count: 3, rank: 16, isTarget: true, isOwn: false },
      { label: "blog.polskaszkola.ai", count: 2, rank: 17, isTarget: false, isOwn: true },
    ]);
    expect(v.rest.map((r) => r.rank)).toEqual([11, 12, 13, 14, 15, 18]);
    expect(v.total).toBe(18);
  });

  it("łączy duplikaty (maksimum) i odrzuca śmieci z jsonb", () => {
    const v = viewDomains([d("a.pl", 2), d("a.pl", 5), { domain: "" , count: 9 }, { count: 3 }, "b.pl", null, { domain: "c.pl", count: "x" }], { targetUrl: null, ownDomains: [] });
    expect(v.top.map((r) => [r.label, r.count])).toEqual([["a.pl", 5], ["c.pl", 0]]);
    expect(viewDomains(undefined, { targetUrl: null, ownDomains: [] })).toEqual({ top: [], rest: [], max: 0, total: 0, sum: 0 });
  });
});

describe("viewCompetitors", () => {
  it("sortuje po liczbie wzmianek, bez flag celu", () => {
    const v = viewCompetitors([{ name: "EY Academy", count: 1 }, { name: "Akademia PARP", count: 4 }]);
    expect(v.top.map((r) => [r.label, r.isTarget])).toEqual([["Akademia PARP", false], ["EY Academy", false]]);
  });
});

describe("plainExcerpt", () => {
  it("zamienia znacznik cytowania AI Overview na domenę źródła i usuwa markdown", () => {
    const md = "`Na polskim rynku znajduje się wiele renomowanych szkoleń z zakresu sztucznej inteligencji (AI) dla firm, podzielonych na kategorie w zależności od potrzeb organizacji`.[[1]](https://aiprzewodnik.pl/szkolenia-ai-biznes.html)\n\n### Najlepsze programy i szkolenia biznesowe z AI\n- **AI Biznes Lab (Mirek B";
    expect(plainExcerpt(md)).toBe("Na polskim rynku znajduje się wiele renomowanych szkoleń z zakresu sztucznej inteligencji (AI) dla firm, podzielonych na kategorie w zależności od potrzeb organizacji. [aiprzewodnik.pl] Najlepsze programy i szkolenia biznesowe z AI AI Biznes Lab (Mirek B");
  });

  it("radzi sobie z nagłówkami i liniami w środku spłaszczonego tekstu, linkami i uciętym znacznikiem", () => {
    expect(plainExcerpt("Polski rynek edukacji AI podzielony jest na kilka kategorii: --- ### 1. Dla kadry")).toBe("Polski rynek edukacji AI podzielony jest na kilka kategorii: 1. Dla kadry");
    expect(plainExcerpt("Zobacz [ranking](https://x.pl/r) oraz źródło [2](https://www.ican.pl/a) i [[3]](https://ican.pl/b")).toBe("Zobacz ranking oraz źródło [ican.pl] i [ican.pl]");
    expect(plainExcerpt("Gemini [1](https://vertexaisearch.cloud.google.com/grounding-api-redirect/X) cytuje")).toBe("Gemini cytuje");
  });

  it("tabela i lista zamieniają się w jedną linię", () => {
    expect(plainExcerpt("| Firma | Format |\n|:---|---:|\n| ICAN | online |\n* pierwszy\n1. drugi")).toBe("Firma Format ICAN online pierwszy drugi");
  });
});

describe("viewQuotes", () => {
  it("stary format: silnik z prefiksu, ucięty tekst kończy się na pełnym słowie i „…”", () => {
    const body = `Słowo ${"słowo ".repeat(48)}ucię`;
    expect(body).toHaveLength(298);
    const cut = `${body}ta`; // 300 znaków: tyle zapisywał stary kod, więc tekst był ucięty
    const [q] = viewQuotes([`[google_ai_overview] ${cut}`]);
    expect(q).toEqual({ engineId: "google_ai_overview", responseId: null, text: `Słowo ${"słowo ".repeat(48).trim()}…` });
    expect(viewQuotes(["[gemini] Krótka odpowiedź."])).toEqual([{ engineId: "gemini", responseId: null, text: "Krótka odpowiedź." }]);
    // the window opened mid-answer: the partial first word goes, "…" marks the cut
    expect(viewQuotes(["[openai] fert w Polsce najsensowniejsze opcje to:"])).toEqual([{ engineId: "openai", responseId: null, text: "…w Polsce najsensowniejsze opcje to:" }]);
    // the window opened between words: nothing to drop, still marked as cut
    expect(viewQuotes(["[gemini]  czy szukasz warsztatów"])).toEqual([{ engineId: "gemini", responseId: null, text: "…czy szukasz warsztatów" }]);
  });

  it("nowy format z id odpowiedzi; puste i śmieci pomija", () => {
    expect(viewQuotes([{ engine_id: "openai", response_id: "r1", text: "**Tekst**" }, { engine_id: "x", text: "  " }, 3, null, "bez prefiksu"])).toEqual([
      { engineId: "openai", responseId: "r1", text: "Tekst" },
      { engineId: null, responseId: null, text: "bez prefiksu" },
    ]);
    expect(viewQuotes(undefined)).toEqual([]);
  });
});

describe("highlight", () => {
  it("zaznacza wszystkie wystąpienia bez względu na wielkość liter, dłuższy termin wygrywa", () => {
    expect(highlight("Źródło [aiprzewodnik.pl] i AIprzewodnik.pl, oraz EY.", ["aiprzewodnik.pl", "aiprzewodnik", "EY"])).toEqual([
      { text: "Źródło [", hit: false },
      { text: "aiprzewodnik.pl", hit: true },
      { text: "] i ", hit: false },
      { text: "AIprzewodnik.pl", hit: true },
      { text: ", oraz EY.", hit: false },
    ]);
  });
  it("bez terminów zwraca cały tekst", () => {
    expect(highlight("abc", [])).toEqual([{ text: "abc", hit: false }]);
    expect(highlight("", ["abc"])).toEqual([]);
  });
});
