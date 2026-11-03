import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeAdmin, filterValue, type Call, type Handled } from "./fake-admin";

type Result = { data: unknown; error: { message: string } | null };

let result: Result;
const rpc = vi.fn(async (name: string, args: unknown) => { void name; void args; return result; });
const h = vi.hoisted(() => ({ from: null as null | ((table: string) => unknown) }));
const q = vi.hoisted(() => ({ getGscLastDate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc, from: (table: string) => h.from!(table) }) }));
vi.mock("@/lib/seo/queries", () => q);

import { countActiveKeywords, getKeywordDetail, getLatestRanks, getRankDirectionRows } from "@/lib/seo/rank-queries";

let calls: Call[];
function setDb(handler: (c: Call) => Handled) {
  const fake = fakeAdmin(handler);
  h.from = (fake.client as unknown as { from: (table: string) => unknown }).from;
  calls = fake.calls;
}

beforeEach(() => {
  rpc.mockClear();
  q.getGscLastDate.mockReset();
  result = { data: [], error: null };
  calls = [];
});

// PostgREST oddaje int jako liczbę, ale numeric i bigint mogą przyjść jako tekst; jsonb jako obiekt.
const row = (over: Record<string, unknown> = {}) => ({
  keyword_id: "k1", device: "desktop", week_start: "2026-11-02",
  position: 52, rank_absolute: 58, url: "https://polskaszkola.ai/szkolenia-ai", breadcrumb: "https://polskaszkola.ai › szkolenia-ai",
  features: { aiOverview: true, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: true, knowledgePanelOurs: false },
  competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/ai" }],
  checked_at: "2026-11-03T04:12:00Z", prev_week_start: "2026-10-26", prev_position: 55,
  ...over,
});

describe("getLatestRanks", () => {
  it("wywołuje rank_latest dla projektu i mapuje wiersz po id frazy i urządzeniu", async () => {
    result = { data: [row(), row({ device: "mobile", position: null, rank_absolute: null, url: null, breadcrumb: null, prev_week_start: null, prev_position: null })], error: null };
    const ranks = await getLatestRanks("rq-map");
    expect(rpc).toHaveBeenCalledWith("rank_latest", { p_project: "rq-map" });
    expect([...ranks.keys()]).toEqual(["k1"]);
    const k1 = ranks.get("k1")!;
    expect(k1.desktop).toEqual({
      weekStart: "2026-11-02", position: 52, rankAbsolute: 58, url: "https://polskaszkola.ai/szkolenia-ai",
      breadcrumb: "https://polskaszkola.ai › szkolenia-ai",
      features: { aiOverview: true, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: true, knowledgePanelOurs: false },
      competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/ai" }],
      checkedAt: "2026-11-03T04:12:00Z", prevWeekStart: "2026-10-26", prevPosition: 55,
    });
    // brak pozycji to null, nie 0; brak poprzedniego pomiaru to null
    expect(k1.mobile).toMatchObject({ position: null, rankAbsolute: null, url: null, breadcrumb: null, prevWeekStart: null, prevPosition: null });
  });

  it("liczby z tekstu stają się liczbami, a pusty tekst i nie-liczba to null", async () => {
    result = { data: [row({ position: "37", rank_absolute: "41", prev_position: "40" }), row({ keyword_id: "k2", position: "", rank_absolute: "abc", prev_position: "" })], error: null };
    const ranks = await getLatestRanks("rq-num");
    expect(ranks.get("k1")!.desktop).toMatchObject({ position: 37, rankAbsolute: 41, prevPosition: 40 });
    expect(ranks.get("k2")!.desktop).toMatchObject({ position: null, rankAbsolute: null, prevPosition: null });
  });

  it("konkurenci od najlepszej pozycji; wpis bez nazwy albo pozycji jest pomijany, brak adresu to null", async () => {
    result = {
      data: [row({
        competitors: [
          { name: "Coders Lab", domain: "coderslab.pl", position: "12", url: null },
          null, "x", { name: "Bez pozycji", domain: "a.pl" }, { position: 3 },
          { name: "Altkom Akademia", position: 7, url: "https://altkomakademia.pl/ai" },
        ],
      })],
      error: null,
    };
    const { competitors } = (await getLatestRanks("rq-rivals")).get("k1")!.desktop!;
    expect(competitors).toEqual([
      { name: "Altkom Akademia", domain: "", position: 7, url: "https://altkomakademia.pl/ai" },
      { name: "Coders Lab", domain: "coderslab.pl", position: 12, url: null },
    ]);
  });

  it("uszkodzony jsonb daje puste cechy i pustą listę konkurentów, a nie wyjątek", async () => {
    result = {
      data: [
        row({ features: "nie obiekt", competitors: { name: "x" } }),
        row({ keyword_id: "k2", features: null, competitors: null }),
        row({ keyword_id: "k3", features: { aiOverview: "true", localPack: 1, peopleAlsoAsk: true }, competitors: "[]" }),
      ],
      error: null,
    };
    const ranks = await getLatestRanks("rq-broken");
    const none = { aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false };
    expect(ranks.get("k1")!.desktop).toMatchObject({ features: none, competitors: [] });
    expect(ranks.get("k2")!.desktop).toMatchObject({ features: none, competitors: [] });
    // tylko dokładne `true` liczy się jako cecha
    expect(ranks.get("k3")!.desktop!.features).toEqual({ ...none, peopleAlsoAsk: true });
  });

  it("wiersz z nieznanym urządzeniem albo bez tygodnia jest pomijany", async () => {
    result = { data: [row({ device: "tablet" }), row({ keyword_id: "k2", week_start: null }), row({ keyword_id: "k3" })], error: null };
    expect([...(await getLatestRanks("rq-skip")).keys()]).toEqual(["k3"]);
  });

  it("dwa urządzenia tej samej frazy trafiają do jednego wpisu", async () => {
    result = { data: [row(), row({ device: "mobile", position: 61 })], error: null };
    const k1 = (await getLatestRanks("rq-two")).get("k1")!;
    expect(k1.desktop?.position).toBe(52);
    expect(k1.mobile?.position).toBe(61);
  });

  it("brak wierszy (albo null z bazy) daje pustą mapę", async () => {
    expect((await getLatestRanks("rq-empty")).size).toBe(0);
    result = { data: null, error: null };
    expect((await getLatestRanks("rq-null")).size).toBe(0);
  });

  it("błąd bazy rzuca po polsku", async () => {
    result = { data: null, error: { message: "boom" } };
    await expect(getLatestRanks("rq-err")).rejects.toThrow("Nie udało się pobrać pozycji: boom");
  });
});

// --- getKeywordDetail ---------------------------------------------------------------------------------------------

const KW = "5b0f3c1e-0000-4000-8000-000000000001";
const keywordRow = (over: Record<string, unknown> = {}) => ({
  id: KW, project_id: "p1", text: "Szkolenia AI", key: "szkolenia ai", source: "manual", target_path: "/szkolenia", active: true,
  search_volume: "1900", competition: "HIGH", competition_index: "81", cpc: "2.40", monthly_searches: [], trend: [],
  volume_updated_at: "2026-11-03T10:00:00Z", trend_updated_at: null,
  ...over,
});
const noFeatures = { aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false };
const check = (over: Record<string, unknown> = {}) => ({
  device: "desktop", week_start: "2026-11-02", position: 37, url: "https://polskaszkola.ai/szkolenia.html", breadcrumb: null,
  features: noFeatures, top10: [], competitors: [],
  ...over,
});
const entry = (over: Record<string, unknown> = {}) => ({
  position: 1, domain: "altkomakademia.pl", url: "https://altkomakademia.pl/ai", title: "Szkolenia AI", breadcrumb: "https://altkomakademia.pl › ai", ...over,
});

/** Atrapa bazy: fraza `keywords` należy do projektu `p1` (inny projekt widzi zero wierszy, jak przy RLS), pomiary to `checks`. */
function seedDetail(checks: unknown[], keyword: unknown = keywordRow()) {
  setDb((c) => {
    if (c.table === "keywords") return { data: filterValue(c, "eq", "project_id") === "p1" && filterValue(c, "eq", "id") === KW ? keyword : null };
    if (c.table === "rank_checks") return { data: checks };
    return { data: null };
  });
}

describe("getKeywordDetail", () => {
  beforeEach(() => q.getGscLastDate.mockResolvedValue(null));

  it("fraza spoza projektu albo nieistniejąca to null, bez czytania pomiarów i Search Console", async () => {
    seedDetail([check()]);
    expect(await getKeywordDetail("p-obcy", KW)).toBeNull();
    expect(await getKeywordDetail("p1", "5b0f3c1e-0000-4000-8000-0000000000ff")).toBeNull();
    expect(calls.every((c) => c.table === "keywords")).toBe(true);
    expect(calls).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("czyta frazę po id w projekcie, a wiersz mapuje tak samo jak lista fraz (liczby z tekstu)", async () => {
    seedDetail([]);
    const detail = await getKeywordDetail("p1", KW);
    const call = calls.find((c) => c.table === "keywords")!;
    expect(call.op).toBe("select");
    expect(filterValue(call, "eq", "id")).toBe(KW);
    expect(filterValue(call, "eq", "project_id")).toBe("p1");
    expect(detail!.keyword).toMatchObject({
      id: KW, text: "Szkolenia AI", key: "szkolenia ai", targetPath: "/szkolenia", active: true, searchVolume: 1900, cpc: 2.4,
      competitionIndex: 81, volumeUpdatedAt: "2026-11-03T10:00:00Z",
    });
  });

  it("pomiary tylko ze statusem done, z projektu i frazy, od najstarszego tygodnia", async () => {
    seedDetail([]);
    await getKeywordDetail("p1", KW);
    const call = calls.find((c) => c.table === "rank_checks")!;
    expect(call.op).toBe("select");
    expect(filterValue(call, "eq", "project_id")).toBe("p1");
    expect(filterValue(call, "eq", "keyword_id")).toBe(KW);
    expect(filterValue(call, "eq", "status")).toBe("done");
    expect(call.filters.find((f) => f[0] === "order")).toEqual(["order", "week_start", { ascending: true }]);
  });

  it("historia łączy komputer i telefon po tygodniu, rosnąco; brak pomiaru urządzenia i brak w top 100 to null", async () => {
    seedDetail([
      check({ device: "mobile", week_start: "2026-11-02", position: "45" }),
      check({ device: "desktop", week_start: "2026-11-02", position: 37 }),
      check({ device: "desktop", week_start: "2026-10-26", position: 41 }),
      check({ device: "mobile", week_start: "2026-10-19", position: null }),
      check({ device: "desktop", week_start: "2026-10-19", position: null }),
    ]);
    const { history } = (await getKeywordDetail("p1", KW))!;
    expect(history).toEqual([
      { weekStart: "2026-10-19", desktop: null, mobile: null },
      { weekStart: "2026-10-26", desktop: 41, mobile: null },
      { weekStart: "2026-11-02", desktop: 37, mobile: 45 },
    ]);
  });

  it("wiersz z nieznanym urządzeniem albo bez tygodnia jest pomijany", async () => {
    seedDetail([check({ device: "tablet" }), check({ week_start: null }), check({ week_start: "2026-10-26", position: 40 })]);
    const detail = (await getKeywordDetail("p1", KW))!;
    expect(detail.history).toEqual([{ weekStart: "2026-10-26", desktop: 40, mobile: null }]);
    expect(detail.latest.desktop?.weekStart).toBe("2026-10-26");
  });

  it("najnowszy pomiar każdego urządzenia z poprzednim pomiarem tego urządzenia; urządzenie bez pomiarów nie ma wpisu", async () => {
    seedDetail([
      check({ week_start: "2026-10-26", position: 41 }),
      check({
        week_start: "2026-11-02", position: "37", breadcrumb: "https://polskaszkola.ai › szkolenia",
        features: { ...noFeatures, aiOverview: true, peopleAlsoAsk: true },
        competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 1, url: null }],
      }),
    ]);
    const { latest } = (await getKeywordDetail("p1", KW))!;
    expect(latest.mobile).toBeUndefined();
    expect(latest.desktop).toEqual({
      weekStart: "2026-11-02", position: 37, url: "https://polskaszkola.ai/szkolenia.html", breadcrumb: "https://polskaszkola.ai › szkolenia",
      features: { ...noFeatures, aiOverview: true, peopleAlsoAsk: true },
      competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 1, url: null }],
      top10: [], prevWeekStart: "2026-10-26", prevPosition: 41,
    });
  });

  it("pierwszy pomiar nie ma poprzedniego; poprzedni poza top 100 ma prevPosition null przy znanym tygodniu", async () => {
    seedDetail([check({ device: "mobile", week_start: "2026-10-26", position: null }), check({ device: "mobile", week_start: "2026-11-02", position: 55 }), check({ device: "desktop", position: null })]);
    const { latest } = (await getKeywordDetail("p1", KW))!;
    expect(latest.desktop).toMatchObject({ position: null, prevWeekStart: null, prevPosition: null });
    expect(latest.mobile).toMatchObject({ position: 55, prevWeekStart: "2026-10-26", prevPosition: null });
  });

  it("top 10 od pozycji 1; wpis bez pozycji jest pomijany, brak adresu i tytułu to null i pusty tekst", async () => {
    seedDetail([check({
      top10: [
        entry({ position: "3", domain: "coderslab.pl", url: "https://coderslab.pl/ai", title: null, breadcrumb: null }),
        null, "x", { domain: "bez-pozycji.pl" },
        entry({ position: 1, domain: "telewizjagorzow.pl", url: null, title: "Artykuły", breadcrumb: "https://www.telewizjagorzow.pl › Artykuły" }),
      ],
    })]);
    const { top10 } = (await getKeywordDetail("p1", KW))!.latest.desktop!;
    expect(top10).toEqual([
      { position: 1, domain: "telewizjagorzow.pl", url: null, title: "Artykuły", breadcrumb: "https://www.telewizjagorzow.pl › Artykuły" },
      { position: 3, domain: "coderslab.pl", url: "https://coderslab.pl/ai", title: "", breadcrumb: null },
    ]);
  });

  it("uszkodzony jsonb daje puste cechy, konkurentów i top 10, a nie wyjątek", async () => {
    seedDetail([check({ features: "nie obiekt", competitors: { name: "x" }, top10: "[]" })]);
    expect((await getKeywordDetail("p1", KW))!.latest.desktop).toMatchObject({ features: noFeatures, competitors: [], top10: [] });
  });

  it("Search Console: ostatnie 28 dni okna do ostatniej daty z danymi, fraza po kluczu, liczby z tekstu", async () => {
    seedDetail([]);
    q.getGscLastDate.mockResolvedValue("2026-10-31");
    result = {
      data: [
        { page: "/szkolenia", clicks: "12", impressions: "340", position: "8.4" },
        { page: "/blog/ai", clicks: 0, impressions: 25, position: null },
      ],
      error: null,
    };
    const { gsc } = (await getKeywordDetail("p1", KW))!;
    expect(q.getGscLastDate).toHaveBeenCalledWith("p1");
    expect(rpc).toHaveBeenCalledWith("gsc_query_detail", { p_project: "p1", p_query: "szkolenia ai", p_from: "2026-10-04", p_to: "2026-10-31" });
    expect(gsc).toEqual([
      { page: "/szkolenia", clicks: 12, impressions: 340, position: 8.4 },
      { page: "/blog/ai", clicks: 0, impressions: 25, position: null },
    ]);
  });

  it("bez danych z Search Console pusta lista i bez zapytania; brak wierszy to też pusta lista", async () => {
    seedDetail([]);
    expect((await getKeywordDetail("p1", KW))!.gsc).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    q.getGscLastDate.mockResolvedValue("2026-10-31");
    result = { data: null, error: null };
    expect((await getKeywordDetail("p1", KW))!.gsc).toEqual([]);
  });

  it("błędy bazy rzucają po polsku", async () => {
    setDb((c) => (c.table === "keywords" ? { error: { message: "boom" } } : { data: [] }));
    await expect(getKeywordDetail("p1", KW)).rejects.toThrow("Nie udało się pobrać frazy: boom");

    setDb((c) => (c.table === "keywords" ? { data: keywordRow() } : { error: { message: "boom" } }));
    await expect(getKeywordDetail("p1", KW)).rejects.toThrow("Nie udało się pobrać pozycji frazy: boom");

    seedDetail([]);
    q.getGscLastDate.mockResolvedValue("2026-10-31");
    result = { data: null, error: { message: "boom" } };
    await expect(getKeywordDetail("p1", KW)).rejects.toThrow("Nie udało się pobrać frazy z Search Console: boom");
  });
});

// --- getRankDirectionRows i countActiveKeywords --------------------------------------------------------------------

describe("getRankDirectionRows", () => {
  const directionRow = (over: Record<string, unknown> = {}) => ({ keyword_id: "k1", week_start: "2026-11-02", position: 12, ...over });

  /** Atrapa bazy: najnowszy tydzień to pierwsze zapytanie (kolumna `week_start`), wiersze to drugie. */
  function seedDirection(newest: string | null, rows: unknown[]) {
    setDb((c) => (c.cols === "week_start" ? { data: newest === null ? null : { week_start: newest } } : { data: rows }));
  }

  it("najpierw najnowszy tydzień ukończonych pomiarów na komputerze, potem wiersze z 42 dni do niego, tylko z projektu", async () => {
    seedDirection("2026-11-02", []);
    await getRankDirectionRows("rd-query");
    const [newest, rows] = calls.filter((c) => c.table === "rank_checks");
    for (const call of [newest, rows]) {
      expect(call.op).toBe("select");
      expect(filterValue(call, "eq", "project_id")).toBe("rd-query");
      expect(filterValue(call, "eq", "status")).toBe("done");
      expect(filterValue(call, "eq", "device")).toBe("desktop");
    }
    expect(newest.filters.find((f) => f[0] === "order")).toEqual(["order", "week_start", { ascending: false }]);
    expect(newest.filters.find((f) => f[0] === "limit")).toEqual(["limit", 1]);
    expect(rows.cols).toBe("keyword_id, week_start, position");
    expect(filterValue(rows, "gte", "week_start")).toBe("2026-09-21");
  });

  it("mapuje wiersze na id frazy, tydzień i pozycję; pozycja z tekstu to liczba, brak pozycji to null, nie 0", async () => {
    seedDirection("2026-11-02", [
      directionRow(),
      directionRow({ keyword_id: "k2", position: "37" }),
      directionRow({ keyword_id: "k3", position: null }),
      directionRow({ keyword_id: "k4", week_start: "2026-10-05", position: "" }),
    ]);
    expect(await getRankDirectionRows("rd-map")).toEqual([
      { keywordId: "k1", weekStart: "2026-11-02", position: 12 },
      { keywordId: "k2", weekStart: "2026-11-02", position: 37 },
      { keywordId: "k3", weekStart: "2026-11-02", position: null },
      { keywordId: "k4", weekStart: "2026-10-05", position: null },
    ]);
  });

  it("wiersz bez frazy albo bez tygodnia jest pomijany", async () => {
    seedDirection("2026-11-02", [directionRow({ keyword_id: null }), directionRow({ week_start: null }), directionRow({ keyword_id: "k9" })]);
    expect(await getRankDirectionRows("rd-skip")).toEqual([{ keywordId: "k9", weekStart: "2026-11-02", position: 12 }]);
  });

  it("bez żadnego ukończonego pomiaru: pusta lista i bez drugiego zapytania", async () => {
    seedDirection(null, [directionRow()]);
    expect(await getRankDirectionRows("rd-none")).toEqual([]);
    expect(calls.filter((c) => c.table === "rank_checks")).toHaveLength(1);
  });

  it("błędy bazy rzucają po polsku", async () => {
    setDb(() => ({ error: { message: "boom" } }));
    await expect(getRankDirectionRows("rd-err1")).rejects.toThrow("Nie udało się pobrać pozycji do podsumowania: boom");
    setDb((c) => (c.cols === "week_start" ? { data: { week_start: "2026-11-02" } } : { error: { message: "boom" } }));
    await expect(getRankDirectionRows("rd-err2")).rejects.toThrow("Nie udało się pobrać pozycji do podsumowania: boom");
  });
});

describe("countActiveKeywords", () => {
  it("liczy aktywne frazy projektu zapytaniem tylko o liczbę, bez pobierania wierszy", async () => {
    setDb(() => ({ data: null, count: 7 }));
    expect(await countActiveKeywords("ck-ok")).toBe(7);
    const call = calls.find((c) => c.table === "keywords")!;
    expect(call.op).toBe("select");
    expect(call.opts).toEqual({ count: "exact", head: true });
    expect(filterValue(call, "eq", "project_id")).toBe("ck-ok");
    expect(filterValue(call, "eq", "active")).toBe(true);
  });

  it("brak licznika w odpowiedzi to 0", async () => {
    setDb(() => ({ data: null, count: null }));
    expect(await countActiveKeywords("ck-null")).toBe(0);
  });

  it("błąd bazy rzuca po polsku", async () => {
    setDb(() => ({ error: { message: "boom" } }));
    await expect(countActiveKeywords("ck-err")).rejects.toThrow("Nie udało się policzyć fraz: boom");
  });
});
