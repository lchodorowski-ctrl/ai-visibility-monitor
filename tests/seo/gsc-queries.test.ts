import { describe, it, expect, vi, beforeEach } from "vitest";

type Result = { data: unknown; error: { message: string } | null };

const calls: string[] = [];
let tables: Record<string, unknown[]>;
let rpcs: Record<string, Result>;

// Łańcuch zapytania jak w PostgREST: każda metoda zapisuje wywołanie, a `await` albo maybeSingle zwraca wiersze tabeli.
function table(name: string) {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) {
    api[m] = (...a: unknown[]) => { calls.push(`${name}.${m}(${a.map((x) => JSON.stringify(x)).join(",")})`); return api; };
  }
  api.maybeSingle = async () => ({ data: (tables[name] ?? [])[0] ?? null, error: null });
  api.then = (res: (v: unknown) => void) => res({ data: tables[name] ?? [], error: null });
  return api;
}
const rpc = vi.fn(async (name: string, args: unknown) => { calls.push(`rpc.${name}(${JSON.stringify(args)})`); return rpcs[name] ?? { data: [], error: null }; });
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (n: string) => table(n), rpc }) }));

import { getGscLastDate, getGscTotals, getGscSeries, getQueryWindows, getTopPages, getQueryPages, getSeoStatus } from "@/lib/seo/queries";

beforeEach(() => {
  calls.length = 0;
  tables = {};
  rpcs = {};
  rpc.mockClear();
});

describe("getGscLastDate", () => {
  it("najnowsza data z gsc_site_daily projektu albo null", async () => {
    tables.gsc_site_daily = [{ date: "2026-10-31" }];
    expect(await getGscLastDate("p1")).toBe("2026-10-31");
    expect(calls).toContain('gsc_site_daily.eq("project_id","p1")');
    expect(calls).toContain('gsc_site_daily.order("date",{"ascending":false})');
    tables.gsc_site_daily = [];
    expect(await getGscLastDate("p2")).toBeNull();
  });
});

describe("getGscTotals", () => {
  it("wywołuje gsc_totals i zamienia liczby tekstowe z PostgREST na liczby", async () => {
    rpcs.gsc_totals = { data: [{ clicks: "142", impressions: "4200", position: "9.40" }], error: null };
    expect(await getGscTotals("p1", "2026-10-04", "2026-10-31")).toEqual({ clicks: 142, impressions: 4200, position: 9.4 });
    expect(calls).toContain('rpc.gsc_totals({"p_project":"p1","p_from":"2026-10-04","p_to":"2026-10-31"})');
  });

  it("brak danych (wiersz z samymi nullami albo pusta odpowiedź) daje trzy nulle, nie zera", async () => {
    const empty = { clicks: null, impressions: null, position: null };
    rpcs.gsc_totals = { data: [{ clicks: null, impressions: null, position: null }], error: null };
    expect(await getGscTotals("p1", "a", "b")).toEqual(empty);
    rpcs.gsc_totals = { data: [], error: null };
    expect(await getGscTotals("p1", "a", "c")).toEqual(empty);
    rpcs.gsc_totals = { data: null, error: null };
    expect(await getGscTotals("p1", "a", "d")).toEqual(empty);
  });

  it("błąd bazy rzuca po polsku", async () => {
    rpcs.gsc_totals = { data: null, error: { message: "boom" } };
    await expect(getGscTotals("p1", "a", "e")).rejects.toThrow("Nie udało się pobrać sumy z Search Console: boom");
  });
});

describe("getGscSeries", () => {
  it("90 dni liczone od ostatniej daty w bazie, liczby jako Number, pozycja null zostaje null", async () => {
    tables.gsc_site_daily = [{ date: "2026-10-31", clicks: "3", impressions: "30", position: "5.50" }];
    // pierwsze zapytanie (ostatnia data) i drugie (seria) czytają tę samą tabelę
    const series = await getGscSeries("p1", 90);
    expect(series).toEqual([{ date: "2026-10-31", clicks: 3, impressions: 30, position: 5.5 }]);
    expect(calls).toContain('gsc_site_daily.gte("date","2026-08-03")');
    expect(calls).toContain('gsc_site_daily.order("date")');
    tables.gsc_site_daily = [{ date: "2026-10-31", clicks: 0, impressions: 0, position: null }];
    expect((await getGscSeries("p9", 90))[0].position).toBeNull();
  });

  it("bez żadnych danych: pusta seria", async () => {
    tables.gsc_site_daily = [];
    expect(await getGscSeries("p1")).toEqual([]);
  });
});

describe("getQueryWindows", () => {
  const w = { cur: { from: "2026-10-04", to: "2026-10-31" }, prev: { from: "2026-09-06", to: "2026-10-03" } };

  it("mapuje płaskie wiersze SQL na QueryWindow z zagnieżdżonymi cur i prev; liczby jako Number", async () => {
    rpcs.gsc_query_windows = {
      data: [{
        query: "kurs ai", cur_clicks: "12", cur_impressions: "340", cur_position: "7.25",
        prev_clicks: 10, prev_impressions: 300, prev_position: 8.5,
      }],
      error: null,
    };
    expect(await getQueryWindows("p1", w)).toEqual([
      { query: "kurs ai", cur: { clicks: 12, impressions: 340, position: 7.25 }, prev: { clicks: 10, impressions: 300, position: 8.5 } },
    ]);
    expect(calls).toContain(
      'rpc.gsc_query_windows({"p_project":"p1","p_cur_from":"2026-10-04","p_cur_to":"2026-10-31","p_prev_from":"2026-09-06","p_prev_to":"2026-10-03","p_limit":500})',
    );
  });

  it("pozycja jest null, gdy okno nie ma wyświetleń (także gdy SQL zwrócił liczbę) albo gdy SQL zwrócił null", async () => {
    rpcs.gsc_query_windows = {
      data: [
        { query: "nowa", cur_clicks: 1, cur_impressions: 20, cur_position: 4, prev_clicks: 0, prev_impressions: 0, prev_position: 3 },
        { query: "utracona", cur_clicks: 0, cur_impressions: 0, cur_position: null, prev_clicks: 5, prev_impressions: 40, prev_position: null },
      ],
      error: null,
    };
    const [nowa, utracona] = await getQueryWindows("p1", w, 100);
    expect(nowa.prev).toEqual({ clicks: 0, impressions: 0, position: null });
    expect(nowa.cur.position).toBe(4);
    expect(utracona.cur.position).toBeNull();
    expect(utracona.prev).toEqual({ clicks: 5, impressions: 40, position: null });
    expect(calls.some((c) => c.includes('"p_limit":100'))).toBe(true);
  });
});

describe("getTopPages i getQueryPages", () => {
  it("top strony: limit domyślnie 10, liczby jako Number, pozycja null bez wyświetleń", async () => {
    rpcs.gsc_top_pages = { data: [{ page: "/a", clicks: "9", impressions: "100", position: "3.10" }, { page: "/b", clicks: 0, impressions: 0, position: null }], error: null };
    expect(await getTopPages("p1", "2026-10-04", "2026-10-31")).toEqual([
      { page: "/a", clicks: 9, impressions: 100, position: 3.1 },
      { page: "/b", clicks: 0, impressions: 0, position: null },
    ]);
    expect(calls).toContain('rpc.gsc_top_pages({"p_project":"p1","p_from":"2026-10-04","p_to":"2026-10-31","p_limit":10})');
  });

  it("fraza x strona: domyślny próg wyświetleń to THRESHOLDS.cannibalMinImpressions", async () => {
    rpcs.gsc_query_pages = { data: [{ query: "q", page: "/a", clicks: "1", impressions: "60", position: "5.00" }], error: null };
    expect(await getQueryPages("p1", "2026-10-04", "2026-10-31")).toEqual([{ query: "q", page: "/a", clicks: 1, impressions: 60, position: 5 }]);
    expect(calls).toContain('rpc.gsc_query_pages({"p_project":"p1","p_from":"2026-10-04","p_to":"2026-10-31","p_min_impressions":30})');
  });

  it("błąd bazy rzuca po polsku", async () => {
    rpcs.gsc_top_pages = { data: null, error: { message: "boom" } };
    await expect(getTopPages("p1", "a", "b")).rejects.toThrow("Nie udało się pobrać stron z Search Console: boom");
  });
});

describe("getSeoStatus", () => {
  it("ostatnia synchronizacja gsc_sync oraz wydatki SEO i AI w tym miesiącu", async () => {
    tables.seo_jobs = [{ id: "j1", kind: "gsc_sync", status: "done", error: null, cost_usd: "0.25", started_at: "2026-11-02T04:30:00Z" }];
    tables.runs = [{ cost_usd: "1.5", recommendations_cost_usd: "0.5" }, { cost_usd: "2", recommendations_cost_usd: null }];
    const s = await getSeoStatus("p1");
    expect(s.lastSync).toMatchObject({ id: "j1", status: "done" });
    expect(s.seoSpent).toBeCloseTo(0.25, 10);
    expect(s.aiSpent).toBeCloseTo(4, 10);
    expect(calls).toContain('seo_jobs.eq("kind","gsc_sync")');
    expect(calls).toContain('seo_jobs.order("started_at",{"ascending":false})');
  });

  it("bez zadań: lastSync null i zerowe wydatki", async () => {
    const s = await getSeoStatus("p2");
    expect(s).toEqual({ lastSync: null, seoSpent: 0, aiSpent: 0 });
  });
});
