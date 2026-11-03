import { describe, it, expect } from "vitest";
import { seoMonthSpend, decideSeoSpend, budgetExceededMessage, passSeoBudget } from "@/lib/seo/budget";
import { fakeAdmin as fakeLedger, type Call } from "./fake-admin";

function fakeAdmin(rows: unknown[], error: { message: string } | null = null) {
  const calls: { table: string; cols?: string; filters: unknown[][] } = { table: "", filters: [] };
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => { calls.cols = cols; return b; };
  b.eq = (...a: unknown[]) => { calls.filters.push(["eq", ...a]); return b; };
  b.gte = (...a: unknown[]) => { calls.filters.push(["gte", ...a]); return Promise.resolve({ data: error ? null : rows, error }); };
  return { client: { from: (t: string) => { calls.table = t; return b; } } as never, calls };
}

describe("seoMonthSpend", () => {
  it("sumuje cost_usd od początku miesiąca (także liczby jako tekst)", async () => {
    const { client, calls } = fakeAdmin([{ cost_usd: 1.25 }, { cost_usd: "0.7500" }]);
    const now = new Date("2026-11-15T10:00:00Z");
    expect(await seoMonthSpend(client, "proj", now)).toBeCloseTo(2.0);
    expect(calls.table).toBe("seo_jobs");
    expect(calls.cols).toBe("cost_usd");
    expect(calls.filters).toEqual([["eq", "project_id", "proj"], ["gte", "started_at", "2026-11-01T00:00:00.000Z"]]);
  });
  it("zwraca 0 bez zadań w miesiącu", async () => {
    const { client } = fakeAdmin([]);
    expect(await seoMonthSpend(client, "proj")).toBe(0);
  });
  it("rzuca przy błędzie zapytania", async () => {
    const { client } = fakeAdmin([], { message: "boom" });
    await expect(seoMonthSpend(client, "proj")).rejects.toThrow("boom");
  });
});

describe("decideSeoSpend", () => {
  it("odmawia, gdy wydane plus szacunek przekraczają budżet", () => {
    expect(decideSeoSpend(9.5, 0.6, 10)).toEqual({ kind: "budget_exceeded", spent: 9.5, estimate: 0.6 });
  });
  it("pozwala, gdy wydane plus szacunek mieszczą się w budżecie", () => {
    expect(decideSeoSpend(9.0, 0.6, 10)).toEqual({ kind: "go" });
  });
  it("pozwala dokładnie na granicy budżetu", () => {
    expect(decideSeoSpend(10, 0, 10)).toEqual({ kind: "go" });
  });
  it("NaN w dowolnym argumencie to budget_exceeded (brama zamknięta)", () => {
    expect(decideSeoSpend(NaN, 1, 10).kind).toBe("budget_exceeded");
    expect(decideSeoSpend(1, NaN, 10).kind).toBe("budget_exceeded");
    expect(decideSeoSpend(1, 1, NaN).kind).toBe("budget_exceeded");
  });
});

describe("budgetExceededMessage", () => {
  it("podaje wydane, budżet i szacunek z przecinkiem dziesiętnym", () => {
    expect(budgetExceededMessage(9.95, 0.101, 10)).toBe("Limit SEO: wydano 9,95 USD z 10,00 USD, to zadanie kosztuje ok. 0,10 USD");
  });
});

describe("passSeoBudget", () => {
  const NOW = new Date("2026-11-15T10:00:00Z");
  /** Rejestr zadań: wydane w miesiącu (`spent`) i potwierdzenie każdego zapisu zadania. */
  const ledger = (spent: number) => fakeLedger((c: Call) => (c.op === "select" ? { data: [{ cost_usd: spent }] } : { data: [{ id: "job-1" }] }));
  const updates = (calls: Call[]) => calls.filter((c) => c.table === "seo_jobs" && c.op === "update");

  it("passSeoBudget przy zgodzie rezerwuje szacunek w cost_usd", async () => {
    const { client, calls } = ledger(1);
    const ok = await passSeoBudget(client, { projectId: "proj", jobId: "job-1", estimate: 0.1, budget: 10, now: NOW });

    expect(ok).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["select", "update"]);
    expect(calls[0].filters).toContainEqual(["gte", "started_at", "2026-11-01T00:00:00.000Z"]);
    expect(updates(calls)).toHaveLength(1);
    expect(updates(calls)[0]).toMatchObject({ payload: { cost_usd: 0.1 }, filters: [["eq", "id", "job-1"]] });
  });

  it("passSeoBudget przy przekroczeniu zamyka job budget_exceeded i zwraca false", async () => {
    const { client, calls } = ledger(9.95);
    const ok = await passSeoBudget(client, { projectId: "proj", jobId: "job-1", estimate: 0.101, budget: 10, now: NOW });

    expect(ok).toBe(false);
    expect(updates(calls)).toHaveLength(1);
    const closing = updates(calls)[0].payload as Record<string, unknown>;
    expect(closing).toMatchObject({
      status: "budget_exceeded",
      error: "Limit SEO: wydano 9,95 USD z 10,00 USD, to zadanie kosztuje ok. 0,10 USD",
      stats: { spentUsd: 9.95, estimateUsd: 0.101, budgetUsd: 10 },
    });
    // brak rezerwacji: koszt zadania zostaje bez zmian
    expect(closing).not.toHaveProperty("cost_usd");
  });

  it("budżet równy wydanym plus szacunek jeszcze przepuszcza", async () => {
    const { client } = ledger(9.9);
    expect(await passSeoBudget(client, { projectId: "proj", jobId: "job-1", estimate: 0.1, budget: 10, now: NOW })).toBe(true);
  });

  it("brak liczbowego budżetu zamyka bramę (NaN) i nic nie rezerwuje", async () => {
    const { client, calls } = ledger(0);
    expect(await passSeoBudget(client, { projectId: "proj", jobId: "job-1", estimate: 0.1, budget: NaN, now: NOW })).toBe(false);
    expect(updates(calls)[0].payload).toMatchObject({ status: "budget_exceeded" });
    expect(updates(calls)[0].payload).not.toHaveProperty("cost_usd");
  });

  it("nieudana rezerwacja rzuca, więc płatne wywołanie się nie zacznie", async () => {
    const { client } = fakeLedger((c: Call) => (c.op === "select" ? { data: [{ cost_usd: 0 }] } : { error: { message: "ledger down" } }));
    await expect(passSeoBudget(client, { projectId: "proj", jobId: "job-1", estimate: 0.1, budget: 10, now: NOW })).rejects.toThrow("ledger down");
  });
});
