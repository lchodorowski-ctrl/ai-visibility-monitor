import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { monthStartIso } from "@/lib/budget";

/** Month-to-date SEO spend of a project (`seo_jobs.cost_usd`); separate from the AI budget in `src/lib/budget.ts`. */
export async function seoMonthSpend(admin: SupabaseClient<Database>, projectId: string, now = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("seo_jobs").select("cost_usd").eq("project_id", projectId).gte("started_at", monthStartIso(now));
  if (error) throw new Error(error.message);
  // numeric columns may arrive as strings from PostgREST
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

export type SeoSpendDecision = { kind: "go" } | { kind: "budget_exceeded"; spent: number; estimate: number };

/** Gate before a paid SEO call: refuse when already spent plus the estimate would exceed the monthly budget. */
export function decideSeoSpend(spent: number, estimate: number, budget: number): SeoSpendDecision {
  return spent + estimate > budget ? { kind: "budget_exceeded", spent, estimate } : { kind: "go" };
}
