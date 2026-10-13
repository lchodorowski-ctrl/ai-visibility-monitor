import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunStatus } from "@/components/RunStatus";
import type { Tables } from "@/lib/db-types";

const run = (over: Partial<Tables<"runs">>) => ({
  id: "r1", project_id: "p", status: "done", started_at: "2026-10-12T08:00:00Z", finished_at: "2026-10-12T08:05:00Z",
  queries_total: 1, queries_failed: 0, cost_usd: 0.5, error: null, ...over,
}) as Tables<"runs">;
const text = (r: Tables<"runs"> | null) => renderToStaticMarkup(<RunStatus run={r} />).replace(/<[^>]+>/g, "");

describe("RunStatus", () => {
  it("używa słowa „pomiar”, nie „run”", () => {
    expect(text(run({}))).toContain("Ostatni pomiar:");
    expect(text(run({}))).not.toMatch(/\brun\b/i);
  });
  it.each([
    [1, 0, "1 zapytanie", "0 błędów"],
    [3, 1, "3 zapytania", "1 błąd"],
    [5, 2, "5 zapytań", "2 błędy"],
    [12, 5, "12 zapytań", "5 błędów"],
    [22, 24, "22 zapytania", "24 błędy"],
  ])("odmienia %i zapytań i %i błędów", (total, failed, q, e) => {
    const t = text(run({ queries_total: total, queries_failed: failed }));
    expect(t).toContain(q);
    expect(t).toContain(e);
  });
  it("bez pomiaru pokazuje komunikat", () => {
    expect(text(null)).toBe("Jeszcze nie było żadnego pomiaru.");
  });
});
