import { describe, it, expect } from "vitest";
import { startJob, finishJob } from "@/lib/seo/jobs";

describe("startJob", () => {
  it("wstawia running i zwraca id", async () => {
    const calls: { table: string; insert?: unknown; cols?: string } = { table: "" };
    const b: Record<string, unknown> = {};
    b.insert = (row: unknown) => { calls.insert = row; return b; };
    b.select = (cols: string) => { calls.cols = cols; return b; };
    b.single = () => Promise.resolve({ data: { id: "job-1" }, error: null });
    const admin = { from: (t: string) => { calls.table = t; return b; } } as never;

    expect(await startJob(admin, "proj", "gsc_sync")).toBe("job-1");
    expect(calls.table).toBe("seo_jobs");
    expect(calls.insert).toEqual({ project_id: "proj", kind: "gsc_sync", status: "running" });
    expect(calls.cols).toBe("id");
  });
  it("rzuca przy błędzie wstawiania", async () => {
    const b: Record<string, unknown> = {};
    b.insert = () => b;
    b.select = () => b;
    b.single = () => Promise.resolve({ data: null, error: { message: "boom" } });
    const admin = { from: () => b } as never;
    await expect(startJob(admin, "proj", "rank_check")).rejects.toThrow("boom");
  });
});

describe("finishJob", () => {
  function fakeUpdateAdmin(opts: { error?: { message: string } | null; rows?: { id: string }[] } = {}) {
    const calls: { table: string; update?: Record<string, unknown>; filters: unknown[][]; cols?: string } = { table: "", filters: [] };
    const b: Record<string, unknown> = {};
    b.update = (patch: Record<string, unknown>) => { calls.update = patch; return b; };
    b.eq = (...a: unknown[]) => { calls.filters.push(["eq", ...a]); return b; };
    b.select = (cols: string) => {
      calls.cols = cols;
      const error = opts.error ?? null;
      return Promise.resolve({ data: error ? null : (opts.rows ?? [{ id: "job" }]), error });
    };
    return { client: { from: (t: string) => { calls.table = t; return b; } } as never, calls };
  }

  it("zapisuje status, koszt, statystyki i finished_at", async () => {
    const { client, calls } = fakeUpdateAdmin();
    await finishJob(client, "job-1", { status: "done", costUsd: 0.42, stats: { rows: 12 } });
    expect(calls.table).toBe("seo_jobs");
    expect(calls.filters).toEqual([["eq", "id", "job-1"]]);
    expect(calls.cols).toBe("id");
    expect(calls.update).toMatchObject({ status: "done", cost_usd: 0.42, stats: { rows: 12 }, error: null });
    expect(new Date(calls.update!.finished_at as string).toISOString()).toBe(calls.update!.finished_at);
  });
  it("zapisuje błąd i domyślne statystyki", async () => {
    const { client, calls } = fakeUpdateAdmin();
    await finishJob(client, "job-2", { status: "failed", error: "GSC 403" });
    expect(calls.update).toMatchObject({ status: "failed", stats: {}, error: "GSC 403" });
  });
  it("finishJob bez costUsd nie wysyła cost_usd", async () => {
    const { client, calls } = fakeUpdateAdmin();
    await finishJob(client, "job-2", { status: "failed", error: "GSC 403" });
    expect(calls.update).not.toHaveProperty("cost_usd");
  });
  it("zapisuje jawne costUsd równe 0", async () => {
    const { client, calls } = fakeUpdateAdmin();
    await finishJob(client, "job-2", { status: "done", costUsd: 0 });
    expect(calls.update).toHaveProperty("cost_usd", 0);
  });
  it("rzuca przy błędzie zapisu", async () => {
    const { client } = fakeUpdateAdmin({ error: { message: "boom" } });
    await expect(finishJob(client, "job-3", { status: "done" })).rejects.toThrow("boom");
  });
  it("finishJob dla nieznanego id rzuca", async () => {
    const { client } = fakeUpdateAdmin({ rows: [] });
    await expect(finishJob(client, "job-x", { status: "done" })).rejects.toThrow("seo_jobs: brak zadania job-x");
  });
});
