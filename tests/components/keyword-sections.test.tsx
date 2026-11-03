import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { KeywordRow, SuggestionRow } from "@/lib/seo/keyword-queries";
import type { RankView } from "@/lib/seo/rank-queries";
import type { Device } from "@/lib/dataforseo/serp";

const q = vi.hoisted(() => ({ getKeywords: vi.fn(), getSuggestions: vi.fn(), getKeywordJobs: vi.fn(), getResearchTargets: vi.fn() }));
const r = vi.hoisted(() => ({ getLatestRanks: vi.fn() }));
vi.mock("@/lib/seo/keyword-queries", () => q);
vi.mock("@/lib/seo/rank-queries", () => r);
vi.mock("@/app/app/google/keywords/actions", () => ({
  addKeywords: vi.fn(), toggleKeyword: vi.fn(), deleteKeyword: vi.fn(), setTargetPath: vi.fn(), acceptSuggestion: vi.fn(),
  dismissSuggestion: vi.fn(), importFromGsc: vi.fn(), refreshVolumes: vi.fn(), checkRanks: vi.fn(), runResearch: vi.fn(),
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
const noFeatures = { aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false };
const rank = (over: Partial<RankView> = {}): RankView => ({
  weekStart: "2026-11-02", position: 52, rankAbsolute: 58, url: "https://polskaszkola.ai/szkolenia-ai", breadcrumb: null,
  features: noFeatures, competitors: [], checkedAt: "2026-11-03T04:12:00Z", prevWeekStart: "2026-10-26", prevPosition: 55, ...over,
});
/** Odczyty frazy `id` w mapie zwracanej przez `getLatestRanks`. */
const withRanks = (id: string, readings: Partial<Record<Device, RankView>>) => r.getLatestRanks.mockResolvedValue(new Map([[id, readings]]));
const job = (over: Record<string, unknown> = {}) => ({
  id: "j1", project_id: "p", kind: "keyword_volumes", status: "done", cost_usd: 0.123, started_at: "2026-11-03T10:00:00Z",
  finished_at: "2026-11-03T10:01:00Z", error: null, stats: {}, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  q.getKeywords.mockResolvedValue([]);
  q.getSuggestions.mockResolvedValue([]);
  q.getKeywordJobs.mockResolvedValue({ volumes: null, research: null, ranks: null, researchDoneAt: null });
  q.getResearchTargets.mockResolvedValue({ own: "polskaszkola.ai", rivals: 7 });
  r.getLatestRanks.mockResolvedValue(new Map());
});

/** The competitors checkbox tag (React writes the attributes in its own order). */
const competitorsBox = (html: string) => /<input type="checkbox"[^>]*>/.exec(html)?.[0] ?? "";

// the button's class list contains "disabled:" variants, so look for the attribute itself
const disabledButton = (html: string, label: string) => new RegExp(`<button[^>]*\\sdisabled=""[^>]*>${label}</button>`).test(html);

describe("KeywordStatusSection", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const withJobs = (volumes: unknown, research: unknown, ranks: unknown = null) => q.getKeywordJobs.mockResolvedValue({ volumes, research, ranks, researchDoneAt: null });
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
    activeKeywords(10); // 1 zadanie wolumenów 0,09 + 3 zapytania Trends po 0,011 = 0,123, w górę do centa
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(html).toContain("Odśwież wolumeny i trendy (najwyżej 0,13 USD)");
    expect(html).not.toContain("(ok.");
    expect(disabledButton(html, "Odśwież wolumeny i trendy \\(najwyżej 0,13 USD\\)")).toBe(false);
  });

  it("nieaktywne frazy nie liczą się do kosztu; bez aktywnych fraz przycisk jest wyłączony z podpowiedzią", async () => {
    q.getKeywords.mockResolvedValue([keyword({ active: false })]);
    const html = render(await KeywordStatusSection({ projectId: "p", now }));
    expect(disabledButton(html, "Odśwież wolumeny i trendy \\(najwyżej 0,00 USD\\)")).toBe(true);
    expect(html).toContain("Dodaj albo włącz frazy");
  });

  describe("pozycje", () => {
    it("ostatnie sprawdzenie pozycji: status, data i koszt jak przy pozostałych zadaniach", async () => {
      withJobs(null, null, job({ id: "j3", kind: "rank_check", cost_usd: 0.2, finished_at: "2026-11-03T11:00:00Z" }));
      const html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("Pozycje: ");
      expect(html).toContain("zakończone");
      expect(html).toContain("koszt 0,20 USD");
      expect(html).not.toContain("Jeszcze nie sprawdzano pozycji.");
      expect(html).not.toMatch(NO_DASHES);
    });

    it("sprawdzenie pozycji w toku od 50 minut jeszcze trwa (odbiór wyników bywa godzinny), po 95 minutach jest przerwane", async () => {
      const running = (startedAt: string) => job({ kind: "rank_check", status: "running", finished_at: null, started_at: startedAt });
      withJobs(null, null, running("2026-11-03T11:10:00Z")); // 50 minut przed 12:00
      let html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("w toku");
      expect(html).not.toContain("przerwane");
      withJobs(null, null, running("2026-11-03T10:25:00Z")); // 95 minut przed 12:00
      html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toMatch(/<span class="[^"]*text-red[^"]*">przerwane<\/span>/);
      expect(html).not.toContain("w toku");
    });

    it("bez żadnego sprawdzenia: informacja, że jeszcze nic nie uruchomiono", async () => {
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).toContain("Jeszcze nie sprawdzano pozycji.");
    });

    it("pominięte sprawdzenie podaje powód, nieudane jest czerwone", async () => {
      withJobs(null, null, job({ kind: "rank_check", status: "skipped", error: "Pozycje z tego tygodnia są już sprawdzone" }));
      let html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("pominięte");
      expect(html).toContain("Pozycje z tego tygodnia są już sprawdzone");
      withJobs(null, null, job({ kind: "rank_check", status: "failed", error: "DataForSEO: brak środków na koncie" }));
      html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toMatch(/<span class="[^"]*text-red[^"]*">nieudane<\/span>/);
      expect(html).toContain("DataForSEO: brak środków na koncie");
    });

    it("wyniki, które czekają w kolejce DataForSEO (stats.pending > 0), są nazwane i odmienione", async () => {
      withJobs(null, null, job({ kind: "rank_check", stats: { posted: 40, done: 37, pending: 3 } }));
      let html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("3 wyniki w kolejce DataForSEO, odbierze je następne sprawdzenie");
      withJobs(null, null, job({ kind: "rank_check", stats: { pending: 1 } }));
      html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("1 wynik w kolejce DataForSEO, odbierze go następne sprawdzenie");
      withJobs(null, null, job({ kind: "rank_check", stats: { pending: 12 } }));
      html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("12 wyników w kolejce DataForSEO, odbierze je następne sprawdzenie");
      expect(html).not.toMatch(NO_DASHES);
    });

    it("bez oczekujących wyników (0, brak, liczba z tekstu spoza zakresu, stats nie jest obiektem) nie ma wiersza o kolejce", async () => {
      for (const stats of [{ pending: 0 }, {}, { pending: "dużo" }, { pending: -2 }, null, "nie obiekt", [3]]) {
        withJobs(null, null, job({ kind: "rank_check", stats }));
        expect(render(await KeywordStatusSection({ projectId: "p", now }))).not.toContain("w kolejce DataForSEO");
      }
    });

    it("liczba oczekujących może przyjść jako tekst (jsonb)", async () => {
      withJobs(null, null, job({ kind: "rank_check", stats: { pending: "4" } }));
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).toContain("4 wyniki w kolejce DataForSEO");
    });

    it("przycisk sprawdzenia ma górny szacunek: 10 fraz × 2 urządzenia × 0,0066 = 0,132, w górę do centa 0,14", async () => {
      activeKeywords(10);
      const html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain("Sprawdź pozycje (najwyżej 0,14 USD)");
      expect(disabledButton(html, "Sprawdź pozycje \\(najwyżej 0,14 USD\\)")).toBe(false);
    });

    it("szacunek liczy najwyżej 100 fraz tygodniowo (200 sprawdzeń), tyle ile sprawdza zadanie", async () => {
      activeKeywords(150);
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).toContain("Sprawdź pozycje (najwyżej 1,32 USD)");
      activeKeywords(60); // 120 × 0,0066 = 0,792 → 0,80
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).toContain("Sprawdź pozycje (najwyżej 0,80 USD)");
    });

    it("powyżej 100 aktywnych fraz nota mówi, że co tydzień sprawdzamy 100 z największym wolumenem; do 100 jej nie ma", async () => {
      const note = "Co tydzień sprawdzamy 100 fraz z największym wolumenem.";
      activeKeywords(101);
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).toContain(note);
      activeKeywords(150);
      const html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(html).toContain(note);
      expect(html).not.toMatch(NO_DASHES);
      activeKeywords(100);
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).not.toContain("Co tydzień sprawdzamy");
      activeKeywords(3);
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).not.toContain("Co tydzień sprawdzamy");
    });

    it("do limitu liczą się tylko aktywne frazy: 100 aktywnych i dużo wstrzymanych to jeszcze brak noty", async () => {
      q.getKeywords.mockResolvedValue([
        ...Array.from({ length: 100 }, (_, i) => keyword({ id: `a${i}`, key: `aktywna ${i}` })),
        ...Array.from({ length: 30 }, (_, i) => keyword({ id: `p${i}`, key: `wstrzymana ${i}`, active: false })),
      ]);
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).not.toContain("Co tydzień sprawdzamy");
    });

    it("wstrzymane frazy nie liczą się do szacunku; bez aktywnych fraz przycisk jest wyłączony", async () => {
      q.getKeywords.mockResolvedValue([keyword({ active: false })]);
      const html = render(await KeywordStatusSection({ projectId: "p", now }));
      expect(disabledButton(html, "Sprawdź pozycje \\(najwyżej 0,00 USD\\)")).toBe(true);
      expect(html).toContain("Dodaj albo włącz frazy");
    });

    it("nota: frazy sprawdzone w tym tygodniu nie są sprawdzane drugi raz", async () => {
      activeKeywords(3);
      expect(render(await KeywordStatusSection({ projectId: "p", now }))).toContain("Frazy sprawdzone w tym tygodniu nie są sprawdzane drugi raz.");
    });

    it("kwoty „najwyżej” idą w górę do centa, także gdy szacunek ma błąd zmiennoprzecinkowy (0,15 nie staje się 0,16)", async () => {
      q.getResearchTargets.mockResolvedValue({ own: "polskaszkola.ai", rivals: 0 });
      const research = render(await ResearchSection({ projectId: "p", ownDomain: "polskaszkola.ai" }));
      expect(research).toContain("Koszt dla ustawień domyślnych: najwyżej 0,15 USD");
      expect(research).not.toContain("najwyżej 0,16 USD");
    });
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

describe("TrackedSection: pozycje w Google", () => {
  const props = { projectId: "p", hasGscData: true };
  const tracked = (over: Partial<KeywordRow> = {}) => q.getKeywords.mockResolvedValue([keyword(over)]);

  it("nazwa frazy jest linkiem do szczegółów frazy", async () => {
    tracked();
    const html = render(await TrackedSection(props));
    expect(html).toMatch(/<a [^>]*href="\/app\/google\/keywords\/k1"[^>]*>szkolenia ai<\/a>/);
  });

  it("komputer i telefon: pozycja, zmiana tydzień do tygodnia i „poza top 100”", async () => {
    tracked();
    withRanks("k1", {
      desktop: rank({ position: 52, prevPosition: 55 }),
      mobile: rank({ position: null, url: null, prevPosition: 40 }),
    });
    const html = render(await TrackedSection(props));
    expect(html).toContain("komputer 52");
    expect(html).toContain("\u2191 3");
    expect(html).toContain("telefon poza top 100");
    expect(html).toContain("wypadła z top 100");
    expect(html).not.toMatch(NO_DASHES);
  });

  it("pozostałe zmiany: spadek, bez zmian, nowa w top 100; pierwszy pomiar nie ma tekstu zmiany", async () => {
    tracked();
    withRanks("k1", { desktop: rank({ position: 54, prevPosition: 52 }) });
    expect(render(await TrackedSection(props))).toContain("\u2193 2");
    withRanks("k1", { desktop: rank({ position: 52, prevPosition: 52 }) });
    expect(render(await TrackedSection(props))).toContain("bez zmian");
    withRanks("k1", { desktop: rank({ position: 37, prevPosition: null }) });
    expect(render(await TrackedSection(props))).toContain("nowa w top 100");
    withRanks("k1", { desktop: rank({ position: 37, prevPosition: null, prevWeekStart: null }) });
    const first = render(await TrackedSection(props));
    expect(first).toContain("komputer 37");
    expect(first).not.toMatch(/\u2191|\u2193|bez zmian|nowa w top 100|wypadła/);
  });

  it("każdy odczyt podaje tydzień pomiaru („tydzień od DD.MM”), więc stara pozycja nie wygląda na bieżącą", async () => {
    tracked({ volumeUpdatedAt: null });
    withRanks("k1", {
      desktop: rank({ weekStart: "2026-10-12", position: 52 }),
      mobile: rank({ weekStart: "2026-10-26", position: 41 }),
    });
    const html = render(await TrackedSection(props));
    const desktop = html.slice(html.indexOf("komputer 52"), html.indexOf("telefon 41"));
    const mobile = html.slice(html.indexOf("telefon 41"));
    expect(desktop).toContain("tydzień od 12.10");
    expect(desktop).not.toContain("26.10");
    expect(mobile).toContain("tydzień od 26.10");
    expect(html.match(/tydzień od /g)).toHaveLength(2);
    expect(html).not.toMatch(NO_DASHES);
  });

  it("tylko jedno urządzenie z pomiarem: pokazuje tylko je", async () => {
    tracked();
    withRanks("k1", { mobile: rank({ position: 41 }) });
    const html = render(await TrackedSection(props));
    expect(html).toContain("telefon 41");
    expect(html).not.toContain("komputer");
  });

  it("fraza bez pomiaru: „pozycja: jeszcze nie sprawdzano”, bez odznak i oznaczeń", async () => {
    tracked({ targetPath: "/szkolenia" });
    const html = render(await TrackedSection(props));
    expect(html).toContain("pozycja: jeszcze nie sprawdzano");
    expect(html).not.toContain("komputer");
    expect(html).not.toContain("blisko top 3");
    expect(html).not.toContain("rankuje inna strona");
  });

  it("rankujący adres: adres, a gdy Google go ukrył, breadcrumb", async () => {
    tracked();
    withRanks("k1", { desktop: rank({ url: "https://polskaszkola.ai/szkolenia-ai" }) });
    expect(render(await TrackedSection(props))).toContain("https://polskaszkola.ai/szkolenia-ai");
    withRanks("k1", { desktop: rank({ url: null, breadcrumb: "https://polskaszkola.ai › szkolenia" }) });
    const html = render(await TrackedSection(props));
    expect(html).toContain("https://polskaszkola.ai › szkolenia");
    expect(html).not.toContain("szkolenia-ai");
  });

  it("adres bierze się z drugiego urządzenia, gdy pierwsze go nie ma (poza top 100)", async () => {
    tracked();
    withRanks("k1", { desktop: rank({ position: null, url: null }), mobile: rank({ position: 41, url: "https://polskaszkola.ai/mobilna" }) });
    const html = render(await TrackedSection(props));
    expect(html).toContain("https://polskaszkola.ai/mobilna");
    expect(html).toContain("komputer poza top 100");
    expect(html).toContain("telefon 41");
  });

  it("najlepszy konkurent: nazwa i pozycja; bez konkurentów nie ma wiersza", async () => {
    tracked();
    withRanks("k1", {
      desktop: rank({
        competitors: [
          { name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/ai" },
          { name: "Coders Lab", domain: "coderslab.pl", position: 12, url: null },
        ],
      }),
    });
    const html = render(await TrackedSection(props));
    expect(html).toContain("najlepszy konkurent: Altkom Akademia, 7.");
    expect(html).not.toContain("Coders Lab");
    withRanks("k1", { desktop: rank() });
    expect(render(await TrackedSection(props))).not.toContain("najlepszy konkurent");
  });

  it("odznaki cech SERP w ustalonej kolejności, z „AI Overview: bez Was”", async () => {
    tracked();
    withRanks("k1", {
      desktop: rank({ features: { ...noFeatures, aiOverview: true, peopleAlsoAsk: true, localPack: true } }),
    });
    const html = render(await TrackedSection(props));
    expect(html).toContain("AI Overview: bez Was");
    expect(html.indexOf("AI Overview: bez Was")).toBeLessThan(html.indexOf("Mapa z firmami"));
    expect(html.indexOf("Mapa z firmami")).toBeLessThan(html.indexOf("Pytania (PAA)"));
  });

  it("bez cech SERP nie ma odznak, a z cytowaniem jest „AI Overview: cytuje Was”", async () => {
    tracked();
    withRanks("k1", { desktop: rank() });
    let html = render(await TrackedSection(props));
    expect(html).not.toContain("AI Overview");
    expect(html).not.toContain("Pytania (PAA)");
    withRanks("k1", { desktop: rank({ features: { ...noFeatures, aiOverview: true, aiOverviewCitesUs: true } }) });
    html = render(await TrackedSection(props));
    expect(html).toContain("AI Overview: cytuje Was");
    expect(html).not.toContain("bez Was");
  });

  it("„blisko top 3”: pozycja 4-20 i wolumen co najmniej 30; poza tym nie", async () => {
    tracked({ searchVolume: 1900 });
    withRanks("k1", { desktop: rank({ position: 12 }) });
    expect(render(await TrackedSection(props))).toContain("blisko top 3");
    withRanks("k1", { desktop: rank({ position: 2 }) });
    expect(render(await TrackedSection(props))).not.toContain("blisko top 3");
    withRanks("k1", { desktop: rank({ position: 21 }) });
    expect(render(await TrackedSection(props))).not.toContain("blisko top 3");
    tracked({ searchVolume: 10 });
    withRanks("k1", { desktop: rank({ position: 12 }) });
    expect(render(await TrackedSection(props))).not.toContain("blisko top 3");
    tracked({ searchVolume: null });
    expect(render(await TrackedSection(props))).not.toContain("blisko top 3");
  });

  it("„blisko top 3” z telefonu, gdy komputer jest poza zakresem", async () => {
    tracked({ searchVolume: 1900 });
    withRanks("k1", { desktop: rank({ position: 37 }), mobile: rank({ position: 15 }) });
    expect(render(await TrackedSection(props))).toContain("blisko top 3");
  });

  it("„rankuje inna strona niż docelowa”: adres spoza docelowej ścieżki; ta sama ścieżka (też z „/” na końcu) nie", async () => {
    tracked({ targetPath: "/szkolenia" });
    withRanks("k1", { desktop: rank({ url: "https://polskaszkola.ai/blog/ai" }) });
    expect(render(await TrackedSection(props))).toContain("rankuje inna strona niż docelowa");
    withRanks("k1", { desktop: rank({ url: "https://polskaszkola.ai/szkolenia/" }) });
    expect(render(await TrackedSection(props))).not.toContain("rankuje inna strona");
    tracked({ targetPath: null });
    withRanks("k1", { desktop: rank({ url: "https://polskaszkola.ai/blog/ai" }) });
    expect(render(await TrackedSection(props))).not.toContain("rankuje inna strona");
    tracked({ targetPath: "/szkolenia" });
    withRanks("k1", { desktop: rank({ url: null, breadcrumb: "https://polskaszkola.ai › blog" }) });
    expect(render(await TrackedSection(props))).not.toContain("rankuje inna strona");
  });

  it("odczyty trafiają do właściwej frazy według id, a dla innej frazy nie ma nic", async () => {
    q.getKeywords.mockResolvedValue([keyword(), keyword({ id: "k2", text: "kurs ai", key: "kurs ai" })]);
    withRanks("k2", { desktop: rank({ position: 8 }) });
    const html = render(await TrackedSection(props));
    expect(html.match(/komputer 8/g)).toHaveLength(1);
    expect(html.match(/pozycja: jeszcze nie sprawdzano/g)).toHaveLength(1);
    expect(r.getLatestRanks).toHaveBeenCalledWith("p");
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
