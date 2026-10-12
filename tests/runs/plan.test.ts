import { describe, it, expect } from "vitest";
import { planQueries, estimateCost } from "@/lib/runs/plan";

describe("planQueries", () => {
  it("1 próbka zwykłe, 3 próbki kluczowe, dla każdego silnika", () => {
    const jobs = planQueries(
      [{ id: "a", text: "A", is_key: false }, { id: "b", text: "B", is_key: true }],
      ["openai", "gemini"],
    );
    expect(jobs).toHaveLength(2 * (1 + 3));
    expect(jobs.filter((j) => j.promptId === "b" && j.engineId === "openai").map((j) => j.sampleIdx)).toEqual([0, 1, 2]);
  });
  it("brak promptów lub silników → pusto", () => {
    expect(planQueries([], ["openai"])).toEqual([]);
    expect(planQueries([{ id: "a", text: "A", is_key: false }], [])).toEqual([]);
  });
});

describe("estimateCost", () => {
  it("sumuje koszt wg silnika", () => {
    const jobs = planQueries([{ id: "a", text: "A", is_key: false }], ["openai", "google_ai_overview"]);
    expect(estimateCost(jobs)).toBeCloseTo(0.012 + 0.004);
  });
});
