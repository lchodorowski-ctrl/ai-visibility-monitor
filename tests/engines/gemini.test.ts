import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "../fixtures/responses/gemini.json";

const create = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { interactions = { create }; },
}));

describe("gemini adapter", () => {
  beforeEach(() => { create.mockReset(); process.env.GEMINI_API_KEY = "test"; });

  it("parseGeminiResponse: tekst z output_text, cytowania z annotations", async () => {
    const { parseGeminiResponse } = await import("@/lib/engines/gemini");
    const r = parseGeminiResponse(fixture);
    expect(r.text).toContain("Polska Szkoła AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "akademia-ai.pl"]);
  });

  it("parseGeminiResponse: bez output_text składa tekst ze steps", async () => {
    const { parseGeminiResponse } = await import("@/lib/engines/gemini");
    const { output_text: _omit, ...noText } = fixture;
    expect(parseGeminiResponse(noText).text).toContain("Akademia AI");
  });

  it("query używa google_search i zwraca EngineResult", async () => {
    create.mockResolvedValue(fixture);
    const { geminiAdapter } = await import("@/lib/engines/gemini");
    const res = await geminiAdapter.query("Pytanie", { locale: "pl-PL", country: "PL" });
    expect(create.mock.calls[0][0]).toMatchObject({ model: "gemini-3.8-flash", input: "Pytanie", tools: [{ type: "google_search" }] });
    expect(res.citations).toHaveLength(2);
    expect(res.model).toBe("gemini-3.8-flash");
  });
});
