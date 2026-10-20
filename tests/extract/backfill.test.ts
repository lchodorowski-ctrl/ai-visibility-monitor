import { describe, it, expect } from "vitest";
import type { BrandDef } from "@/lib/extract/brands";
import { planMentionBackfill, competitorForCitation, type StoredMention } from "@/lib/extract/backfill";

const brands: BrandDef[] = [
  { kind: "own", name: "Polska Szkoła AI", aliases: ["PSAI"] },
  { kind: "competitor", name: "Akademia PARP", aliases: ["PARP"], competitorId: "c-parp" },
  { kind: "competitor", name: "Altkom Akademia", aliases: ["Altkom"], competitorId: "c-altkom" },
];

// "Polecam PARP, Altkom i PSAI." → PARP @8, Altkom @14, PSAI @23
const text = "Polecam PARP, Altkom i PSAI.";
const own = (position: number): StoredMention => ({
  id: "m-own", brand_kind: "own", brand_name: "Polska Szkoła AI", competitor_id: null, position, char_index: 23,
});

describe("planMentionBackfill", () => {
  it("dopisuje brakujących konkurentów z pozycją z rankingu wszystkich marek", () => {
    const plan = planMentionBackfill({ text, noAnswer: false, stored: [own(1)] }, brands);
    expect(plan.inserts).toEqual([
      { kind: "competitor", name: "Akademia PARP", competitorId: "c-parp", position: 1, charIndex: 8 },
      { kind: "competitor", name: "Altkom Akademia", competitorId: "c-altkom", position: 2, charIndex: 14 },
    ]);
  });

  it("nie dotyka wiersza własnej marki, tylko zgłasza, że jej pozycja nie zgadza się z rankingiem", () => {
    const plan = planMentionBackfill({ text, noAnswer: false, stored: [own(1)] }, brands);
    expect(plan.inserts.every((m) => m.kind === "competitor")).toBe(true);
    expect(plan.positionFixes).toEqual([{ id: "m-own", kind: "own", from: 1, to: 3 }]);
  });

  it("pozycje są takie, jakie zapisałby run z dzisiejszą listą konkurentów", () => {
    const plan = planMentionBackfill({ text, noAnswer: false, stored: [own(1)] }, brands);
    const merged = [
      ...plan.inserts.map((m) => [m.name, m.position]),
      ["Polska Szkoła AI", plan.positionFixes[0].to],
    ].sort((a, b) => Number(a[1]) - Number(b[1]));
    // ten sam tekst przetworzony od zera przez extractMentions
    expect(merged).toEqual([["Akademia PARP", 1], ["Altkom Akademia", 2], ["Polska Szkoła AI", 3]]);
  });

  it("idempotentnie: konkurent już zapisany (po competitor_id) nie jest dopisywany drugi raz", () => {
    const stored: StoredMention[] = [
      { id: "m1", brand_kind: "competitor", brand_name: "Akademia PARP", competitor_id: "c-parp", position: 1, char_index: 8 },
      { id: "m2", brand_kind: "competitor", brand_name: "Altkom Akademia", competitor_id: "c-altkom", position: 2, char_index: 14 },
      { ...own(3) },
    ];
    expect(planMentionBackfill({ text, noAnswer: false, stored }, brands)).toEqual({ inserts: [], positionFixes: [] });
  });

  it("po dopisaniu bez renumeracji kolejny przebieg nie dopisuje nic, ale dalej widzi nieaktualną pozycję własnej marki", () => {
    const first = planMentionBackfill({ text, noAnswer: false, stored: [own(1)] }, brands);
    const stored: StoredMention[] = [
      own(1),
      ...first.inserts.map((m, i) => ({
        id: `ins-${i}`, brand_kind: m.kind, brand_name: m.name, competitor_id: m.competitorId, position: m.position, char_index: m.charIndex,
      })),
    ];
    expect(planMentionBackfill({ text, noAnswer: false, stored }, brands)).toEqual({
      inserts: [], positionFixes: [{ id: "m-own", kind: "own", from: 1, to: 3 }],
    });
  });

  it("po nazwie rozpoznaje wiersz konkurenta, którego competitor_id wyzerowało usunięcie konkurenta", () => {
    const stored: StoredMention[] = [
      { id: "m1", brand_kind: "competitor", brand_name: "Akademia PARP", competitor_id: null, position: 1, char_index: 8 },
    ];
    const plan = planMentionBackfill({ text: "Polecam PARP.", noAnswer: false, stored }, brands);
    expect(plan.inserts).toEqual([]);
  });

  it("dopisuje tylko brakującego konkurenta i przelicza pozycje istniejących wierszy", () => {
    const stored: StoredMention[] = [
      { id: "m-altkom", brand_kind: "competitor", brand_name: "Altkom Akademia", competitor_id: "c-altkom", position: 1, char_index: 14 },
      { ...own(2) },
    ];
    const plan = planMentionBackfill({ text, noAnswer: false, stored }, brands);
    expect(plan.inserts).toEqual([{ kind: "competitor", name: "Akademia PARP", competitorId: "c-parp", position: 1, charIndex: 8 }]);
    expect(plan.positionFixes).toEqual([
      { id: "m-altkom", kind: "competitor", from: 1, to: 2 },
      { id: "m-own", kind: "own", from: 2, to: 3 },
    ]);
  });

  it("konkurent po własnej marce nie zmienia jej pozycji", () => {
    const plan = planMentionBackfill({
      text: "PSAI albo Altkom.", noAnswer: false,
      stored: [{ id: "m-own", brand_kind: "own", brand_name: "Polska Szkoła AI", competitor_id: null, position: 1, char_index: 0 }],
    }, brands);
    expect(plan.inserts).toEqual([{ kind: "competitor", name: "Altkom Akademia", competitorId: "c-altkom", position: 2, charIndex: 10 }]);
    expect(plan.positionFixes).toEqual([]);
  });

  it("nie dopisuje własnej marki, nawet gdy dzisiejsze aliasy ją znajdują", () => {
    const plan = planMentionBackfill({ text, noAnswer: false, stored: [] }, brands);
    expect(plan.inserts.map((m) => m.name)).toEqual(["Akademia PARP", "Altkom Akademia"]);
  });

  it("odpowiedź oznaczona jako brak odpowiedzi nie dostaje wzmianek (jak w processResponse)", () => {
    expect(planMentionBackfill({ text, noAnswer: true, stored: [] }, brands)).toEqual({ inserts: [], positionFixes: [] });
  });

  it("pusty tekst → nic do zrobienia", () => {
    expect(planMentionBackfill({ text: "", noAnswer: false, stored: [] }, brands)).toEqual({ inserts: [], positionFixes: [] });
  });
});

describe("competitorForCitation", () => {
  const competitors = [{ id: "c-parp", domains: ["parp.gov.pl"] }];

  it("przypisuje konkurenta po domenie (także subdomenie)", () => {
    expect(competitorForCitation({ url: "https://akademia.parp.gov.pl/x", domain: "akademia.parp.gov.pl", is_own: false }, ["polskaszkola.ai"], competitors)).toBe("c-parp");
  });

  it("cytowanie własnej domeny nigdy nie należy do konkurenta", () => {
    expect(competitorForCitation({ url: "https://parp.gov.pl", domain: "parp.gov.pl", is_own: true }, [], competitors)).toBeNull();
  });

  it("obca domena → brak konkurenta", () => {
    expect(competitorForCitation({ url: "https://example.com", domain: "example.com", is_own: false }, ["polskaszkola.ai"], competitors)).toBeNull();
  });
});
