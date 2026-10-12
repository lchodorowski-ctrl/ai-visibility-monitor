import { describe, it, expect, vi } from "vitest";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { parse }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (s: unknown) => ({ type: "json_schema", schema: s }) }));

describe("generatePromptProposals", () => {
  it("zwraca propozycje i przekazuje kontekst marki", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    parse.mockResolvedValue({ parsed_output: { prompts: [{ text: "Jaki kurs AI dla HR?", topic: "Kursy AI dla firm", intent: "comparison" }] } });
    const { generatePromptProposals } = await import("@/lib/prompts/generate");
    const out = await generatePromptProposals({
      brandName: "Polska Szkoła AI", facts: { oferta: "szkolenia" }, topics: ["Kursy AI dla firm"],
      seedPhrases: ["szkolenia AI"], personas: ["HR manager"], count: 10,
    });
    expect(out).toHaveLength(1);
    const content = parse.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("HR manager");
    expect(content).toContain("szkolenia AI");
  });

  it("rzuca czytelny błąd bez klucza", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { generatePromptProposals } = await import("@/lib/prompts/generate");
    await expect(generatePromptProposals({ brandName: "X", facts: {}, topics: [], seedPhrases: [], personas: [], count: 5 })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
