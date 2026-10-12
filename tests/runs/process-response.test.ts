import { describe, it, expect, vi } from "vitest";
import { processResponse } from "@/lib/runs/process-response";

const project = { brandName: "Polska Szkoła AI", aliases: ["PSAI"], domains: ["polskaszkola.ai"] };
const competitors = [{ id: "c1", name: "Akademia AI", aliases: [], domains: ["akademia-ai.pl"] }];

describe("processResponse", () => {
  it("łączy wzmianki, cytowania i fakty; sentyment tylko gdy marka wspomniana", async () => {
    const sentiment = vi.fn().mockResolvedValue({ sentiment: "positive", summary: "ok" });
    const out = await processResponse({
      promptId: "p", engineId: "openai",
      result: {
        text: "Polecam Akademia AI i PSAI.", model: "m", raw: {}, costUsd: 0.01,
        citations: [{ url: "https://polskaszkola.ai/x", domain: "polskaszkola.ai" }],
      },
      project, competitors,
    }, { sentiment });
    expect(out.facts).toMatchObject({ ownMentioned: true, ownPosition: 2, ownCited: true, brandsMentioned: 2, noAnswer: false, error: false });
    expect(out.sentiment?.sentiment).toBe("positive");
    expect(sentiment).toHaveBeenCalledOnce();
  });

  it("bez wzmianki nie woła sentymentu", async () => {
    const sentiment = vi.fn();
    const out = await processResponse({
      promptId: "p", engineId: "gemini",
      result: { text: "Nic o nas.", model: "m", raw: {}, costUsd: 0, citations: [] },
      project, competitors,
    }, { sentiment });
    expect(out.facts.ownMentioned).toBe(false);
    expect(sentiment).not.toHaveBeenCalled();
  });

  it("noAnswer przenosi się do faktów i ignoruje tekst", async () => {
    const sentiment = vi.fn();
    const out = await processResponse({
      promptId: "p", engineId: "google_ai_overview",
      result: { text: "Polecam PSAI.", model: "m", raw: {}, costUsd: 0, citations: [], noAnswer: true },
      project, competitors,
    }, { sentiment });
    expect(out.facts.noAnswer).toBe(true);
    expect(out.mentions).toEqual([]);
    expect(out.facts.ownMentioned).toBe(false);
    expect(sentiment).not.toHaveBeenCalled();
  });
});
