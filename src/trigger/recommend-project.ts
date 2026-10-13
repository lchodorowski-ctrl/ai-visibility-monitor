import { task } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { qualifyPrompts } from "@/lib/recommend/qualify";
import { visibilityByPrompt } from "@/lib/recommend/collect";
import { buildRecommendationInput } from "@/lib/recommend/input";
import { generateRecommendations } from "@/lib/recommend/generate";
import { technicalRules } from "@/lib/recommend/rules";
import { upsertRecommendations } from "@/lib/recommend/persist";
import type { Evidence } from "@/lib/recommend/fingerprint";

export interface RecommendProjectPayload { projectId: string; runId: string | null; date: string }

export async function runRecommendProject(
  { projectId, runId, date }: RecommendProjectPayload,
  deps: { admin?: SupabaseClient<Database> } = {},
) {
  if (!process.env.ANTHROPIC_API_KEY) { console.warn("recommend-project: brak ANTHROPIC_API_KEY — pomijam"); return { skipped: true as const }; }
  const admin = deps.admin ?? createAdminSupabase();
  const [projectRes, promptsRes, metricsRes, compsRes, pagesRes] = await Promise.all([
    admin.from("projects").select("*").eq("id", projectId).single(),
    admin.from("prompts").select("id, text, intent, topic_id, topics(name)").eq("project_id", projectId).eq("active", true),
    admin.from("daily_metrics").select("prompt_id, engine_id, visibility_rate, responses_count").eq("project_id", projectId).eq("date", date).not("prompt_id", "is", null),
    admin.from("competitors").select("name, aliases").eq("project_id", projectId),
    admin.from("site_pages").select("path, title, description").eq("project_id", projectId).eq("status", 200).order("path").limit(120),
  ]);
  for (const r of [projectRes, promptsRes, metricsRes, compsRes, pagesRes]) if (r.error) throw new Error(r.error.message);
  const project = projectRes.data!, prompts = promptsRes.data ?? [];
  const threshold = Number(project.low_visibility_threshold);
  const vis = visibilityByPrompt(metricsRes.data ?? [], prompts.map((p) => ({ id: p.id, intent: p.intent })));
  const qualified = qualifyPrompts(vis, threshold);
  const competitorAliases = (compsRes.data ?? []).flatMap((c) => [c.name, ...c.aliases]);
  const brand = { name: project.brand_name, aliases: project.brand_aliases, domains: project.domains, facts: project.facts, siteUrl: project.site_url };
  const dayStart = `${date}T00:00:00Z`, dayEnd = new Date(Date.parse(dayStart) + 86400000).toISOString();
  const { data: dayRuns, error: runsErr } = await admin.from("runs").select("id").eq("project_id", projectId).gte("started_at", dayStart).lt("started_at", dayEnd);
  if (runsErr) throw new Error(runsErr.message);
  const runIds = (dayRuns ?? []).map((r) => r.id);

  let accepted = 0, rejected = 0, failed = 0, costUsd = 0;
  for (const promptId of qualified) {
    const p = prompts.find((x) => x.id === promptId)!;
    const v = vis.find((x) => x.promptId === promptId)!;
    const [responsesRes, existingRes] = await Promise.all([
      runIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin.from("responses").select("engine_id, text, no_answer, error, citations(url, domain), mentions(brand_kind, brand_name)").eq("prompt_id", promptId).in("run_id", runIds).eq("no_answer", false).is("error", null).limit(50),
      admin.from("recommendations").select("type, title").eq("project_id", projectId).eq("prompt_id", promptId).neq("status", "dismissed"),
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
      gen = await generateRecommendations(input);
    } catch (err) {
      // generateRecommendations throws on refusal / max_tokens / missing key: one bad prompt must not sink the run
      console.error(`recommend-project: prompt ${promptId} failed:`, err instanceof Error ? err.message : String(err));
      failed++;
      continue;
    }
    const evidence: Evidence = {
      prompt_ids: [promptId], visibility_by_engine: input.visibility.byEngine, cited_domains: input.citedDomains, cited_urls: input.citedUrls,
      competitors_mentioned: input.competitorsMentioned, sample_quotes: input.excerpts.slice(0, 3).map((e) => `[${e.engineId}] ${e.text.slice(0, 300)}`),
    };
    await upsertRecommendations(admin, projectId, runId, promptId, gen.accepted, evidence);
    accepted += gen.accepted.length; rejected += gen.rejected.length; costUsd += gen.costUsd;
    if (gen.rejected.length) console.warn(`recommend-project: odrzucone dla ${promptId}:`, gen.rejected);
  }
  const tech = await technicalRules(project.site_url);
  await upsertRecommendations(admin, projectId, runId, null, tech, { prompt_ids: [], visibility_by_engine: {}, cited_domains: [], cited_urls: [], competitors_mentioned: [], sample_quotes: [] });
  if (runId) {
    const { error } = await admin.from("runs").update({ recommendations_cost_usd: costUsd }).eq("id", runId);
    if (error) throw new Error(error.message);
  }
  return { prompts: qualified.length, accepted, rejected, failed, technical: tech.length, costUsd };
}

export const recommendProject = task({
  id: "recommend-project",
  queue: { concurrencyLimit: 1 },
  maxDuration: 1800,
  run: (payload: RecommendProjectPayload) => runRecommendProject(payload),
});
