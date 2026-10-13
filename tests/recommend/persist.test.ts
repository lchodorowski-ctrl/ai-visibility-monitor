import { describe, it, expect } from "vitest";
import { upsertRecommendations } from "@/lib/recommend/persist";
import { fingerprintFor } from "@/lib/recommend/fingerprint";
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
    expect((inserted[0] as { fingerprint: string }).fingerprint).toBe(fingerprintFor(item));
    expect((inserted[0] as { rationale: string }).rationale).toBe(item.rationale_pl);
  });
  it("scala z istniejącą: łączy evidence, zachowuje status, bierze max impact/effort", async () => {
    const fp = fingerprintFor(item);
    const { client, updated } = fakeAdmin({ [fp]: { id: "r1", evidence: { ...ev, prompt_ids: ["p0"] }, status: "done", impact: 2, effort: 5 } });
    const r = await upsertRecommendations(client, "proj", "run", "p1", [item], ev);
    expect(r).toEqual({ inserted: 0, merged: 1 });
    expect(updated[0].id).toBe("r1");
    expect((updated[0].patch.evidence as { prompt_ids: string[] }).prompt_ids).toEqual(["p0", "p1"]);
    expect(updated[0].patch.status).toBeUndefined();
    expect(updated[0].patch.rationale).toBe(item.rationale_pl);
    expect(updated[0].patch.impact).toBe(4); expect(updated[0].patch.effort).toBe(5);
  });
  it("ten sam host offsite pod innym tytułem i ścieżką scala się w jeden wiersz; wyższy impact podmienia tytuł", async () => {
    const other = { ...item, title: "Wpis w innej podstronie", target_url: "https://www.parp.gov.pl/inna/sciezka?id=2", suggested_outline: { h1: "Nowy" } as never, impact: 5 };
    expect(fingerprintFor(other)).toBe(fingerprintFor(item));
    const { client, updated, inserted } = fakeAdmin({ [fingerprintFor(item)]: { id: "r1", evidence: ev, status: "todo", impact: 4, effort: 2 } });
    const r = await upsertRecommendations(client, "proj", "run", "p1", [other], ev);
    expect(r).toEqual({ inserted: 0, merged: 1 });
    expect(inserted).toHaveLength(0);
    expect(updated[0].patch.title).toBe(other.title);
    expect(updated[0].patch.target_url).toBe(other.target_url);
    expect(updated[0].patch.suggested_outline).toEqual(other.suggested_outline);
    expect(updated[0].patch.impact).toBe(5);
  });
  it("niższy lub równy impact zachowuje istniejący tytuł, podsumowanie i kroki", async () => {
    const other = { ...item, title: "Inny tytuł tego samego celu", impact: 4 };
    const { client, updated } = fakeAdmin({ [fingerprintFor(item)]: { id: "r1", evidence: ev, status: "todo", impact: 4, effort: 2 } });
    await upsertRecommendations(client, "proj", "run", "p1", [other], ev);
    for (const k of ["title", "summary", "rationale", "action_steps", "target_url", "suggested_outline"]) expect(updated[0].patch[k]).toBeUndefined();
    expect(updated[0].patch.impact).toBe(4);
  });
  it("technical bez wspólnego tytułu nie scala się mimo tego samego targetu", async () => {
    const a = { ...item, type: "technical" as const, title: "Dodaj sitemap", target_url: "/sitemap.xml" };
    const b = { ...a, title: "Napraw robots.txt" };
    expect(fingerprintFor(a)).not.toBe(fingerprintFor(b));
    const { client, inserted } = fakeAdmin({});
    const r = await upsertRecommendations(client, "proj", "run", "p1", [a, b], ev);
    expect(r).toEqual({ inserted: 2, merged: 0 });
    expect(inserted).toHaveLength(2);
  });
});
