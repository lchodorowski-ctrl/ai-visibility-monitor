import { describe, it, expect } from "vitest";
import { pluralPl, pluralFmt } from "@/lib/format/plural";
import { pct, fmtDate } from "@/lib/format/number";

describe("pluralPl", () => {
  const f: [string, string, string] = ["pytanie", "pytania", "pytań"];
  it.each([[1, "1 pytanie"], [2, "2 pytania"], [4, "4 pytania"], [5, "5 pytań"], [12, "12 pytań"], [14, "14 pytań"], [22, "22 pytania"], [25, "25 pytań"], [0, "0 pytań"], [112, "112 pytań"]])(
    "%i", (n, out) => expect(pluralPl(n, f)).toBe(out),
  );
});
describe("pluralFmt", () => {
  const f: [string, string, string] = ["kliknięcie", "kliknięcia", "kliknięć"];
  it("odmiana jak pluralPl, a liczba zapisana jak w całej aplikacji (zwykłe spacje co trzy cyfry)", () => {
    expect(pluralFmt(1, f)).toBe("1 kliknięcie");
    expect(pluralFmt(22, f)).toBe("22 kliknięcia");
    expect(pluralFmt(112, f)).toBe("112 kliknięć");
    expect(pluralFmt(12345, f)).toBe("12 345 kliknięć");
    expect(pluralFmt(1234567, f)).toBe("1 234 567 kliknięć");
    expect(pluralFmt(0, f)).toBe("0 kliknięć");
  });
});
describe("formaty", () => {
  it("pct zaokrągla do całości", () => { expect(pct(0.2249)).toBe("22%"); expect(pct(1)).toBe("100%"); });
  it("fmtDate w strefie Europe/Warsaw", () => { expect(fmtDate("2026-10-12T21:30:59Z")).toBe("12.10.2026, 23:30"); });
});
