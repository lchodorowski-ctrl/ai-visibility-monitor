import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DFS_BASE } from "@/lib/dataforseo/client";
import { trendsExplore, trendBatches, normalizeTrends, type TrendSeries } from "@/lib/dataforseo/trends";
import fixture from "../fixtures/dataforseo/trends-explore.json";

const respondWith = (body: unknown) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("trendsExplore", () => {
  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = "l";
    process.env.DATAFORSEO_PASSWORD = "p";
    delete process.env.DATAFORSEO_LOCATION_CODE;
  });
  afterEach(() => vi.unstubAllGlobals());

  const keywords = ["szkolenia ai", "szkolenie chatgpt", "kurs ai", "ai act"];

  it("wysyła zapytanie live: 12 miesięcy, wyszukiwarka web, Polska, język pl", async () => {
    const fetchMock = respondWith(fixture);
    vi.stubGlobal("fetch", fetchMock);
    await trendsExplore(keywords);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DFS_BASE}/keywords_data/google_trends/explore/live`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual([
      { keywords, location_code: 2616, language_code: "pl", time_range: "past_12_months", type: "web" },
    ]);
  });

  it("parsuje prawdziwą odpowiedź: seria na frazę, 53 tygodnie, tydzień z date_from", async () => {
    vi.stubGlobal("fetch", respondWith(fixture));
    const { series, costUsd } = await trendsExplore(keywords);
    expect(costUsd).toBe(0.011);
    expect(series.map((s) => s.keyword)).toEqual(keywords);
    for (const s of series) expect(s.points).toHaveLength(53);
    expect(series[0].points[0]).toEqual({ week: "2025-11-02", value: 8 });
    expect(series[0].points[1]).toEqual({ week: "2025-11-09", value: 7 });
    expect(series[2].points[0]).toEqual({ week: "2025-11-02", value: 26 });
    expect(series[3].points[0]).toEqual({ week: "2025-11-02", value: 100 });
    expect(series[0].points[52].week).toBe("2026-11-01");
  });

  it("brak danych w tygodniu zostaje null", async () => {
    vi.stubGlobal("fetch", respondWith(fixture));
    const { series } = await trendsExplore(keywords);
    expect(series[1].keyword).toBe("szkolenie chatgpt");
    expect(series[1].points[0].value).toBeNull();
  });

  it("wartość z values[j] należy do item.keywords[j], nawet gdy kolejność różni się od wysłanej", async () => {
    const body = structuredClone(fixture);
    const graph = body.tasks[0].result[0].items[0];
    graph.keywords = ["ai act", "kurs ai"];
    for (const point of graph.data) point.values = [point.values[3], point.values[2]];
    vi.stubGlobal("fetch", respondWith(body));
    const { series } = await trendsExplore(["kurs ai", "ai act"]);
    expect(series.map((s) => s.keyword)).toEqual(["ai act", "kurs ai"]);
    expect(series[0].points[0].value).toBe(100);
    expect(series[1].points[0].value).toBe(26);
  });

  it("wybiera element google_trends_graph spośród innych", async () => {
    const body = structuredClone(fixture);
    const graph = body.tasks[0].result[0].items[0];
    const other = { type: "google_trends_topics_list", position: 2, title: null, keywords: ["x"], data: [] };
    (body.tasks[0].result[0].items as unknown[]) = [other, graph];
    vi.stubGlobal("fetch", respondWith(body));
    const { series } = await trendsExplore(keywords);
    expect(series).toHaveLength(4);
  });

  it("odpowiedź bez wykresu to brak serii, a koszt zostaje", async () => {
    const body = structuredClone(fixture);
    (body.tasks[0].result[0].items as unknown[]) = [];
    vi.stubGlobal("fetch", respondWith(body));
    await expect(trendsExplore(keywords)).resolves.toEqual({ series: [], costUsd: 0.011 });
  });

  it("odmawia więcej niż 5 fraz i pustej listy bez wołania API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(trendsExplore(["a", "b", "c", "d", "e", "f"])).rejects.toThrow("od 1 do 5 fraz");
    await expect(trendsExplore([])).rejects.toThrow("od 1 do 5 fraz");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("5 fraz jest dozwolone", async () => {
    vi.stubGlobal("fetch", respondWith(fixture));
    await expect(trendsExplore(["a", "b", "c", "d", "e"])).resolves.toMatchObject({ costUsd: 0.011 });
  });
});

describe("trendBatches", () => {
  const nine = Array.from({ length: 9 }, (_, i) => `fraza ${i + 1}`);

  it("po 4 frazy bez kotwicy i kotwica na końcu każdej paczki", () => {
    expect(trendBatches(nine, "szkolenia ai")).toEqual([
      ["fraza 1", "fraza 2", "fraza 3", "fraza 4", "szkolenia ai"],
      ["fraza 5", "fraza 6", "fraza 7", "fraza 8", "szkolenia ai"],
      ["fraza 9", "szkolenia ai"],
    ]);
  });

  it("kotwica z listy nie dubluje się (porównanie po znormalizowanym kluczu)", () => {
    const withAnchor = [...nine.slice(0, 3), "Szkolenia  AI ", ...nine.slice(3)];
    const batches = trendBatches(withAnchor, "szkolenia ai");
    expect(batches).toHaveLength(3);
    for (const batch of batches) {
      expect(batch.filter((k) => k.toLowerCase().trim() === "szkolenia ai")).toHaveLength(1);
      expect(batch[batch.length - 1]).toBe("szkolenia ai");
    }
  });

  it("9 fraz z kotwicą na liście to 8 innych, czyli 2 paczki", () => {
    expect(trendBatches([...nine.slice(0, 8), "szkolenia ai"], "szkolenia ai")).toHaveLength(2);
  });

  it("powtórzone frazy trafiają do paczek raz", () => {
    expect(trendBatches(["a", "b", "A ", "a"], "x")).toEqual([["a", "b", "x"]]);
  });

  it("żadna paczka nie przekracza 5 fraz", () => {
    for (const batch of trendBatches(Array.from({ length: 41 }, (_, i) => `f${i}`), "k")) expect(batch.length).toBeLessThanOrEqual(5);
  });

  it("bez fraz albo tylko z kotwicą nie ma paczek", () => {
    expect(trendBatches([], "szkolenia ai")).toEqual([]);
    expect(trendBatches(["szkolenia ai"], "szkolenia ai")).toEqual([]);
  });
});

describe("normalizeTrends", () => {
  const WEEKS = ["2026-10-04", "2026-10-11", "2026-10-18"];
  const series = (keyword: string, values: (number | null)[], weeks = WEEKS): TrendSeries => ({
    keyword,
    points: weeks.map((week, i) => ({ week, value: values[i] ?? null })),
  });
  const values = (points: { value: number | null }[] | undefined) => points?.map((p) => p.value);

  it("paczka z kotwicą dwa razy mniejszą podwaja wartości", () => {
    const batch1 = [series("a", [10, 20, 30]), series("kotwica", [50, 50, 50])];
    const batch2 = [series("b", [10, 20, 30]), series("kotwica", [25, 25, 25])];
    const result = normalizeTrends([batch1, batch2], "kotwica");
    expect(values(result.get("a"))).toEqual([10, 20, 30]);
    expect(values(result.get("b"))).toEqual([20, 40, 60]);
  });

  it("zachowuje tygodnie punktów", () => {
    const result = normalizeTrends([[series("a", [1, 2, 3]), series("kotwica", [50, 50, 50])]], "kotwica");
    expect(result.get("a")?.map((p) => p.week)).toEqual(WEEKS);
  });

  it("kotwica jest w wyniku raz, z paczki odniesienia", () => {
    const batch1 = [series("a", [1, 2, 3]), series("kotwica", [40, 50, 60])];
    const batch2 = [series("b", [1, 2, 3]), series("kotwica", [20, 25, 30])];
    const result = normalizeTrends([batch1, batch2], "kotwica");
    expect([...result.keys()].filter((k) => k === "kotwica")).toHaveLength(1);
    expect(result.size).toBe(3);
    expect(values(result.get("kotwica"))).toEqual([40, 50, 60]);
  });

  it("odniesieniem jest pierwsza paczka z kotwicą o sumie większej od zera", () => {
    const batch1 = [series("a", [10, 10, 10]), series("kotwica", [0, 0, 0])];
    const batch2 = [series("b", [10, 10, 10]), series("kotwica", [20, 20, 20])];
    const batch3 = [series("c", [10, 10, 10]), series("kotwica", [40, 40, 40])];
    const result = normalizeTrends([batch1, batch2, batch3], "kotwica");
    expect(values(result.get("a"))).toEqual([null, null, null]);
    expect(values(result.get("b"))).toEqual([10, 10, 10]);
    expect(values(result.get("c"))).toEqual([5, 5, 5]);
    expect(values(result.get("kotwica"))).toEqual([20, 20, 20]);
  });

  it("paczka z kotwicą samych zer daje null", () => {
    const batch1 = [series("a", [10, 20, 30]), series("kotwica", [50, 50, 50])];
    const batch2 = [series("b", [10, 20, 30]), series("kotwica", [0, 0, 0])];
    const result = normalizeTrends([batch1, batch2], "kotwica");
    expect(values(result.get("b"))).toEqual([null, null, null]);
    expect(values(result.get("a"))).toEqual([10, 20, 30]);
  });

  it("paczka bez kotwicy daje null", () => {
    const batch1 = [series("a", [10, 20, 30]), series("kotwica", [50, 50, 50])];
    const batch2 = [series("b", [10, 20, 30])];
    const result = normalizeTrends([batch1, batch2], "kotwica");
    expect(values(result.get("b"))).toEqual([null, null, null]);
  });

  it("brak danych w punkcie zostaje null, nie zero", () => {
    const batch1 = [series("a", [1, 2, 3]), series("kotwica", [50, 50, 50])];
    const batch2 = [series("b", [null, 20, 30]), series("kotwica", [25, 25, 25])];
    expect(values(normalizeTrends([batch1, batch2], "kotwica").get("b"))).toEqual([null, 40, 60]);
  });

  it("zaokrągla do jednego miejsca po przecinku", () => {
    const batch1 = [series("a", [1, 1, 1]), series("kotwica", [30, 30, 30])];
    const batch2 = [series("b", [7, 1, 1]), series("kotwica", [20, 20, 20])];
    expect(values(normalizeTrends([batch1, batch2], "kotwica").get("b"))).toEqual([10.5, 1.5, 1.5]);
    const batch3 = [series("c", [1, 1, 1]), series("kotwica", [90, 90, 90])];
    expect(values(normalizeTrends([batch1, batch3], "kotwica").get("c"))).toEqual([0.3, 0.3, 0.3]);
  });

  it("kotwicę rozpoznaje po znormalizowanym kluczu, a wynik kluczuje tak samo", () => {
    const batch = [series("Fraza A", [1, 2, 3]), series("Szkolenia AI", [50, 50, 50])];
    const result = normalizeTrends([batch], "szkolenia ai");
    expect([...result.keys()].sort()).toEqual(["fraza a", "szkolenia ai"]);
  });

  it("łączy tygodnie po polu week: czynnik z tygodni wspólnych, gdy paczki mają różne zakresy", () => {
    const shifted = ["2026-10-11", "2026-10-18", "2026-10-25"];
    const batch1 = [series("a", [1, 1, 1]), series("kotwica", [100, 50, 50])];
    // wspólne tygodnie: 10-11 i 10-18; kotwica odniesienia 50 + 50 = 100, w paczce 25 + 25 = 50
    const batch2 = [series("b", [10, 20, 30], shifted), series("kotwica", [25, 25, 999], shifted)];
    const result = normalizeTrends([batch1, batch2], "kotwica");
    expect(result.get("b")).toEqual([
      { week: "2026-10-11", value: 20 },
      { week: "2026-10-18", value: 40 },
      { week: "2026-10-25", value: 60 },
    ]);
  });

  it("paczki bez wspólnych tygodni z odniesieniem dają null", () => {
    const batch1 = [series("a", [1, 1, 1]), series("kotwica", [50, 50, 50])];
    const batch2 = [series("b", [1, 1, 1], ["2027-01-03", "2027-01-10", "2027-01-17"]), series("kotwica", [50, 50, 50], ["2027-01-03", "2027-01-10", "2027-01-17"])];
    expect(values(normalizeTrends([batch1, batch2], "kotwica").get("b"))).toEqual([null, null, null]);
  });

  it("gdy kotwica nigdzie nie ma ruchu, frazy mają null, a kotwica zostaje z prawdziwymi zerami", () => {
    const result = normalizeTrends([[series("a", [5, 5, 5]), series("kotwica", [0, 0, 0])]], "kotwica");
    expect(values(result.get("a"))).toEqual([null, null, null]);
    expect(values(result.get("kotwica"))).toEqual([0, 0, 0]);
  });

  it("bez paczek i bez kotwicy w żadnej paczce wynik jest pusty albo bez kotwicy", () => {
    expect(normalizeTrends([], "kotwica").size).toBe(0);
    const result = normalizeTrends([[series("a", [5, 5, 5])]], "kotwica");
    expect([...result.keys()]).toEqual(["a"]);
    expect(values(result.get("a"))).toEqual([null, null, null]);
  });

  it("działa na seriach z prawdziwej odpowiedzi Trends (kotwica to ostatnia fraza)", async () => {
    process.env.DATAFORSEO_LOGIN = "l";
    process.env.DATAFORSEO_PASSWORD = "p";
    vi.stubGlobal("fetch", respondWith(fixture));
    try {
      const { series: real } = await trendsExplore(["szkolenie chatgpt", "kurs ai", "ai act", "szkolenia ai"]);
      const result = normalizeTrends([real], "szkolenia ai");
      expect(values(result.get("szkolenia ai"))?.[0]).toBe(8);
      expect(values(result.get("ai act"))?.[0]).toBe(100);
      expect(values(result.get("szkolenie chatgpt"))?.[0]).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
