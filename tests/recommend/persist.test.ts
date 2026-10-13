import { describe, it, expect } from "vitest";
import { upsertRecommendations } from "@/lib/recommend/persist";
import { fingerprint } from "@/lib/recommend/fingerprint";
function fakeAdmin(existing: Record<string, { id: string; evidence: unknown; status: string; impact: number; effort: number }>) {
  const inserted: unknown[] = []; const updated: { id: string; patch: Record<string, unknown> }[] = [];
  const api = (table: string) => {
    const q: Record<string, unknown> = {}; let fp = "";
    q.select = () => q; q.eq = (col: string, v: string) => { if (col === "fingerprint") fp = v; return q; };
    q.maybeSingle = async () => ({ data: existing[fp] ?? null, error: null });
    q.insert = (rows: unknown) => { inserted.push(rows); return { then: (r: (v: unknown) => void) => r({ error: null }) }; };
    q.update = (patch: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { updated.push({ id, patch }); return { then: (r: (v: unknown) => void) => r({ error: null }) }; } });
    return table === "recommendations" ? q : q;
  };
  return { client: { from: api } as never, inserted, updated };
}
const item = { type: "offsite" as const, title: "Zgłoś się do rankingu PARP", summary: "s".repeat(30), action_steps: ["a", "b"], target_url: "https://parp.gov.pl/x", suggested_outline: null, impact: 4, effort: 2, rationale_pl: "r".repeat(20) };
const ev = { prompt_ids: ["p1"], visibility_by_engine: {}, cited_domains: [{ domain: "parp.gov.pl", count: 1 }], cited_urls: [], competitors_mentioned: [], sample_quotes: [] };
describe("upsertRecommendations", () => {
  it("wstawia nową rekomendację z fingerprintem", async () => {
    const { client, inserted } = fakeAdmin({});
    const r = await upsertRecommendations(client, "proj", "run", "p1", [item], ev);
    expect(r).toEqual({ inserted: 1, merged: 0 });
    expect((inserted[0] as { fingerprint: string }).fingerprint).toBe(fingerprint("offsite", item.title));
    expect((inserted[0] as { rationale: string }).rationale).toBe(item.rationale_pl);
  });
  it("scala z istniejącą: łączy evidence, zachowuje status, bierze max impact/effort", async () => {
    const fp = fingerprint("offsite", item.title);
    const { client, updated } = fakeAdmin({ [fp]: { id: "r1", evidence: { ...ev, prompt_ids: ["p0"] }, status: "done", impact: 2, effort: 5 } });
    const r = await upsertRecommendations(client, "proj", "run", "p1", [item], ev);
    expect(r).toEqual({ inserted: 0, merged: 1 });
    expect(updated[0].id).toBe("r1");
    expect((updated[0].patch.evidence as { prompt_ids: string[] }).prompt_ids).toEqual(["p0", "p1"]);
    expect(updated[0].patch.status).toBeUndefined();
    expect(updated[0].patch.rationale).toBe(item.rationale_pl);
    expect(updated[0].patch.impact).toBe(4); expect(updated[0].patch.effort).toBe(5);
  });
});
