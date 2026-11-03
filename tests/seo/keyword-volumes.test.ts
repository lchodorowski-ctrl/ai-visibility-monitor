import { describe, it, expect, vi, afterEach } from "vitest";
import { runKeywordVolumes, TRENDS_MIN_VOLUME, MAX_TRACKED } from "@/lib/seo/keyword-volumes";
import { estimateVolumesCost } from "@/lib/seo/costs";
import type { searchVolume as searchVolumeFn, VolumeItem } from "@/lib/dataforseo/keywords-data";
import type { trendsExplore as trendsExploreFn, TrendSeries } from "@/lib/dataforseo/trends";
import { fakeAdmin, filterValue, jobUpdate, type Call } from "./fake-admin";

const PROJECT = "proj-1";
const now = () => new Date("2026-11-03T05:00:00Z");
const NOW_ISO = "2026-11-03T05:00:00.000Z";

interface World { budget?: number; anchor?: string | null; spent?: number; keywords?: { id: string; key: string; search_volume?: number | null }[]; failUpdate?: string }

function world(w: World = {}) {
  const keywords = w.keywords ?? [];
  return fakeAdmin((c: Call) => {
    if (c.table === "projects") return { data: { seo_budget_usd: w.budget ?? 10, trends_anchor: w.anchor ?? null } };
    if (c.table === "keywords" && c.op === "select") return { data: keywords };
    if (c.table === "keywords" && c.op === "update") {
      const id = filterValue(c, "eq", "id");
      return id === w.failUpdate ? { error: { message: `boom ${id}` } } : {};
    }
    if (c.table === "seo_jobs" && c.op === "insert") return { data: { id: "job-1" } };
    if (c.table === "seo_jobs" && c.op === "select") return { data: [{ cost_usd: w.spent ?? 0 }] };
    if (c.table === "seo_jobs" && c.op === "update") return { data: [{ id: "job-1" }] };
    return {};
  });
}

const tracked = (...keys: string[]) => keys.map((key, i) => ({ id: `k${i + 1}`, key, search_volume: null as number | null }));
/** Frazy z już zapisanym wolumenem (kolejność jak w `tracked`). */
const trackedWithVolume = (...entries: [string, number | null][]) => entries.map(([key, search_volume], i) => ({ id: `k${i + 1}`, key, search_volume }));

const vol = (keyword: string, searchVolume: number | null, extra: Partial<VolumeItem> = {}): VolumeItem => ({
  keyword, searchVolume, competition: null, competitionIndex: null, cpc: null, monthlySearches: [], ...extra,
});

const volumesFake = (items: VolumeItem[], costUsd = 0.09) => vi.fn<typeof searchVolumeFn>(async () => ({ items, costUsd }));

const series = (keyword: string, weeks: string[], values: (number | null)[]): TrendSeries => ({
  keyword, points: weeks.map((week, i) => ({ week, value: values[i] })),
});

/** Atrapa Trends: wartości każdej frazy z tabeli `values`, kotwica w każdej paczce z wartościami `anchorValues`. */
function trendsFake(weeks: string[], values: Record<string, (number | null)[]>, costUsd = 0.011) {
  return vi.fn<typeof trendsExploreFn>(async (keywords) => ({
    series: keywords.map((k) => series(k, weeks, values[k] ?? weeks.map(() => 0))),
    costUsd,
  }));
}

const keywordUpdates = (calls: Call[], id?: string) =>
  calls.filter((c) => c.table === "keywords" && c.op === "update" && (id === undefined || filterValue(c, "eq", "id") === id));

/** Aktualizacja wolumenowa frazy (taka, która nie zapisuje trendu). */
const volumeUpdate = (calls: Call[], id: string) =>
  keywordUpdates(calls, id).map((c) => c.payload as Record<string, unknown>).find((p) => !("trend" in p));

const WEEKS = ["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"];

afterEach(() => vi.restoreAllMocks());

describe("stałe", () => {
  it("Trends tylko dla fraz od 50 wyszukiwań, najwyżej 500 śledzonych fraz", () => {
    expect(TRENDS_MIN_VOLUME).toBe(50);
    expect(MAX_TRACKED).toBe(500);
  });
});

describe("runKeywordVolumes: bez płatnych wywołań", () => {
  it("bez aktywnych fraz zapisuje zadanie skipped i nie woła API ani budżetu", async () => {
    const { client, calls } = world({ keywords: [] });
    const searchVolume = vi.fn();
    const trendsExplore = vi.fn();

    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore, now });

    expect(res).toEqual({ status: "skipped", keywords: 0, trends: 0, costUsd: 0 });
    expect(searchVolume).not.toHaveBeenCalled();
    expect(trendsExplore).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "seo_jobs" && c.op === "insert")?.payload)
      .toEqual({ project_id: PROJECT, kind: "keyword_volumes", status: "running" });
    expect(jobUpdate(calls)).toMatchObject({ status: "skipped", error: "Brak aktywnych fraz" });
    expect(calls.some((c) => c.table === "seo_jobs" && c.op === "select")).toBe(false);
  });

  it("czyta tylko aktywne frazy projektu, najstarsze pierwsze, najwyżej 500", async () => {
    const { client, calls } = world({ keywords: [] });
    await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: vi.fn(), trendsExplore: vi.fn(), now });

    const read = calls.find((c) => c.table === "keywords" && c.op === "select")!;
    expect(read.cols).toBe("id, key, search_volume");
    expect(read.filters).toEqual([
      ["eq", "project_id", PROJECT],
      ["eq", "active", true],
      ["order", "created_at", { ascending: true }],
      ["limit", 500],
    ]);
  });

  it("limit SEO: wydane 9,95 z 10 i szacunek ok. 0,10 daje budget_exceeded z kwotami, bez wywołań API", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenia ai"), budget: 10, spent: 9.95 });
    const searchVolume = vi.fn();
    const trendsExplore = vi.fn();

    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore, now });

    expect(res).toEqual({ status: "budget_exceeded", keywords: 0, trends: 0, costUsd: 0 });
    expect(searchVolume).not.toHaveBeenCalled();
    expect(trendsExplore).not.toHaveBeenCalled();
    expect(keywordUpdates(calls)).toHaveLength(0);
    expect(jobUpdate(calls)).toMatchObject({
      status: "budget_exceeded",
      error: "Limit SEO: wydano 9,95 USD z 10,00 USD, to zadanie kosztuje ok. 0,10 USD",
    });
    const spend = calls.find((c) => c.table === "seo_jobs" && c.op === "select")!;
    expect(spend.filters).toContainEqual(["gte", "started_at", "2026-11-01T00:00:00.000Z"]);
  });

  it("szacunek to estimateVolumesCost(n, n): budżet równy wydanym plus szacunek jeszcze przepuszcza, o grosz mniej już nie", async () => {
    const keys = tracked("a", "b", "c", "d", "e");
    const estimate = estimateVolumesCost(5, 5);
    const open = world({ keywords: keys, budget: 1 + estimate, spent: 1 });
    const searchVolume = volumesFake([]);
    const ok = await runKeywordVolumes({ projectId: PROJECT }, { admin: open.client, searchVolume, trendsExplore: vi.fn(), now });
    expect(ok.status).toBe("done");

    const tight = world({ keywords: keys, budget: 1 + estimate - 0.01, spent: 1 });
    const blocked = await runKeywordVolumes({ projectId: PROJECT }, { admin: tight.client, searchVolume: volumesFake([]), trendsExplore: vi.fn(), now });
    expect(blocked.status).toBe("budget_exceeded");
    expect(jobUpdate(tight.calls)).toMatchObject({ stats: { estimateUsd: estimate, spentUsd: 1, budgetUsd: 1 + estimate - 0.01 } });
  });

  it("brak liczbowego budżetu zamyka bramę (NaN)", async () => {
    const { client } = world({ keywords: tracked("a"), budget: NaN });
    const searchVolume = vi.fn();
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore: vi.fn(), now });
    expect(res.status).toBe("budget_exceeded");
    expect(searchVolume).not.toHaveBeenCalled();
  });

  it("błąd odczytu projektu rzuca bez zakładania zadania", async () => {
    const { client, calls } = fakeAdmin((c) => (c.table === "projects" ? { error: { message: "no rows" } } : {}));
    await expect(runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: vi.fn(), trendsExplore: vi.fn(), now })).rejects.toThrow("no rows");
    expect(calls.some((c) => c.table === "seo_jobs")).toBe(false);
  });
});

describe("runKeywordVolumes: szczęśliwa ścieżka", () => {
  const items = [
    vol("kurs prompt engineering", 500, {
      competition: "MEDIUM", competitionIndex: 42, cpc: 2.4000000953674316,
      monthlySearches: [{ year: 2026, month: 9, searchVolume: 480 }, { year: 2026, month: 8, searchVolume: null }],
    }),
    vol("kurs ai dla firm", null),
    vol("szkolenie chatgpt", 90, { competition: "LOW", competitionIndex: 10, cpc: 1.5, monthlySearches: [{ year: 2026, month: 9, searchVolume: 50 }] }),
    vol("ai act", 49, { competition: "HIGH", competitionIndex: 80, cpc: 0 }),
  ];
  const trendValues = {
    "kurs prompt engineering": [10, 20, 30, 5],
    "szkolenie chatgpt": [null, 4, 6, 1],
    "szkolenia ai": [50, 50, 50, 20],
  };

  it("jedno zadanie wolumenów dla wszystkich fraz, po kluczach, w kolejności odczytu", async () => {
    const { client } = world({ keywords: tracked("kurs prompt engineering", "kurs ai dla firm", "szkolenie chatgpt", "ai act") });
    const searchVolume = volumesFake(items);
    await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore: trendsFake(WEEKS, trendValues), now });
    expect(searchVolume.mock.calls).toEqual([[["kurs prompt engineering", "kurs ai dla firm", "szkolenie chatgpt", "ai act"]]]);
  });

  it("zapisuje wolumen frazy: tylko pola, które Google zwróciło; cpc zaokrąglone do 2 miejsc, miesięczne wyszukiwania bez zmian", async () => {
    const { client, calls } = world({ keywords: tracked("kurs prompt engineering", "kurs ai dla firm", "szkolenie chatgpt", "ai act") });
    await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake(items), trendsExplore: trendsFake(WEEKS, trendValues), now });

    expect(volumeUpdate(calls, "k1")).toEqual({
      search_volume: 500, competition: "MEDIUM", competition_index: 42, cpc: 2.4,
      monthly_searches: [{ year: 2026, month: 9, searchVolume: 480 }, { year: 2026, month: 8, searchVolume: null }],
      volume_updated_at: NOW_ISO,
    });
    // zero to prawdziwa wartość (cpc 0), a pusta lista miesięcy nie trafia do zapisu
    expect(volumeUpdate(calls, "k4")).toEqual({
      search_volume: 49, competition: "HIGH", competition_index: 80, cpc: 0, volume_updated_at: NOW_ISO,
    });
    // aktualizacja zawsze po id i projekcie
    for (const c of keywordUpdates(calls).filter((u) => !("trend" in (u.payload as object)))) {
      expect(c.filters.map((f) => f.slice(0, 2).join(":"))).toEqual(["eq:id", "eq:project_id"]);
      expect(filterValue(c, "eq", "project_id")).toBe(PROJECT);
    }
  });

  it("odpowiedź bez żadnych danych nie zmienia frazy: brak zapisu, a fraza liczy się jako bez danych", async () => {
    const { client, calls } = world({ keywords: tracked("kurs ai dla firm") });
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake([vol("kurs ai dla firm", null)]), trendsExplore: vi.fn(), now });

    expect(keywordUpdates(calls)).toHaveLength(0);
    expect(res).toMatchObject({ status: "done", keywords: 0 });
    expect(jobUpdate(calls)).toMatchObject({ stats: { keywords: 0, noData: 1, missing: 0 } });
  });

  it("nigdy nie nadpisuje znanej wartości pustą: null z Google Ads pomija pole, a data pomiaru rusza tylko wraz z wolumenem", async () => {
    const { client, calls } = world({ keywords: trackedWithVolume(["szkolenie chatgpt", 300], ["kurs ai", 120], ["ai act", 80]) });
    await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, trendsExplore: trendsFake(WEEKS, {}), now,
      searchVolume: volumesFake([
        // bez wolumenu, ale z konkurencją: zapisuje się tylko ona
        vol("szkolenie chatgpt", null, { competition: "LOW" }),
        // wolumen jest, cpc i konkurencji brak: wolumen i data, bez pól z nullem
        vol("kurs ai", 140, { cpc: null, competition: null, competitionIndex: null }),
        // pusta odpowiedź: nic nie jest zapisywane
        vol("ai act", null),
      ]),
    });

    const withoutVolume = volumeUpdate(calls, "k1");
    expect(withoutVolume).toEqual({ competition: "LOW" });
    expect(withoutVolume).not.toHaveProperty("search_volume");
    expect(withoutVolume).not.toHaveProperty("volume_updated_at");
    const withVolume = volumeUpdate(calls, "k2");
    expect(withVolume).toEqual({ search_volume: 140, volume_updated_at: NOW_ISO });
    expect(keywordUpdates(calls, "k3")).toHaveLength(0);
  });

  it("miesięczne wyszukiwania zapisuje tylko, gdy lista nie jest pusta", async () => {
    const { client, calls } = world({ keywords: tracked("a", "b") });
    await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, trendsExplore: vi.fn(), now,
      searchVolume: volumesFake([vol("a", 10, { monthlySearches: [{ year: 2026, month: 9, searchVolume: 10 }] }), vol("b", 10, { monthlySearches: [] })]),
    });
    expect(volumeUpdate(calls, "k1")).toHaveProperty("monthly_searches");
    expect(volumeUpdate(calls, "k2")).not.toHaveProperty("monthly_searches");
  });

  it("Trends tylko dla fraz od 50 wyszukiwań, z domyślną kotwicą na końcu paczki", async () => {
    const { client } = world({ keywords: tracked("kurs prompt engineering", "kurs ai dla firm", "szkolenie chatgpt", "ai act") });
    const trendsExplore = trendsFake(WEEKS, trendValues);
    await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake(items), trendsExplore, now });
    expect(trendsExplore.mock.calls).toEqual([[["kurs prompt engineering", "szkolenie chatgpt", "szkolenia ai"]]]);
  });

  it("zapisuje trend bez niepełnego bieżącego tygodnia", async () => {
    const { client, calls } = world({ keywords: tracked("kurs prompt engineering", "kurs ai dla firm", "szkolenie chatgpt", "ai act") });
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake(items), trendsExplore: trendsFake(WEEKS, trendValues), now });

    const trendUpdate = (id: string) => keywordUpdates(calls, id).map((c) => c.payload).find((p) => "trend" in (p as object));
    // 2026-11-01 zaczyna się 2 dni przed now(): niepełny tydzień, odpada
    expect(trendUpdate("k1")).toEqual({
      trend: [{ week: "2026-10-11", value: 10 }, { week: "2026-10-18", value: 20 }, { week: "2026-10-25", value: 30 }],
      trend_updated_at: NOW_ISO,
    });
    expect(trendUpdate("k3")).toEqual({
      trend: [{ week: "2026-10-11", value: null }, { week: "2026-10-18", value: 4 }, { week: "2026-10-25", value: 6 }],
      trend_updated_at: NOW_ISO,
    });
    expect(trendUpdate("k2")).toBeUndefined();
    expect(trendUpdate("k4")).toBeUndefined();
    expect(res.trends).toBe(2);
  });

  it("koszt to suma kosztów wolumenów i Trends, zapisana w zadaniu razem ze statystykami", async () => {
    const { client, calls } = world({ keywords: tracked("kurs prompt engineering", "kurs ai dla firm", "szkolenie chatgpt", "ai act") });
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake(items, 0.09), trendsExplore: trendsFake(WEEKS, trendValues, 0.011), now });

    expect(res.status).toBe("done");
    // "kurs ai dla firm" Google zwrócił bez żadnych danych, więc nie ma w nim zapisu
    expect(res.keywords).toBe(3);
    expect(res.costUsd).toBeCloseTo(0.101, 6);
    const job = jobUpdate(calls);
    expect(job).toMatchObject({ status: "done", error: null, stats: { keywords: 3, noData: 1, trendCandidates: 2, trends: 2, trendRequests: 1, missing: 0, tooLong: 0 } });
    expect(job.cost_usd as number).toBeCloseTo(0.101, 6);
  });

  it("własna kotwica projektu zastępuje domyślną", async () => {
    const { client } = world({ keywords: tracked("szkolenie chatgpt"), anchor: "Kurs AI" });
    const trendsExplore = trendsFake(WEEKS, { "szkolenie chatgpt": [1, 2, 3, 4], "Kurs AI": [5, 5, 5, 5] });
    await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake([vol("szkolenie chatgpt", 90)]), trendsExplore, now });
    expect(trendsExplore.mock.calls).toEqual([[["szkolenie chatgpt", "Kurs AI"]]]);
  });

  it("granica 50: fraza z 50 wyszukiwaniami ma trend, z 49 nie", async () => {
    const { client } = world({ keywords: tracked("fraza pięćdziesiąt", "fraza czterdzieści dziewięć") });
    const trendsExplore = trendsFake(WEEKS, {});
    await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake([vol("fraza pięćdziesiąt", 50), vol("fraza czterdzieści dziewięć", 49)]), trendsExplore, now,
    });
    expect(trendsExplore.mock.calls.flat(2)).toContain("fraza pięćdziesiąt");
    expect(trendsExplore.mock.calls.flat(2)).not.toContain("fraza czterdzieści dziewięć");
  });

  it("o Trends decyduje wolumen z Google, a gdy Google go nie zwróci, wolumen zapisany wcześniej", async () => {
    const { client } = world({
      keywords: trackedWithVolume(["stara wysoka", 300], ["stara niska", 10], ["spadek poniżej progu", 300], ["pusta", null]),
    });
    const trendsExplore = trendsFake(WEEKS, {});
    await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, trendsExplore, now,
      searchVolume: volumesFake([vol("stara wysoka", null), vol("stara niska", null), vol("spadek poniżej progu", 20), vol("pusta", null)]),
    });
    expect(trendsExplore.mock.calls).toEqual([[["stara wysoka", "szkolenia ai"]]]);
  });

  it("trend złożony z samych null (kotwica bez ruchu) nie jest zapisywany, choć zapytanie kosztuje", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenie chatgpt") });
    const trendsExplore = trendsFake(WEEKS, { "szkolenie chatgpt": [1, 2, 3, 4], "szkolenia ai": [0, 0, 0, 0] });
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake([vol("szkolenie chatgpt", 90)]), trendsExplore, now });

    expect(trendsExplore).toHaveBeenCalledTimes(1);
    expect(keywordUpdates(calls).filter((c) => "trend" in (c.payload as object) || "trend_updated_at" in (c.payload as object))).toHaveLength(0);
    expect(res.trends).toBe(0);
    expect(res.costUsd).toBeCloseTo(0.101, 6);
    expect(jobUpdate(calls)).toMatchObject({ stats: { trendCandidates: 1, trends: 0, trendRequests: 1 } });
  });

  it("prawdziwe zera trendu (kotwica bez ruchu, ale z danymi) zapisują się: to wartość, nie brak danych", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenia ai") });
    const trendsExplore = trendsFake(WEEKS, { "szkolenia ai": [0, 0, 0, 0] });
    await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake([vol("szkolenia ai", 1900)]), trendsExplore, now });
    const trend = keywordUpdates(calls, "k1").map((c) => c.payload).find((p) => "trend" in (p as object)) as { trend: { value: number | null }[] };
    expect(trend.trend.map((p) => p.value)).toEqual([0, 0, 0]);
  });

  it("bez fraz od 50 wyszukiwań nie woła Trends", async () => {
    const { client } = world({ keywords: tracked("ai act", "kurs ai dla firm") });
    const trendsExplore = vi.fn();
    const res = await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake([vol("ai act", 49), vol("kurs ai dla firm", null)]), trendsExplore, now,
    });
    expect(trendsExplore).not.toHaveBeenCalled();
    // "kurs ai dla firm" bez danych z Google nic nie zapisuje
    expect(res).toMatchObject({ status: "done", keywords: 1, trends: 0 });
    expect(res.costUsd).toBeCloseTo(0.09, 6);
  });

  it("pięć fraz to dwie paczki Trends; kotwica drugiej paczki o połowę mniejsza podwaja jej wartości", async () => {
    const keys = ["a1", "a2", "a3", "a4", "a5"];
    const { client, calls } = world({ keywords: tracked(...keys) });
    const weeks = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"];
    const trendsExplore = vi.fn<typeof trendsExploreFn>()
      .mockResolvedValueOnce({
        series: [...keys.slice(0, 4).map((k) => series(k, weeks, [1, 1, 1, 1])), series("szkolenia ai", weeks, [50, 50, 50, 50])],
        costUsd: 0.011,
      })
      .mockResolvedValueOnce({ series: [series("a5", weeks, [10, 10, 10, 10]), series("szkolenia ai", weeks, [25, 25, 25, 25])], costUsd: 0.011 });

    const res = await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake(keys.map((k) => vol(k, 100))), trendsExplore, now,
    });

    expect(trendsExplore.mock.calls).toEqual([[["a1", "a2", "a3", "a4", "szkolenia ai"]], [["a5", "szkolenia ai"]]]);
    const a5 = keywordUpdates(calls, "k5").map((c) => c.payload).find((p) => "trend" in (p as object)) as { trend: { week: string; value: number }[] };
    expect(a5.trend.map((p) => p.value)).toEqual([20, 20, 20, 20]);
    expect(res.trends).toBe(5);
    expect(res.costUsd).toBeCloseTo(0.09 + 2 * 0.011, 6);
  });

  it("jedyna fraza z ruchem to kotwica: zapytanie Trends dotyczy samej kotwicy, a jej trend się zapisuje", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenia ai") });
    const trendsExplore = trendsFake(WEEKS, { "szkolenia ai": [7, 8, 9, 3] });
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake([vol("szkolenia ai", 1900)]), trendsExplore, now });

    expect(trendsExplore.mock.calls).toEqual([[["szkolenia ai"]]]);
    expect(res.trends).toBe(1);
    const trend = keywordUpdates(calls, "k1").map((c) => c.payload).find((p) => "trend" in (p as object)) as { trend: unknown };
    expect(trend.trend).toEqual([{ week: "2026-10-11", value: 7 }, { week: "2026-10-18", value: 8 }, { week: "2026-10-25", value: 9 }]);
  });

  it("fraza śledzona jako kotwica dostaje trend z paczki, w której kotwica jest odniesieniem", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenie chatgpt", "szkolenia ai") });
    const trendsExplore = trendsFake(WEEKS, { "szkolenie chatgpt": [1, 2, 3, 4], "szkolenia ai": [40, 30, 20, 10] });
    await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake([vol("szkolenie chatgpt", 90), vol("szkolenia ai", 1900)]), trendsExplore, now,
    });
    expect(trendsExplore.mock.calls).toEqual([[["szkolenie chatgpt", "szkolenia ai"]]]);
    const anchor = keywordUpdates(calls, "k2").map((c) => c.payload).find((p) => "trend" in (p as object)) as { trend: { value: number }[] };
    expect(anchor.trend.map((p) => p.value)).toEqual([40, 30, 20]);
  });

  it("tydzień zaczęty dokładnie 7 dni przed now() jest pełny i zostaje, o sekundę młodszy odpada", async () => {
    const run = async (at: string) => {
      const { client, calls } = world({ keywords: tracked("szkolenie chatgpt") });
      await runKeywordVolumes({ projectId: PROJECT }, {
        admin: client, searchVolume: volumesFake([vol("szkolenie chatgpt", 90)]),
        trendsExplore: trendsFake(["2026-10-25", "2026-11-01"], { "szkolenie chatgpt": [3, 4], "szkolenia ai": [5, 5] }),
        now: () => new Date(at),
      });
      const t = keywordUpdates(calls, "k1").map((c) => c.payload).find((p) => "trend" in (p as object)) as { trend: { week: string }[] };
      return t.trend.map((p) => p.week);
    };
    expect(await run("2026-11-08T00:00:00Z")).toEqual(["2026-10-25", "2026-11-01"]);
    expect(await run("2026-11-07T23:59:59Z")).toEqual(["2026-10-25"]);
  });

  it("dopasowuje odpowiedź po znormalizowanej frazie, a fraza bez odpowiedzi zostaje nietknięta i liczy się jako brak", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenie chatgpt", "kurs ai dla firm") });
    const res = await runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake([vol("Szkolenie  ChatGPT", 30)]), trendsExplore: vi.fn(), now,
    });

    expect(keywordUpdates(calls, "k1")).toHaveLength(1);
    expect(keywordUpdates(calls, "k2")).toHaveLength(0);
    expect(res).toMatchObject({ status: "done", keywords: 1 });
    expect(jobUpdate(calls)).toMatchObject({ stats: { keywords: 1, missing: 1 } });
  });
});

describe("runKeywordVolumes: frazy dłuższe niż 10 słów", () => {
  const TEN = "jak wybrać dobre szkolenie z ai dla małej firmy usługowej";
  const ELEVEN = `${TEN} dzisiaj`;

  it("fraza z 10 słowami jedzie do Google Ads, z 11 nie: wiersz zostaje nietknięty, a liczba takich fraz jest w statystykach", async () => {
    const { client, calls } = world({ keywords: tracked(TEN, ELEVEN, "szkolenia ai") });
    const searchVolume = volumesFake([vol(TEN, 60), vol("szkolenia ai", 100)]);
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore: trendsFake(WEEKS, {}), now });

    expect(searchVolume.mock.calls).toEqual([[[TEN, "szkolenia ai"]]]);
    expect(keywordUpdates(calls, "k2")).toHaveLength(0);
    expect(res).toMatchObject({ status: "done", keywords: 2 });
    expect(jobUpdate(calls)).toMatchObject({ stats: { keywords: 2, tooLong: 1, missing: 0 } });
  });

  it("szacunek kosztu liczy tylko frazy wysyłane do Google (4 z 5), więc budżet na dokładnie tyle jeszcze przepuszcza", async () => {
    const keys = tracked("a1", "a2", "a3", "a4", ELEVEN);
    const estimate = estimateVolumesCost(4, 4);
    expect(estimate).toBeLessThan(estimateVolumesCost(5, 5));
    const { client, calls } = world({ keywords: keys, budget: 1 + estimate, spent: 1 });
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: volumesFake([]), trendsExplore: vi.fn(), now });
    expect(res.status).toBe("done");
    expect(jobUpdate(calls)).toMatchObject({ stats: { estimateUsd: estimate, tooLong: 1 } });
  });

  it("same za długie frazy: żadnego wywołania Google, zadanie zakończone z zerowym kosztem", async () => {
    const { client, calls } = world({ keywords: tracked(ELEVEN) });
    const searchVolume = vi.fn();
    const res = await runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore: vi.fn(), now });
    expect(searchVolume).not.toHaveBeenCalled();
    expect(res).toEqual({ status: "done", keywords: 0, trends: 0, costUsd: 0 });
    expect(jobUpdate(calls)).toMatchObject({ status: "done", stats: { tooLong: 1, keywords: 0, missing: 0 } });
  });
});

describe("runKeywordVolumes: błędy", () => {
  it("wyjątek wolumenów: zadanie failed z kosztem 0, wyjątek leci dalej, nic nie zapisano", async () => {
    const { client, calls } = world({ keywords: tracked("szkolenia ai") });
    const searchVolume = vi.fn().mockRejectedValue(new Error("DataForSEO 40501: brak środków"));
    const trendsExplore = vi.fn();

    await expect(runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore, now })).rejects.toThrow("DataForSEO 40501");

    expect(trendsExplore).not.toHaveBeenCalled();
    expect(keywordUpdates(calls)).toHaveLength(0);
    expect(jobUpdate(calls)).toMatchObject({ status: "failed", error: "DataForSEO 40501: brak środków", cost_usd: 0 });
  });

  it("wyjątek w drugiej paczce Trends: zadanie failed z kosztem wolumenów i pierwszej paczki, wolumeny zostają zapisane", async () => {
    const keys = ["a1", "a2", "a3", "a4", "a5"];
    const { client, calls } = world({ keywords: tracked(...keys) });
    const weeks = ["2026-10-04", "2026-10-11"];
    const trendsExplore = vi.fn<typeof trendsExploreFn>()
      .mockResolvedValueOnce({ series: [...keys.slice(0, 4).map((k) => series(k, weeks, [1, 1])), series("szkolenia ai", weeks, [5, 5])], costUsd: 0.011 })
      .mockRejectedValueOnce(new Error("Trends 50000: błąd"));

    await expect(runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake(keys.map((k) => vol(k, 100))), trendsExplore, now,
    })).rejects.toThrow("Trends 50000");

    const job = jobUpdate(calls);
    expect(job).toMatchObject({ status: "failed", error: "Trends 50000: błąd" });
    expect(job.cost_usd as number).toBeCloseTo(0.101, 6);
    expect(keywordUpdates(calls).filter((c) => "search_volume" in (c.payload as object))).toHaveLength(5);
    expect(keywordUpdates(calls).filter((c) => "trend" in (c.payload as object))).toHaveLength(0);
  });

  it("błąd zapisu do bazy kończy zadanie jako failed z już poniesionym kosztem", async () => {
    const { client, calls } = world({ keywords: tracked("a1", "a2"), failUpdate: "k2" });
    await expect(runKeywordVolumes({ projectId: PROJECT }, {
      admin: client, searchVolume: volumesFake([vol("a1", 10), vol("a2", 10)]), trendsExplore: vi.fn(), now,
    })).rejects.toThrow("boom k2");

    const job = jobUpdate(calls);
    expect(job).toMatchObject({ status: "failed", error: "boom k2" });
    expect(job.cost_usd as number).toBeCloseTo(0.09, 6);
  });

  it("błąd odczytu fraz też kończy zadanie jako failed", async () => {
    const { client, calls } = fakeAdmin((c) => {
      if (c.table === "projects") return { data: { seo_budget_usd: 10, trends_anchor: null } };
      if (c.table === "keywords") return { error: { message: "boom keywords" } };
      if (c.table === "seo_jobs" && c.op === "insert") return { data: { id: "job-1" } };
      if (c.table === "seo_jobs" && c.op === "update") return { data: [{ id: "job-1" }] };
      return {};
    });
    await expect(runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume: vi.fn(), trendsExplore: vi.fn(), now })).rejects.toThrow("boom keywords");
    expect(jobUpdate(calls)).toMatchObject({ status: "failed", error: "boom keywords" });
  });

  it("nieudany zapis zamknięcia zadania nie zasłania pierwotnego błędu", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeAdmin((c) => {
      if (c.table === "projects") return { data: { seo_budget_usd: 10, trends_anchor: null } };
      if (c.table === "keywords") return { data: [{ id: "k1", key: "a" }] };
      if (c.table === "seo_jobs" && c.op === "insert") return { data: { id: "job-1" } };
      if (c.table === "seo_jobs" && c.op === "select") return { data: [] };
      if (c.table === "seo_jobs" && c.op === "update") return { error: { message: "ledger down" } };
      return {};
    });
    const searchVolume = vi.fn().mockRejectedValue(new Error("pierwotny błąd"));

    await expect(runKeywordVolumes({ projectId: PROJECT }, { admin: client, searchVolume, trendsExplore: vi.fn(), now })).rejects.toThrow("pierwotny błąd");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("keyword-volumes"), expect.stringContaining("ledger down"));
  });
});
