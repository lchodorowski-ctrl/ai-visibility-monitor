import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
function table(name: string, rows: unknown[]) {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "order", "limit", "gte"]) api[m] = (...a: unknown[]) => { calls.push(`${name}.${m}(${a.map(String).join(",")})`); return api; };
  api.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  api.then = (res: (v: unknown) => void) => res({ data: rows, error: null });
  return api;
}
const rows = { daily_metrics: [{ date: "2026-10-12", engine_id: null, prompt_id: null, responses_count: 10, visibility_rate: "0.2", avg_position: null, citation_rate: "0.1", share_of_voice: "0.5", score: 30 }], runs: [], mentions: [] };
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (n: keyof typeof rows) => table(n, rows[n]) }) }));

describe("queries", () => {
  it("getTrend ogranicza zakres dat (gte) i sortuje po dacie", async () => {
    const { getTrend } = await import("@/lib/metrics/queries");
    const t = await getTrend("p1", 90);
    expect(t).toEqual([{ date: "2026-10-12", score: 30, visibilityRate: 0.2 }]);
    expect(calls.some((c) => c.startsWith("daily_metrics.gte(date,"))).toBe(true);
  });
  it("getLatestMetrics zwraca overall i byEngine", async () => {
    const { getLatestMetrics } = await import("@/lib/metrics/queries");
    const m = await getLatestMetrics("p1");
    expect(m.latest?.score).toBe(30);
    expect(m.byEngine).toEqual([]);
  });
});
