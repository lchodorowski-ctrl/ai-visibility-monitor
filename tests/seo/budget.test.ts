import { describe, it, expect } from "vitest";
import { seoMonthSpend, decideSeoSpend } from "@/lib/seo/budget";

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
