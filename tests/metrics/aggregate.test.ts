import { describe, it, expect } from "vitest";
import { computeMetrics, computeScore, type ResponseFacts } from "@/lib/metrics/aggregate";

const f = (p: Partial<ResponseFacts>): ResponseFacts => ({
  promptId: "p1", engineId: "openai", noAnswer: false, error: false,
  ownMentioned: false, ownPosition: null, ownCited: false, brandsMentioned: 0, ...p,
});

describe("computeScore", () => {
  it("100 przy pełnej widoczności na 1. pozycji", () => {
    expect(computeScore({ visibilityRate: 1, citationRate: 1, shareOfVoice: 1, avgPosition: 1 })).toBe(100);
  });
  it("0 bez widoczności", () => {
    expect(computeScore({ visibilityRate: 0, citationRate: 0, shareOfVoice: 0, avgPosition: null })).toBe(0);
  });
});

describe("computeMetrics", () => {
  const rows = [
    f({ ownMentioned: true, ownPosition: 1, ownCited: true, brandsMentioned: 2 }),
    f({ ownMentioned: false, brandsMentioned: 1 }),
    f({ engineId: "gemini", ownMentioned: true, ownPosition: 3, brandsMentioned: 3 }),
    f({ engineId: "gemini", promptId: "p2", noAnswer: true }),   // wyłączone z mianownika
    f({ engineId: "gemini", promptId: "p2", error: true }),      // wyłączone z mianownika
  ];

  it("liczy ogółem z pominięciem noAnswer/error", () => {
    const all = computeMetrics(rows).find((m) => m.engineId === null && m.promptId === null)!;
    expect(all.responsesCount).toBe(3);
    expect(all.visibilityRate).toBeCloseTo(2 / 3);
    expect(all.citationRate).toBeCloseTo(1 / 3);
    expect(all.avgPosition).toBeCloseTo(2);
    expect(all.shareOfVoice).toBeCloseTo(2 / 6);
  });

  it("liczy per silnik i per prompt", () => {
    const out = computeMetrics(rows);
    const gemini = out.find((m) => m.engineId === "gemini" && m.promptId === null)!;
    expect(gemini.responsesCount).toBe(1);
    expect(gemini.visibilityRate).toBe(1);
    const p1 = out.find((m) => m.engineId === null && m.promptId === "p1")!;
    expect(p1.responsesCount).toBe(3);
    const cell = out.find((m) => m.engineId === "openai" && m.promptId === "p1")!;
    expect(cell.visibilityRate).toBeCloseTo(0.5);
  });

  it("pomija wiersze per silnik/prompt/komórka bez poprawnych odpowiedzi", () => {
    const out = computeMetrics(rows);
    expect(out.find((m) => m.engineId === "gemini" && m.promptId === "p2")).toBeUndefined();
    expect(out.find((m) => m.engineId === null && m.promptId === "p2")).toBeUndefined();
    const gemini = out.find((m) => m.engineId === "gemini" && m.promptId === null)!;
    expect(gemini.responsesCount).toBe(1);
  });

  it("pusty zbiór → []", () => {
    expect(computeMetrics([])).toEqual([]);
  });

  it("wszystkie odpowiedzi noAnswer/error → []", () => {
    expect(computeMetrics([f({ noAnswer: true }), f({ error: true }), f({ engineId: "gemini", error: true })])).toEqual([]);
  });
});
