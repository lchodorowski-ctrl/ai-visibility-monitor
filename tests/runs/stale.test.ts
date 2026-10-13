import { describe, it, expect } from "vitest";
import { isRunStale, isRunInFlight, RECOMMEND_TTL_MINUTES } from "@/lib/runs/stale";

const now = new Date("2026-10-12T12:00:00Z");

describe("isRunStale", () => {
  it("running starszy niż 60 minut jest przeterminowany", () => {
    expect(isRunStale({ status: "running", started_at: "2026-10-12T10:59:00Z" }, now)).toBe(true);
  });
  it("świeży running oraz zakończony run nie są przeterminowane", () => {
    expect(isRunStale({ status: "running", started_at: "2026-10-12T11:30:00Z" }, now)).toBe(false);
    expect(isRunStale({ status: "done", started_at: "2026-10-12T08:00:00Z" }, now)).toBe(false);
  });
});

describe("isRunInFlight", () => {
  const r = (over: Partial<{ status: string; stage: string; started_at: string; finished_at: string | null }>) =>
    ({ status: "running", stage: "queries", started_at: "2026-10-12T11:30:00Z", finished_at: null, ...over });
  it("running jest w toku, chyba że przeterminowany", () => {
    expect(isRunInFlight(r({}), now)).toBe(true);
    expect(isRunInFlight(r({ started_at: "2026-10-12T10:00:00Z" }), now)).toBe(false);
  });
  it("done z niezamkniętym etapem jest w toku przez 45 minut od zakończenia", () => {
    const done = (finished_at: string | null, stage = "recommending") => r({ status: "done", stage, finished_at });
    expect(isRunInFlight(done("2026-10-12T11:50:00Z"), now)).toBe(true);
    expect(isRunInFlight(done("2026-10-12T11:50:00Z", "aggregating"), now)).toBe(true);
    expect(isRunInFlight(done(new Date(now.getTime() - RECOMMEND_TTL_MINUTES * 60_000).toISOString()), now)).toBe(true);
    expect(isRunInFlight(done(new Date(now.getTime() - (RECOMMEND_TTL_MINUTES * 60 + 1) * 1000).toISOString()), now)).toBe(false);
    expect(isRunInFlight(done(null), now)).toBe(false);
  });
  it("done z zamkniętym etapem oraz failed/empty/budget_exceeded nigdy nie są w toku", () => {
    expect(isRunInFlight(r({ status: "done", stage: "done", finished_at: "2026-10-12T11:59:00Z" }), now)).toBe(false);
    for (const status of ["failed", "empty", "budget_exceeded"]) {
      expect(isRunInFlight(r({ status, stage: "recommending", finished_at: "2026-10-12T11:59:00Z" }), now)).toBe(false);
    }
  });
});
