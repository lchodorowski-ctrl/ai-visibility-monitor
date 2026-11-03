import { describe, it, expect } from "vitest";
import {
  normalizeKeyword,
  parseKeywordList,
  DEFAULT_TRENDS_ANCHOR,
  COMPETITION_LABEL,
  DEFAULT_SEEDS,
  MAX_KEYWORD_LENGTH,
} from "@/lib/seo/keywords";
import { MAX_SEEDS } from "@/lib/seo/keyword-research";

describe("normalizeKeyword", () => {
  it("przycina, zamienia na małe litery i zwija białe znaki", () => {
    expect(normalizeKeyword("  Szkolenia   AI ")).toBe("szkolenia ai");
    expect(normalizeKeyword("szkolenia\tai\n\nwrocław")).toBe("szkolenia ai wrocław");
  });

  it("zachowuje polskie znaki", () => {
    expect(normalizeKeyword("Wrocław")).toBe("wrocław");
    expect(normalizeKeyword("ŁÓDŹ")).toBe("łódź");
  });

  it("zapis rozłożony (NFD) daje ten sam klucz co złożony (NFC)", () => {
    const nfc = "łódź";
    const nfd = "łódź".normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(normalizeKeyword(nfd)).toBe(normalizeKeyword(nfc));
    expect(normalizeKeyword(nfd)).toBe(nfc);
    expect(normalizeKeyword("Łá")).toBe("łá");
  });

  it("używa małych liter wg języka polskiego, a nie tureckiego", () => {
    expect(normalizeKeyword("SZKOLENIA I")).toBe("szkolenia i");
  });
});

describe("parseKeywordList", () => {
  it("dzieli po nowych liniach i przecinkach, normalizuje, usuwa puste, zbyt długie i duplikaty", () => {
    expect(parseKeywordList("a\nB, a\n\n" + "x".repeat(81))).toEqual(["a", "b"]);
  });

  it("zostawia frazę o długości dokładnie 80 znaków", () => {
    const edge = "x".repeat(80);
    expect(parseKeywordList(edge)).toEqual([edge]);
  });

  it("traktuje frazy różniące się wielkością liter i spacjami jako duplikat, zachowując pierwszą kolejność", () => {
    expect(parseKeywordList("Szkolenia AI,  szkolenia   ai\nkursy ai")).toEqual(["szkolenia ai", "kursy ai"]);
  });

  it("liczy długość po normalizacji (zwinięte spacje)", () => {
    const padded = "a" + " ".repeat(200) + "b";
    expect(parseKeywordList(padded)).toEqual(["a b"]);
  });

  it("obsługuje CRLF i puste wejście", () => {
    expect(parseKeywordList("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(parseKeywordList("")).toEqual([]);
    expect(parseKeywordList(" ,\n, ")).toEqual([]);
  });

  it("ogranicza wynik do max (domyślnie 200)", () => {
    const input = Array.from({ length: 250 }, (_, i) => `fraza ${i}`).join("\n");
    expect(parseKeywordList(input)).toHaveLength(200);
    expect(parseKeywordList(input, 3)).toEqual(["fraza 0", "fraza 1", "fraza 2"]);
    expect(parseKeywordList("a,b,c", 0)).toEqual([]);
  });

  it("duplikaty i odrzucone frazy nie zajmują miejsca w limicie max", () => {
    expect(parseKeywordList("a\na\n" + "x".repeat(81) + "\nb\nc", 3)).toEqual(["a", "b", "c"]);
  });
});

describe("stałe", () => {
  it("domyślna kotwica Trends", () => {
    expect(DEFAULT_TRENDS_ANCHOR).toBe("szkolenia ai");
  });

  it("etykiety konkurencji po polsku", () => {
    expect(COMPETITION_LABEL).toEqual({ LOW: "niska", MEDIUM: "średnia", HIGH: "wysoka" });
  });
});

describe("DEFAULT_SEEDS", () => {
  it("siedem haseł wyjściowych, już znormalizowanych, w limicie badania", () => {
    expect(DEFAULT_SEEDS).toEqual([
      "szkolenia ai", "szkolenie chatgpt", "kurs ai dla firm", "szkolenie ai act",
      "szkolenia ai warszawa", "szkolenia ai wrocław", "lider w erze ai",
    ]);
    expect(DEFAULT_SEEDS.length).toBeLessThanOrEqual(MAX_SEEDS);
    for (const seed of DEFAULT_SEEDS) {
      expect(normalizeKeyword(seed)).toBe(seed);
      expect(seed.length).toBeLessThanOrEqual(MAX_KEYWORD_LENGTH);
    }
    expect(parseKeywordList(DEFAULT_SEEDS.join("\n"))).toEqual([...DEFAULT_SEEDS]);
  });
});
