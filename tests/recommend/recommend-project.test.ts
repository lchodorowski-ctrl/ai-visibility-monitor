import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// the module registers a Trigger.dev task at import time; the run body is tested directly
vi.mock("@trigger.dev/sdk", () => ({ task: (def: unknown) => def }));

import { runRecommendProject, recommendProject, MAX_PROMPTS_PER_RUN } from "@/trigger/recommend-project";
import { GenerationError, type GeneratedRecommendation } from "@/lib/recommend/generate";

type Filter = [string, ...unknown[]];
interface Call { table: string; op: "select" | "update" | "insert"; cols?: string; payload?: unknown; filters: Filter[] }

const PROJECT = "proj-1";
const has = (c: Call, ...f: unknown[]) => c.filters.some((x) => JSON.stringify(x) === JSON.stringify(f));

/** Chainable PostgREST stand-in: every call is recorded, the result comes from `handler`. */
function fakeAdmin(handler: (c: Call) => { data?: unknown; error?: { message: string } | null }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "neq", "in", "gte", "lt", "not", "is", "or", "order", "limit"]) b[m] = (...args: unknown[]) => { call.filters.push([m, ...args]); return b; };
    b.select = (cols: string) => { if (call.op === "select") call.cols = cols; return b; };
    b.update = (payload: unknown) => { call.op = "update"; call.payload = payload; return b; };
    b.insert = (payload: unknown) => { call.op = "insert"; call.payload = payload; return b; };
    const run = () => { calls.push(call); const r = handler(call); return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }); };
    b.single = run; b.maybeSingle = run;
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko);
    return b;
  };
  return { client: { from } as never, calls };
}

interface World {
  prompts: { id: string; is_key?: boolean; overall: number }[];
  dayRuns?: string[];
  sitePagesFetchedAt?: string | null;
  runCost?: number;
  latestRun?: { id: string; recommendations_cost_usd: number } | null;
}

function world(w: World) {
  return fakeAdmin((c) => {
    if (c.table === "projects") return { data: { id: PROJECT, brand_name: "PSAI", brand_aliases: [], domains: ["polskaszkola.ai"], facts: {}, site_url: "https://psai.example", low_visibility_threshold: 0.34 } };
    if (c.table === "prompts") return { data: w.prompts.map((p) => ({ id: p.id, text: `Pytanie ${p.id}`, intent: "informational", is_key: p.is_key ?? false, topic_id: null, topics: null })) };
    if (c.table === "daily_metrics") return { data: w.prompts.map((p) => ({ prompt_id: p.id, engine_id: null, visibility_rate: p.overall, responses_count: 4 })) };
    if (c.table === "competitors") return { data: [] };
    if (c.table === "site_pages" && c.cols === "fetched_at") return { data: w.sitePagesFetchedAt ? { fetched_at: w.sitePagesFetchedAt } : null };
    if (c.table === "site_pages") return { data: [] };
    if (c.table === "runs" && c.op === "select" && c.cols === "id") return { data: (w.dayRuns ?? []).map((id) => ({ id })) };
    if (c.table === "runs" && c.op === "select") {
      if (has(c, "eq", "id", "run-1")) return { data: { id: "run-1", recommendations_cost_usd: w.runCost ?? 0 } };
      return { data: w.latestRun ?? null };
    }
    if (c.table === "runs" && c.op === "update") return {};
    if (c.table === "responses") return { data: [] };
    if (c.table === "recommendations" && c.op === "select") return { data: c.cols === "type, title" ? [] : null };
    if (c.table === "recommendations") return {};
    throw new Error(`unexpected ${c.op} on ${c.table}`);
  });
}

const rec = (title: string): GeneratedRecommendation => ({
  type: "offsite", title, summary: "s".repeat(30), action_steps: ["a", "b"], target_url: "https://parp.gov.pl/x",
  suggested_outline: null, impact: 4, effort: 2, rationale_pl: "r".repeat(20),
});
const ok = (cost = 0.1) => vi.fn(async (input: { prompt: { id: string }; excerpts: unknown[] }) => ({ accepted: [rec(`Rekomendacja dla ${input.prompt.id}`)], rejected: [], usage: { input_tokens: 1, output_tokens: 1 }, costUsd: cost }));
const noRules = vi.fn(async () => [] as GeneratedRecommendation[]);
const freshCrawl = () => new Date().toISOString();

describe("runRecommendProject", () => {
  const key = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
    vi.restoreAllMocks();
  });

  it("bez ANTHROPIC_API_KEY pomija i nie dotyka bazy", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }] });
    const generate = ok();
    expect(await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate, rules: noRules })).toEqual({ skipped: true });
    expect(calls).toEqual([]); expect(generate).not.toHaveBeenCalled();
  });

  it("bez runów z tego dnia nie pyta o odpowiedzi, a generuje na pustych dowodach", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }], dayRuns: [], sitePagesFetchedAt: freshCrawl() });
    const generate = ok();
    const r = await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate, rules: noRules, crawl: vi.fn() });
    expect(calls.some((c) => c.table === "responses")).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].excerpts).toEqual([]);
    expect(r).toMatchObject({ prompts: 1, accepted: 1, failed: 0 });
  });

  it("z runami z tego dnia czyta odpowiedzi tylko z tych runów", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }], dayRuns: ["run-1", "run-0"], sitePagesFetchedAt: freshCrawl() });
    await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate: ok(), rules: noRules, crawl: vi.fn() });
    const resp = calls.find((c) => c.table === "responses")!;
    expect(has(resp, "in", "run_id", ["run-1", "run-0"])).toBe(true);
    expect(has(resp, "eq", "prompt_id", "p1")).toBe(true);
  });

  it("istniejące rekomendacje dla pytania obejmują też te scalone z innego pytania (evidence.prompt_ids)", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }], sitePagesFetchedAt: freshCrawl() });
    await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate: ok(), rules: noRules, crawl: vi.fn() });
    const existing = calls.find((c) => c.table === "recommendations" && c.cols === "type, title")!;
    expect(has(existing, "eq", "project_id", PROJECT)).toBe(true);
    expect(has(existing, "or", 'prompt_id.eq.p1,evidence->prompt_ids.cs.["p1"]')).toBe(true);
    expect(has(existing, "neq", "status", "dismissed")).toBe(true);
  });

  it("błąd jednego pytania nie przerywa pozostałych, a jego koszt i tak się liczy", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }, { id: "p2", overall: 0.1 }], sitePagesFetchedAt: freshCrawl(), runCost: 0 });
    const generate = vi.fn(async (input: { prompt: { id: string } }) => {
      if (input.prompt.id === "p1") throw new GenerationError("generateRecommendations: max_tokens", { input_tokens: 1, output_tokens: 1 }, 0.3);
      return { accepted: [rec("Rekomendacja p2")], rejected: [], usage: { input_tokens: 1, output_tokens: 1 }, costUsd: 0.2 };
    });
    const r = await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate, rules: noRules, crawl: vi.fn() });
    expect(r).toMatchObject({ prompts: 2, accepted: 1, failed: 1 });
    expect((r as { costUsd: number }).costUsd).toBeCloseTo(0.5);
    const inserts = calls.filter((c) => c.table === "recommendations" && c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ prompt_id: "p2" });
  });

  it("gdy wszystkie wywołania modelu padną, run kończy się błędem — po zapisaniu kosztu", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }, { id: "p2", overall: 0 }], sitePagesFetchedAt: freshCrawl(), runCost: 1 });
    const generate = vi.fn(async () => { throw new GenerationError("generateRecommendations: refusal", { input_tokens: 1, output_tokens: 1 }, 0.25); });
    await expect(runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate, rules: noRules, crawl: vi.fn() }))
      .rejects.toThrow("recommend-project: wszystkie wywołania modelu nie powiodły się (2/2)");
    const upd = calls.find((c) => c.table === "runs" && c.op === "update")!;
    expect((upd.payload as { recommendations_cost_usd: number }).recommendations_cost_usd).toBeCloseTo(1.5);
  });

  it(`ogranicza liczbę pytań do ${MAX_PROMPTS_PER_RUN}: najpierw kluczowe, potem najniższa widoczność`, async () => {
    const prompts = Array.from({ length: 25 }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, overall: (25 - i) / 100, is_key: i === 0 || i === 3 }));
    const { client } = world({ prompts, sitePagesFetchedAt: freshCrawl() });
    const generate = ok(0);
    const r = await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate, rules: noRules, crawl: vi.fn() });
    const order = generate.mock.calls.map((c) => c[0].prompt.id);
    expect(order).toHaveLength(MAX_PROMPTS_PER_RUN);
    // key prompts first (p03: 22%, p00: 25%), then ascending visibility: p24 (1%), p23 (2%), …
    expect(order.slice(0, 4)).toEqual(["p03", "p00", "p24", "p23"]);
    expect(order).not.toContain("p01"); expect(order).not.toContain("p02");
    expect(r).toMatchObject({ prompts: 20, skipped: 5 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("pominięto 5"));
  });

  it("z runId dodaje koszt do kosztu runu (+=), nie nadpisuje", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }], sitePagesFetchedAt: freshCrawl(), runCost: 0.4 });
    await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate: ok(0.1), rules: noRules, crawl: vi.fn() });
    const upd = calls.filter((c) => c.table === "runs" && c.op === "update");
    expect(upd).toHaveLength(1);
    expect((upd[0].payload as { recommendations_cost_usd: number }).recommendations_cost_usd).toBeCloseTo(0.5);
    expect(has(upd[0], "eq", "id", "run-1")).toBe(true);
    expect(has(upd[0], "eq", "project_id", PROJECT)).toBe(true);
  });

  it("bez runId (ręczne odświeżenie) dopisuje koszt do ostatniego runu projektu", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }], sitePagesFetchedAt: freshCrawl(), latestRun: { id: "run-latest", recommendations_cost_usd: 0.2 } });
    await runRecommendProject({ projectId: PROJECT, runId: null, date: "2026-10-13" }, { admin: client, generate: ok(0.1), rules: noRules, crawl: vi.fn() });
    const lookup = calls.find((c) => c.table === "runs" && c.op === "select" && c.cols === "id, recommendations_cost_usd")!;
    expect(has(lookup, "eq", "project_id", PROJECT)).toBe(true);
    expect(has(lookup, "order", "started_at", { ascending: false })).toBe(true);
    expect(has(lookup, "limit", 1)).toBe(true);
    const upd = calls.find((c) => c.table === "runs" && c.op === "update")!;
    expect(has(upd, "eq", "id", "run-latest")).toBe(true);
    expect((upd.payload as { recommendations_cost_usd: number }).recommendations_cost_usd).toBeCloseTo(0.3);
  });

  it("crawluje stronę, gdy site_pages jest puste lub starsze niż 7 dni; świeżej mapy nie rusza", async () => {
    for (const [fetchedAt, expected] of [[null, 1], [new Date(Date.now() - 8 * 86_400_000).toISOString(), 1], [freshCrawl(), 0]] as const) {
      const { client } = world({ prompts: [], sitePagesFetchedAt: fetchedAt });
      const crawl = vi.fn(async () => ({ upserted: 3, retired: 0 }));
      await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate: ok(), rules: noRules, crawl });
      expect(crawl).toHaveBeenCalledTimes(expected);
      if (expected) expect(crawl).toHaveBeenCalledWith(client, PROJECT, "https://psai.example");
    }
  });

  it("błąd crawla jest logowany i nie blokuje rekomendacji", async () => {
    const { client } = world({ prompts: [{ id: "p1", overall: 0 }], sitePagesFetchedAt: null });
    const crawl = vi.fn(async () => { throw new Error("sitemap 500"); });
    const generate = ok();
    const r = await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate, rules: noRules, crawl });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ accepted: 1 });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("crawl"), "sitemap 500");
  });

  it("zapis jest zawężony do projektu i runu; reguły techniczne zapisują się bez pytania", async () => {
    const { client, calls } = world({ prompts: [{ id: "p1", overall: 0 }], sitePagesFetchedAt: freshCrawl() });
    const rules = vi.fn(async () => [{ ...rec("Opublikuj llms.txt"), type: "technical" as const, target_url: "/llms.txt" }]);
    const r = await runRecommendProject({ projectId: PROJECT, runId: "run-1", date: "2026-10-13" }, { admin: client, generate: ok(), rules, crawl: vi.fn() });
    expect(rules).toHaveBeenCalledWith("https://psai.example");
    const inserts = calls.filter((c) => c.table === "recommendations" && c.op === "insert").map((c) => c.payload as Record<string, unknown>);
    expect(inserts).toHaveLength(2);
    for (const row of inserts) expect(row).toMatchObject({ project_id: PROJECT, run_id: "run-1" });
    expect(inserts[0]).toMatchObject({ prompt_id: "p1" });
    expect(inserts[1]).toMatchObject({ prompt_id: null, type: "technical" });
    for (const c of calls.filter((x) => x.op === "select" && x.table !== "projects" && x.table !== "runs")) expect(has(c, "eq", "project_id", PROJECT)).toBe(true);
    expect(r).toMatchObject({ technical: 1 });
  });

  it("task nie ponawia prób (ponowienie kupiłoby wszystkie wywołania Opus jeszcze raz)", () => {
    expect((recommendProject as unknown as { retry: { maxAttempts: number } }).retry).toEqual({ maxAttempts: 1 });
  });
});
