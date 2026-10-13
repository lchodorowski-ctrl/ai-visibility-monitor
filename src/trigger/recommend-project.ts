import { task } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { qualifyPrompts, prioritizeQualified } from "@/lib/recommend/qualify";
import { visibilityByPrompt } from "@/lib/recommend/collect";
import { buildRecommendationInput } from "@/lib/recommend/input";
import { generateRecommendations } from "@/lib/recommend/generate";
import { technicalRules } from "@/lib/recommend/rules";
import { upsertRecommendations } from "@/lib/recommend/persist";
import type { Evidence } from "@/lib/recommend/fingerprint";
import { crawlSite, persistSitePages } from "@/lib/site/crawl";

export interface RecommendProjectPayload { projectId: string; runId: string | null; date: string }

type Admin = SupabaseClient<Database>;
export interface RecommendProjectDeps {
  admin?: Admin;
  generate?: typeof generateRecommendations;
  rules?: typeof technicalRules;
  /** Crawls the site and persists site_pages; injectable for tests. */
  crawl?: (admin: Admin, projectId: string, siteUrl: string) => Promise<unknown>;
}

/** Each qualified prompt is one paid model call; the rest waits for the next run. */
export const MAX_PROMPTS_PER_RUN = 20;
/** site_pages older than this (or missing) are re-crawled before generating. */
export const SITE_PAGES_MAX_AGE_MS = 7 * 86_400_000;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function crawlAndPersist(admin: Admin, projectId: string, siteUrl: string) {
  const pages = await crawlSite(siteUrl);
  return persistSitePages(admin, projectId, pages);
}

/** Re-crawls the site when the page map is empty or stale. A crawl failure is logged and never blocks recommendations. */
async function refreshSitePagesIfStale(admin: Admin, projectId: string, siteUrl: string, crawl: NonNullable<RecommendProjectDeps["crawl"]>) {
  const { data, error } = await admin.from("site_pages").select("fetched_at").eq("project_id", projectId)
    .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (data && Date.now() - Date.parse(data.fetched_at) <= SITE_PAGES_MAX_AGE_MS) return;
  try {
    await crawl(admin, projectId, siteUrl);
  } catch (err) {
    console.error("recommend-project: crawl strony nie powiódł się — generuję na dotychczasowej mapie strony:", message(err));
  }
}

/**
 * Adds (never overwrites) the generation spend to a run: the given run, or — for a manual
 * refresh without a run — the project's latest run, so the spend lands in the monthly budget.
 */
async function addRecommendationCost(admin: Admin, projectId: string, runId: string | null, costUsd: number) {
  if (costUsd <= 0) return;
  const base = admin.from("runs").select("id, recommendations_cost_usd").eq("project_id", projectId);
  const { data: run, error } = await (runId ? base.eq("id", runId) : base.order("started_at", { ascending: false }).limit(1)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) { console.warn(`recommend-project: brak runu, do którego można dopisać koszt ${costUsd.toFixed(4)} USD`); return; }
  const { error: upErr } = await admin.from("runs")
    .update({ recommendations_cost_usd: Number(run.recommendations_cost_usd) + costUsd }).eq("id", run.id).eq("project_id", projectId);
  if (upErr) throw new Error(upErr.message);
}

async function generateForProject(
  { projectId, runId, date }: RecommendProjectPayload,
  deps: RecommendProjectDeps = {},
) {
  if (!process.env.ANTHROPIC_API_KEY) { console.warn("recommend-project: brak ANTHROPIC_API_KEY — pomijam"); return { skipped: true as const }; }
  const admin = deps.admin ?? createAdminSupabase();
  const generate = deps.generate ?? generateRecommendations;
  const rules = deps.rules ?? technicalRules;

  const projectRes = await admin.from("projects").select("*").eq("id", projectId).single();
  if (projectRes.error) throw new Error(projectRes.error.message);
  const project = projectRes.data;
  await refreshSitePagesIfStale(admin, projectId, project.site_url, deps.crawl ?? crawlAndPersist);

  const [promptsRes, metricsRes, compsRes, pagesRes] = await Promise.all([
    admin.from("prompts").select("id, text, intent, is_key, topic_id, topics(name)").eq("project_id", projectId).eq("active", true),
    admin.from("daily_metrics").select("prompt_id, engine_id, visibility_rate, responses_count").eq("project_id", projectId).eq("date", date).not("prompt_id", "is", null),
    admin.from("competitors").select("name, aliases").eq("project_id", projectId),
    admin.from("site_pages").select("path, title, description").eq("project_id", projectId).eq("status", 200).order("path").limit(120),
  ]);
  for (const r of [promptsRes, metricsRes, compsRes, pagesRes]) if (r.error) throw new Error(r.error.message);
  const prompts = promptsRes.data ?? [];
  const threshold = Number(project.low_visibility_threshold);
  const vis = visibilityByPrompt(metricsRes.data ?? [], prompts.map((p) => ({ id: p.id, intent: p.intent })));
  const { selected: qualified, skipped } = prioritizeQualified(
    qualifyPrompts(vis, threshold),
    new Map(prompts.map((p) => [p.id, { isKey: p.is_key, overall: vis.find((v) => v.promptId === p.id)?.overall?.visibilityRate ?? null }])),
    MAX_PROMPTS_PER_RUN,
  );
  if (skipped.length) console.warn(`recommend-project: limit ${MAX_PROMPTS_PER_RUN} pytań na uruchomienie — pominięto ${skipped.length} (wrócą przy następnym runie)`);
  const competitorAliases = (compsRes.data ?? []).flatMap((c) => [c.name, ...c.aliases]);
  const brand = { name: project.brand_name, aliases: project.brand_aliases, domains: project.domains, facts: project.facts, siteUrl: project.site_url };
  const dayStart = `${date}T00:00:00Z`, dayEnd = new Date(Date.parse(dayStart) + 86400000).toISOString();
  const { data: dayRuns, error: runsErr } = await admin.from("runs").select("id").eq("project_id", projectId).gte("started_at", dayStart).lt("started_at", dayEnd);
  if (runsErr) throw new Error(runsErr.message);
  const runIds = (dayRuns ?? []).map((r) => r.id);

  let accepted = 0, rejected = 0, failed = 0, costUsd = 0, technical = 0;
  // the spend is recorded even when something below throws: the model calls were already paid for
  let pending: unknown = null;
  try {
    for (const promptId of qualified) {
      const p = prompts.find((x) => x.id === promptId)!;
      const v = vis.find((x) => x.promptId === promptId)!;
      const [responsesRes, existingRes] = await Promise.all([
        runIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : admin.from("responses").select("engine_id, text, no_answer, error, citations(url, domain), mentions(brand_kind, brand_name)").eq("prompt_id", promptId).in("run_id", runIds).eq("no_answer", false).is("error", null).limit(50),
        // a recommendation merged from another prompt carries this prompt only in evidence.prompt_ids
        admin.from("recommendations").select("type, title").eq("project_id", projectId)
          .or(`prompt_id.eq.${promptId},evidence->prompt_ids.cs.["${promptId}"]`).neq("status", "dismissed"),
      ]);
      if (responsesRes.error) throw new Error(responsesRes.error.message);
      if (existingRes.error) throw new Error(existingRes.error.message);
      const input = buildRecommendationInput({
        prompt: { id: p.id, text: p.text, intent: p.intent, topic: (p.topics as { name: string } | null)?.name ?? null },
        visibility: { overall: v.overall?.visibilityRate ?? null, byEngine: Object.fromEntries(v.byEngine.map((e) => [e.engineId, e.visibilityRate])) },
        responses: (responsesRes.data ?? []).map((r) => ({ engineId: r.engine_id, text: r.text, citations: r.citations, mentions: r.mentions.map((m) => ({ kind: m.brand_kind as "own" | "competitor", name: m.brand_name })) })),
        brand, sitePages: pagesRes.data ?? [], existing: existingRes.data ?? [], competitorAliases,
      });
      let gen;
      try {
        gen = await generate(input);
      } catch (err) {
        // refusal / max_tokens / API error: one bad prompt must not sink the run; a billed failure still costs money
        const spent = (err as { costUsd?: unknown } | null)?.costUsd;
        if (typeof spent === "number" && Number.isFinite(spent)) costUsd += spent;
        console.error(`recommend-project: prompt ${promptId} failed:`, message(err));
        failed++;
        continue;
      }
      costUsd += gen.costUsd;
      const evidence: Evidence = {
        prompt_ids: [promptId], visibility_by_engine: input.visibility.byEngine, cited_domains: input.citedDomains, cited_urls: input.citedUrls,
        competitors_mentioned: input.competitorsMentioned, sample_quotes: input.excerpts.slice(0, 3).map((e) => `[${e.engineId}] ${e.text.slice(0, 300)}`),
      };
      await upsertRecommendations(admin, projectId, runId, promptId, gen.accepted, evidence);
      accepted += gen.accepted.length; rejected += gen.rejected.length;
      if (gen.rejected.length) console.warn(`recommend-project: odrzucone dla ${promptId}:`, gen.rejected);
    }
    const tech = await rules(project.site_url);
    await upsertRecommendations(admin, projectId, runId, null, tech, { prompt_ids: [], visibility_by_engine: {}, cited_domains: [], cited_urls: [], competitors_mentioned: [], sample_quotes: [] });
    technical = tech.length;
  } catch (err) {
    pending = err;
  }
  try {
    await addRecommendationCost(admin, projectId, runId, costUsd);
  } catch (err) {
    if (!pending) throw err;
    console.error("recommend-project: nie udało się zapisać kosztu rekomendacji:", message(err));
  }
  if (pending) throw pending;
  if (qualified.length > 0 && failed === qualified.length) {
    throw new Error(`recommend-project: wszystkie wywołania modelu nie powiodły się (${failed}/${qualified.length})`);
  }
  return { prompts: qualified.length, skipped: skipped.length, accepted, rejected, failed, technical, costUsd };
}

/**
 * Runs the generation and, when the task belongs to a measurement, always closes its progress stage
 * (`done`) — also when it is skipped or throws — so the Overview progress bar never hangs on "recommending".
 */
export async function runRecommendProject(payload: RecommendProjectPayload, deps: RecommendProjectDeps = {}) {
  let failure: { err: unknown } | null = null;
  try {
    return await generateForProject(payload, deps);
  } catch (err) {
    failure = { err };
    throw err;
  } finally {
    if (payload.runId) {
      try {
        const admin = deps.admin ?? createAdminSupabase();
        const { error } = await admin.from("runs").update({ stage: "done" }).eq("id", payload.runId).eq("project_id", payload.projectId);
        if (error) throw new Error(error.message);
      } catch (err) {
        // the original failure (if any) wins; a stage write that fails on its own is surfaced
        if (!failure) throw err;
        console.error(`recommend-project: nie udało się zamknąć etapu runu ${payload.runId}:`, message(err));
      }
    }
  }
}

export const recommendProject = task({
  id: "recommend-project",
  queue: { concurrencyLimit: 1 },
  // a retry would re-buy every Opus call of the attempt; a failed run waits for the next run or a manual refresh
  retry: { maxAttempts: 1 },
  maxDuration: 1800,
  run: (payload: RecommendProjectPayload) => runRecommendProject(payload),
});
