import { describe, it, expect } from "vitest";
import { normalizeDomain, domainMatches, toCitation, dedupeCitations, domainFromTitle, isRedirectHost } from "@/lib/engines/domain";

describe("normalizeDomain", () => {
  it("usuwa protokół, www, ścieżkę i wielkie litery", () => {
    expect(normalizeDomain("https://www.PolskaSzkola.ai/kursy?x=1")).toBe("polskaszkola.ai");
    expect(normalizeDomain("polskaszkola.ai")).toBe("polskaszkola.ai");
    expect(normalizeDomain("https://example.pl./")).toBe("example.pl");
  });
  it("zwraca pusty string dla śmieci", () => {
    expect(normalizeDomain("not a url")).toBe("");
  });
});

describe("domainMatches", () => {
  it("dopasowuje domenę i subdomenę, nie dopasowuje sufiksu", () => {
    expect(domainMatches("blog.polskaszkola.ai", ["polskaszkola.ai"])).toBe(true);
    expect(domainMatches("polskaszkola.ai", ["polskaszkola.ai"])).toBe(true);
    expect(domainMatches("notpolskaszkola.ai", ["polskaszkola.ai"])).toBe(false);
  });
});

describe("toCitation", () => {
  it("buduje cytowanie z domeną lub null dla złego URL", () => {
    expect(toCitation("https://www.example.pl/a", "T")).toEqual({ url: "https://www.example.pl/a", domain: "example.pl", title: "T" });
    expect(toCitation("javascript:void(0)")).toBeNull();
  });
  it("przekierowanie Gemini: domena z tytułu, URL bez zmian", () => {
    const url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFcrx";
    expect(toCitation(url, "comarch.pl")).toEqual({ url, domain: "comarch.pl", title: "comarch.pl" });
    expect(toCitation(url, "www.Sages.pl")?.domain).toBe("sages.pl");
  });
  it("przekierowanie bez tytułu-domeny zostaje przy hoście przekierowania", () => {
    const url = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/X";
    expect(toCitation(url)?.domain).toBe("vertexaisearch.cloud.google.com");
    expect(toCitation(url, "Polska Szkoła AI")?.domain).toBe("vertexaisearch.cloud.google.com");
    expect(toCitation(url, "Wikipedia")?.domain).toBe("vertexaisearch.cloud.google.com");
  });
  it("tytuł zwykłego URL nie zmienia domeny", () => {
    expect(toCitation("https://a.pl/x", "b.pl")?.domain).toBe("a.pl");
  });
});

describe("domainFromTitle / isRedirectHost", () => {
  it("rozpoznaje host przekierowania i tytuły będące domeną", () => {
    expect(isRedirectHost("vertexaisearch.cloud.google.com")).toBe(true);
    expect(isRedirectHost("google.com")).toBe(false);
    expect(domainFromTitle(" ican.pl ")).toBe("ican.pl");
    expect(domainFromTitle("vertexaisearch.cloud.google.com")).toBe("");
    expect(domainFromTitle(null)).toBe("");
  });
});

describe("dedupeCitations", () => {
  it("usuwa duplikaty po url, zachowuje pierwsze wystąpienie i kolejność", () => {
    const a = { url: "https://a.pl/1", domain: "a.pl" };
    const b = { url: "https://b.pl/2", domain: "b.pl", title: "B" };
    const aDup = { url: "https://a.pl/1", domain: "a.pl", title: "later" };
    expect(dedupeCitations([a, b, aDup])).toEqual([a, b]);
  });
});
