import { describe, it, expect } from "vitest";
import { aggregateSources, sourceDomain, type SourceCitation, type SourcesContext } from "@/lib/sources/aggregate";
import { parseRange, rangeHref, rangeParam, sinceIso } from "@/lib/sources/range";

const ctx: SourcesContext = {
  prompts: new Map([["p1", "Kurs AI dla firm"], ["p2", "Szkolenie ChatGPT"], ["p3", "Agenci AI"]]),
  competitors: [{ id: "c1", name: "Comarch", domains: ["comarch.pl"] }, { id: "c2", name: "Alx", domains: ["alx.pl"] }],
  ownDomains: ["polskaszkola.ai"],
};

const cite = (o: Partial<SourceCitation> & Pick<SourceCitation, "domain" | "responseId">): SourceCitation => ({
  title: null, isOwn: false, competitorId: null, promptId: "p1", engineId: "openai", ...o,
});

describe("sourceDomain", () => {
  it("normalizuje domenę (www, wielkość liter)", () => {
    expect(sourceDomain({ domain: "WWW.Example.PL", title: null })).toBe("example.pl");
  });

  it("host przekierowania zastępuje domeną z tytułu, a bez niej pomija", () => {
    expect(sourceDomain({ domain: "vertexaisearch.cloud.google.com", title: "comarch.pl" })).toBe("comarch.pl");
    expect(sourceDomain({ domain: "vertexaisearch.cloud.google.com", title: "Kursy AI dla firm" })).toBe("");
    expect(sourceDomain({ domain: "vertexaisearch.cloud.google.com", title: null })).toBe("");
  });

  it("pusta lub niepoprawna domena daje pusty wynik", () => {
    expect(sourceDomain({ domain: "", title: null })).toBe("");
    expect(sourceDomain({ domain: "localhost", title: null })).toBe("");
  });
});

describe("aggregateSources", () => {
  it("liczy odpowiedzi, nie surowe cytowania", () => {
    const v = aggregateSources([
      cite({ domain: "a.pl", responseId: "r1" }),
      cite({ domain: "a.pl", responseId: "r1" }),
      cite({ domain: "https://www.a.pl/x", responseId: "r1" }),
      cite({ domain: "a.pl", responseId: "r2" }),
    ], ctx);
    expect(v.top).toHaveLength(1);
    expect(v.top[0]).toMatchObject({ domain: "a.pl", responses: 2, rank: 1 });
    expect(v.responses).toBe(2);
    expect(v.domains).toBe(1);
    expect(v.max).toBe(2);
  });

  it("dla domeny zbiera pytania i silniki z liczbą odpowiedzi, najczęstsze pierwsze", () => {
    const v = aggregateSources([
      cite({ domain: "a.pl", responseId: "r1", promptId: "p1", engineId: "openai" }),
      cite({ domain: "a.pl", responseId: "r2", promptId: "p2", engineId: "gemini" }),
      cite({ domain: "a.pl", responseId: "r3", promptId: "p2", engineId: "gemini" }),
      cite({ domain: "a.pl", responseId: "r3", promptId: "p2", engineId: "gemini" }),
    ], ctx);
    expect(v.top[0].prompts).toEqual([
      { id: "p2", text: "Szkolenie ChatGPT", responses: 2 },
      { id: "p1", text: "Kurs AI dla firm", responses: 1 },
    ]);
    expect(v.top[0].engines).toEqual([{ id: "gemini", responses: 2 }, { id: "openai", responses: 1 }]);
  });

  it("sortuje po odpowiedziach, potem liczbie pytań, potem alfabetycznie", () => {
    const v = aggregateSources([
      cite({ domain: "z.pl", responseId: "r1" }), cite({ domain: "z.pl", responseId: "r2" }),
      cite({ domain: "b.pl", responseId: "r1", promptId: "p1" }), cite({ domain: "b.pl", responseId: "r3", promptId: "p2" }),
      cite({ domain: "c.pl", responseId: "r4" }),
      cite({ domain: "a.pl", responseId: "r5" }),
    ], ctx);
    expect(v.top.map((r) => [r.domain, r.rank])).toEqual([["b.pl", 1], ["z.pl", 2], ["a.pl", 3], ["c.pl", 4]]);
  });

  it("pomija hosty przekierowań bez domeny w tytule, a z domeną liczy jako tę domenę", () => {
    const v = aggregateSources([
      cite({ domain: "vertexaisearch.cloud.google.com", title: "Kurs AI", responseId: "r1" }),
      cite({ domain: "vertexaisearch.cloud.google.com", title: "comarch.pl", responseId: "r2", engineId: "gemini" }),
    ], ctx);
    expect(v.top.map((r) => r.domain)).toEqual(["comarch.pl"]);
    expect(v.top[0].competitor).toBe("Comarch");
    expect(v.responses).toBe(1);
  });

  it("oznacza własną domenę z flagi lub z domen projektu (także subdomeny)", () => {
    const v = aggregateSources([
      cite({ domain: "polskaszkola.ai", responseId: "r1" }),
      cite({ domain: "blog.polskaszkola.ai", responseId: "r2" }),
      cite({ domain: "inna.pl", responseId: "r3", isOwn: true }),
      cite({ domain: "obca.pl", responseId: "r4" }),
    ], ctx);
    const own = Object.fromEntries(v.top.map((r) => [r.domain, r.isOwn]));
    expect(own).toEqual({ "polskaszkola.ai": true, "blog.polskaszkola.ai": true, "inna.pl": true, "obca.pl": false });
    expect(v.own?.domain).toBe("blog.polskaszkola.ai");
  });

  it("oznacza konkurenta po competitor_id, a bez niego po domenach konkurenta", () => {
    const v = aggregateSources([
      cite({ domain: "alx.pl", responseId: "r1", competitorId: "c2" }),
      cite({ domain: "comarch.pl", responseId: "r2" }),
      cite({ domain: "nieznany.pl", responseId: "r3", competitorId: "c9" }),
      cite({ domain: "obca.pl", responseId: "r4" }),
    ], ctx);
    const comp = Object.fromEntries(v.top.map((r) => [r.domain, r.competitor]));
    expect(comp).toEqual({ "alx.pl": "Alx", "comarch.pl": "Comarch", "nieznany.pl": null, "obca.pl": null });
  });

  it("dzieli na top N i resztę, a własną domenę spoza topu przypina do topu z prawdziwą pozycją", () => {
    const rows: SourceCitation[] = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j <= 5 - i; j++) rows.push(cite({ domain: `d${i}.pl`, responseId: `r${i}-${j}` }));
    rows.push(cite({ domain: "polskaszkola.ai", responseId: "own" }));
    rows.push(cite({ domain: "zz.pl", responseId: "zz" }));
    const v = aggregateSources(rows, ctx, 3);
    expect(v.top.map((r) => r.domain)).toEqual(["d0.pl", "d1.pl", "d2.pl", "polskaszkola.ai"]);
    expect(v.top.at(-1)?.rank).toBe(6);
    expect(v.rest.map((r) => r.domain)).toEqual(["d3.pl", "d4.pl", "zz.pl"]);
    expect(v.domains).toBe(7);
    expect(v.max).toBe(6);
  });

  it("nieznane pytanie dostaje pusty tekst, a brak cytowań daje pusty widok", () => {
    expect(aggregateSources([cite({ domain: "a.pl", responseId: "r1", promptId: "px" })], ctx).top[0].prompts).toEqual([{ id: "px", text: "", responses: 1 }]);
    expect(aggregateSources([], ctx)).toEqual({ top: [], rest: [], max: 0, domains: 0, responses: 0, own: null });
  });
});

describe("range", () => {
  it("parseRange: 30 i 90 dni, wszystko inne to ostatni pomiar", () => {
    expect(parseRange("30")).toEqual({ kind: "days", days: 30 });
    expect(parseRange(["90", "30"])).toEqual({ kind: "days", days: 90 });
    expect(parseRange("7")).toEqual({ kind: "run" });
    expect(parseRange(undefined)).toEqual({ kind: "run" });
  });

  it("rangeParam i rangeHref budują link przełącznika", () => {
    expect(rangeParam({ kind: "run" })).toBe("run");
    expect(rangeParam({ kind: "days", days: 30 })).toBe("30");
    expect(rangeHref("run")).toBe("/app/sources");
    expect(rangeHref("90")).toBe("/app/sources?range=90");
  });

  it("sinceIso cofa się o N dni", () => {
    expect(sinceIso(30, new Date("2026-10-20T12:00:00Z"))).toBe("2026-09-20T12:00:00.000Z");
  });
});
