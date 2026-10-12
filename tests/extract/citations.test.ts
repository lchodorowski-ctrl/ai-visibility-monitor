import { describe, it, expect } from "vitest";
import { classifyCitations } from "@/lib/extract/citations";

describe("classifyCitations", () => {
  it("oznacza własne i konkurencyjne domeny, także z www i subdomeną", () => {
    const out = classifyCitations(
      [
        { url: "https://www.polskaszkola.ai/kursy?x=1", domain: "polskaszkola.ai" },
        { url: "https://blog.akademia-ai.pl/post", domain: "blog.akademia-ai.pl" },
        { url: "https://wikipedia.org/x", domain: "wikipedia.org" },
      ],
      ["polskaszkola.ai"],
      [{ id: "c1", domains: ["akademia-ai.pl"] }],
    );
    expect(out.map((c) => [c.isOwn, c.competitorId ?? null])).toEqual([[true, null], [false, "c1"], [false, null]]);
  });
});
