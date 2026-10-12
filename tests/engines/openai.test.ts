import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "../fixtures/responses/openai.json";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class { responses = { create }; },
}));

describe("openai adapter", () => {
  beforeEach(() => { create.mockReset(); process.env.OPENAI_API_KEY = "test"; });

  it("parseOpenAIResponse wyciąga tekst i unikalne cytowania", async () => {
    const { parseOpenAIResponse } = await import("@/lib/engines/openai");
    const r = parseOpenAIResponse(fixture);
    expect(r.text).toContain("Polska Szkoła AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "akademia-ai.pl"]);
  });

  it("query wysyła web_search z lokalizacją PL i zwraca EngineResult", async () => {
    create.mockResolvedValue(fixture);
    const { openaiAdapter } = await import("@/lib/engines/openai");
    const res = await openaiAdapter.query("Jakie szkolenia AI?", { locale: "pl-PL", country: "PL" });
    const args = create.mock.calls[0][0];
    expect(args.tools[0]).toMatchObject({ type: "web_search", user_location: { type: "approximate", country: "PL" } });
    expect(args.input).toBe("Jakie szkolenia AI?");
    expect(res.model).toBe("gpt-5.4-mini");
    expect(res.citations).toHaveLength(2);
    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.raw).toBe(fixture);
  });
});
