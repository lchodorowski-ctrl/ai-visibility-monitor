import { describe, it, expect } from "vitest";
import {
  gscWindows, shiftDate, delta, ctr, overviewState, hasPreviousWindow, isInterruptedJob, topOpportunities, topQueries, fillMissingDays,
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

describe("hasPreviousWindow", () => {
  const w = gscWindows("2026-10-31"); // poprzednie okno: 2026-09-06 do 2026-10-03

  it("poprzednie okno jest pełne, gdy historia zaczyna się najpóźniej w jego pierwszym dniu", () => {
    expect(hasPreviousWindow("2026-09-06", w)).toBe(true);
    expect(hasPreviousWindow("2025-07-01", w)).toBe(true);
  });

  it("krótsza historia (pierwsza data po początku poprzedniego okna) to brak poprzedniego okna", () => {
    expect(hasPreviousWindow("2026-09-07", w)).toBe(false);
    expect(hasPreviousWindow("2026-09-21", w)).toBe(false); // 40 dni historii
  });

  it("bez żadnych danych też nie ma z czym porównać", () => {
    expect(hasPreviousWindow(null, w)).toBe(false);
  });
});

describe("isInterruptedJob", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const running = (started_at: string) => ({ status: "running", started_at });

  it("zadanie w toku dłużej niż 45 minut uznajemy za przerwane; równe 45 minut jeszcze trwa", () => {
    expect(isInterruptedJob(running("2026-11-02T11:15:00Z"), now)).toBe(false);
    expect(isInterruptedJob(running("2026-11-02T11:14:59Z"), now)).toBe(true);
    expect(isInterruptedJob(running("2026-11-02T11:59:00Z"), now)).toBe(false);
  });

  it("zadanie w innym stanie nigdy nie jest przerwane, a nieczytelna data nie wywołuje fałszywego alarmu", () => {
    expect(isInterruptedJob({ status: "done", started_at: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(isInterruptedJob({ status: "failed", started_at: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(isInterruptedJob(running("nie data"), now)).toBe(false);
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
  const now = new Date("2026-11-02T12:00:00Z");
  const job = (status: string, error: string | null = null, started_at = "2026-11-02T11:50:00Z") => ({ status, error, started_at });
  const state = (o: { gscProperty?: string | null; lastDate?: string | null; lastJob?: ReturnType<typeof job> | null }) =>
    overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: null, now, ...o });

  it("brak usługi Search Console (null albo pusty tekst) → no_property, także gdy są dane i zadanie", () => {
    expect(state({ gscProperty: null })).toBe("no_property");
    expect(state({ gscProperty: "  ", lastDate: "2026-10-31", lastJob: job("done") })).toBe("no_property");
  });

  it("usługa jest, ale brak danych i brak zadania → no_data", () => {
    expect(state({})).toBe("no_data");
  });

  it("brak danych i ostatnie zadanie nieudane → error", () => {
    expect(state({ lastJob: job("failed", "403") })).toBe("error");
  });

  it("brak danych i zadanie w toku od niedawna → syncing", () => {
    expect(state({ lastJob: job("running", null, "2026-11-02T11:15:00Z") })).toBe("syncing");
    expect(state({ lastJob: job("running", null, "2026-11-02T11:59:00Z") })).toBe("syncing");
  });

  it("zadanie w toku dłużej niż 45 minut jest przerwane, więc to zwykły brak danych (nie „w toku”)", () => {
    expect(state({ lastJob: job("running", null, "2026-11-02T11:14:59Z") })).toBe("no_data");
    expect(state({ lastJob: job("running", null, "2026-10-30T04:30:00Z") })).toBe("no_data");
  });

  it("synchronizacja zakończona, a danych nadal brak → empty_result", () => {
    expect(state({ lastJob: job("done") })).toBe("empty_result");
  });

  it("pominięte zadanie (sprzed wpisania usługi) nie jest błędem ani pustym wynikiem", () => {
    expect(state({ lastJob: job("skipped", "Brak usługi") })).toBe("no_data");
  });

  it("są dane → ok, także gdy ostatnia synchronizacja się nie udała albo trwa (błąd i status widać w pasku)", () => {
    expect(state({ lastDate: "2026-10-31", lastJob: job("done") })).toBe("ok");
    expect(state({ lastDate: "2026-10-31", lastJob: job("failed", "boom") })).toBe("ok");
    expect(state({ lastDate: "2026-10-31", lastJob: job("running") })).toBe("ok");
    expect(state({ lastDate: "2026-10-31", lastJob: null })).toBe("ok");
  });

  it("bez wstrzykniętego czasu używa bieżącego (świeże zadanie w toku to syncing)", () => {
    expect(overviewState({ gscProperty: "sc-domain:x.pl", lastDate: null, lastJob: job("running", null, new Date().toISOString()) })).toBe("syncing");
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

  it("nowe i utracone frazy zostają mimo zerowych kliknięć (pojawienie się i zniknięcie frazy to informacja)", () => {
    const fresh: Opportunity = { kind: "new", query: "nowa bez klików", clicks: 0, impressions: 80, position: 9, ctr: 0, potentialClicks: 0 };
    const gone: Opportunity = { kind: "lost", query: "utracona bez klików", clicks: 0, impressions: 60, position: 6, ctr: 0, potentialClicks: 0 };
    expect(topOpportunities([fresh, striking("zero", 0), gone]).map((o) => (o.kind === "cannibal" ? o.query : o.query))).toEqual(["nowa bez klików", "utracona bez klików"]);
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
