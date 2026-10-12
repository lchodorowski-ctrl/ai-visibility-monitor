import { describe, it, expect } from "vitest";
import { buildHighlightSegments } from "@/components/HighlightedText";

describe("buildHighlightSegments", () => {
  it("dzieli tekst na segmenty z oznaczeniem marki", () => {
    const seg = buildHighlightSegments(
      "Polecam PSAI oraz Akademia AI.",
      [{ charIndex: 8, name: "Polska Szkoła AI", kind: "own" }, { charIndex: 18, name: "Akademia AI", kind: "competitor" }],
      { "Polska Szkoła AI": ["PSAI"], "Akademia AI": ["Akademia AI"] },
    );
    expect(seg).toEqual([
      { text: "Polecam " }, { text: "PSAI", kind: "own" }, { text: " oraz " }, { text: "Akademia AI", kind: "competitor" }, { text: "." },
    ]);
  });

  it("sortuje wzmianki i pomija nakładające się", () => {
    const seg = buildHighlightSegments(
      "Wybierz Akademia AI lub PSAI.",
      [
        { charIndex: 24, name: "Polska Szkoła AI", kind: "own" },
        { charIndex: 8, name: "Akademia AI", kind: "competitor" },
        { charIndex: 12, name: "Akademia AI", kind: "competitor" },
      ],
      { "Polska Szkoła AI": ["PSAI"] },
    );
    expect(seg).toEqual([
      { text: "Wybierz " }, { text: "Akademia AI", kind: "competitor" }, { text: " lub " }, { text: "PSAI", kind: "own" }, { text: "." },
    ]);
  });

  it("dopasowuje polskie znaki i wielkość liter przy zachowaniu oryginalnego tekstu", () => {
    const seg = buildHighlightSegments(
      "Szkoła Łódzka poleca.",
      [{ charIndex: 0, name: "szkola lodzka", kind: "competitor" }],
      {},
    );
    expect(seg).toEqual([{ text: "Szkoła Łódzka", kind: "competitor" }, { text: " poleca." }]);
  });

  it("ignoruje wzmiankę, której nie da się dopasować w tekście", () => {
    expect(buildHighlightSegments("Brak marki.", [{ charIndex: 3, name: "PSAI", kind: "own" }], {}))
      .toEqual([{ text: "Brak marki." }]);
  });
});
