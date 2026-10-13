import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Month-to-date spend of a project: engine queries (`cost_usd`) plus recommendation generation (`recommendations_cost_usd`). */
export async function monthSpend(admin: SupabaseClient<Database>, projectId: string, now = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("runs").select("cost_usd, recommendations_cost_usd").eq("project_id", projectId).gte("started_at", monthStartIso(now));
  if (error) throw new Error(error.message);
  // numeric columns may arrive as strings from PostgREST
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd) + Number(r.recommendations_cost_usd ?? 0), 0);
}
