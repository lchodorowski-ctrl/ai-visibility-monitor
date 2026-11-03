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

/**
 * Closes a ledger entry: final status, stats and `finished_at`. `cost_usd` is written only when `costUsd`
 * is given, so a cost already recorded on the row is never overwritten with 0. Throws when no row matched.
 */
export async function finishJob(
  admin: SupabaseClient<Database>,
  jobId: string,
  r: { status: SeoJobStatus; stats?: Record<string, unknown>; error?: string; costUsd?: number },
): Promise<void> {
  const { data, error } = await admin
    .from("seo_jobs")
    .update({
      status: r.status,
      ...(r.costUsd === undefined ? {} : { cost_usd: r.costUsd }),
      stats: (r.stats ?? {}) as NonNullable<Json>,
      error: r.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(`seo_jobs: brak zadania ${jobId}`);
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Reserves the estimated cost of a paid job on its own row, once the budget gate has passed: the spend of the month
 * (`seoMonthSpend`) then already counts it for any job that starts meanwhile. The closing write replaces the
 * reservation with the actual cost. Throws when the write fails or no row matched, so a paid call never starts
 * without its reservation.
 */
export async function reserveJobCost(admin: SupabaseClient<Database>, jobId: string, costUsd: number): Promise<void> {
  const { data, error } = await admin.from("seo_jobs").update({ cost_usd: costUsd }).eq("id", jobId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(`seo_jobs: brak zadania ${jobId}`);
}

/**
 * Closes a ledger entry as `failed` with the error message and the cost incurred so far. Never throws: the original
 * error matters more than a failed write to the ledger, so that one is only logged under `label`.
 */
export async function failJob(admin: SupabaseClient<Database>, jobId: string, err: unknown, costUsd: number, label: string): Promise<void> {
  try {
    await finishJob(admin, jobId, { status: "failed", error: errorMessage(err), costUsd });
  } catch (finishErr) {
    console.error(`${label}: nie udało się zamknąć zadania w rejestrze:`, errorMessage(finishErr));
  }
}
