import { describe, it, expect, vi, beforeEach } from "vitest";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { parse }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (s: unknown) => ({ type: "json_schema", schema: s }) }));

describe("analyzeSentiment", () => {
  beforeEach(() => { parse.mockReset(); });

  it("zwraca null bez klucza API", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { analyzeSentiment } = await import("@/lib/extract/sentiment");
    expect(await analyzeSentiment("x", "PSAI", [])).toBeNull();
  });

  it("zwraca sparsowany wynik", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    parse.mockResolvedValue({ parsed_output: { sentiment: "positive", summary: "Polecana jako solidna." }, stop_reason: "end_turn" });
    const { analyzeSentiment } = await import("@/lib/extract/sentiment");
    const r = await analyzeSentiment("PSAI jest solidna.", "Polska Szkoła AI", ["PSAI"]);
    expect(r).toEqual({ sentiment: "positive", summary: "Polecana jako solidna." });
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe("claude-haiku-5-5");
    expect(args.messages[0].content).toContain("PSAI jest solidna.");
  });

  it("zwraca null gdy parsed_output puste", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    parse.mockResolvedValue({ parsed_output: null, stop_reason: "end_turn" });
    const { analyzeSentiment } = await import("@/lib/extract/sentiment");
    expect(await analyzeSentiment("x", "B", [])).toBeNull();
  });
});
