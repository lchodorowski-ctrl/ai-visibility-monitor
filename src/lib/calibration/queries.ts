import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { CALIBRATION_ENGINES, isCalibrationEngine, type CalibrationEngine } from "./engines";
import { apiOutcome, compareRow, agreementByEngine, type ApiOutcome, type ApiResponse, type RowResult, type EngineAgreement } from "./compare";

export type CalibrationListItem = { id: string; status: "open" | "closed"; created_at: string; run_started_at: string | null; agreement: EngineAgreement[] };
export type CalibrationCheckView = { id: string; promptId: string; promptText: string; engineId: CalibrationEngine; manualMentioned: boolean | null; manualUrls: string[]; manualAlias: string | null; api: ApiOutcome; apiResponseId: string | null; apiDomains: string[]; result: RowResult };
export type CalibrationView = { id: string; status: "open" | "closed"; created_at: string; closed_at: string | null; run: { id: string; started_at: string } | null; checks: CalibrationCheckView[] };

export const getLatestDoneRun = cache(async (projectId: string) => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("runs").select("id, started_at").eq("project_id", projectId).eq("status", "done").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getLatestDoneRun: ${error.message}`);
  return data;
});

const RESPONSES_SAFETY_LIMIT = 1000;

async function apiByPair(projectId: string, runId: string, promptIds: string[]): Promise<Map<string, ApiResponse[]>> {
  const map = new Map<string, ApiResponse[]>();
  if (promptIds.length === 0) return map;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("responses")
    .select("id, prompt_id, engine_id, error, no_answer, mentions(brand_kind), citations(domain)")
    .eq("project_id", projectId).eq("run_id", runId)
    .in("prompt_id", promptIds).in("engine_id", [...CALIBRATION_ENGINES])
    .limit(RESPONSES_SAFETY_LIMIT);
  if (error) throw new Error(`calibration responses: ${error.message}`);
  if ((data?.length ?? 0) >= RESPONSES_SAFETY_LIMIT) console.warn(`calibration responses: osiągnięto limit ${RESPONSES_SAFETY_LIMIT} wierszy dla przebiegu ${runId}, część odpowiedzi może być pominięta`);
  for (const r of data ?? []) {
    const key = `${r.prompt_id}:${r.engine_id}`;
    const list = map.get(key) ?? [];
    list.push({ id: r.id, error: r.error, no_answer: r.no_answer, ownMention: (r.mentions ?? []).some((m) => m.brand_kind === "own"), domains: (r.citations ?? []).map((c) => c.domain) });
    map.set(key, list);
  }
  return map;
}

export const getCalibration = cache(async (projectId: string, id: string): Promise<CalibrationView | null> => {
  const supabase = await createServerSupabase();
  const { data: cal, error } = await supabase
    .from("calibrations").select("id, status, created_at, closed_at, run_id, runs(id, started_at)")
    .eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCalibration: ${error.message}`);
  if (!cal) return null;
  const { data: checks, error: cErr } = await supabase
    .from("calibration_checks").select("id, prompt_id, engine_id, manual_mentioned, manual_urls, manual_alias, prompts(text, created_at)")
    .eq("project_id", projectId).eq("calibration_id", id);
  if (cErr) throw new Error(`getCalibration checks: ${cErr.message}`);
  const api = cal.run_id ? await apiByPair(projectId, cal.run_id, [...new Set((checks ?? []).map((c) => c.prompt_id))]) : new Map<string, ApiResponse[]>();
  const order = (e: string) => ["openai", "perplexity", "google_ai_overview"].indexOf(e);
  const keyed = (checks ?? [])
    .filter((c) => isCalibrationEngine(c.engine_id))
    .map((c) => {
      const responses = api.get(`${c.prompt_id}:${c.engine_id}`) ?? [];
      const outcome = apiOutcome(responses);
      const valid = responses.filter((r) => !r.error && !r.no_answer);
      const pick = valid.find((r) => r.ownMention) ?? valid[0] ?? responses[0] ?? null;
      const view: CalibrationCheckView = {
        id: c.id, promptId: c.prompt_id, promptText: c.prompts?.text ?? "", engineId: c.engine_id as CalibrationEngine,
        manualMentioned: c.manual_mentioned, manualUrls: c.manual_urls, manualAlias: c.manual_alias,
        api: outcome, apiResponseId: pick?.id ?? null, apiDomains: valid.flatMap((r) => r.domains),
        result: compareRow(c.manual_mentioned, outcome),
      };
      return { promptCreated: c.prompts?.created_at ?? "", view };
    })
    .sort((a, b) => a.promptCreated.localeCompare(b.promptCreated) || a.view.promptId.localeCompare(b.view.promptId) || order(a.view.engineId) - order(b.view.engineId));
  const views: CalibrationCheckView[] = keyed.map((k) => k.view);
  const run = cal.runs ? { id: cal.runs.id, started_at: cal.runs.started_at } : null;
  return { id: cal.id, status: cal.status as "open" | "closed", created_at: cal.created_at, closed_at: cal.closed_at, run, checks: views };
});

// Lista ma max 24 pozycje (2 lata miesięcznych kalibracji), więc wywołanie getCalibration per pozycja (równolegle) jest akceptowalne; to ekran używany raz w miesiącu.
export const listCalibrations = cache(async (projectId: string): Promise<CalibrationListItem[]> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("calibrations").select("id, status, created_at, runs(started_at)")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(24);
  if (error) throw new Error(`listCalibrations: ${error.message}`);
  return Promise.all((data ?? []).map(async (c): Promise<CalibrationListItem> => {
    const view = await getCalibration(projectId, c.id);
    return { id: c.id, status: c.status as "open" | "closed", created_at: c.created_at, run_started_at: c.runs?.started_at ?? null,
      agreement: agreementByEngine((view?.checks ?? []).map((v) => ({ promptId: v.promptId, engineId: v.engineId, result: v.result }))) };
  }));
});
