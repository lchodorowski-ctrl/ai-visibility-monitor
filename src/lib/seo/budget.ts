import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { monthStartIso } from "@/lib/budget";
import { fmtDecimal } from "@/lib/format/number";
import { finishJob, reserveJobCost } from "./jobs";

/** Month-to-date SEO spend of a project (`seo_jobs.cost_usd`); separate from the AI budget in `src/lib/budget.ts`. */
export async function seoMonthSpend(admin: SupabaseClient<Database>, projectId: string, now = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("seo_jobs").select("cost_usd").eq("project_id", projectId).gte("started_at", monthStartIso(now));
  if (error) throw new Error(error.message);
  // numeric columns may arrive as strings from PostgREST
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

export type SeoSpendDecision = { kind: "go" } | { kind: "budget_exceeded"; spent: number; estimate: number };

/**
 * Gate before a paid SEO call. Fails closed: goes only when spent plus the estimate is provably within
 * the monthly budget, so NaN in any argument (a comparison with NaN is always false) refuses the call.
 */
export function decideSeoSpend(spent: number, estimate: number, budget: number): SeoSpendDecision {
  return spent + estimate <= budget ? { kind: "go" } : { kind: "budget_exceeded", spent, estimate };
}

/** Polish message stored on a `budget_exceeded` job and shown in the UI: amounts in USD with a decimal comma. */
export function budgetExceededMessage(spent: number, estimate: number, budget: number): string {
  return `Limit SEO: wydano ${fmtDecimal(spent, 2)} USD z ${fmtDecimal(budget, 2)} USD, to zadanie kosztuje ok. ${fmtDecimal(estimate, 2)} USD`;
}

/**
 * The budget gate shared by every paid SEO job: month-to-date spend plus the estimate against the project's budget.
 * Over it, the job is closed as `budget_exceeded` (with the amounts) and the result is `false`, so the caller makes no
 * paid call. Within it, the estimate is reserved in the job's `cost_usd` before `true` is returned.
 */
export async function passSeoBudget(
  admin: SupabaseClient<Database>,
  o: { projectId: string; jobId: string; estimate: number; budget: number; now: Date },
): Promise<boolean> {
  const decision = decideSeoSpend(await seoMonthSpend(admin, o.projectId, o.now), o.estimate, o.budget);
  if (decision.kind === "budget_exceeded") {
    await finishJob(admin, o.jobId, {
      status: "budget_exceeded",
      error: budgetExceededMessage(decision.spent, decision.estimate, o.budget),
      stats: { spentUsd: decision.spent, estimateUsd: decision.estimate, budgetUsd: o.budget },
    });
    return false;
  }
  await reserveJobCost(admin, o.jobId, o.estimate);
  return true;
}
