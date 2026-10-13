import { describe, it, expect } from "vitest";
import { progressOf, stageLabel, toRunProgress, isProgressFinished, needsResponseCount } from "@/lib/runs/progress";

describe("progressOf", () => {
  it.each([
    [0, 10, 0], [1, 3, 33], [2, 3, 67], [5, 10, 50], [10, 10, 100],
  ])("%i z %i → %i%%", (done, total, pct) => expect(progressOf(done, total)).toBe(pct));
  it("zerowa liczba zapytań daje 0%", () => expect(progressOf(0, 0)).toBe(0));
  it("nadmiar odpowiedzi nie przekracza 100%", () => expect(progressOf(12, 10)).toBe(100));
  it("ujemne wartości dają 0%", () => expect(progressOf(-1, 10)).toBe(0));
});

describe("stageLabel", () => {
  it("opisuje etapy po zapytaniach", () => {
    expect(stageLabel("aggregating")).toBe("Agregacja wyników…");
    expect(stageLabel("recommending")).toBe("Generowanie rekomendacji…");
  });
  it("etapy zapytań i końca nie mają stałej etykiety", () => {
    expect(stageLabel("queries")).toBeNull();
    expect(stageLabel("done")).toBeNull();
    expect(stageLabel("whatever")).toBeNull();
  });
});

describe("toRunProgress", () => {
  it("składa odpowiedź endpointu", () => {
    expect(toRunProgress({ status: "running", stage: "queries", queries_total: 8 }, 2))
      .toEqual({ status: "running", stage: "queries", done: 2, total: 8, percent: 25 });
  });
});

describe("toRunProgress bez liczenia", () => {
  it("null oznacza, że wszystkie zapytania są za nami", () => {
    expect(toRunProgress({ status: "running", stage: "aggregating", queries_total: 8 }, null)).toMatchObject({ done: 8, total: 8, percent: 100 });
  });
});

describe("isProgressFinished", () => {
  it.each([
    ["running", "queries", false], ["running", "aggregating", false], ["running", "done", false],
    ["done", "recommending", false], ["done", "done", true],
    ["failed", "done", true], ["failed", "queries", true], ["empty", "done", true], ["budget_exceeded", "done", true],
  ])("%s / %s → %s", (status, stage, expected) => expect(isProgressFinished({ status, stage })).toBe(expected));
});

describe("needsResponseCount", () => {
  it("liczy odpowiedzi tylko w etapie zapytań", () => {
    expect(needsResponseCount("queries")).toBe(true);
    for (const s of ["aggregating", "recommending", "done"]) expect(needsResponseCount(s)).toBe(false);
  });
});
