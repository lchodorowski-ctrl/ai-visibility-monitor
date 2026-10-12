import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixture from "../fixtures/responses/perplexity.json";

describe("perplexity adapter", () => {
  beforeEach(() => { process.env.PERPLEXITY_API_KEY = "test"; });
  afterEach(() => vi.unstubAllGlobals());

  it("parsePerplexityResponse łączy tekst i search_results", async () => {
    const { parsePerplexityResponse } = await import("@/lib/engines/perplexity");
    const r = parsePerplexityResponse(fixture);
    expect(r.text).toContain("Polską Szkołę AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "example-ranking.pl"]);
  });

  it("query woła /v1/agent z presetem i bearerem", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { perplexityAdapter } = await import("@/lib/engines/perplexity");
    const res = await perplexityAdapter.query("Pytanie", { locale: "pl-PL", country: "PL" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.perplexity.ai/v1/agent");
    expect(init.headers.Authorization).toBe("Bearer test");
    expect(JSON.parse(init.body)).toEqual({ preset: "fast", input: "Pytanie" });
    expect(res.citations).toHaveLength(2);
  });

  it("rzuca czytelny błąd przy HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    const { perplexityAdapter } = await import("@/lib/engines/perplexity");
    await expect(perplexityAdapter.query("x", { locale: "pl-PL", country: "PL" })).rejects.toThrow(/429/);
  });
});
