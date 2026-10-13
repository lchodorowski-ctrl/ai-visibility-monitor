import { describe, it, expect } from "vitest";
import { monthStartIso, monthSpend } from "@/lib/budget";

describe("monthStartIso", () => {
  it("zwraca pierwszy dzień miesiąca w UTC", () => {
    expect(monthStartIso(new Date("2026-10-12T15:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});

function fakeAdmin(rows: unknown[], error: { message: string } | null = null) {
  const calls: { table: string; cols?: string; filters: unknown[][] } = { table: "", filters: [] };
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => { calls.cols = cols; return b; };
  b.eq = (...a: unknown[]) => { calls.filters.push(["eq", ...a]); return b; };
  b.gte = (...a: unknown[]) => { calls.filters.push(["gte", ...a]); return Promise.resolve({ data: error ? null : rows, error }); };
  return { client: { from: (t: string) => { calls.table = t; return b; } } as never, calls };
}

describe("monthSpend", () => {
  it("sumuje koszt zapytań i koszt rekomendacji (także liczby jako tekst)", async () => {
    const { client, calls } = fakeAdmin([
      { cost_usd: 1.5, recommendations_cost_usd: 0.25 },
      { cost_usd: "2.0000", recommendations_cost_usd: "0.7500" },
    ]);
    const now = new Date("2026-10-13T10:00:00Z");
    expect(await monthSpend(client, "proj", now)).toBeCloseTo(4.5);
    expect(calls.table).toBe("runs");
    expect(calls.cols).toContain("recommendations_cost_usd");
    expect(calls.filters).toEqual([["eq", "project_id", "proj"], ["gte", "started_at", "2026-10-01T00:00:00.000Z"]]);
  });
  it("rzuca przy błędzie zapytania", async () => {
    const { client } = fakeAdmin([], { message: "boom" });
    await expect(monthSpend(client, "proj")).rejects.toThrow("boom");
  });
});
