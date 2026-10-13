import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { GeneratedRecommendation } from "./generate";
import { fingerprint, mergeEvidence, type Evidence } from "./fingerprint";

/** Inserts new recommendations or merges into the existing one with the same (project, fingerprint); status is never touched on merge. */
export async function upsertRecommendations(admin: SupabaseClient<Database>, projectId: string, runId: string | null, promptId: string | null, items: GeneratedRecommendation[], evidence: Evidence) {
  let inserted = 0, merged = 0;
  for (const item of items) {
    const fp = fingerprint(item.type, item.title);
    const { data: existing, error } = await admin.from("recommendations").select("id, evidence, status, impact, effort").eq("project_id", projectId).eq("fingerprint", fp).maybeSingle();
    if (error) throw new Error(`recommendations select: ${error.message}`);
    if (existing) {
      const { error: upErr } = await admin.from("recommendations").update({
        evidence: mergeEvidence(existing.evidence as unknown as Evidence, evidence) as never, run_id: runId, updated_at: new Date().toISOString(),
        impact: Math.max(existing.impact, item.impact), effort: Math.max(existing.effort, item.effort), summary: item.summary, rationale: item.rationale_pl, action_steps: item.action_steps as never,
      }).eq("id", existing.id);
      if (upErr) throw new Error(`recommendations update: ${upErr.message}`);
      merged++;
    } else {
      const { error: insErr } = await admin.from("recommendations").insert({
        project_id: projectId, run_id: runId, prompt_id: promptId, type: item.type, title: item.title, summary: item.summary, rationale: item.rationale_pl,
        action_steps: item.action_steps as never, target_url: item.target_url, suggested_outline: item.suggested_outline as never,
        evidence: evidence as never, impact: item.impact, effort: item.effort, fingerprint: fp,
      });
      if (insErr) throw new Error(`recommendations insert: ${insErr.message}`);
      inserted++;
    }
  }
  return { inserted, merged };
}
