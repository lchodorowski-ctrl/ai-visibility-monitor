import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function monthSpend(admin: SupabaseClient<Database>, projectId: string, now = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("runs").select("cost_usd").eq("project_id", projectId).gte("started_at", monthStartIso(now));
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}
