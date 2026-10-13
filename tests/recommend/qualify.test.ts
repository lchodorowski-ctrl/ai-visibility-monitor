import { describe, it, expect } from "vitest";
import { qualifyPrompts, type PromptVisibility } from "@/lib/recommend/qualify";
const row = (p: Partial<PromptVisibility>): PromptVisibility => ({ promptId: "p", intent: "informational", overall: { visibilityRate: 0, responsesCount: 4 }, byEngine: [], ...p });
describe("qualifyPrompts", () => {
  it("kwalifikuje poniżej progu lub 0% w ≥2 silnikach", () => {
    const rows = [
      row({ promptId: "a", overall: { visibilityRate: 0.2, responsesCount: 4 } }),
      row({ promptId: "b", overall: { visibilityRate: 0.5, responsesCount: 4 }, byEngine: [{ engineId: "openai", visibilityRate: 0, responsesCount: 1 }, { engineId: "gemini", visibilityRate: 0, responsesCount: 1 }] }),
      row({ promptId: "c", overall: { visibilityRate: 0.8, responsesCount: 4 } }),
    ];
    expect(qualifyPrompts(rows, 0.34)).toEqual(["a", "b"]);
  });
  it("pomija pytania bez ważnych odpowiedzi (brak danych ≠ brak widoczności)", () => {
    expect(qualifyPrompts([row({ promptId: "x", overall: null }), row({ promptId: "y", overall: { visibilityRate: 0, responsesCount: 0 } })], 0.34)).toEqual([]);
  });
  it("pomija pytania brandowe z widocznością ≥ próg", () => {
    expect(qualifyPrompts([row({ promptId: "b", intent: "brand", overall: { visibilityRate: 0.9, responsesCount: 3 } })], 0.34)).toEqual([]);
    expect(qualifyPrompts([row({ promptId: "b2", intent: "brand", overall: { visibilityRate: 0.1, responsesCount: 3 } })], 0.34)).toEqual(["b2"]);
  });
  it("nie liczy silników bez odpowiedzi jako 0% widoczności", () => {
    const rows = [row({ promptId: "z", overall: { visibilityRate: 0.5, responsesCount: 4 }, byEngine: [{ engineId: "openai", visibilityRate: 0, responsesCount: 0 }, { engineId: "gemini", visibilityRate: 0, responsesCount: 0 }, { engineId: "claude", visibilityRate: 0, responsesCount: 2 }] })];
    expect(qualifyPrompts(rows, 0.34)).toEqual([]);
  });
});
