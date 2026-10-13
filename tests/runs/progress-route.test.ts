import { describe, it, expect, vi, beforeEach } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    run: null as { status: string; stage: string; queries_total: number } | null,
    count: 0, runError: null as { message: string } | null, countError: null as { message: string } | null,
    calls: [] as { table: string; filters: unknown[][]; select?: unknown[] }[],
  },
}));

vi.mock("@/lib/workspace", () => ({ getCurrentProject: async () => ({ id: "proj-1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: (table: string) => {
      const call = { table, filters: [] as unknown[][], select: undefined as unknown[] | undefined };
      state.calls.push(call);
      const b: Record<string, unknown> = {};
      b.select = (...a: unknown[]) => { call.select = a; return b; };
      b.eq = (...a: unknown[]) => { call.filters.push(["eq", ...a]); return b; };
      b.maybeSingle = async () => ({ data: state.run, error: state.runError });
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ count: state.count, error: state.countError }).then(ok);
      return b;
    },
  }),
}));

import { GET } from "@/app/api/runs/[id]/progress/route";

const ID = "7d6f0f5e-6b7a-4f0e-9d3a-2d1f6a7b8c9d";
const call = (id: string) => GET(new Request("http://x"), { params: Promise.resolve({ id }) });

describe("GET /api/runs/[id]/progress", () => {
  beforeEach(() => { state.run = { status: "running", stage: "queries", queries_total: 8 }; state.count = 3; state.runError = null; state.countError = null; state.calls = []; });

  it("zwraca status, etap i postęp, bez cache", async () => {
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "running", stage: "queries", done: 3, total: 8, percent: 38 });
  });

  it("zawęża run do projektu i liczy odpowiedzi tego runu (count head)", async () => {
    await call(ID);
    const runs = state.calls.find((c) => c.table === "runs")!;
    expect(runs.filters).toContainEqual(["eq", "id", ID]);
    expect(runs.filters).toContainEqual(["eq", "project_id", "proj-1"]);
    const responses = state.calls.find((c) => c.table === "responses")!;
    expect(responses.select).toEqual(["id", { count: "exact", head: true }]);
    expect(responses.filters).toContainEqual(["eq", "run_id", ID]);
  });

  it("zerowa liczba zapytań daje 0%", async () => {
    state.run = { status: "empty", stage: "done", queries_total: 0 }; state.count = 0;
    expect(await (await call(ID)).json()).toMatchObject({ done: 0, total: 0, percent: 0 });
  });

  it("niepoprawne id → 404 bez zapytań do bazy", async () => {
    const res = await call("nie-uuid");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(state.calls).toEqual([]);
  });

  it("nieznany lub cudzy run (RLS) → 404", async () => {
    state.run = null;
    const res = await call(ID);
    expect(res.status).toBe(404);
    expect(state.calls.some((c) => c.table === "responses")).toBe(false);
  });

  it("błąd bazy → 500", async () => {
    state.runError = { message: "boom" };
    expect((await call(ID)).status).toBe(500);
    state.runError = null; state.countError = { message: "boom" };
    expect((await call(ID)).status).toBe(500);
  });
});
