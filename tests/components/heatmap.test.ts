import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Heatmap, buildHeatmapRows, heatmapCellStyle, promptVisibility } from "@/components/Heatmap";

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

describe("heatmapCellStyle (trzy stany, próg 0,34)", () => {
  const T = 0.34;
  it("brak danych: s2 i kreska, bez tonu", () => {
    const s = heatmapCellStyle(null, T);
    expect(s.className).toContain("bg-s2"); expect(s.label).toBe("—"); expect(s.style).toBeUndefined(); expect(s.tone).toBeUndefined();
  });
  it("bardzo źle (<34%): red, krycie 18% przy 0% do 45% przy 33%, tekst t0", () => {
    const low = heatmapCellStyle(0.1, T), top = heatmapCellStyle(0.33, T);
    expect(low.tone).toBe("bad"); expect(low.label).toBe("10%");
    expect(low.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-red) 26%, transparent)");
    expect(low.className).toContain("text-t0");
    expect(top.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-red) 45%, transparent)");
  });
  it("0%: red 18% z obrysem line-2, żeby pusta komórka była widoczna", () => {
    const s = heatmapCellStyle(0, T);
    expect(s.tone).toBe("bad"); expect(s.label).toBe("0%");
    expect(s.className).toContain("border-line-2");
    expect(s.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-red) 18%, transparent)");
  });
  it("poniżej 0,5% etykieta 0% i komórka zerowa (red z obrysem)", () => {
    const s = heatmapCellStyle(0.004, T);
    expect(s.label).toBe("0%"); expect(s.className).toContain("border-line-2"); expect(s.tone).toBe("bad");
  });
  it("słabo (34–66%): dotychczasowa skala ink, kolor tekstu wg motywu", () => {
    const lo = heatmapCellStyle(0.34, T), mid = heatmapCellStyle(0.5, T), hi = heatmapCellStyle(0.66, T);
    expect(lo.tone).toBe("weak"); expect(hi.tone).toBe("weak");
    expect(lo.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-ink) 36%, transparent)");
    expect(lo.className).toContain("text-t0");
    expect(mid.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-ink) 47%, transparent)");
    expect(mid.className).toContain("text-t0 dark:text-bg");
    expect(hi.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-ink) 58%, transparent)");
  });
  it("dobrze (≥67%): teal, krycie 35% przy 67% do 100% przy 100%, tekst zależny od motywu (patrz niżej)", () => {
    const s67 = heatmapCellStyle(0.67, T), s83 = heatmapCellStyle(0.83, T), s100 = heatmapCellStyle(1, T);
    expect(s67.tone).toBe("good"); expect(s67.label).toBe("67%");
    expect(s67.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-teal) 35%, transparent)");
    expect(s67.className).toContain("text-t0");
    expect(s83.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-teal) 67%, transparent)");
    expect(s83.className).toContain("text-t0 dark:text-bg");
    expect(s100.style?.backgroundColor).toBe("color-mix(in srgb, var(--color-teal) 100%, transparent)");
    expect(s100.className).toContain("text-bg");
  });
  it("kubełek zgadza się z etykietą: 2/3 to 67% i dobrze", () => {
    const s = heatmapCellStyle(0.6667, T);
    expect(s.label).toBe("67%"); expect(s.tone).toBe("good"); expect(s.style?.backgroundColor).toContain("var(--color-teal) 35%");
  });
  it("próg z ustawień przesuwa granicę stanu bardzo źle", () => {
    expect(heatmapCellStyle(0.4, 0.5).tone).toBe("bad");
    expect(heatmapCellStyle(0.4, 0.2).tone).toBe("weak");
    // próg 0: nic nie jest „bardzo źle”, a 0% to słabo z obrysem
    const zero = heatmapCellStyle(0, 0);
    expect(zero.tone).toBe("weak"); expect(zero.className).toContain("border-line-2"); expect(zero.className).toContain("bg-bg");
    // próg 0,01: tylko 0% jest bardzo źle, bez dzielenia przez zero
    expect(heatmapCellStyle(0, 0.01).style?.backgroundColor).toContain("var(--color-red) 18%");
  });
});

describe("kolor tekstu w komórce zależy od motywu", () => {
  const cls = (v: number, t = 0.34) => heatmapCellStyle(v, t).className;
  const text = (v: number, t = 0.34) => cls(v, t).split(" ").filter((c) => /^(dark:)?text-(t0|bg)$/.test(c)).join(" ");
  it("teal: <80% t0, 80–90% t0 + dark:bg, ≥91% bg", () => {
    expect(text(0.67)).toBe("text-t0"); expect(text(0.79)).toBe("text-t0");
    expect(text(0.8)).toBe("text-t0 dark:text-bg"); expect(text(0.83)).toBe("text-t0 dark:text-bg"); expect(text(0.9)).toBe("text-t0 dark:text-bg");
    expect(text(0.91)).toBe("text-bg"); expect(text(0.95)).toBe("text-bg"); expect(text(1)).toBe("text-bg");
  });
  it("ink (słabo): <45% t0, 45–64% t0 + dark:bg, ≥65% bg", () => {
    expect(text(0.34)).toBe("text-t0"); expect(text(0.44)).toBe("text-t0");
    expect(text(0.45)).toBe("text-t0 dark:text-bg"); expect(text(0.5)).toBe("text-t0 dark:text-bg"); expect(text(0.64)).toBe("text-t0 dark:text-bg");
    expect(text(0.65)).toBe("text-bg"); expect(text(0.66)).toBe("text-bg");
  });
  it("red (bardzo źle): zawsze t0", () => {
    for (const v of [0, 0.1, 0.33]) expect(text(v)).toBe("text-t0");
  });
});

describe("promptVisibility", () => {
  it("łączny wiersz ma pierwszeństwo przed średnią z silników", () => {
    const cells = [{ prompt_id: "p1", visibility_rate: 1 }, { prompt_id: "p1", visibility_rate: 0 }];
    expect(promptVisibility(cells, new Map([["p1", 0.8]])).get("p1")).toBe(0.8);
    expect(promptVisibility(cells, new Map()).get("p1")).toBe(0.5);
  });
  it("uśrednia silniki dla pytania; pytanie bez komórek nie ma wpisu", () => {
    const m = promptVisibility([
      { prompt_id: "p1", visibility_rate: 1 }, { prompt_id: "p1", visibility_rate: 0.5 }, { prompt_id: "p2", visibility_rate: 0 },
    ]);
    expect(m.get("p1")).toBe(0.75); expect(m.get("p2")).toBe(0); expect(m.has("p3")).toBe(false);
  });
});

describe("Heatmap", () => {
  it("próg 0 ukrywa pozycję „bardzo źle” w legendzie", () => {
    const { rows, engines } = buildHeatmapRows([{ engine_id: "openai", prompt_id: "p1", visibility_rate: 0.2 }], prompts);
    const html = renderToStaticMarkup(createElement(Heatmap, { rows, engines, threshold: 0 }));
    expect(html).toContain("dobrze ≥ 67%"); expect(html).not.toContain("bardzo źle &lt;");
  });
  it("renderuje legendę z progiem i etykietę stanu w aria-label komórki", () => {
    const { rows, engines } = buildHeatmapRows([{ engine_id: "openai", prompt_id: "p1", visibility_rate: 0.2 }], prompts);
    const html = renderToStaticMarkup(createElement(Heatmap, { rows, engines, threshold: 0.34 }));
    expect(html).toContain("dobrze ≥ 67%");
    expect(html).toContain("słabo");
    expect(html).toContain("bardzo źle &lt; 34%");
    expect(html).toContain("bg-teal"); expect(html).toContain("bg-red");
    expect(html).toContain("aria-label=\"ChatGPT: 20%, bardzo źle\"");
  });
});
