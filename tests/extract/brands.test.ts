import { describe, it, expect } from "vitest";
import { foldText } from "@/lib/extract/normalize";
import { extractMentions, type BrandDef } from "@/lib/extract/brands";

const brands: BrandDef[] = [
  { kind: "own", name: "Polska Szkoła AI", aliases: ["Polska Szkoła AI", "PSAI", "polskaszkola.ai"] },
  { kind: "competitor", name: "Akademia AI", aliases: ["Akademia AI"], competitorId: "c1" },
];

describe("foldText", () => {
  it("usuwa diakrytyki i wielkość liter", () => {
    expect(foldText("Polska Szkoła AI — ŁÓDŹ")).toBe("polska szkola ai — lodz");
  });
});

describe("extractMentions", () => {
  it("znajduje marki w kolejności wystąpienia z pozycją 1..n", () => {
    const m = extractMentions("Polecam Akademia AI, a także Polską Szkołę AI (PSAI).", brands);
    expect(m.map((x) => [x.name, x.position])).toEqual([["Akademia AI", 1], ["Polska Szkoła AI", 2]]);
  });

  it("dopasowuje bez diakrytyków i wielkości liter", () => {
    const m = extractMentions("polska szkola ai to dobry wybór", brands);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("own");
  });

  it("nie dopasowuje aliasu wewnątrz innego słowa", () => {
    expect(extractMentions("Firma PSAIR i akademia-ai.pl", brands)).toHaveLength(0);
  });

  it("jedna marka liczona raz, nawet przy wielu aliasach", () => {
    const m = extractMentions("PSAI, czyli Polska Szkoła AI, polskaszkola.ai", brands);
    expect(m).toHaveLength(1);
    expect(m[0].charIndex).toBe(0);
  });

  it("pusty tekst → brak wzmianek", () => {
    expect(extractMentions("", brands)).toEqual([]);
  });
});
