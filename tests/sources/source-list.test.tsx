import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceList } from "@/app/app/sources/SourceList";
import { aggregateSources, type SourceCitation } from "@/lib/sources/aggregate";

const P1 = "11111111-1111-4111-8111-111111111111";
const cite = (o: Partial<SourceCitation> & Pick<SourceCitation, "domain" | "responseId">): SourceCitation => ({
  title: null, isOwn: false, competitorId: null, promptId: P1, engineId: "openai", ...o,
});
const ctx = {
  prompts: new Map([[P1, "Kurs AI dla firm"]]),
  competitors: [{ id: "c1", name: "Comarch", domains: ["comarch.pl"] }],
  ownDomains: ["polskaszkola.ai"],
};

describe("SourceList", () => {
  it("wiersz domeny: pozycja, liczba odpowiedzi, silniki w stałej kolejności i pytania z linkiem do odpowiedzi", () => {
    const view = aggregateSources([
      cite({ domain: "comarch.pl", responseId: "r1", engineId: "gemini" }),
      cite({ domain: "comarch.pl", responseId: "r2", engineId: "gemini" }),
      cite({ domain: "comarch.pl", responseId: "r3", engineId: "openai" }),
    ], ctx);
    const html = renderToStaticMarkup(<SourceList view={view} />);
    expect(html).toContain("comarch.pl");
    expect(html).toContain("Konkurent: Comarch");
    expect(html).toContain("3×");
    expect(html).toContain("1 pytanie · ChatGPT, Gemini");
    expect(html).toContain("ChatGPT 1 · Gemini 2");
    expect(html).toContain(`href="/app/responses?prompt=${P1}"`);
    expect(html).toContain("Kurs AI dla firm");
    expect(html).toContain('href="https://comarch.pl"');
  });

  it("własna domena jest oznaczona, a domeny spoza topu są pod „Pokaż resztę”", () => {
    const rows: SourceCitation[] = [];
    for (let i = 0; i < 22; i++) rows.push(cite({ domain: `d${String(i).padStart(2, "0")}.pl`, responseId: `r${i}` }), cite({ domain: `d${String(i).padStart(2, "0")}.pl`, responseId: `x${i}` }));
    rows.push(cite({ domain: "polskaszkola.ai", responseId: "own" }));
    const html = renderToStaticMarkup(<SourceList view={aggregateSources(rows, ctx)} />);
    expect(html).toContain("Wasza domena");
    expect(html).toContain("Pokaż resztę (2)");
    expect(html.indexOf("polskaszkola.ai")).toBeLessThan(html.indexOf("Pokaż resztę"));
    expect(html.indexOf("d21.pl")).toBeGreaterThan(html.indexOf("Pokaż resztę"));
  });
});
