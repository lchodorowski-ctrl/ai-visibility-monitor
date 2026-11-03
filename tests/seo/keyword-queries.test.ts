import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeAdmin, filterValue, type Call, type Handled } from "./fake-admin";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => h.client }));

import { getKeywords, getSuggestions, getKeywordJobs, getResearchTargets } from "@/lib/seo/keyword-queries";
import { MAX_TRACKED } from "@/lib/seo/keyword-volumes";
import { MAX_COMPETITORS } from "@/lib/seo/keyword-research";

let calls: Call[];
function setDb(handler: (c: Call) => Handled) {
  const fake = fakeAdmin(handler);
  h.client = fake.client;
  calls = fake.calls;
}
beforeEach(() => { calls = []; });

// DataForSEO zapisuje miesiące od najnowszego; kolumna numeric(10,2) i bigint mogą przyjść z PostgREST jako tekst.
const keywordRow = (over: Record<string, unknown> = {}) => ({
  id: "k1", project_id: "p", text: "szkolenia ai", key: "szkolenia ai", source: "ranked", target_path: "/szkolenia", active: true,
  search_volume: "1900", competition: "HIGH", competition_index: "81", cpc: "2.40",
  monthly_searches: [
    { year: 2026, month: 10, searchVolume: 1900 },
    { year: 2026, month: 9, searchVolume: 1600 },
    { year: 2025, month: 12, searchVolume: null },
    { year: 2026, month: 1, searchVolume: 1200 },
  ],
  volume_updated_at: "2026-11-03T10:00:00Z",
  trend: [{ week: "2026-10-12", value: 41.5 }, { week: "2026-10-19", value: null }, { week: "2026-10-26", value: 50 }],
  trend_updated_at: "2026-11-03T10:00:05Z", created_at: "2026-11-01T10:00:00Z",
  ...over,
});

describe("getKeywords", () => {
  it("czyta frazy projektu, najpierw największy wolumen, brak wolumenu na końcu, do MAX_TRACKED", async () => {
    setDb(() => ({ data: [keywordRow()] }));
    await getKeywords("kw-order");
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.table).toBe("keywords");
    expect(call.op).toBe("select");
    expect(filterValue(call, "eq", "project_id")).toBe("kw-order");
    const orders = call.filters.filter((f) => f[0] === "order");
    expect(orders[0]).toEqual(["order", "search_volume", { ascending: false, nullsFirst: false }]);
    expect(orders[1][1]).toBe("text");
    expect(call.filters).toContainEqual(["limit", MAX_TRACKED]);
  });

  it("liczby z tekstu stają się liczbami, a miesiące są od najstarszego (dane są od najnowszego)", async () => {
    setDb(() => ({ data: [keywordRow()] }));
    const [k] = await getKeywords("kw-map");
    expect(k).toMatchObject({
      id: "k1", text: "szkolenia ai", key: "szkolenia ai", source: "ranked", targetPath: "/szkolenia", active: true,
      searchVolume: 1900, competition: "HIGH", competitionIndex: 81, cpc: 2.4,
      volumeUpdatedAt: "2026-11-03T10:00:00Z",
    });
    expect(k.monthlySearches.map((m) => `${m.year}-${m.month}:${m.searchVolume}`)).toEqual([
      "2025-12:null", "2026-1:1200", "2026-9:1600", "2026-10:1900",
    ]);
    expect(k.trend).toEqual([{ week: "2026-10-12", value: 41.5 }, { week: "2026-10-19", value: null }, { week: "2026-10-26", value: 50 }]);
  });

  it("brak danych to null albo pusta lista, nigdy 0; zepsuty jsonb nie wywraca strony", async () => {
    setDb(() => ({
      data: [keywordRow({
        search_volume: null, competition: null, competition_index: null, cpc: null, target_path: null,
        monthly_searches: null, trend: null, volume_updated_at: null, trend_updated_at: null,
      }), keywordRow({
        id: "k2", monthly_searches: "nie lista", trend: [{ week: 5 }, null, { week: "2026-10-26", value: "oops" }, { week: "2026-10-19", value: 7 }],
      })],
    }));
    const [empty, broken] = await getKeywords("kw-empty");
    expect(empty).toMatchObject({ searchVolume: null, competition: null, competitionIndex: null, cpc: null, targetPath: null, monthlySearches: [], trend: [] });
    expect(empty.volumeUpdatedAt).toBeNull();
    expect(broken.monthlySearches).toEqual([]);
    expect(broken.trend).toEqual([{ week: "2026-10-19", value: 7 }, { week: "2026-10-26", value: null }]);
  });

  it("pusta tabela daje pustą listę, a błąd bazy rzuca po polsku", async () => {
    setDb(() => ({ data: null }));
    expect(await getKeywords("kw-none")).toEqual([]);
    setDb(() => ({ error: { message: "boom" } }));
    await expect(getKeywords("kw-err")).rejects.toThrow("Nie udało się pobrać fraz: boom");
  });
});

const suggestionRow = (over: Record<string, unknown> = {}) => ({
  id: "s1", project_id: "p", key: "szkolenia ai wrocław", text: "szkolenia ai wrocław", seed: "szkolenia ai", source: "labs",
  search_volume: "320", keyword_difficulty: "38", cpc: "1.10", own_position: null, own_url: null, competitor_positions: [], status: "new",
  updated_at: "2026-11-03T10:00:00Z", ...over,
});

/** Atrapa bazy: frazy śledzone (`keywords.key`) i skrzynka podpowiedzi. */
function seedSuggestions(rows: unknown[], tracked: string[] = []) {
  setDb((c) => (c.table === "keywords" ? { data: tracked.map((key) => ({ key })) } : { data: rows }));
}
const suggestionCall = () => calls.find((c) => c.table === "keyword_suggestions")!;

describe("getSuggestions", () => {
  it("tylko nowe podpowiedzi danego źródła; frazy z hasła i luki od największego wolumenu, z limitem 100", async () => {
    seedSuggestions([suggestionRow()]);
    await getSuggestions("sg-labs", "labs");
    const call = suggestionCall();
    expect(call.op).toBe("select");
    expect(filterValue(call, "eq", "project_id")).toBe("sg-labs");
    expect(filterValue(call, "eq", "source")).toBe("labs");
    expect(filterValue(call, "eq", "status")).toBe("new");
    expect(call.filters.find((f) => f[0] === "order")).toEqual(["order", "search_volume", { ascending: false, nullsFirst: false }]);
    expect(call.filters).toContainEqual(["limit", 100]);

    calls.length = 0;
    await getSuggestions("sg-gap", "gap", 25);
    expect(filterValue(suggestionCall(), "eq", "source")).toBe("gap");
    expect(suggestionCall().filters.find((f) => f[0] === "order")).toEqual(["order", "search_volume", { ascending: false, nullsFirst: false }]);
    expect(suggestionCall().filters).toContainEqual(["limit", 25]);
  });

  it("własne frazy w Google idą według pozycji, od najwyższej, a bez pozycji na końcu", async () => {
    seedSuggestions([]);
    await getSuggestions("sg-ranked", "ranked");
    const orders = suggestionCall().filters.filter((f) => f[0] === "order");
    expect(orders[0]).toEqual(["order", "own_position", { ascending: true, nullsFirst: false }]);
    expect(orders[1]).toEqual(["order", "search_volume", { ascending: false, nullsFirst: false }]);
  });

  it("własne frazy w Google: każdy wiersz ranked bez względu na status i śledzenie, śledzone oznaczone, limit bez dopłaty za śledzone", async () => {
    const rows = [
      suggestionRow({ id: "s1", key: "a", text: "a", source: "ranked", own_position: 3, status: "new" }),
      suggestionRow({ id: "s2", key: "b", text: "b", source: "ranked", own_position: 7, status: "accepted" }),
      suggestionRow({ id: "s3", key: "c", text: "c", source: "ranked", own_position: 9, status: "dismissed" }),
    ];
    seedSuggestions(rows, ["b"]);
    const shown = await getSuggestions("sg-all-ranked", "ranked", 3);

    expect(shown.map((s) => [s.key, s.tracked])).toEqual([["a", false], ["b", true], ["c", false]]);
    expect(filterValue(suggestionCall(), "eq", "source")).toBe("ranked");
    expect(suggestionCall().filters.some((f) => f[0] === "eq" && f[1] === "status")).toBe(false);
    expect(suggestionCall().filters).toContainEqual(["limit", 3]);
  });

  it("podpowiedzi z Labs i luki nadal tylko ze statusem new, bez śledzonych, więc nigdy nie są oznaczone jako śledzone", async () => {
    seedSuggestions([suggestionRow({ id: "s1", key: "a", text: "a" }), suggestionRow({ id: "s2", key: "b", text: "b" })], ["a"]);
    const shown = await getSuggestions("sg-labs-flag", "labs");
    expect(shown.map((s) => [s.key, s.tracked])).toEqual([["b", false]]);
    expect(filterValue(suggestionCall(), "eq", "status")).toBe("new");
  });

  it("data odświeżenia wiersza (updatedAt) idzie do widoku", async () => {
    seedSuggestions([suggestionRow({ source: "ranked", updated_at: "2026-11-02T08:30:00Z" })]);
    const [row] = await getSuggestions("sg-updated", "ranked");
    expect(row.updatedAt).toBe("2026-11-02T08:30:00Z");
  });

  it("ukrywa podpowiedzi, których fraza jest już śledzona (dodana ręcznie po badaniu), także nieaktywnej", async () => {
    // pierwsze trzy podpowiedzi są już na liście fraz: zapytanie prosi o tyle więcej wierszy, żeby wciąż starczyło na limit
    const rows = ["a", "b", "c", "d", "e"].map((key, i) => suggestionRow({ id: `s${i}`, key, text: key }));
    seedSuggestions(rows, ["a", "b", "c"]);
    const shown = await getSuggestions("sg-tracked", "labs", 2);
    expect(shown.map((s) => s.key)).toEqual(["d", "e"]);
    const keywordsCall = calls.find((c) => c.table === "keywords")!;
    expect(keywordsCall.cols).toBe("key");
    expect(filterValue(keywordsCall, "eq", "project_id")).toBe("sg-tracked");
    expect(keywordsCall.filters).toContainEqual(["limit", 1000]);
    expect(suggestionCall().filters).toContainEqual(["limit", 2 + 3]);
  });

  it("po odfiltrowaniu zostaje najwyżej tyle podpowiedzi, ile prosi limit", async () => {
    const rows = ["a", "b", "c", "d"].map((key, i) => suggestionRow({ id: `s${i}`, key, text: key }));
    seedSuggestions(rows, ["a"]);
    expect((await getSuggestions("sg-slice", "labs", 2)).map((s) => s.key)).toEqual(["b", "c"]);
  });

  it("mapuje liczby z tekstu, a konkurentów układa od najwyższej pozycji, pomijając uszkodzone wpisy", async () => {
    seedSuggestions([
      suggestionRow({
        id: "s2", key: "gap fraza", source: "gap", seed: null, search_volume: null, keyword_difficulty: null, cpc: null,
        competitor_positions: [
          { name: "Coders Lab", domain: "coderslab.pl", position: 12, url: "https://coderslab.pl/ai" },
          { name: "Altkom Akademia", domain: "altkomakademia.pl", position: "7", url: "https://altkomakademia.pl/szkolenia-ai" },
          { name: "bez pozycji", domain: "x.pl" },
          "śmieć",
        ],
      }),
    ]);
    const [gap] = await getSuggestions("sg-map", "gap");
    expect(gap).toMatchObject({ id: "s2", source: "gap", seed: null, searchVolume: null, keywordDifficulty: null, cpc: null, ownPosition: null });
    expect(gap.competitors).toEqual([
      { name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/szkolenia-ai" },
      { name: "Coders Lab", domain: "coderslab.pl", position: 12, url: "https://coderslab.pl/ai" },
    ]);
    seedSuggestions([suggestionRow({ id: "s3", key: "ranked fraza", source: "ranked", own_position: "52", own_url: "https://polskaszkola.ai/szkolenia-ai", competitor_positions: null })]);
    const [ranked] = await getSuggestions("sg-map-ranked", "ranked");
    expect(ranked).toMatchObject({ id: "s3", source: "ranked", ownPosition: 52, ownUrl: "https://polskaszkola.ai/szkolenia-ai", competitors: [] });
    seedSuggestions([suggestionRow()]);
    const [first] = await getSuggestions("sg-map2", "labs");
    expect(first).toMatchObject({ searchVolume: 320, keywordDifficulty: 38, cpc: 1.1, seed: "szkolenia ai", text: "szkolenia ai wrocław" });
  });

  it("błąd bazy rzuca po polsku: przy podpowiedziach i przy liście śledzonych fraz", async () => {
    setDb((c) => (c.table === "keywords" ? { data: [] } : { error: { message: "boom" } }));
    await expect(getSuggestions("sg-err", "labs")).rejects.toThrow("Nie udało się pobrać podpowiedzi fraz: boom");
    setDb((c) => (c.table === "keywords" ? { error: { message: "boom" } } : { data: [] }));
    await expect(getSuggestions("sg-err2", "labs")).rejects.toThrow("Nie udało się pobrać śledzonych fraz: boom");
  });
});

describe("getKeywordJobs", () => {
  const job = (kind: string) => ({ id: `j-${kind}`, kind, status: "done", cost_usd: "0.12", started_at: "2026-11-03T10:00:00Z", finished_at: "2026-11-03T10:01:00Z", error: null, stats: {} });
  /** Zapytania o ostatnie zadanie każdego rodzaju, bez filtra statusu. */
  const latestCalls = () => calls.filter((c) => !c.filters.some((f) => f[0] === "eq" && f[1] === "status"));
  const doneCall = () => calls.find((c) => c.filters.some((f) => f[0] === "eq" && f[1] === "status"))!;

  it("ostatnie zadanie wolumenów, ostatnie badanie fraz i ostatnie sprawdzenie pozycji, każde z własnym rodzajem", async () => {
    setDb((c) => ({ data: job(String(filterValue(c, "eq", "kind"))) }));
    const jobs = await getKeywordJobs("jb-ok");
    expect(jobs.volumes?.id).toBe("j-keyword_volumes");
    expect(jobs.research?.id).toBe("j-keyword_research");
    expect(jobs.ranks?.id).toBe("j-rank_check");
    expect(latestCalls().map((c) => filterValue(c, "eq", "kind")).sort()).toEqual(["keyword_research", "keyword_volumes", "rank_check"]);
    for (const c of latestCalls()) {
      expect(c.table).toBe("seo_jobs");
      expect(filterValue(c, "eq", "project_id")).toBe("jb-ok");
      expect(c.filters.find((f) => f[0] === "order")).toEqual(["order", "started_at", { ascending: false }]);
      expect(c.filters).toContainEqual(["limit", 1]);
    }
  });

  it("getKeywordJobs: researchDoneAt z ostatniego zakończonego badania (nowszy job failed nie zmienia daty)", async () => {
    // baza oddaje to, co pasuje do filtrów: zakończone badanie tylko ze statusem done, najnowsze zadanie z dowolnym statusem
    const history = [
      { kind: "keyword_research", status: "failed", started_at: "2026-11-05T09:00:00Z", finished_at: "2026-11-05T09:00:03Z" },
      { kind: "keyword_research", status: "done", started_at: "2026-11-03T10:00:00Z", finished_at: "2026-11-03T10:01:00Z" },
      { kind: "keyword_research", status: "done", started_at: "2026-10-01T10:00:00Z", finished_at: "2026-10-01T10:02:00Z" },
    ];
    setDb((c) => {
      const kind = filterValue(c, "eq", "kind");
      const status = filterValue(c, "eq", "status");
      const match = history.filter((j) => j.kind === kind && (status === undefined || j.status === status));
      return { data: match[0] ? { id: `j-${match[0].status}`, ...match[0] } : null };
    });
    const jobs = await getKeywordJobs("jb-done");
    expect(jobs.research?.status).toBe("failed");
    expect(jobs.researchDoneAt).toBe("2026-11-03T10:01:00Z");
    expect(filterValue(doneCall(), "eq", "kind")).toBe("keyword_research");
    expect(filterValue(doneCall(), "eq", "project_id")).toBe("jb-done");
    expect(doneCall().filters.find((f) => f[0] === "order")).toEqual(["order", "started_at", { ascending: false }]);
    expect(doneCall().filters).toContainEqual(["limit", 1]);
  });

  it("bez żadnego zadania: puste pola i brak daty; błąd bazy rzuca po polsku", async () => {
    setDb(() => ({ data: null }));
    expect(await getKeywordJobs("jb-none")).toEqual({ volumes: null, research: null, ranks: null, researchDoneAt: null });
    setDb(() => ({ error: { message: "boom" } }));
    await expect(getKeywordJobs("jb-err")).rejects.toThrow("Nie udało się pobrać zadań fraz: boom");
  });

  it("błąd samego zapytania o zakończone badanie też rzuca po polsku", async () => {
    setDb((c) => (filterValue(c, "eq", "status") === "done" ? { error: { message: "boom done" } } : { data: null }));
    await expect(getKeywordJobs("jb-err-done")).rejects.toThrow("Nie udało się pobrać zadań fraz: boom done");
  });
});

describe("getResearchTargets", () => {
  const rival = (name: string, domains: string[]) => ({ name, domains });

  it("własna domena i liczba konkurentów liczona jak w badaniu: pierwsza domena, bez własnej i pustych", async () => {
    setDb(() => ({
      data: [
        rival("Altkom Akademia", ["https://www.altkomakademia.pl/szkolenia"]),
        rival("Coders Lab", ["coderslab.pl", "inna.pl"]),
        rival("My sami", ["polskaszkola.ai"]),
        rival("Bez domeny", []),
        rival("Pusta domena", ["  "]),
      ],
    }));
    const t = await getResearchTargets("rt-ok", "https://www.PolskaSzkola.ai/");
    expect(t).toEqual({ own: "polskaszkola.ai", rivals: 2 });
    expect(calls[0].table).toBe("competitors");
    expect(filterValue(calls[0], "eq", "project_id")).toBe("rt-ok");
  });

  it("ta sama domena u dwóch konkurentów liczy się raz, tak jak w badaniu (wspólne pickRivals), w kolejności po nazwie", async () => {
    setDb(() => ({ data: [rival("Altkom", ["https://www.altkomakademia.pl/szkolenia"]), rival("Altkom bis", ["altkomakademia.pl"]), rival("Coders Lab", ["coderslab.pl"])] }));
    expect(await getResearchTargets("rt-dedupe", "polskaszkola.ai")).toEqual({ own: "polskaszkola.ai", rivals: 2 });
    expect(calls[0].filters).toContainEqual(["order", "name", { ascending: true }]);
  });

  it("najwyżej MAX_COMPETITORS konkurentów", async () => {
    setDb(() => ({ data: Array.from({ length: MAX_COMPETITORS + 3 }, (_, i) => rival(`K${i}`, [`k${i}.pl`])) }));
    expect((await getResearchTargets("rt-max", "polskaszkola.ai")).rivals).toBe(MAX_COMPETITORS);
  });

  it("bez własnej domeny badanie nie sprawdza konkurencji (luki wymagają własnej domeny)", async () => {
    setDb(() => ({ data: [rival("Altkom Akademia", ["altkomakademia.pl"])] }));
    expect(await getResearchTargets("rt-noown", "")).toEqual({ own: null, rivals: 0 });
    expect(calls).toHaveLength(0);
  });

  it("błąd bazy rzuca po polsku", async () => {
    setDb(() => ({ error: { message: "boom" } }));
    await expect(getResearchTargets("rt-err", "polskaszkola.ai")).rejects.toThrow("Nie udało się pobrać konkurentów: boom");
  });
});
