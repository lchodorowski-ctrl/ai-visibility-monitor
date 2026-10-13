import { describe, it, expect } from "vitest";
import { buildExcerpt, buildRecommendationInput } from "@/lib/recommend/input";
describe("buildExcerpt", () => {
  it("wycina ±radius wokół pierwszego konkurenta", () => {
    const text = "x".repeat(500) + " Akademia PARP poleca " + "y".repeat(500);
    const e = buildExcerpt(text, ["Akademia PARP"], 100);
    expect(e.length).toBeLessThanOrEqual(230);
    expect(e).toContain("Akademia PARP");
  });
  it("bez konkurenta bierze początek", () => { expect(buildExcerpt("a".repeat(1000), ["Z"], 100)).toHaveLength(800); });
  it("dopasowuje konkurenta bez względu na wielkość liter i diakrytyki, także w tekście NFD", () => {
    const text = ("x".repeat(500) + " Szkoła Żółć poleca " + "y".repeat(500)).normalize("NFD");
    const e = buildExcerpt(text, ["szkola zolc"], 50);
    expect(e.normalize("NFC")).toContain("Szkoła Żółć");
    expect(e.length).toBeLessThanOrEqual(130);
  });
  it("zwraca pusty tekst dla pustego wejścia i ignoruje puste aliasy", () => {
    expect(buildExcerpt("", ["A"])).toBe("");
    expect(buildExcerpt("abc", [""])).toBe("abc");
  });
});
describe("buildRecommendationInput", () => {
  it("agreguje domeny, konkurentów i limituje fragmenty do 2 na silnik", () => {
    const resp = (engineId: string, i: number) => ({ engineId, text: `odp ${i} EY Academy`, citations: [{ url: `https://parp.gov.pl/${i}`, domain: "parp.gov.pl" }], mentions: [{ kind: "competitor" as const, name: "EY Academy" }] });
    const input = buildRecommendationInput({
      prompt: { id: "p1", text: "Q", intent: "comparison", topic: "T" },
      visibility: { overall: 0.1, byEngine: { openai: 0 } },
      responses: [resp("openai", 1), resp("openai", 2), resp("openai", 3), resp("gemini", 4)],
      brand: { name: "PSAI", aliases: [], domains: ["polskaszkola.ai"], facts: {}, siteUrl: "https://x" },
      sitePages: Array.from({ length: 150 }, (_, i) => ({ path: `/${i}`, title: `T${i}`, description: null })),
      existing: [], competitorAliases: ["EY Academy"],
    });
    expect(input.excerpts.filter((e) => e.engineId === "openai")).toHaveLength(2);
    expect(input.citedDomains).toEqual([{ domain: "parp.gov.pl", count: 4 }]);
    expect(input.competitorsMentioned).toEqual([{ name: "EY Academy", count: 4 }]);
    expect(input.sitePages).toHaveLength(120);
    expect(input.citedUrls.length).toBeLessThanOrEqual(10);
  });
  it("limituje URL do 10, bez duplikatów, a własne wzmianki nie liczą się jako konkurenci", () => {
    const input = buildRecommendationInput({
      prompt: { id: "p1", text: "Q", intent: "comparison", topic: null },
      visibility: { overall: null, byEngine: {} },
      responses: [{
        engineId: "openai", text: "t",
        citations: [...Array.from({ length: 15 }, (_, i) => ({ url: `https://a.pl/${i}`, domain: "a.pl" })), { url: "https://a.pl/0", domain: "a.pl" }],
        mentions: [{ kind: "own", name: "PSAI" }],
      }],
      brand: { name: "PSAI", aliases: [], domains: [], facts: null, siteUrl: "https://x" },
      sitePages: [], existing: [], competitorAliases: [],
    });
    expect(input.citedUrls).toHaveLength(10);
    expect(new Set(input.citedUrls).size).toBe(10);
    expect(input.citedDomains).toEqual([{ domain: "a.pl", count: 16 }]);
    expect(input.competitorsMentioned).toEqual([]);
  });
});
