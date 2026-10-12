import { describe, it, expect } from "vitest";
import { isRunStale } from "@/lib/runs/stale";

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
