import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { KeywordRow, SuggestionRow } from "@/lib/seo/keyword-queries";

const q = vi.hoisted(() => ({ getKeywords: vi.fn(), getSuggestions: vi.fn(), getKeywordJobs: vi.fn(), getResearchTargets: vi.fn() }));
vi.mock("@/lib/seo/keyword-queries", () => q);
vi.mock("@/app/app/google/keywords/actions", () => ({
  addKeywords: vi.fn(), toggleKeyword: vi.fn(), deleteKeyword: vi.fn(), setTargetPath: vi.fn(), acceptSuggestion: vi.fn(),
  dismissSuggestion: vi.fn(), importFromGsc: vi.fn(), refreshVolumes: vi.fn(), runResearch: vi.fn(),
}));

import {
  KeywordStatusSection, RankedSection, TrackedSection, GapSection, SuggestionSection, ResearchSection,
} from "@/app/app/google/keywords/sections";

const render = (node: React.ReactElement) => renderToStaticMarkup(node);
const NO_DASHES = /[\u2013\u2014]/;

const monthly = (...values: (number | null)[]) => values.map((searchVolume, i) => ({ year: 2026, month: i + 1, searchVolume }));
const keyword = (over: Partial<KeywordRow> = {}): KeywordRow => ({
  id: "k1", text: "szkolenia ai", key: "szkolenia ai", source: "manual", targetPath: null, active: true,
  searchVolume: 1900, competition: "HIGH", competitionIndex: 81, cpc: 2.4, monthlySearches: [], trend: [],
  volumeUpdatedAt: "2026-11-03T10:00:00Z", trendUpdatedAt: null, ...over,
});
const suggestion = (over: Partial<SuggestionRow> = {}): SuggestionRow => ({
  id: "s1", key: "kurs ai", text: "kurs ai", seed: "szkolenia ai", source: "labs", searchVolume: 880, keywordDifficulty: 38,
  cpc: 1.1, ownPosition: null, ownUrl: null, competitors: [], updatedAt: "2026-11-03T10:00:00Z", tracked: false, ...over,
});
const job = (over: Record<string, unknown> = {}) => ({
  id: "j1", project_id: "p", kind: "keyword_volumes", status: "done", cost_usd: 0.123, started_at: "2026-11-03T10:00:00Z",
  finished_at: "2026-11-03T10:01:00Z", error: null, stats: {}, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  q.getKeywords.mockResolvedValue([]);
  q.getSuggestions.mockResolvedValue([]);
  q.getKeywordJobs.mockResolvedValue({ volumes: null, research: null, researchDoneAt: null });
  q.getResearchTargets.mockResolvedValue({ own: "polskaszkola.ai", rivals: 7 });
});

/** The competitors checkbox tag (React writes the attributes in its own order). */
const competitorsBox = (html: string) => /<input type="checkbox"[^>]*>/.exec(html)?.[0] ?? "";

// the button's class list contains "disabled:" variants, so look for the attribute itself
const disabledButton = (html: string, label: string) => new RegExp(`<button[^>]*\\sdisabled=""[^>]*>${label}</button>`).test(html);

describe("KeywordStatusSection", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const withJobs = (volumes: unknown, research: unknown) => q.getKeywordJobs.mockResolvedValue({ volumes, research, researchDoneAt: null });
  const activeKeywords = (n: number) => q.getKeywords.mockResolvedValue(Array.from({ length: n }, (_, i) => keyword({ id: `k${i}`, key: `fraza ${i}` })));

  it("ostatnie odświeżenie wolumenów i ostatnie wyszukiwanie: status, data i koszt z przecinkiem", async () => {
    withJobs(job(), job({ id: "j2", kind: "keyword_research", cost_usd: 0.318, finished_at: "2026-11-03T11:00:00Z" }));
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("Wolumeny i trendy");
    expect(html).toContain("Wyszukiwanie fraz");
    expect(html).toContain("zakończone");
    expect(html).toContain("03.11.2026");
    expect(html).toContain("koszt 0,12 USD");
    expect(html).toContain("koszt 0,32 USD");
    expect(html).not.toMatch(NO_DASHES);
    expect(q.getKeywordJobs).toHaveBeenCalledWith("p");
  });

  it("bez żadnego zadania: informacja, że jeszcze nic nie uruchomiono", async () => {
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("Jeszcze nie odświeżano wolumenów.");
    expect(html).toContain("Jeszcze nie szukano fraz.");
  });

  it("przekroczony limit SEO: czerwony komunikat zadania, a błąd pokazuje treść błędu", async () => {
    withJobs(
      job({ status: "budget_exceeded", cost_usd: 0, error: "Limit SEO: wydano 9,95 USD z 10,00 USD, to zadanie kosztuje ok. 0,12 USD" }),
      job({ id: "j2", kind: "keyword_research", status: "failed", cost_usd: 0.05, error: "DataForSEO: brak środków na koncie" }),
    );
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("limit SEO wyczerpany");
    expect(html).toContain("Limit SEO: wydano 9,95 USD z 10,00 USD, to zadanie kosztuje ok. 0,12 USD");
    expect(html).toContain("nieudane");
    expect(html).toContain("DataForSEO: brak środków na koncie");
    expect(html).toMatch(/<span class="[^"]*text-red[^"]*">limit SEO wyczerpany<\/span>/);
  });

  it("pominięte zadanie podaje powód; zadanie w toku od niedawna to „w toku”, a dłużej niż 45 minut „przerwane”", async () => {
    withJobs(job({ status: "skipped", error: "Brak aktywnych fraz" }), job({ id: "j2", kind: "keyword_research", status: "running", finished_at: null, started_at: "2026-11-03T11:30:00Z" }));
    let html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("pominięte");
    expect(html).toContain("Brak aktywnych fraz");
    expect(html).toContain("w toku");
    withJobs(null, job({ id: "j2", kind: "keyword_research", status: "running", finished_at: null, started_at: "2026-11-03T11:00:00Z" }));
    html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("przerwane");
    expect(html).not.toContain("w toku");
  });

  it("przycisk odświeżenia ma szacunek kosztu liczony dla aktywnych fraz", async () => {
    activeKeywords(10); // 1 zadanie wolumenów 0,09 + 3 zapytania Trends po 0,011 = 0,123
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("Odśwież wolumeny i trendy (najwyżej 0,12 USD)");
    expect(html).not.toContain("(ok.");
    expect(disabledButton(html, "Odśwież wolumeny i trendy \\(najwyżej 0,12 USD\\)")).toBe(false);
  });

  it("nieaktywne frazy nie liczą się do kosztu; bez aktywnych fraz przycisk jest wyłączony z podpowiedzią", async () => {
    q.getKeywords.mockResolvedValue([keyword({ active: false })]);
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(disabledButton(html, "Odśwież wolumeny i trendy \\(najwyżej 0,00 USD\\)")).toBe(true);
    expect(html).toContain("Dodaj albo włącz frazy");
  });
});

describe("RankedSection", () => {
  it("fraza, pozycja, wolumen, adres i przycisk „Śledź”; nota o źródle danych", async () => {
    q.getKeywordJobs.mockResolvedValue({ volumes: null, research: null, researchDoneAt: "2026-11-03T10:01:00Z" });
    q.getSuggestions.mockResolvedValue([
      suggestion({ id: "s9", key: "szkolenia ai", text: "szkolenia ai", source: "ranked", searchVolume: 1900, ownPosition: 52, ownUrl: "https://polskaszkola.ai/szkolenia-ai" }),
    ]);
    const html = render(await RankedSection({ projectId: "p" }));
    expect(html).toContain("Gdzie już jesteście w Google");
    expect(html).toContain("szkolenia ai");
    expect(html).toContain("pozycja 52");
    expect(html).toContain("1900 / mies.");
    expect(html).toContain("https://polskaszkola.ai/szkolenia-ai");
    expect(html).toContain("według indeksu DataForSEO, stan na 03.11.2026");
    expect(html).toMatch(/<input type="hidden" name="id" value="s9"\/>/);
    expect(html).toMatch(/>Śledź<\/button>/);
    expect(html).not.toContain("Odrzuć");
    expect(q.getSuggestions).toHaveBeenCalledWith("p", "ranked", expect.any(Number));
  });

  it("fraza już śledzona dostaje wyciszoną etykietę „śledzona” zamiast przycisku „Śledź”, pozostałe zachowują przycisk", async () => {
    q.getSuggestions.mockResolvedValue([
      suggestion({ id: "s1", key: "a", text: "fraza a", source: "ranked", ownPosition: 3, tracked: true }),
      suggestion({ id: "s2", key: "b", text: "fraza b", source: "ranked", ownPosition: 8, tracked: false }),
    ]);
    const html = render(await RankedSection({ projectId: "p" }));
    expect(html.match(/>Śledź<\/button>/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Śledź frazę „fraza b”"');
    expect(html).not.toContain('aria-label="Śledź frazę „fraza a”"');
    expect(html.match(/>śledzona</g)).toHaveLength(1);
    expect(html).not.toMatch(/<input type="hidden" name="id" value="s1"\/>/);
    expect(html).toMatch(/<input type="hidden" name="id" value="s2"\/>/);
    expect(html).not.toContain("Odrzuć");
  });

  it("nota podaje datę ostatniego zakończonego badania (researchDoneAt), w czasie warszawskim", async () => {
    q.getKeywordJobs.mockResolvedValue({ volumes: null, research: null, researchDoneAt: "2026-11-02T23:30:00Z" });
    q.getSuggestions.mockResolvedValue([suggestion({ source: "ranked" })]);
    const html = render(await RankedSection({ projectId: "p" }));
    expect(html).toContain("według indeksu DataForSEO, stan na 03.11.2026");
    expect(html).not.toMatch(NO_DASHES);
    expect(q.getKeywordJobs).toHaveBeenCalledWith("p");
  });

  it("data nie zależy od updatedAt wierszy, które podbija też „Śledź”: liczy się tylko badanie", async () => {
    q.getKeywordJobs.mockResolvedValue({ volumes: null, research: null, researchDoneAt: "2026-10-12T08:00:00Z" });
    q.getSuggestions.mockResolvedValue([
      suggestion({ id: "s1", source: "ranked", updatedAt: "2026-11-02T08:00:00Z" }),
      suggestion({ id: "s2", source: "ranked", updatedAt: "2026-11-03T10:00:00Z" }),
    ]);
    const html = render(await RankedSection({ projectId: "p" }));
    expect(html).toContain("stan na 12.10.2026");
    expect(html).not.toContain("03.11.2026");
    expect(html).not.toContain("02.11.2026");
  });

  it("bez zakończonego badania nota nie podaje daty", async () => {
    q.getSuggestions.mockResolvedValue([suggestion({ source: "ranked", updatedAt: "2026-11-03T10:00:00Z" })]);
    const html = render(await RankedSection({ projectId: "p" }));
    expect(html).toContain("według indeksu DataForSEO");
    expect(html).not.toContain("stan na");
  });

  it("brak wolumenu to „brak danych”, nie 0", async () => {
    q.getSuggestions.mockResolvedValue([suggestion({ source: "ranked", searchVolume: null, ownPosition: 78, ownUrl: null })]);
    const html = render(await RankedSection({ projectId: "p" }));
    expect(html).toContain("brak danych");
    expect(html).not.toContain("0 / mies.");
  });

  it("pusta lista: „Uruchom wyszukiwanie fraz poniżej.”", async () => {
    expect(render(await RankedSection({ projectId: "p" }))).toContain("Uruchom wyszukiwanie fraz poniżej.");
  });
});

describe("TrackedSection", () => {
  const props = { projectId: "p", hasGscData: true };

  it("wolumen z liczbą, a wolumen null to „brak danych”", async () => {
    q.getKeywords.mockResolvedValue([keyword(), keyword({ id: "k2", text: "kurs ai dla firm", key: "kurs ai dla firm", searchVolume: null })]);
    const html = render(await TrackedSection(props));
    expect(html).toContain("1900 / mies.");
    expect(html).toContain("brak danych");
    expect(html).not.toMatch(/(?<!\d)0 \/ mies\./);
    expect(html).not.toMatch(NO_DASHES);
  });

  it("obok wolumenu wyciszone „stan na DD.MM” z daty pomiaru; bez pomiaru nic nie ma", async () => {
    q.getKeywords.mockResolvedValue([
      keyword({ volumeUpdatedAt: "2026-11-03T10:00:00Z" }),
      keyword({ id: "k2", text: "kurs ai dla firm", key: "kurs ai dla firm", searchVolume: null, volumeUpdatedAt: null }),
    ]);
    const html = render(await TrackedSection(props));
    expect(html.match(/stan na /g)).toHaveLength(1);
    expect(html).toContain("stan na 03.11");
    expect(html).not.toContain("stan na 03.11.");
  });

  it("CPC z przecinkiem i USD, konkurencja po polsku (nieznany kod zostaje jak jest)", async () => {
    q.getKeywords.mockResolvedValue([keyword(), keyword({ id: "k2", competition: "ZAGADKA", cpc: null })]);
    const html = render(await TrackedSection(props));
    expect(html).toContain("2,40 USD");
    expect(html).toContain("wysoka");
    expect(html).toContain("ZAGADKA");
    expect(html).not.toContain("2.40");
  });

  it("wykres 12 miesięcy z danych miesięcznych od najstarszego, opis od pierwszego do ostatniego miesiąca", async () => {
    q.getKeywords.mockResolvedValue([keyword({ monthlySearches: monthly(1200, 1300, null, 1900) })]);
    const html = render(await TrackedSection(props));
    expect(html).toContain('role="img"');
    expect(html).toContain("Wolumen frazy „szkolenia ai” w ostatnich miesiącach: od 1200 do 1900");
    expect(html).not.toContain("Google Trends");
  });

  it("Google Trends tylko gdy są dane; jedna wartość to nie trend", async () => {
    q.getKeywords.mockResolvedValue([
      keyword({ trend: [{ week: "2026-10-12", value: 40 }, { week: "2026-10-19", value: null }, { week: "2026-10-26", value: 55 }] }),
      keyword({ id: "k2", text: "kurs ai", key: "kurs ai", trend: [{ week: "2026-10-12", value: 40 }] }),
    ]);
    const html = render(await TrackedSection(props));
    expect(html).toContain("Google Trends dla frazy „szkolenia ai”: od 40 do 55");
    expect(html).not.toContain("Google Trends dla frazy „kurs ai”");
  });

  it("źródło frazy, wstrzymana fraza i przełącznik aktywności", async () => {
    q.getKeywords.mockResolvedValue([
      keyword({ source: "gsc" }),
      keyword({ id: "k2", text: "kurs ai", key: "kurs ai", source: "gap", active: false }),
    ]);
    const html = render(await TrackedSection(props));
    expect(html).toContain("z Search Console");
    expect(html).toContain("luka wobec konkurencji");
    expect(html).toContain("wstrzymana");
    // przełącznik wysyła nowy stan: aktywną fraza się wstrzymuje, a wstrzymaną wznawia
    expect(html).toMatch(/<input type="hidden" name="id" value="k1"\/><input type="hidden" name="active" value="false"\/>/);
    expect(html).toMatch(/<input type="hidden" name="id" value="k2"\/><input type="hidden" name="active" value="true"\/>/);
    expect(html).toContain(">Wstrzymaj<");
    expect(html).toContain(">Wznów<");
    expect(html).toContain(">Usuń<");
  });

  it("docelowa strona: pole z ukośnikiem na początku i obecną wartością", async () => {
    q.getKeywords.mockResolvedValue([keyword({ targetPath: "/szkolenia/ai-act" })]);
    const html = render(await TrackedSection(props));
    expect(html).toContain('name="target_path"');
    expect(html).toContain('value="/szkolenia/ai-act"');
    expect(html).toContain('aria-label="Docelowa strona dla frazy szkolenia ai"');
    expect(html).toContain('pattern="/\\S*"');
  });

  it("formularz dodawania fraz i przycisk importu z Search Console", async () => {
    const html = render(await TrackedSection(props));
    expect(html).toContain("Dodaj frazy (każda w osobnej linii)");
    expect(html).toContain('name="keywords"');
    expect(html).toContain(">Dodaj frazy<");
    expect(disabledButton(html, "Importuj z Search Console")).toBe(false);
  });

  it("bez danych z Search Console import jest wyłączony z podpowiedzią", async () => {
    const html = render(await TrackedSection({ projectId: "p", hasGscData: false }));
    expect(disabledButton(html, "Importuj z Search Console")).toBe(true);
    expect(html).toContain("Najpierw zsynchronizuj Search Console");
  });

  it("licznik fraz i pusta lista", async () => {
    expect(render(await TrackedSection(props))).toContain("Brak śledzonych fraz");
    q.getKeywords.mockResolvedValue([keyword(), keyword({ id: "k2", key: "kurs ai", text: "kurs ai" })]);
    expect(render(await TrackedSection(props))).toContain("2 frazy");
  });
});

describe("GapSection", () => {
  const gap = (over: Partial<SuggestionRow> = {}) => suggestion({
    id: "g1", key: "szkolenia ai", text: "szkolenia ai", source: "gap", seed: null, searchVolume: 1900,
    competitors: [
      { name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/ai" },
      { name: "Coders Lab", domain: "coderslab.pl", position: 12, url: "https://coderslab.pl/ai" },
    ], ...over,
  });

  it("fraza, wolumen, najlepszy konkurent „Altkom Akademia: 7. miejsce” i przyciski „Śledź” oraz „Odrzuć”", async () => {
    q.getSuggestions.mockResolvedValue([gap()]);
    const html = render(await GapSection({ projectId: "p" }));
    expect(html).toContain("Luki: konkurencja jest wyżej");
    expect(html).toContain("szkolenia ai");
    expect(html).toContain("1900 / mies.");
    expect(html).toContain("Altkom Akademia: 7. miejsce");
    expect(html).not.toContain("Coders Lab");
    expect(html).toMatch(/>Śledź<\/button>/);
    expect(html).toMatch(/>Odrzuć<\/button>/);
    expect(q.getSuggestions).toHaveBeenCalledWith("p", "gap", expect.any(Number));
  });

  it("brak wolumenu i brak danych o konkurencie to „brak danych”", async () => {
    q.getSuggestions.mockResolvedValue([gap({ searchVolume: null, competitors: [] })]);
    const html = render(await GapSection({ projectId: "p" }));
    expect(html.match(/brak danych/g)).toHaveLength(2);
  });

  it("pusta lista wyjaśnia, skąd biorą się luki", async () => {
    const html = render(await GapSection({ projectId: "p" }));
    expect(html).toContain("Brak luk");
    expect(html).toContain("Sprawdź też konkurencję");
  });
});

describe("SuggestionSection", () => {
  it("fraza, wolumen, trudność 0-100, hasło wyjściowe oraz „Śledź” i „Odrzuć”", async () => {
    q.getSuggestions.mockResolvedValue([suggestion()]);
    const html = render(await SuggestionSection({ projectId: "p" }));
    expect(html).toContain("Podpowiedzi fraz");
    expect(html).toContain("kurs ai");
    expect(html).toContain("880 / mies.");
    expect(html).toContain("trudność 38/100");
    expect(html).toContain("z hasła „szkolenia ai”");
    expect(html).toMatch(/>Śledź<\/button>/);
    expect(html).toMatch(/>Odrzuć<\/button>/);
    expect(html).not.toMatch(NO_DASHES);
    expect(q.getSuggestions).toHaveBeenCalledWith("p", "labs", expect.any(Number));
  });

  it("brak trudności i wolumenu to „brak danych”", async () => {
    q.getSuggestions.mockResolvedValue([suggestion({ keywordDifficulty: null, searchVolume: null, seed: null })]);
    const html = render(await SuggestionSection({ projectId: "p" }));
    expect(html.match(/brak danych/g)).toHaveLength(2);
    expect(html).not.toContain("z hasła");
  });

  it("pusta lista wskazuje formularz wyszukiwania", async () => {
    expect(render(await SuggestionSection({ projectId: "p" }))).toContain("Brak nowych podpowiedzi");
  });
});

describe("ResearchSection", () => {
  it("hasła domyślne po jednym w linii, pole wyboru z liczbą domen konkurencji i koszt ustawień domyślnych", async () => {
    const html = render(await ResearchSection({ projectId: "p", ownDomain: "polskaszkola.ai" }));
    expect(html).toContain("Szukaj nowych fraz");
    expect(html).toContain("szkolenia ai\nszkolenie chatgpt\nkurs ai dla firm\nszkolenie ai act\nszkolenia ai warszawa\nszkolenia ai wrocław\nlider w erze ai");
    expect(html).toContain('name="seeds"');
    expect(html).toContain("Hasła wyjściowe (każde w osobnej linii, do 10)");
    expect(html).toContain("Sprawdź też konkurencję (7 domen)");
    expect(competitorsBox(html)).toContain('name="competitors"');
    expect(competitorsBox(html)).toContain('checked=""');
    expect(competitorsBox(html)).not.toContain("disabled");
    // 7 haseł po 0,018 + własna domena i 7 konkurentów po 0,024 = 0,318
    expect(html).toContain("Koszt dla ustawień domyślnych: najwyżej 0,32 USD");
    expect(html).toContain(">Szukaj fraz<");
    expect(q.getResearchTargets).toHaveBeenCalledWith("p", "polskaszkola.ai");
    expect(html).not.toMatch(NO_DASHES);
  });

  it("odmienia „domena”, „domeny”, „domen”", async () => {
    for (const [n, text] of [[1, "1 domena"], [3, "3 domeny"], [7, "7 domen"]] as const) {
      q.getResearchTargets.mockResolvedValue({ own: "polskaszkola.ai", rivals: n });
      expect(render(await ResearchSection({ projectId: "p", ownDomain: "polskaszkola.ai" }))).toContain(`Sprawdź też konkurencję (${text})`);
    }
  });

  it("bez konkurentów albo własnej domeny pole jest wyłączone z podpowiedzią, a koszt obejmuje same hasła i własną domenę", async () => {
    q.getResearchTargets.mockResolvedValue({ own: "polskaszkola.ai", rivals: 0 });
    let html = render(await ResearchSection({ projectId: "p", ownDomain: "polskaszkola.ai" }));
    expect(html).toContain("Sprawdź też konkurencję (0 domen)");
    expect(competitorsBox(html)).toContain('disabled=""');
    expect(competitorsBox(html)).not.toContain("checked");
    expect(html).toContain("Dodaj konkurentów w Ustawieniach");
    expect(html).toContain("najwyżej 0,15 USD"); // 7 haseł po 0,018 + własna domena 0,024
    q.getResearchTargets.mockResolvedValue({ own: null, rivals: 0 });
    html = render(await ResearchSection({ projectId: "p", ownDomain: "" }));
    expect(html).toContain("Dodaj domenę projektu w Ustawieniach");
    expect(html).toContain("najwyżej 0,13 USD"); // same hasła
  });

  it("podaje koszt dodatkowego hasła i dodatkowej domeny z trzema miejscami po przecinku (to nie jest „ok.”, tylko górna granica)", async () => {
    const html = render(await ResearchSection({ projectId: "p", ownDomain: "polskaszkola.ai" }));
    expect(html).toContain("każde dodatkowe hasło najwyżej 0,018 USD");
    expect(html).toContain("każda domena najwyżej 0,024 USD");
    expect(html).not.toContain("ok.");
  });
});
