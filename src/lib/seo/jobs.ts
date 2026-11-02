import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db-types";

export type SeoJobKind =
  | "gsc_sync"
  | "rank_check"
  | "url_inspection"
  | "pagespeed"
  | "keyword_volumes"
  | "keyword_research"
  | "seo_recommend"
  | "seo_weekly";

/** Final states of a job; `running` is set only by `startJob`. */
export type SeoJobStatus = "done" | "failed" | "budget_exceeded" | "skipped";

/** Opens a ledger entry (status `running`) and returns its id. */
export async function startJob(admin: SupabaseClient<Database>, projectId: string, kind: SeoJobKind): Promise<string> {
  const { data, error } = await admin
    .from("seo_jobs").insert({ project_id: projectId, kind, status: "running" }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Closes a ledger entry: final status, cost, stats and `finished_at`. */
export async function finishJob(
  admin: SupabaseClient<Database>,
  jobId: string,
  r: { status: SeoJobStatus; stats?: Record<string, unknown>; error?: string; costUsd?: number },
): Promise<void> {
  const { error } = await admin
    .from("seo_jobs")
    .update({
      status: r.status,
      cost_usd: r.costUsd ?? 0,
      stats: (r.stats ?? {}) as NonNullable<Json>,
      error: r.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}
