import { describe, it, expect } from "vitest";
import { visibilityByPrompt } from "@/lib/recommend/collect";
describe("visibilityByPrompt", () => {
  it("składa overall i byEngine per prompt, numeric jako string", () => {
    const rows = [
      { prompt_id: "p1", engine_id: null, visibility_rate: "0.2", responses_count: 4 },
      { prompt_id: "p1", engine_id: "openai", visibility_rate: 0, responses_count: 2 },
      { prompt_id: "p2", engine_id: "gemini", visibility_rate: "1", responses_count: 1 },
    ];
    const v = visibilityByPrompt(rows, [{ id: "p1", intent: "comparison" }, { id: "p2", intent: "brand" }, { id: "p3", intent: "informational" }]);
    expect(v.find((x) => x.promptId === "p1")).toEqual({ promptId: "p1", intent: "comparison", overall: { visibilityRate: 0.2, responsesCount: 4 }, byEngine: [{ engineId: "openai", visibilityRate: 0, responsesCount: 2 }] });
    expect(v.find((x) => x.promptId === "p3")?.overall).toBeNull();
  });
});
