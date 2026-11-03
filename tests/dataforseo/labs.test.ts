import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DFS_BASE } from "@/lib/dataforseo/client";
import { keywordSuggestions, rankedKeywords } from "@/lib/dataforseo/labs";
import suggestionsFixture from "../fixtures/dataforseo/labs-keyword-suggestions.json";
import rankedOwnFixture from "../fixtures/dataforseo/labs-ranked-keywords-own.json";
import rankedCompetitorFixture from "../fixtures/dataforseo/labs-ranked-keywords-competitor.json";

const respondWith = (body: unknown) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = "l";
  process.env.DATAFORSEO_PASSWORD = "p";
  delete process.env.DATAFORSEO_LOCATION_CODE;
});
afterEach(() => vi.unstubAllGlobals());

describe("keywordSuggestions", () => {
  it("wysyła zapytanie live z frazą wyjściową i domyślnym limitem 50", async () => {
    const fetchMock = respondWith(suggestionsFixture);
    vi.stubGlobal("fetch", fetchMock);
    await keywordSuggestions("szkolenia ai");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DFS_BASE}/dataforseo_labs/google/keyword_suggestions/live`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual([
      { keyword: "szkolenia ai", location_code: 2616, language_code: "pl", limit: 50, include_seed_keyword: true },
    ]);
  });

  it("własny limit trafia do zapytania", async () => {
    const fetchMock = respondWith(suggestionsFixture);
    vi.stubGlobal("fetch", fetchMock);
    await keywordSuggestions("szkolenia ai", 20);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0].limit).toBe(20);
  });

  it("parsuje prawdziwą odpowiedź: 20 podpowiedzi, pierwsza to fraza wyjściowa", async () => {
    vi.stubGlobal("fetch", respondWith(suggestionsFixture));
    const { items, costUsd } = await keywordSuggestions("szkolenia ai", 20);
    expect(costUsd).toBe(0.0144);
    expect(items).toHaveLength(20);
    expect(items[0]).toEqual({ keyword: "szkolenia ai", searchVolume: 1900, keywordDifficulty: 8, cpc: 2.4 });
    expect(items[1]).toEqual({ keyword: "szkolenia ai dla firm", searchVolume: 480, keywordDifficulty: 0, cpc: 8.2 });
  });

  it("brak trudności albo wolumenu to null, a zero trudności zostaje zerem", async () => {
    vi.stubGlobal("fetch", respondWith(suggestionsFixture));
    const { items } = await keywordSuggestions("szkolenia ai", 20);
    expect(items[4]).toEqual({ keyword: "szkolenia ai dla nauczycieli", searchVolume: 140, keywordDifficulty: null, cpc: 0.9 });
    expect(items[19]).toEqual({ keyword: "szkolenia ai w księgowości", searchVolume: null, keywordDifficulty: null, cpc: null });
  });

  it("podpowiedź bez keyword_info i keyword_properties daje same null", async () => {
    const body = structuredClone(suggestionsFixture);
    const bare = { keyword: "goła fraza" } as unknown as (typeof body.tasks)[0]["result"][0]["items"][0];
    body.tasks[0].result[0].items = [bare];
    vi.stubGlobal("fetch", respondWith(body));
    const { items } = await keywordSuggestions("x");
    expect(items).toEqual([{ keyword: "goła fraza", searchVolume: null, keywordDifficulty: null, cpc: null }]);
  });

  it("brak wyniku daje pustą listę i koszt z odpowiedzi", async () => {
    vi.stubGlobal("fetch", respondWith({ status_code: 20000, status_message: "Ok.", cost: 0.012, tasks: [{ status_code: 20000, status_message: "Ok.", result: null }] }));
    await expect(keywordSuggestions("x")).resolves.toEqual({ items: [], costUsd: 0.012 });
  });

  it("wynik z items null daje pustą listę", async () => {
    vi.stubGlobal("fetch", respondWith({ status_code: 20000, status_message: "Ok.", cost: 0.012, tasks: [{ status_code: 20000, status_message: "Ok.", result: [{ items: null }] }] }));
    await expect(keywordSuggestions("x")).resolves.toEqual({ items: [], costUsd: 0.012 });
  });
});

describe("rankedKeywords", () => {
  it("wysyła zapytanie live z domeną, limitem 100 i sortowaniem po wolumenie malejąco", async () => {
    const fetchMock = respondWith(rankedOwnFixture);
    vi.stubGlobal("fetch", fetchMock);
    await rankedKeywords("polskaszkola.ai");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DFS_BASE}/dataforseo_labs/google/ranked_keywords/live`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual([
      {
        target: "polskaszkola.ai", location_code: 2616, language_code: "pl", limit: 100,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    ]);
  });

  it("własny limit trafia do zapytania", async () => {
    const fetchMock = respondWith(rankedOwnFixture);
    vi.stubGlobal("fetch", fetchMock);
    await rankedKeywords("polskaszkola.ai", 30);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0].limit).toBe(30);
  });

  it("własna domena: 6 fraz, „szkolenia ai” na pozycji 52", async () => {
    vi.stubGlobal("fetch", respondWith(rankedOwnFixture));
    const { items, costUsd } = await rankedKeywords("polskaszkola.ai");
    expect(costUsd).toBe(0.01272);
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({
      keyword: "szkolenia ai", position: 52, url: "https://www.polskaszkola.ai/",
      searchVolume: 1900, keywordDifficulty: 8,
    });
    expect(items[0].cpc).toBeCloseTo(2.4, 5);
    expect(items.map((i) => [i.keyword, i.position])).toEqual([
      ["szkolenia ai", 52], ["szkolenie ai", 62], ["szkolenie z ai", 64], ["kurs ai", 78], ["kurs sztuczna inteligencja", 80], ["szkolenie sztuczna inteligencja", 88],
    ]);
  });

  it("konkurent: 11 fraz, „szkolenia ai” na pozycji 7 z adresem podstrony", async () => {
    vi.stubGlobal("fetch", respondWith(rankedCompetitorFixture));
    const { items, costUsd } = await rankedKeywords("altkomakademia.pl");
    expect(costUsd).toBe(0.01332);
    expect(items).toHaveLength(11);
    expect(items[0]).toMatchObject({
      keyword: "szkolenia ai", position: 7,
      url: "https://www.altkomakademia.pl/product-category/szkolenia-it/data-ai/ai-artificial-intelligence-data-ai/",
    });
    expect(items[3]).toMatchObject({ keyword: "agenci ai", position: 10, url: "https://www.altkomakademia.pl/szkolenia/agenci-ai-od-podstaw-do-wdrozenia/" });
  });

  it("pomija elementy inne niż organic", async () => {
    const body = structuredClone(rankedOwnFixture);
    body.tasks[0].result[0].items[1].ranked_serp_element.serp_item.type = "featured_snippet";
    body.tasks[0].result[0].items[2].ranked_serp_element.serp_item.type = "paid";
    vi.stubGlobal("fetch", respondWith(body));
    const { items } = await rankedKeywords("polskaszkola.ai");
    expect(items.map((i) => i.keyword)).toEqual(["szkolenia ai", "kurs ai", "kurs sztuczna inteligencja", "szkolenie sztuczna inteligencja"]);
  });

  it("brak wyniku daje pustą listę", async () => {
    vi.stubGlobal("fetch", respondWith({ status_code: 20000, status_message: "Ok.", cost: 0.012, tasks: [{ status_code: 20000, status_message: "Ok.", result: [{ items: null }] }] }));
    await expect(rankedKeywords("nikt.pl")).resolves.toEqual({ items: [], costUsd: 0.012 });
  });

  it("błąd zadania z DataForSEO przechodzi dalej", async () => {
    vi.stubGlobal("fetch", respondWith({ status_code: 20000, status_message: "Ok.", tasks: [{ status_code: 40501, status_message: "Invalid Field" }] }));
    await expect(rankedKeywords("x")).rejects.toThrow("DataForSEO task 40501: Invalid Field");
  });
});
