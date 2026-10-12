import { describe, it, expect } from "vitest";
import { decideRun } from "@/lib/runs/guard";

describe("decideRun", () => {
  it("empty bez zadań", () => expect(decideRun(0, 0, 0, 30).kind).toBe("empty"));
  it("budget_exceeded gdy wydatki + szacunek > budżet", () => expect(decideRun(10, 29.5, 1, 30).kind).toBe("budget_exceeded"));
  it("go gdy wydatki + szacunek == budżet (granica)", () => expect(decideRun(10, 29, 1, 30).kind).toBe("go"));
  it("go gdy mieści się w budżecie", () => expect(decideRun(10, 10, 1, 30).kind).toBe("go"));
});
