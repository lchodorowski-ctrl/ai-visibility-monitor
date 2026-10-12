import { describe, it, expect } from "vitest";
import { tallyBatch } from "@/lib/runs/tally";

describe("tallyBatch", () => {
  it("sumuje koszt i liczy nieudane (output.ok false oraz child failed)", () => {
    const out = tallyBatch([
      { ok: true, output: { ok: true, costUsd: 0.5 } },
      { ok: true, output: { ok: false, costUsd: 0 } },
      { ok: false },
      { ok: true, output: { ok: true, costUsd: 0.25 } },
    ]);
    expect(out).toEqual({ cost: 0.75, failed: 2 });
  });
  it("pusta lista → zera", () => {
    expect(tallyBatch([])).toEqual({ cost: 0, failed: 0 });
  });
});
