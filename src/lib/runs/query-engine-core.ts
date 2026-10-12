import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { EngineAdapter, EngineResult } from "@/lib/engines/types";
import { processResponse, type ProjectBrand, type CompetitorBrand } from "@/lib/runs/process-response";
import type { QueryJob } from "@/lib/runs/plan";

export interface QueryEnginePayload {
  runId: string;
  projectId: string;
  job: QueryJob;
  project: ProjectBrand & { locale: string; country: string };
  competitors: CompetitorBrand[];
}

export type QueryEngineOutput =
  | { ok: true; costUsd: number; error: null }
  | { ok: false; costUsd: 0; error: string | null };

export async function runQueryEngine(
  admin: SupabaseClient<Database>,
  adapter: EngineAdapter,
  payload: QueryEnginePayload,
  deps?: Parameters<typeof processResponse>[1],
): Promise<QueryEngineOutput> {
  const { runId, projectId, job, project, competitors } = payload;

  // idempotentność przy retry Trigger.dev: usuwamy ewentualny wiersz z poprzedniej próby
  // (mentions/citations znikają kaskadowo), żeby nie powstały duplikaty odpowiedzi
  const { error: cleanupError } = await admin.from("responses").delete().match({
    run_id: runId, prompt_id: job.promptId, engine_id: job.engineId, sample_idx: job.sampleIdx,
  });
  if (cleanupError) throw new Error(cleanupError.message);

  let result: EngineResult | null = null;
  let errorMessage: string | null = null;

  try {
    result = await adapter.query(job.promptText, { locale: project.locale, country: project.country });
    // NFC: charIndex z dopasowania marki jest poprawny tylko dla tekstu znormalizowanego do NFC
    result = { ...result, text: result.text.normalize("NFC") };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // błąd jednego silnika nie może wywrócić runu: zapisujemy wiersz z błędem i zwracamy ok: false
  if (!result) {
    const { error: errorRowError } = await admin.from("responses").insert({
      run_id: runId, project_id: projectId, prompt_id: job.promptId, engine_id: job.engineId,
      sample_idx: job.sampleIdx, error: errorMessage, text: "",
    });
    if (errorRowError) throw new Error(errorRowError.message);
    return { ok: false, costUsd: 0, error: errorMessage };
  }

  const processed = await processResponse({ promptId: job.promptId, engineId: job.engineId, result, project, competitors }, deps);

  const { data: response, error } = await admin.from("responses").insert({
    run_id: runId, project_id: projectId, prompt_id: job.promptId, engine_id: job.engineId,
    sample_idx: job.sampleIdx, text: result.text, citations: result.citations as never,
    model: result.model, raw: result.raw as never, cost_usd: result.costUsd,
    no_answer: Boolean(result.noAnswer),
    sentiment: processed.sentiment?.sentiment ?? null, sentiment_summary: processed.sentiment?.summary ?? null,
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (processed.mentions.length) {
    const { error: mentionsError } = await admin.from("mentions").insert(processed.mentions.map((m) => ({
      response_id: response.id, project_id: projectId, brand_kind: m.kind, brand_name: m.name,
      competitor_id: m.competitorId ?? null, position: m.position, char_index: m.charIndex,
    })));
    if (mentionsError) throw new Error(mentionsError.message);
  }
  if (processed.citations.length) {
    const { error: citationsError } = await admin.from("citations").insert(processed.citations.map((c) => ({
      response_id: response.id, project_id: projectId, url: c.url, domain: c.domain, title: c.title ?? null,
      is_own: c.isOwn, competitor_id: c.competitorId ?? null,
    })));
    if (citationsError) throw new Error(citationsError.message);
  }
  return { ok: true, costUsd: result.costUsd, error: null };
}
