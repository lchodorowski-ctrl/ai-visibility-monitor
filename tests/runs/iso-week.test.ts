import { describe, it, expect } from "vitest";
import { isoWeekKey } from "@/lib/runs/iso-week";

describe("isoWeekKey", () => {
  it("zwykły tydzień", () => expect(isoWeekKey(new Date("2026-10-12T05:00:00Z"))).toBe("2026-W42"));
  it("granica roku: 1 stycznia 2027 to tydzień 53 roku 2026", () => {
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});
