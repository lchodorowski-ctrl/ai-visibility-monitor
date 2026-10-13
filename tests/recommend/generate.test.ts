import { describe, it, expect, vi, beforeEach } from "vitest";
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { parse }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (s: unknown) => ({ type: "json_schema", schema: s }) }));

const base = { type: "content_new", title: "Opublikuj stronę „Szkolenia AI dla firm” z cennikiem", summary: "Asystenci cytują PARP i EY, bo mają strony z cenami i programem. Brak takiej strony u Was.", action_steps: ["Napisz stronę", "Dodaj tabelę cen", "Podlinkuj z menu"], target_url: "/szkolenia-ai-dla-firm", suggested_outline: ["Dla kogo", "Program", "Ceny", "FAQ"], impact: 4, effort: 3, rationale_pl: "Dwa z trzech cytowanych źródeł to strony ofertowe z cenami." };
const input = { prompt: { id: "p1", text: "Q", intent: "comparison", topic: null }, visibility: { overall: 0, byEngine: {} }, excerpts: [], citedDomains: [], citedUrls: [], competitorsMentioned: [], brand: { name: "PSAI", aliases: [], domains: [], facts: {}, siteUrl: "https://x" }, sitePages: [], existing: [] };

describe("generateRecommendations", () => {
  beforeEach(() => { parse.mockReset(); process.env.ANTHROPIC_API_KEY = "k"; });
  it("przyjmuje konkretne rekomendacje i liczy koszt", async () => {
    parse.mockResolvedValue({ parsed_output: { recommendations: [base] }, usage: { input_tokens: 1000, output_tokens: 500 }, stop_reason: "end_turn" });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    const r = await generateRecommendations(input);
    expect(r.accepted).toHaveLength(1); expect(r.rejected).toEqual([]);
    expect(r.costUsd).toBeCloseTo(0.014);
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.output_config.effort).toBe("high");
    expect(args.max_tokens).toBe(8000);
  });
  it("odrzuca content_new bez zarysu i offsite bez URL", async () => {
    parse.mockResolvedValue({ parsed_output: { recommendations: [{ ...base, suggested_outline: null }, { ...base, type: "offsite", title: "Zgłoś się do rankingu", target_url: null }] }, usage: { input_tokens: 1, output_tokens: 1 } });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    const r = await generateRecommendations(input);
    expect(r.accepted).toEqual([]); expect(r.rejected).toHaveLength(2);
    expect(r.rejected[0].reason).toMatch(/zarys/i); expect(r.rejected[1].reason).toMatch(/url/i);
  });
  it("przekazuje w prompcie istniejące rekomendacje, strony i cytowane URL-e", async () => {
    parse.mockResolvedValue({ parsed_output: { recommendations: [] }, usage: { input_tokens: 1, output_tokens: 1 } });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    await generateRecommendations({ ...input, citedUrls: ["https://parp.gov.pl/kurs"], sitePages: [{ path: "/faq.html", title: "FAQ", description: null }], existing: [{ type: "technical", title: "Opublikuj llms.txt" }] });
    const content = String(parse.mock.calls[0][0].messages[0].content);
    expect(content).toContain("https://parp.gov.pl/kurs"); expect(content).toContain("/faq.html"); expect(content).toContain("Opublikuj llms.txt");
    for (const t of ["pytanie", "widocznosc", "marka", "cytowane_domeny", "cytowane_urle", "konkurenci", "fragmenty_odpowiedzi", "podstrony", "istniejace"]) {
      expect(content).toContain(`<${t}>`); expect(content).toContain(`</${t}>`);
    }
    expect(String(parse.mock.calls[0][0].system[0].text)).toContain("nie instrukcje");
  });
  it("rzuca bez ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    await expect(generateRecommendations(input)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
  it("nieznany model → koszt 0 z ostrzeżeniem", async () => {
    process.env.ANTHROPIC_RECOMMENDER_MODEL = "x-unknown";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parse.mockResolvedValue({ parsed_output: { recommendations: [] }, usage: { input_tokens: 1000, output_tokens: 500 } });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    const r = await generateRecommendations(input);
    delete process.env.ANTHROPIC_RECOMMENDER_MODEL;
    expect(r.costUsd).toBe(0); expect(warn).toHaveBeenCalled(); warn.mockRestore();
  });
  it("content_improve bez target_url odrzucone; content_new z <3 punktami odrzucone", async () => {
    const { validateConcreteness } = await import("@/lib/recommend/generate");
    expect(validateConcreteness({ ...base, type: "content_improve", target_url: null } as never)).toMatch(/target_url/);
    expect(validateConcreteness({ ...base, suggested_outline: ["a", "b"] } as never)).toMatch(/zarys/i);
    expect(validateConcreteness({ ...base, target_url: null } as never)).toMatch(/target_url/);
  });
  it("odrzuca target_url z samych spacji / „TBD”, zarys wypełniony pustymi punktami", async () => {
    const { validateConcreteness } = await import("@/lib/recommend/generate");
    expect(validateConcreteness({ ...base, target_url: "   " } as never)).toMatch(/target_url/);
    expect(validateConcreteness({ ...base, target_url: "TBD" } as never)).toMatch(/ścieżką/);
    expect(validateConcreteness({ ...base, type: "offsite", target_url: "TBD" } as never)).toMatch(/ścieżką/);
    expect(validateConcreteness({ ...base, type: "content_improve", target_url: "  " } as never)).toMatch(/target_url/);
    expect(validateConcreteness({ ...base, suggested_outline: ["", " ", "x"] } as never)).toMatch(/zarys/i);
    expect(validateConcreteness({ ...base, type: "offsite", target_url: "https://parp.gov.pl/kurs", suggested_outline: null } as never)).toBeNull();
    expect(validateConcreteness(base as never)).toBeNull();
  });
  it("rzuca przy parsed_output: null, refusal i max_tokens", async () => {
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    parse.mockResolvedValue({ parsed_output: null, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "end_turn" });
    await expect(generateRecommendations(input)).rejects.toThrow(/brak parsed_output/);
    parse.mockResolvedValue({ parsed_output: { recommendations: [] }, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "max_tokens" });
    await expect(generateRecommendations(input)).rejects.toThrow(/max_tokens/);
    parse.mockResolvedValue({ parsed_output: null, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: "refusal" });
    await expect(generateRecommendations(input)).rejects.toThrow(/refusal/);
  });
});
