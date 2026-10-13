import { describe, it, expect } from "vitest";
import { buildHeatmapRows, heatmapCellStyle } from "@/components/Heatmap";

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

  it("prompt bez komórek ma same null", () => {
    const { rows } = buildHeatmapRows(
      [
        { engine_id: "openai", prompt_id: "p1", visibility_rate: 1 },
        { engine_id: "openai", prompt_id: "usuniety", visibility_rate: 1 },
      ],
      prompts,
    );
    expect(rows.map((r) => r.promptId)).toEqual(["p2", "p1"]);
    expect(rows[0].cells).toEqual([{ engineId: "openai", visibilityRate: null }]);
  });
});

describe("heatmapCellStyle (monochromatyczna)", () => {
  it("brak danych: s2 i kreska", () => {
    const s = heatmapCellStyle(null);
    expect(s.className).toContain("bg-s2"); expect(s.label).toBe("—"); expect(s.style).toBeUndefined();
  });
  it("0%: białe tło z obramowaniem line-2", () => {
    const s = heatmapCellStyle(0);
    expect(s.className).toContain("bg-bg"); expect(s.className).toContain("border-line-2"); expect(s.label).toBe("0%");
  });
  it("1–66%: krycie czerni rośnie z wartością, tekst biały od 45%", () => {
    const low = heatmapCellStyle(0.1), mid = heatmapCellStyle(0.5);
    expect(low.style?.backgroundColor).toBe("rgb(29 29 31 / 0.19)");
    expect(low.className).toContain("text-t0");
    expect(mid.style?.backgroundColor).toBe("rgb(29 29 31 / 0.47)");
    expect(mid.className).toContain("text-bg");
  });
  it("≥67%: pełna czerń", () => {
    const s = heatmapCellStyle(0.67);
    expect(s.className).toContain("bg-ink"); expect(s.className).toContain("text-bg"); expect(s.label).toBe("67%");
  });
});
