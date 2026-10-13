import { describe, it, expect } from "vitest";
import { selectPrompts } from "@/lib/calibration/select";

const p = (id: string, is_key: boolean, created_at = "2026-10-01T00:00:00Z") => ({ id, is_key, created_at });

describe("selectPrompts", () => {
  it("kluczowe najpierw, uzupełnienie do n deterministycznie przy rng", () => {
    const list = [p("a", false), p("k1", true), p("b", false), p("k2", true), p("c", false)];
    const out = selectPrompts(list, 3, () => 0);
    expect(out.map((x) => x.id).slice(0, 2)).toEqual(["k1", "k2"]);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((x) => x.id)).size).toBe(3);
  });
  it("więcej kluczowych niż n → pierwsze n wg created_at", () => {
    const list = [p("k3", true, "2026-10-03T00:00:00Z"), p("k1", true, "2026-10-01T00:00:00Z"), p("k2", true, "2026-10-02T00:00:00Z")];
    expect(selectPrompts(list, 2).map((x) => x.id)).toEqual(["k1", "k2"]);
  });
  it("mniej pytań niż n → wszystkie", () => {
    expect(selectPrompts([p("a", false), p("b", true)], 10)).toHaveLength(2);
  });
});
