import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DFS_BASE } from "@/lib/dataforseo/client";
import { searchVolume } from "@/lib/dataforseo/keywords-data";
import fixture from "../fixtures/dataforseo/search-volume.json";

const respondWith = (body: unknown) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));

// Odpowiedź w kształcie prawdziwej, z jednym wynikiem na każdą wysłaną frazę.
const echoVolumes = (cost: number) =>
  vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
    const [{ keywords }] = JSON.parse(init.body) as { keywords: string[] }[];
    const result = keywords.map((keyword) => ({
      keyword, competition: "LOW", competition_index: 10, search_volume: 10, cpc: 0.5, monthly_searches: null,
    }));
    return new Response(JSON.stringify({ status_code: 20000, status_message: "Ok.", cost, tasks: [{ status_code: 20000, status_message: "Ok.", result }] }), { status: 200 });
  });

describe("searchVolume", () => {
  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = "l";
    process.env.DATAFORSEO_PASSWORD = "p";
    delete process.env.DATAFORSEO_LOCATION_CODE;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("wysyła jedno zapytanie live z lokalizacją i językiem", async () => {
    const fetchMock = respondWith(fixture);
    vi.stubGlobal("fetch", fetchMock);
    const keywords = ["szkolenia ai", "szkolenie chatgpt", "kurs ai dla firm", "szkolenia ai warszawa"];
    await searchVolume(keywords);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DFS_BASE}/keywords_data/google_ads/search_volume/live`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual([{ keywords, location_code: 2616, language_code: "pl" }]);
  });

  it("lokalizacja z DATAFORSEO_LOCATION_CODE", async () => {
    process.env.DATAFORSEO_LOCATION_CODE = "2840";
    const fetchMock = respondWith(fixture);
    vi.stubGlobal("fetch", fetchMock);
    await searchVolume(["szkolenia ai"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0].location_code).toBe(2840);
  });

  it("parsuje prawdziwą odpowiedź: wolumen, konkurencja, CPC i 12 miesięcy", async () => {
    vi.stubGlobal("fetch", respondWith(fixture));
    const { items, costUsd } = await searchVolume(["szkolenia ai"]);
    expect(costUsd).toBe(0.09);
    expect(items.map((i) => i.keyword)).toEqual(["szkolenia ai", "szkolenie chatgpt", "kurs ai dla firm", "szkolenia ai warszawa"]);
    const first = items[0];
    expect(first).toMatchObject({ keyword: "szkolenia ai", searchVolume: 1900, competition: "HIGH", competitionIndex: 75, cpc: 2.4 });
    expect(first.monthlySearches).toHaveLength(12);
    expect(first.monthlySearches[0]).toEqual({ year: 2026, month: 9, searchVolume: 1600 });
    expect(first.monthlySearches[11]).toEqual({ year: 2025, month: 10, searchVolume: 2900 });
  });

  it("fraza bez danych: null i pusta lista miesięcy", async () => {
    vi.stubGlobal("fetch", respondWith(fixture));
    const { items } = await searchVolume(["kurs ai dla firm"]);
    expect(items[2]).toEqual({
      keyword: "kurs ai dla firm", searchVolume: null, competition: null, competitionIndex: null, cpc: null, monthlySearches: [],
    });
  });

  it("miesiąc z null w wolumenie zostaje z null", async () => {
    const body = structuredClone(fixture);
    body.tasks[0].result[0].monthly_searches![0].search_volume = null as unknown as number;
    vi.stubGlobal("fetch", respondWith(body));
    const { items } = await searchVolume(["szkolenia ai"]);
    expect(items[0].monthlySearches[0]).toEqual({ year: 2026, month: 9, searchVolume: null });
  });

  it("dzieli frazy na paczki po 1000 i sumuje koszt", async () => {
    const keywords = Array.from({ length: 2001 }, (_, i) => `fraza ${i}`);
    const fetchMock = echoVolumes(0.09);
    vi.stubGlobal("fetch", fetchMock);
    const { items, costUsd } = await searchVolume(keywords);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body)[0].keywords as string[]);
    expect(sent.map((s) => s.length)).toEqual([1000, 1000, 1]);
    expect(sent.flat()).toEqual(keywords);
    expect(items.map((i) => i.keyword)).toEqual(keywords);
    expect(costUsd).toBeCloseTo(0.27, 10);
  });

  it("dokładnie 1000 fraz to jedno zapytanie", async () => {
    const fetchMock = echoVolumes(0.09);
    vi.stubGlobal("fetch", fetchMock);
    await searchVolume(Array.from({ length: 1000 }, (_, i) => `fraza ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bez fraz nie woła API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchVolume([])).resolves.toEqual({ items: [], costUsd: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("zadanie bez wyniku i bez kosztu daje pustą listę i zero", async () => {
    vi.stubGlobal("fetch", respondWith({ status_code: 20000, status_message: "Ok.", tasks: [{ status_code: 20000, status_message: "Ok.", result: null }] }));
    await expect(searchVolume(["a"])).resolves.toEqual({ items: [], costUsd: 0 });
  });

  it("błąd zadania z DataForSEO przechodzi dalej", async () => {
    vi.stubGlobal("fetch", respondWith({ status_code: 20000, status_message: "Ok.", tasks: [{ status_code: 40501, status_message: "Invalid Field" }] }));
    await expect(searchVolume(["a"])).rejects.toThrow("DataForSEO task 40501: Invalid Field");
  });
});
