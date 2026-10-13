import { describe, it, expect } from "vitest";
import { apiOutcome, compareRow, agreementByEngine, normalizeDomain, citationCoverage, calibrationTone, calibrationToneClass, type ApiResponse, type CalibrationRow } from "@/lib/calibration/compare";

const r = (p: Partial<ApiResponse>): ApiResponse => ({ id: "x", error: null, no_answer: false, ownMention: false, domains: [], ...p });

describe("apiOutcome", () => {
  it("wzmianka w co najmniej jednej ważnej próbce", () => expect(apiOutcome([r({}), r({ ownMention: true })])).toBe("mentioned"));
  it("ważne próbki bez wzmianki", () => expect(apiOutcome([r({}), r({})])).toBe("absent"));
  it("tylko błędy i brak odpowiedzi → brak danych", () => expect(apiOutcome([r({ error: "boom", ownMention: true }), r({ no_answer: true })])).toBe("no_data"));
  it("brak odpowiedzi w ogóle → brak danych", () => expect(apiOutcome([])).toBe("no_data"));
});

describe("compareRow", () => {
  it.each([
    [true, "mentioned", "match"], [false, "absent", "match"],
    [false, "mentioned", "api_only"], [true, "absent", "manual_only"],
    [null, "mentioned", "skipped"], [true, "no_data", "skipped"], [false, "no_data", "skipped"],
  ] as const)("%s / %s → %s", (m, a, out) => expect(compareRow(m, a)).toBe(out));
});

describe("agreementByEngine", () => {
  it("zgodność = zgodne / sprawdzone, pomija skipped, zawsze 3 silniki", () => {
    const rows: CalibrationRow[] = [
      { promptId: "p1", engineId: "openai", result: "match" },
      { promptId: "p2", engineId: "openai", result: "api_only" },
      { promptId: "p3", engineId: "openai", result: "skipped" },
      { promptId: "p1", engineId: "perplexity", result: "match" },
    ];
    expect(agreementByEngine(rows)).toEqual([
      { engineId: "openai", agreed: 1, checked: 2, rate: 0.5 },
      { engineId: "perplexity", agreed: 1, checked: 1, rate: 1 },
      { engineId: "google_ai_overview", agreed: 0, checked: 0, rate: null },
    ]);
  });
});

describe("normalizeDomain", () => {
  it("URL lub goła domena → host bez www, małymi literami", () => {
    expect(normalizeDomain("https://www.PARP.gov.pl/x?y=1")).toBe("parp.gov.pl");
    expect(normalizeDomain("parp.gov.pl/kurs")).toBe("parp.gov.pl");
    expect(normalizeDomain("to nie jest adres")).toBeNull();
  });
  it("niełacińskie znaki są odrzucane, nie punycode'owane", () => {
    expect(normalizeDomain("śmieci")).toBeNull();
    expect(normalizeDomain("śmieci.pl")).toBeNull();
  });
  it("prefiks protokołu bez względu na wielkość liter, port i ścieżka odcięte", () => {
    expect(normalizeDomain("HTTPS://Ey.com:443/x")).toBe("ey.com");
  });
});

describe("citationCoverage", () => {
  it("po domenie bez www i wielkości liter, śmieci pominięte, duplikaty raz", () => {
    expect(citationCoverage(["https://www.parp.gov.pl/a", "PARP.gov.pl", "śmieci", "https://ey.com/x"], ["parp.gov.pl", "wikipedia.org"]))
      .toEqual({ matched: 1, total: 2 });
  });
});

describe("calibrationTone", () => {
  it.each([[1, "good"], [0.8, "good"], [0.79, "weak"], [0.6, "weak"], [0.59, "bad"], [0, "bad"]] as const)("%s → %s", (v, t) => expect(calibrationTone(v)).toBe(t));
});

describe("calibrationToneClass", () => {
  it.each([[1, "text-teal"], [0.8, "text-teal"], [0.7, "text-t0"], [0.6, "text-t0"], [0.59, "text-red"], [0, "text-red"]] as const)("%s → %s", (v, c) => expect(calibrationToneClass(v)).toBe(c));
});
