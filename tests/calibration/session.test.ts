import { describe, it, expect } from "vitest";
import { assertOpenSession, mergeAlias, parseUrls } from "@/lib/calibration/session";

describe("assertOpenSession", () => {
  it("rzuca dla zamkniętej i brakującej", () => {
    expect(() => assertOpenSession(null)).toThrow(/zamknięta lub nie istnieje/);
    expect(() => assertOpenSession({ status: "closed" })).toThrow(/zamknięta lub nie istnieje/);
    expect(() => assertOpenSession({ status: "open" })).not.toThrow();
  });
});

describe("mergeAlias", () => {
  it("dodaje nowy, odrzuca pusty i duplikat w innej pisowni", () => {
    expect(mergeAlias(["PSAI"], "Polska Szkoła Sztucznej Inteligencji")).toEqual(["PSAI", "Polska Szkoła Sztucznej Inteligencji"]);
    expect(mergeAlias(["Polska Szkola AI"], "  polska szkoła ai ")).toBeNull();
    expect(mergeAlias(["PSAI"], "   ")).toBeNull();
  });

  it("nazwa marki przekazana wśród znanych fraz blokuje duplikat", () => {
    expect(mergeAlias(["Polska Szkoła AI", "PSAI"], "polska szkola ai")).toBeNull();
  });
});

describe("parseUrls", () => {
  it("dzieli po liniach, przycina, pomija puste, max 50", () => {
    expect(parseUrls(" https://a.pl \n\n b.pl\r\n")).toEqual(["https://a.pl", "b.pl"]);
    expect(parseUrls(Array.from({ length: 60 }, (_, i) => `x${i}.pl`).join("\n"))).toHaveLength(50);
    expect(parseUrls(Array.from({ length: 50 }, (_, i) => `x${i}.pl`).join("\n"))).toHaveLength(50);
  });
});
