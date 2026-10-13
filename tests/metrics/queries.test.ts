import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
type Result = { data: unknown[] | null; error: { message: string } | null };
// Domyślnie każda tabela zwraca swoje wiersze; testy mogą nadpisać odpowiedź (błąd, strony).
let respond: (table: string, rangeFrom: number | null) => Result;

const metricRow = { date: "2026-10-12", engine_id: null, prompt_id: null, responses_count: 10, visibility_rate: "0.2", avg_position: null, citation_rate: "0.1", share_of_voice: "0.5", score: 30 };
const defaults: Record<string, unknown[]> = { daily_metrics: [metricRow], runs: [{ id: "r1", project_id: "p1", status: "done" }], mentions: [{ brand_name: "PSAI" }] };

function table(name: string) {
  let rangeFrom: number | null = null;
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "order", "limit", "gte", "range"]) {
    api[m] = (...a: unknown[]) => {
      calls.push(`${name}.${m}(${a.map(String).join(",")})`);
      if (m === "range") rangeFrom = a[0] as number;
      return api;
    };
  }
  api.maybeSingle = async () => { const r = respond(name, rangeFrom); return { data: r.data?.[0] ?? null, error: r.error }; };
  api.then = (res: (v: unknown) => void) => res(respond(name, rangeFrom));
  return api;
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (n: string) => table(n) }) }));
// Bez kontekstu renderu React.cache nie deduplikuje; testy sprawdzają zapytania, nie pamięć podręczną.

beforeEach(() => {
  calls.length = 0;
  respond = (name) => ({ data: defaults[name], error: null });
});

describe("queries", () => {
  it("getTrend ogranicza zakres dat (gte), sortuje po dacie i filtruje po projekcie", async () => {
    const { getTrend } = await import("@/lib/metrics/queries");
    const t = await getTrend("p1", 90);
    expect(t).toEqual([{ date: "2026-10-12", score: 30, visibilityRate: 0.2 }]);
    expect(calls.some((c) => c.startsWith("daily_metrics.gte(date,"))).toBe(true);
    expect(calls).toContain("daily_metrics.order(date)");
    expect(calls).toContain("daily_metrics.eq(project_id,p1)");
  });

  it("getLatestMetrics zwraca overall i byEngine", async () => {
    const { getLatestMetrics } = await import("@/lib/metrics/queries");
    const m = await getLatestMetrics("p2");
    expect(m.latest?.score).toBe(30);
    expect(m.byEngine).toEqual([]);
  });

  it("getMentionCounts filtruje po runie i projekcie", async () => {
    const { getMentionCounts } = await import("@/lib/metrics/queries");
    const c = await getMentionCounts("p3", "run-xyz");
    expect(c).toEqual([{ name: "PSAI", mentions: 1 }]);
    expect(calls).toContain("mentions.eq(responses.run_id,run-xyz)");
    expect(calls).toContain("mentions.eq(project_id,p3)");
  });

  it("getMentionCounts pobiera strony po 1000 aż do niepełnej strony", async () => {
    const full = Array.from({ length: 1000 }, () => ({ brand_name: "PSAI" }));
    respond = (_n, from) => ({ data: from === 0 ? full : [{ brand_name: "PSAI" }, { brand_name: "Inna" }], error: null });
    const { getMentionCounts } = await import("@/lib/metrics/queries");
    const c = await getMentionCounts("p4", "run-paged");
    expect(c).toEqual([{ name: "PSAI", mentions: 1001 }, { name: "Inna", mentions: 1 }]);
    expect(calls).toContain("mentions.range(0,999)");
    expect(calls).toContain("mentions.range(1000,1999)");
    expect(calls.filter((x) => x.startsWith("mentions.range(")).length).toBe(2);
  });

  it("getMentionCounts rzuca błąd także z drugiej strony", async () => {
    const full = Array.from({ length: 1000 }, () => ({ brand_name: "PSAI" }));
    respond = (_n, from) => from === 0 ? { data: full, error: null } : { data: null, error: { message: "page2 fail" } };
    const { getMentionCounts } = await import("@/lib/metrics/queries");
    await expect(getMentionCounts("p5", "run-err2")).rejects.toThrow("page2 fail");
  });

  it("getLatestCells dzieli wiersze na komórki silników i łączny wiersz pytania; liczby jako Number; rzuca na błędzie", async () => {
    respond = (name) => ({ data: name === "daily_metrics" ? [
      { date: "2026-10-12", engine_id: "openai", prompt_id: "q1", visibility_rate: "0.5" },
      { date: "2026-10-12", engine_id: null, prompt_id: "q1", visibility_rate: "0.8" },
    ] : [], error: null });
    const { getLatestCells } = await import("@/lib/metrics/queries");
    const r = await getLatestCells("c1");
    expect(r.cells).toEqual([{ engine_id: "openai", prompt_id: "q1", visibility_rate: 0.5 }]);
    expect(r.overall).toEqual(new Map([["q1", 0.8]]));
    expect(calls).toContain("daily_metrics.eq(date,2026-10-12)");
    respond = () => ({ data: null, error: { message: "cells down" } });
    await expect(getLatestCells("c2")).rejects.toThrow("cells down");
  });

  it("getLatestCells bez pomiarów zwraca puste dane", async () => {
    respond = () => ({ data: [], error: null });
    const { getLatestCells } = await import("@/lib/metrics/queries");
    const r = await getLatestCells("c3");
    expect(r.cells).toEqual([]); expect(r.overall.size).toBe(0);
  });

  it("każda funkcja rzuca, gdy Supabase zwraca błąd", async () => {
    respond = () => ({ data: null, error: { message: "db down" } });
    const q = await import("@/lib/metrics/queries");
    await expect(q.getLatestMetrics("e1")).rejects.toThrow("db down");
    await expect(q.getTrend("e2", 30)).rejects.toThrow("db down");
    await expect(q.getLastRun("e3")).rejects.toThrow("db down");
    await expect(q.getMentionCounts("e4", "r")).rejects.toThrow("db down");
  });

  it("getOverview składa wyniki wszystkich zapytań", async () => {
    const { getOverview } = await import("@/lib/metrics/queries");
    const o = await getOverview({} as never, "p6");
    expect(o.latest?.score).toBe(30);
    expect(o.byEngine).toEqual([]);
    expect(o.trend).toEqual([{ date: "2026-10-12", score: 30, visibilityRate: 0.2 }]);
    expect(o.lastRun).toMatchObject({ id: "r1" });
    expect(o.competitors).toEqual([{ name: "PSAI", mentions: 1 }]);
    expect(calls).toContain("mentions.eq(responses.run_id,r1)");
  });

  it("getOverview bez runu nie pyta o wzmianki", async () => {
    respond = (name) => ({ data: name === "runs" ? [] : defaults[name], error: null });
    const { getOverview } = await import("@/lib/metrics/queries");
    const o = await getOverview({} as never, "p7");
    expect(o.lastRun).toBeNull();
    expect(o.competitors).toEqual([]);
    expect(calls.some((c) => c.startsWith("mentions."))).toBe(false);
  });
});
