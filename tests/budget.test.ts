import { describe, it, expect } from "vitest";
import { monthStartIso } from "@/lib/budget";

describe("monthStartIso", () => {
  it("zwraca pierwszy dzień miesiąca w UTC", () => {
    expect(monthStartIso(new Date("2026-10-12T15:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});
