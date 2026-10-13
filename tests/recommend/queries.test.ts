import { describe, it, expect } from "vitest";
import { applyFilters, countByPrompt, recommendationPromptIds, summarizeOpen } from "@/lib/recommend/queries";
const r = (id: string, status: string, type: string, prompt_id: string | null, evidence: unknown = {}) => ({ id, status, type, prompt_id, evidence, priority: 5 }) as never;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
describe("applyFilters", () => {
  const rows = [r("a", "todo", "offsite", "p1"), r("b", "done", "offsite", "p1"), r("c", "doing", "technical", null), r("d", "dismissed", "content_new", "p2")];
  it("domyślnie otwarte (todo|doing)", () => expect(ids(applyFilters(rows, {}))).toEqual(["a", "c"]));
  it("status done", () => expect(ids(applyFilters(rows, { status: "done" }))).toEqual(["b"]));
  it("typ + prompt", () => expect(ids(applyFilters(rows, { status: "open", type: "offsite", prompt: "p1" }))).toEqual(["a"]));
  it("filtr pytania obejmuje rekomendacje scalone z innego pytania (evidence.prompt_ids)", () => {
    const merged = [
      r("m", "todo", "offsite", "p1", { prompt_ids: ["p1", "p2"] }),
      r("t", "todo", "technical", null, { prompt_ids: ["p2"] }),
      r("x", "todo", "offsite", "p3", { prompt_ids: ["p3"] }),
      r("bad", "todo", "offsite", "p4", { prompt_ids: "p2" }),
    ];
    expect(ids(applyFilters(merged, { prompt: "p2" }))).toEqual(["m", "t"]);
    expect(ids(applyFilters(merged, { prompt: "p1" }))).toEqual(["m"]);
  });
});
describe("countByPrompt", () => {
  it("liczy rekomendację raz dla każdego pytania z prompt_id ∪ evidence.prompt_ids", () => {
    expect(countByPrompt([
      { prompt_id: "p1", evidence: { prompt_ids: ["p1", "p2"] } },
      { prompt_id: "p2", evidence: { prompt_ids: ["p2"] } },
      { prompt_id: null, evidence: { prompt_ids: ["p3"] } },
      { prompt_id: null, evidence: { prompt_ids: [] } },
      { prompt_id: "p4", evidence: null },
    ])).toEqual({ p1: 1, p2: 2, p3: 1, p4: 1 });
  });
  it("recommendationPromptIds ignoruje śmieci w evidence", () => {
    expect(recommendationPromptIds({ prompt_id: "p1", evidence: { prompt_ids: ["p1", 7, null, "p2"] } })).toEqual(["p1", "p2"]);
    expect(recommendationPromptIds({ prompt_id: null, evidence: [] })).toEqual([]);
  });
});

describe("summarizeOpen", () => {
  const row = (status: string, updated_at: string) => ({ status, updated_at });
  it("liczy tylko todo|doing i bierze najnowszą datę zmiany spośród nich", () => {
    expect(summarizeOpen([
      row("todo", "2026-10-10T08:00:00Z"), row("doing", "2026-10-12T08:00:00Z"),
      row("done", "2026-10-13T08:00:00Z"), row("dismissed", "2026-10-14T08:00:00Z"),
    ])).toEqual({ count: 2, lastUpdated: "2026-10-12T08:00:00Z" });
  });
  it("brak otwartych: 0 i null", () => {
    expect(summarizeOpen([])).toEqual({ count: 0, lastUpdated: null });
    expect(summarizeOpen([row("done", "2026-10-13T08:00:00Z")])).toEqual({ count: 0, lastUpdated: null });
  });
});
