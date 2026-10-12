import { describe, it, expect } from "vitest";
import { buildHeatmapRows } from "@/components/Heatmap";

const prompts = [{ id: "p2", text: "Drugi" }, { id: "p1", text: "Pierwszy" }];

describe("buildHeatmapRows", () => {
  it("brakująca komórka daje null, a nie 0", () => {
    const { rows } = buildHeatmapRows(
      [
        { engine_id: "openai", prompt_id: "p1", visibility_rate: 1 },
        { engine_id: "gemini", prompt_id: "p1", visibility_rate: 0 },
        { engine_id: "gemini", prompt_id: "p2", visibility_rate: 0.5 },
      ],
      prompts,
    );
    expect(rows[0].cells).toEqual([
      { engineId: "gemini", visibilityRate: 0.5 },
      { engineId: "openai", visibilityRate: null },
    ]);
    expect(rows[1].cells).toEqual([
      { engineId: "gemini", visibilityRate: 0 },
      { engineId: "openai", visibilityRate: 1 },
    ]);
  });

  it("silniki to unikalne, posortowane id; kolejność wierszy wg listy promptów", () => {
    const { rows, engines } = buildHeatmapRows(
      [
        { engine_id: "perplexity", prompt_id: "p1", visibility_rate: 0.2 },
        { engine_id: "openai", prompt_id: "p1", visibility_rate: 0.4 },
        { engine_id: "openai", prompt_id: "p2", visibility_rate: 0.6 },
      ],
      prompts,
    );
    expect(engines).toEqual(["openai", "perplexity"]);
    expect(rows.map((r) => r.promptId)).toEqual(["p2", "p1"]);
    expect(rows.map((r) => r.promptText)).toEqual(["Drugi", "Pierwszy"]);
  });

  it("pomija prompty bez żadnego pomiaru i nieznane prompt_id", () => {
    const { rows } = buildHeatmapRows(
      [
        { engine_id: "openai", prompt_id: "p1", visibility_rate: 1 },
        { engine_id: "openai", prompt_id: "usuniety", visibility_rate: 1 },
      ],
      prompts,
    );
    expect(rows.map((r) => r.promptId)).toEqual(["p1"]);
  });
});
