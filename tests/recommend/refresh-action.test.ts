import { describe, it, expect, vi, beforeEach } from "vitest";

const { trigger, state } = vi.hoisted(() => ({
  trigger: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: "run_x" })),
  state: { running: [], latestDate: null, calls: [] } as { running: { status: string; started_at: string }[]; latestDate: string | null; calls: { table: string; filters: unknown[][] }[] },
}));

vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getCurrentProject: async () => ({ id: "proj-1", site_url: "https://psai.example" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: (table: string) => {
      const call = { table, filters: [] as unknown[][] };
      state.calls.push(call);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) b[m] = (...a: unknown[]) => { call.filters.push([m, ...a]); return b; };
      b.maybeSingle = async () => ({ data: state.latestDate ? { date: state.latestDate } : null, error: null });
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: state.running, error: null }).then(ok);
      return b;
    },
  }),
}));

import { refreshRecommendations } from "@/app/app/recommendations/actions";

describe("refreshRecommendations", () => {
  beforeEach(() => { trigger.mockClear(); state.running = []; state.latestDate = null; state.calls = []; });

  it("używa daty ostatniego snapshotu i klucza idempotencji z TTL 10 min", async () => {
    state.latestDate = "2026-10-11";
    await refreshRecommendations();
    expect(trigger).toHaveBeenCalledWith(
      "recommend-project",
      { projectId: "proj-1", runId: null, date: "2026-10-11" },
      { idempotencyKey: "recommend-refresh:proj-1:2026-10-11", idempotencyKeyTTL: "10m" },
    );
    const metrics = state.calls.find((c) => c.table === "daily_metrics")!;
    expect(metrics.filters).toContainEqual(["eq", "project_id", "proj-1"]);
    expect(metrics.filters).toContainEqual(["order", "date", { ascending: false }]);
  });

  it("bez metryk w ogóle bierze dzisiejszą datę (UTC)", async () => {
    await refreshRecommendations();
    const today = new Date().toISOString().slice(0, 10);
    expect(trigger).toHaveBeenCalledWith("recommend-project", expect.objectContaining({ date: today }), expect.objectContaining({ idempotencyKey: `recommend-refresh:proj-1:${today}` }));
  });

  it("nic nie zleca, gdy pomiar jest w toku", async () => {
    state.latestDate = "2026-10-11";
    state.running = [{ status: "running", started_at: new Date().toISOString() }];
    await refreshRecommendations();
    expect(trigger).not.toHaveBeenCalled();
  });

  it("zawieszony run (running starszy niż 60 min) nie blokuje odświeżenia", async () => {
    state.latestDate = "2026-10-11";
    state.running = [{ status: "running", started_at: new Date(Date.now() - 2 * 3_600_000).toISOString() }];
    await refreshRecommendations();
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
