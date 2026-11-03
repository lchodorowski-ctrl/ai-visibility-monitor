import { describe, it, expect } from "vitest";
import { DFS_PRICE, estimateVolumesCost, estimateResearchCost } from "@/lib/seo/costs";
import suggestionsFixture from "../fixtures/dataforseo/labs-keyword-suggestions.json";
import rankedOwnFixture from "../fixtures/dataforseo/labs-ranked-keywords-own.json";
import rankedCompetitorFixture from "../fixtures/dataforseo/labs-ranked-keywords-competitor.json";
import volumeFixture from "../fixtures/dataforseo/search-volume.json";
import trendsFixture from "../fixtures/dataforseo/trends-explore.json";

describe("DFS_PRICE", () => {
  it("ma ceny z cennika DataForSEO (USD)", () => {
    expect(DFS_PRICE).toEqual({ searchVolumeTask: 0.09, trendsTask: 0.011, labsTask: 0.012, labsRow: 0.00012 });
  });

  it("zgadza się z kosztami prawdziwych odpowiedzi z 2026-11-03", () => {
    expect(DFS_PRICE.searchVolumeTask).toBe(volumeFixture.cost);
    expect(DFS_PRICE.trendsTask).toBe(trendsFixture.cost);
    const labsRowsCost = (rows: number) => DFS_PRICE.labsTask + rows * DFS_PRICE.labsRow;
    expect(labsRowsCost(suggestionsFixture.tasks[0].result[0].items_count)).toBeCloseTo(suggestionsFixture.cost, 8);
    expect(labsRowsCost(rankedOwnFixture.tasks[0].result[0].items_count)).toBeCloseTo(rankedOwnFixture.cost, 8);
    expect(labsRowsCost(rankedCompetitorFixture.tasks[0].result[0].items_count)).toBeCloseTo(rankedCompetitorFixture.cost, 8);
  });
});

describe("estimateVolumesCost", () => {
  it("jedno zadanie wolumenów na 1000 fraz i jedno zapytanie Trends na 4 frazy", () => {
    expect(estimateVolumesCost(30, 10)).toBeCloseTo(0.123, 10);
  });

  it("paczki zaokrąglane w górę na granicach", () => {
    expect(estimateVolumesCost(1000, 4)).toBeCloseTo(0.09 + 0.011, 10);
    expect(estimateVolumesCost(1001, 5)).toBeCloseTo(2 * 0.09 + 2 * 0.011, 10);
  });

  it("bez fraz nic nie kosztuje", () => {
    expect(estimateVolumesCost(0, 0)).toBe(0);
  });

  it("niepoprawna liczba daje NaN, więc bramka budżetu odmówi", () => {
    expect(estimateVolumesCost(Number.NaN, 4)).toBeNaN();
  });
});

describe("estimateResearchCost", () => {
  it("domyślne limity: 50 podpowiedzi na hasło i 100 fraz na domenę", () => {
    expect(estimateResearchCost({ seeds: 7, domains: 8 })).toBeCloseTo(0.318, 10);
  });

  it("hasła i domeny liczone osobno", () => {
    expect(estimateResearchCost({ seeds: 1, domains: 0 })).toBeCloseTo(0.012 + 50 * 0.00012, 10);
    expect(estimateResearchCost({ seeds: 0, domains: 1 })).toBeCloseTo(0.012 + 100 * 0.00012, 10);
    expect(estimateResearchCost({ seeds: 0, domains: 0 })).toBe(0);
  });

  it("własne limity zmieniają koszt wierszy", () => {
    expect(estimateResearchCost({ seeds: 2, domains: 3, suggestionLimit: 20, rankedLimit: 30 }))
      .toBeCloseTo(2 * (0.012 + 20 * 0.00012) + 3 * (0.012 + 30 * 0.00012), 10);
  });
});
