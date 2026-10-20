import { createServerSupabase } from "@/lib/supabase/server";
import type { SourceCitation } from "./aggregate";
import { sinceIso, type SourceRange } from "./range";

// PostgREST obcina odpowiedź do max_rows (1000), więc cytowania pobieramy stronami; limit stron chroni przed 90 dniami codziennych pomiarów.
const PAGE = 1000;
const MAX_PAGES = 30;

export interface SourcesData {
  runs: { id: string; started_at: string }[];
  citations: SourceCitation[];
  /** Answers in range without an error (also those citing nothing). */
  answers: number;
  /** Citation paging stopped at MAX_PAGES. */
  truncated: boolean;
  prompts: Map<string, string>;
  competitors: { id: string; name: string; domains: string[] }[];
}

/** "run" = the newest finished measurement (a running one is still incomplete); "days" = every measurement started in the window. */
async function runsInRange(projectId: string, range: SourceRange) {
  const supabase = await createServerSupabase();
  let q = supabase.from("runs").select("id, started_at").eq("project_id", projectId);
  q = range.kind === "run"
    ? q.in("status", ["done", "budget_exceeded"]).order("started_at", { ascending: false }).limit(1)
    : q.gte("started_at", sinceIso(range.days)).order("started_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw new Error(`Nie udało się pobrać pomiarów: ${error.message}`);
  return data ?? [];
}

async function citationsOf(projectId: string, runIds: string[]): Promise<{ rows: SourceCitation[]; truncated: boolean }> {
  const supabase = await createServerSupabase();
  const rows: SourceCitation[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("citations").select("domain, title, is_own, competitor_id, response_id, responses!inner(prompt_id, engine_id, run_id)")
      .eq("project_id", projectId).in("responses.run_id", runIds)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Nie udało się pobrać cytowań: ${error.message}`);
    const batch = data ?? [];
    for (const c of batch) {
      rows.push({
        domain: c.domain, title: c.title, isOwn: c.is_own, competitorId: c.competitor_id,
        responseId: c.response_id, promptId: c.responses.prompt_id, engineId: c.responses.engine_id,
      });
    }
    if (batch.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

export async function getSourcesData(projectId: string, range: SourceRange): Promise<SourcesData> {
  const supabase = await createServerSupabase();
  const [runs, promptsRes, competitorsRes] = await Promise.all([
    runsInRange(projectId, range),
    supabase.from("prompts").select("id, text").eq("project_id", projectId),
    supabase.from("competitors").select("id, name, domains").eq("project_id", projectId),
  ]);
  if (promptsRes.error) throw new Error(`Nie udało się pobrać pytań: ${promptsRes.error.message}`);
  if (competitorsRes.error) throw new Error(`Nie udało się pobrać konkurentów: ${competitorsRes.error.message}`);
  const prompts = new Map((promptsRes.data ?? []).map((p) => [p.id, p.text]));
  const competitors = competitorsRes.data ?? [];
  if (runs.length === 0) return { runs, citations: [], answers: 0, truncated: false, prompts, competitors };

  const runIds = runs.map((r) => r.id);
  const [{ rows, truncated }, answersRes] = await Promise.all([
    citationsOf(projectId, runIds),
    supabase.from("responses").select("id", { count: "exact", head: true }).eq("project_id", projectId).in("run_id", runIds).is("error", null),
  ]);
  if (answersRes.error) throw new Error(`Nie udało się policzyć odpowiedzi: ${answersRes.error.message}`);
  return { runs, citations: rows, answers: answersRes.count ?? 0, truncated, prompts, competitors };
}
