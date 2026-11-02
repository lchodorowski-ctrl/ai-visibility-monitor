import { describe, it, expect } from "vitest";
import {
  gscWindows, shiftDate, delta, ctr, overviewState, topOpportunities, topQueries, fillMissingDays,
} from "@/lib/seo/overview";
import type { Opportunity, QueryWindow } from "@/lib/seo/opportunities";

describe("shiftDate", () => {
  it("przesuwa datę o dni, także przez granicę miesiąca i roku", () => {
    expect(shiftDate("2026-10-31", -27)).toBe("2026-10-04");
    expect(shiftDate("2026-01-02", -3)).toBe("2025-12-30");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("gscWindows", () => {
  it("bieżące okno to 28 dni kończące się ostatnią datą, poprzednie to 28 dni tuż przed nim", () => {
    expect(gscWindows("2026-10-31")).toEqual({
      cur: { from: "2026-10-04", to: "2026-10-31" },
      prev: { from: "2026-09-06", to: "2026-10-03" },
    });
  });

  it("przez granicę miesiąca: okna po 28 dni, bez dziur i nakładek", () => {
    const w = gscWindows("2026-03-05");
    expect(w.cur).toEqual({ from: "2026-02-06", to: "2026-03-05" });
    expect(w.prev).toEqual({ from: "2026-01-09", to: "2026-02-05" });
    expect(shiftDate(w.prev.to, 1)).toBe(w.cur.from);
  });

  it("przez granicę roku", () => {
    const w = gscWindows("2026-01-10");
    expect(w.cur).toEqual({ from: "2025-12-14", to: "2026-01-10" });
    expect(w.prev).toEqual({ from: "2025-11-16", to: "2025-12-13" });
  });
});

describe("delta", () => {
  it("zmiana względna wobec poprzedniego okna", () => {
    expect(delta(120, 100)).toBe(0.2);
    expect(delta(80, 100)).toBeCloseTo(-0.2, 10);
    expect(delta(0, 10)).toBe(-1);
    expect(delta(10, 10)).toBe(0);
  });

  it("null, gdy brak bazy do porównania", () => {
    expect(delta(5, 0)).toBeNull();
    expect(delta(null, 3)).toBeNull();
    expect(delta(5, null)).toBeNull();
    expect(delta(null, null)).toBeNull();
    expect(delta(0, 0)).toBeNull();
  });
});

describe("ctr", () => {
  it("kliknięcia podzielone przez wyświetlenia", () => {
    expect(ctr(5, 100)).toBe(0.05);
    expect(ctr(0, 10)).toBe(0);
  });

  it("null bez wyświetleń albo bez danych", () => {
    expect(ctr(5, 0)).toBeNull();
    expect(ctr(null, 10)).toBeNull();
    expect(ctr(5, null)).toBeNull();
  });
});

describe("overviewState", () => {
  const job = (status: string, error: string | null = null) => ({ status, error });

  it("brak usługi Search Console (null albo pusty tekst) → no_property, także gdy są dane i zadanie", () => {
    expect(overviewState({ gscProperty: null, lastDate: null, lastJob: null })).toBe("no_property");
    expect(overviewState({ gscProperty: "  ", lastDate: "2026-10-31", lastJob: job("done") })).toBe("no_property");
  });

  it("usługa jest, ale brak danych i brak nieudanego zadania → no_data", () => {
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: null })).toBe("no_data");
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: job("running") })).toBe("no_data");
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: job("done") })).toBe("no_data");
  });

  it("brak danych i ostatnie zadanie nieudane → error", () => {
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: job("failed", "403") })).toBe("error");
  });

  it("pominięte zadanie (sprzed wpisania usługi) nie jest błędem", () => {
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: job("skipped", "Brak usługi") })).toBe("no_data");
  });

  it("są dane → ok, także gdy ostatnia synchronizacja się nie udała (błąd widać w statusie)", () => {
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: "2026-10-31", lastJob: job("done") })).toBe("ok");
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: "2026-10-31", lastJob: job("failed", "boom") })).toBe("ok");
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: "2026-10-31", lastJob: null })).toBe("ok");
  });
});

const striking = (query: string, potentialClicks: number, impressions = 100): Opportunity => ({
  kind: "striking", query, clicks: 1, impressions, position: 8, ctr: 0.01, potentialClicks,
});

describe("topOpportunities", () => {
  it("ukrywa szanse bez potencjału (<= 0) i zostawia pierwsze pięć w zadanej kolejności", () => {
    const items = [
      striking("a", 40), striking("zero", 0), striking("b", 30), striking("c", 20), striking("d", 10),
      striking("e", 5), striking("f", 4), striking("ujemna", -3),
    ];
    expect(topOpportunities(items).map((o) => o.query)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("limit można zmienić; pusta lista zostaje pusta", () => {
    expect(topOpportunities([striking("a", 3), striking("b", 2)], 1)).toHaveLength(1);
    expect(topOpportunities([])).toEqual([]);
  });
});

const qw = (query: string, curClicks: number, curImpressions: number): QueryWindow => ({
  query,
  cur: { clicks: curClicks, impressions: curImpressions, position: curImpressions > 0 ? 5 : null },
  prev: { clicks: 0, impressions: 0, position: null },
});

describe("topQueries", () => {
  it("najwięcej kliknięć pierwsze, przy remisie więcej wyświetleń; pomija frazy bez wyświetleń w bieżącym oknie", () => {
    const rows = [qw("c", 5, 100), qw("a", 9, 50), qw("b", 5, 300), qw("utracona", 0, 0), qw("d", 0, 20)];
    expect(topQueries(rows).map((r) => r.query)).toEqual(["a", "b", "c", "d"]);
  });

  it("ogranicza do zadanej liczby (domyślnie 10) i nie zmienia wejścia", () => {
    const rows = Array.from({ length: 15 }, (_, i) => qw(`q${i}`, i, 100));
    const copy = [...rows];
    expect(topQueries(rows)).toHaveLength(10);
    expect(topQueries(rows, 3).map((r) => r.query)).toEqual(["q14", "q13", "q12"]);
    expect(rows).toEqual(copy);
  });
});

describe("fillMissingDays", () => {
  const day = (date: string, clicks: number, impressions: number, position: number | null = 5) => ({ date, clicks, impressions, position });

  it("wstawia dni bez wiersza jako zera i pozycję null, bez dodawania dni przed pierwszym i po ostatnim", () => {
    expect(fillMissingDays([day("2026-10-01", 3, 30), day("2026-10-04", 2, 20, 7)])).toEqual([
      day("2026-10-01", 3, 30),
      day("2026-10-02", 0, 0, null),
      day("2026-10-03", 0, 0, null),
      day("2026-10-04", 2, 20, 7),
    ]);
  });

  it("ciągła seria i pusta lista zostają bez zmian", () => {
    const full = [day("2026-10-01", 1, 10), day("2026-10-02", 2, 20)];
    expect(fillMissingDays(full)).toEqual(full);
    expect(fillMissingDays([])).toEqual([]);
  });
});
