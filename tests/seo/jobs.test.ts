import { describe, it, expect, vi, afterEach } from "vitest";
import { startJob, finishJob, reserveJobCost, failJob, errorMessage } from "@/lib/seo/jobs";
import { fakeAdmin, jobUpdate } from "./fake-admin";

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

describe("errorMessage", () => {
  it("komunikat błędu, a dla innych wartości ich tekst", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("tekst")).toBe("tekst");
    expect(errorMessage(42)).toBe("42");
  });
});

describe("reserveJobCost", () => {
  it("zapisuje w zadaniu samą kwotę cost_usd, bez ruszania statusu", async () => {
    const { client, calls } = fakeAdmin(() => ({ data: [{ id: "job-1" }] }));
    await reserveJobCost(client, "job-1", 0.1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "seo_jobs", op: "update", payload: { cost_usd: 0.1 }, filters: [["eq", "id", "job-1"]] });
  });
  it("rzuca przy błędzie zapisu", async () => {
    const { client } = fakeAdmin(() => ({ error: { message: "boom" } }));
    await expect(reserveJobCost(client, "job-1", 0.1)).rejects.toThrow("boom");
  });
  it("rzuca, gdy zadanie nie istnieje (rezerwacja nie jest widoczna dla innych)", async () => {
    const { client } = fakeAdmin(() => ({ data: [] }));
    await expect(reserveJobCost(client, "job-x", 0.1)).rejects.toThrow("seo_jobs: brak zadania job-x");
  });
});

describe("failJob", () => {
  afterEach(() => vi.restoreAllMocks());

  it("zamyka zadanie jako failed z komunikatem błędu i kosztem", async () => {
    const { client, calls } = fakeAdmin(() => ({ data: [{ id: "job-1" }] }));
    await failJob(client, "job-1", new Error("DataForSEO 40501"), 0.09, "keyword-volumes");
    expect(jobUpdate(calls)).toMatchObject({ status: "failed", error: "DataForSEO 40501", cost_usd: 0.09 });
    expect(calls[0].filters).toEqual([["eq", "id", "job-1"]]);
  });
  it("failJob nie rzuca, gdy zapis rejestru się nie uda, tylko loguje z etykietą", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeAdmin(() => ({ error: { message: "ledger down" } }));
    await expect(failJob(client, "job-1", new Error("pierwotny błąd"), 0, "keyword-volumes")).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("keyword-volumes: nie udało się zamknąć zadania w rejestrze:", "ledger down");
  });
});
