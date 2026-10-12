import { describe, it, expect, vi } from "vitest";
import { runQueryEngine, type QueryEnginePayload } from "@/lib/runs/query-engine-core";
import type { EngineAdapter } from "@/lib/engines/types";

type Call = { table: string; op: "delete" | "insert"; arg: unknown };

function fakeAdmin() {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const api: Record<string, unknown> = {};
    api.delete = () => {
      const chain: Record<string, unknown> = {};
      chain.match = (arg: unknown) => {
        calls.push({ table, op: "delete", arg });
        return { then: (resolve: (v: unknown) => unknown) => resolve({ error: null }) };
      };
      return chain;
    };
    api.insert = (rows: unknown) => {
      calls.push({ table, op: "insert", arg: rows });
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.single = async () => ({ data: { id: `${table}-id` }, error: null });
      // `await insert(...)` bez .select().single()
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
      return chain;
    };
    return api;
  });
  return { client: { from } as never, calls };
}

const payload: QueryEnginePayload = {
  runId: "run-1", projectId: "proj-1",
  job: { promptId: "prompt-1", promptText: "najlepsze narzędzia?", engineId: "openai", sampleIdx: 0 },
  project: { brandName: "Acme", aliases: [], domains: ["acme.pl"], locale: "pl-PL", country: "PL" },
  competitors: [],
};

describe("runQueryEngine", () => {
  it("błąd adaptera: jeden wiersz responses z error, delete najpierw, bez mentions/citations", async () => {
    const { client, calls } = fakeAdmin();
    const adapter: EngineAdapter = { id: "openai", query: vi.fn().mockRejectedValue(new Error("rate limit")) };

    const out = await runQueryEngine(client, adapter, payload);

    expect(out).toEqual({ ok: false, costUsd: 0, error: "rate limit" });
    expect(calls[0]).toMatchObject({ table: "responses", op: "delete" });
    expect(calls[0].arg).toEqual({ run_id: "run-1", prompt_id: "prompt-1", engine_id: "openai", sample_idx: 0 });
    const inserts = calls.filter((c) => c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("responses");
    expect(inserts[0].arg).toMatchObject({ error: "rate limit", text: "", run_id: "run-1", engine_id: "openai" });
    expect(calls.some((c) => c.table === "mentions" || c.table === "citations")).toBe(false);
  });

  it("sukces: znormalizowany NFC tekst, mention own i cytowanie is_own", async () => {
    const { client, calls } = fakeAdmin();
    const decomposed = "Polecám café Acme jako lidera";
    const adapter: EngineAdapter = {
      id: "openai",
      query: vi.fn().mockResolvedValue({
        text: decomposed, model: "gpt-x", raw: {}, costUsd: 0.012,
        citations: [{ url: "https://www.acme.pl/oferta", domain: "acme.pl", title: "Oferta" }],
      }),
    };
    const sentiment = vi.fn().mockResolvedValue({ sentiment: "positive", summary: "ok" });

    const out = await runQueryEngine(client, adapter, payload, { sentiment });

    expect(out).toEqual({ ok: true, costUsd: 0.012, error: null });
    expect(calls[0]).toMatchObject({ table: "responses", op: "delete" });
    const response = calls.find((c) => c.table === "responses" && c.op === "insert")!.arg as { text: string; sentiment: string };
    expect(response.text).toBe(decomposed.normalize("NFC"));
    expect(response.text).not.toBe(decomposed);
    expect(response.sentiment).toBe("positive");
    const mentions = calls.find((c) => c.table === "mentions")!.arg as { brand_kind: string; response_id: string }[];
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ brand_kind: "own", response_id: "responses-id" });
    const citations = calls.find((c) => c.table === "citations")!.arg as { is_own: boolean }[];
    expect(citations).toHaveLength(1);
    expect(citations[0].is_own).toBe(true);
    expect(sentiment).toHaveBeenCalledTimes(1);
  });
});
