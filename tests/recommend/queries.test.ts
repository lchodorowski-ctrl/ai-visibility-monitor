import { describe, it, expect } from "vitest";
import { applyFilters } from "@/lib/recommend/queries";
const r = (id: string, status: string, type: string, prompt_id: string | null) => ({ id, status, type, prompt_id, priority: 5 }) as never;
describe("applyFilters", () => {
  const rows = [r("a", "todo", "offsite", "p1"), r("b", "done", "offsite", "p1"), r("c", "doing", "technical", null), r("d", "dismissed", "content_new", "p2")];
  it("domyślnie otwarte (todo|doing)", () => expect(applyFilters(rows, {}).map((x: { id: string }) => x.id)).toEqual(["a", "c"]));
  it("status done", () => expect(applyFilters(rows, { status: "done" }).map((x: { id: string }) => x.id)).toEqual(["b"]));
  it("typ + prompt", () => expect(applyFilters(rows, { status: "open", type: "offsite", prompt: "p1" }).map((x: { id: string }) => x.id)).toEqual(["a"]));
});
