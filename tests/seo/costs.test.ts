import { describe, it, expect } from "vitest";
import { DFS_PRICE, SERP_DEPTH, estimateVolumesCost, estimateResearchCost, estimateRankCost } from "@/lib/seo/costs";
import suggestionsFixture from "../fixtures/dataforseo/labs-keyword-suggestions.json";
import rankedOwnFixture from "../fixtures/dataforseo/labs-ranked-keywords-own.json";
import rankedCompetitorFixture from "../fixtures/dataforseo/labs-ranked-keywords-competitor.json";
import volumeFixture from "../fixtures/dataforseo/search-volume.json";
import trendsFixture from "../fixtures/dataforseo/trends-explore.json";
import serpPostFixture from "../fixtures/dataforseo/serp-task-post.json";
import serpKursFixture from "../fixtures/dataforseo/serp-kurs-ai-z-certyfikatem-desktop.json";
import serpBrandFixture from "../fixtures/dataforseo/serp-polska-szkola-ai-desktop.json";
import serpDesktopFixture from "../fixtures/dataforseo/serp-szkolenia-ai-desktop.json";
import serpMobileFixture from "../fixtures/dataforseo/serp-szkolenia-ai-mobile.json";

describe("DFS_PRICE", () => {
  it("ma ceny z cennika DataForSEO (USD)", () => {
    expect(DFS_PRICE).toEqual({
      searchVolumeTask: 0.09, trendsTask: 0.011, labsTask: 0.012, labsRow: 0.00012, serpPage: 0.0006, serpAioSurcharge: 0.0006,
    });
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

describe("SERP: ceny i szacunek kosztu sprawdzenia pozycji", () => {
  it("głębokość 100 to 10 stron wyników", () => {
    expect(SERP_DEPTH).toBe(100);
  });

  it("task_post pobiera górną granicę: 10 stron plus dopłata za AI Overview (prawdziwa odpowiedź)", () => {
    const upperBound = (SERP_DEPTH / 10) * DFS_PRICE.serpPage + DFS_PRICE.serpAioSurcharge;
    expect(upperBound).toBeCloseTo(0.0066, 10);
    for (const task of serpPostFixture.tasks) expect(task.cost).toBeCloseTo(upperBound, 10);
  });

  it("task_get zwraca koszt faktyczny: strony razy cena strony, plus dopłata, gdy AI Overview wczytał się asynchronicznie", () => {
    const fixtures = [serpKursFixture, serpBrandFixture, serpDesktopFixture, serpMobileFixture];
    let withSurcharge = 0;
    for (const fixture of fixtures) {
      const result = fixture.tasks[0].result[0];
      const aio = result.items.find((item) => item.type === "ai_overview") as { asynchronous_ai_overview?: boolean } | undefined;
      const surcharge = aio?.asynchronous_ai_overview ? DFS_PRICE.serpAioSurcharge : 0;
      if (surcharge) withSurcharge++;
      expect(fixture.tasks[0].cost).toBeCloseTo(result.pages_count * DFS_PRICE.serpPage + surcharge, 10);
      expect(fixture.tasks[0].cost).toBeLessThanOrEqual(estimateRankCost(1) + 1e-12);
    }
    // „polska szkoła ai” to jedyna z czterech odpowiedzi z asynchronicznym AI Overview.
    expect(withSurcharge).toBe(1);
  });
});

describe("estimateRankCost", () => {
  it("jedno sprawdzenie to 0,0066 USD, dziesięć to 0,066", () => {
    expect(estimateRankCost(1)).toBeCloseTo(0.0066, 10);
    expect(estimateRankCost(10)).toBeCloseTo(0.066, 10);
  });

  it("górna granica tygodnia: 100 fraz na dwóch urządzeniach to 1,32 USD", () => {
    expect(estimateRankCost(200)).toBeCloseTo(1.32, 10);
  });

  it("bez sprawdzeń nic nie kosztuje, a niepoprawna liczba daje NaN, więc bramka budżetu odmówi", () => {
    expect(estimateRankCost(0)).toBe(0);
    expect(estimateRankCost(Number.NaN)).toBeNaN();
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
