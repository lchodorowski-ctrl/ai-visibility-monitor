import { describe, it, expect } from "vitest";
import { plainSpaces, fmtDecimal, fmtNumber, fmtCompact, fmtSignedNumber, fmtSignedPercent, positionChangeText } from "@/lib/format/number";

const NO_BREAK = /[\u00a0\u202f]/;

describe("plainSpaces", () => {
  it("zamienia twarde spacje (U+00A0, U+202F) na zwykłe", () => {
    expect(plainSpaces("1\u00a0234\u202f567")).toBe("1 234 567");
  });
});

describe("fmtNumber", () => {
  it("liczba całkowita ze zwykłymi spacjami co trzy cyfry; cztery cyfry bez grupowania (jak pl-PL)", () => {
    expect(fmtNumber(0)).toBe("0");
    expect(fmtNumber(999)).toBe("999");
    expect(fmtNumber(1000)).toBe("1000");
    expect(fmtNumber(12345)).toBe("12 345");
    expect(fmtNumber(1234567)).toBe("1 234 567");
  });

  it("zaokrągla do całości", () => {
    expect(fmtNumber(1234.6)).toBe("1235");
    expect(fmtNumber(2.4)).toBe("2");
  });

  it("nie zwraca twardych spacji", () => {
    expect(fmtNumber(9876543)).not.toMatch(NO_BREAK);
  });
});

describe("fmtDecimal", () => {
  it("przecinek dziesiętny i domyślnie jedno miejsce", () => {
    expect(fmtDecimal(9.4)).toBe("9,4");
    expect(fmtDecimal(3)).toBe("3,0");
    expect(fmtDecimal(4.25)).toBe("4,3");
  });

  it("zadana liczba miejsc i grupowanie tysięcy zwykłą spacją", () => {
    expect(fmtDecimal(0.1234, 2)).toBe("0,12");
    expect(fmtDecimal(12345.67, 1)).toBe("12 345,7");
    expect(fmtDecimal(12345.67, 1)).not.toMatch(NO_BREAK);
    expect(fmtDecimal(7, 0)).toBe("7");
  });
});

describe("fmtCompact", () => {
  it("krótka forma osi wykresu bez twardych spacji", () => {
    expect(fmtCompact(950)).toBe("950");
    expect(fmtCompact(12345)).toBe("12 tys.");
    expect(fmtCompact(1234567)).toBe("1,2 mln");
    expect(fmtCompact(12345)).not.toMatch(NO_BREAK);
  });
});

describe("fmtSignedNumber", () => {
  it("plus dla dodatnich, minus U+2212 dla ujemnych, przecinek dziesiętny", () => {
    expect(fmtSignedNumber(0.3)).toBe("+0,3");
    expect(fmtSignedNumber(-0.3)).toBe("−0,3");
    expect(fmtSignedNumber(6, 0)).toBe("+6");
    expect(fmtSignedNumber(-5, 0)).toBe("−5");
    expect(fmtSignedNumber(12345.6, 1)).toBe("+12 345,6");
  });

  it("minus to U+2212, a nie łącznik ani półpauza", () => {
    const s = fmtSignedNumber(-5, 0);
    expect(s.charCodeAt(0)).toBe(0x2212);
    expect(s).not.toContain("-");
  });

  it("wartość zaokrąglona do zera nie ma znaku (także ujemna)", () => {
    expect(fmtSignedNumber(0, 0)).toBe("0");
    expect(fmtSignedNumber(0.04, 1)).toBe("0,0");
    expect(fmtSignedNumber(-0.04, 1)).toBe("0,0");
    expect(fmtSignedNumber(-0.4, 0)).toBe("0");
  });
});

describe("fmtSignedPercent", () => {
  it("zmiana względna jako procent ze znakiem", () => {
    expect(fmtSignedPercent(0.2)).toBe("+20%");
    expect(fmtSignedPercent(0.18333)).toBe("+18%");
    expect(fmtSignedPercent(-0.14545)).toBe("−15%");
    expect(fmtSignedPercent(-1)).toBe("−100%");
  });

  it("zero i zmiana poniżej połowy procenta to „0%” bez znaku", () => {
    expect(fmtSignedPercent(0)).toBe("0%");
    expect(fmtSignedPercent(-0.004)).toBe("0%");
    expect(fmtSignedPercent(0.004)).toBe("0%");
  });

  it("liczba miejsc po przecinku jest opcjonalna", () => {
    expect(fmtSignedPercent(0.1834, 1)).toBe("+18,3%");
    expect(fmtSignedPercent(-0.0526, 1)).toBe("−5,3%");
  });
});

describe("positionChangeText", () => {
  it("niższa pozycja to „lepiej”, wyższa to „gorzej”, z przecinkiem dziesiętnym i „poz.”", () => {
    expect(positionChangeText(9.4, 12)).toBe("lepiej o 2,6 poz.");
    expect(positionChangeText(12, 9.4)).toBe("gorzej o 2,6 poz.");
    expect(positionChangeText(20.2, 8)).toBe("gorzej o 12,2 poz.");
  });

  it("zmiana poniżej 0,05 to „bez zmian”, od 0,05 już zmiana", () => {
    expect(positionChangeText(9.4, 9.42)).toBe("bez zmian");
    expect(positionChangeText(9.42, 9.4)).toBe("bez zmian");
    expect(positionChangeText(9.4, 9.5)).toBe("lepiej o 0,1 poz.");
  });

  it("bez jednej z wartości nie ma tekstu (null)", () => {
    expect(positionChangeText(null, 9)).toBeNull();
    expect(positionChangeText(9, null)).toBeNull();
    expect(positionChangeText(null, null)).toBeNull();
  });
});
