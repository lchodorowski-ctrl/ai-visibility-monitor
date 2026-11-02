import { schedules } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { gscSyncTask, type GscSyncPayload } from "./gsc-sync";

export interface GscSyncDailyDeps {
  admin?: SupabaseClient<Database>;
  /** Uruchamia zadanie synchronizacji dla jednego projektu; wstrzykiwane w testach. */
  trigger?: (payload: GscSyncPayload, options: { idempotencyKey: string }) => Promise<unknown>;
}

/** Codzienna synchronizacja Search Console: osobne zadanie dla każdego projektu z ustawioną usługą. */
export async function runGscSyncDaily(payload: { timestamp: Date | string }, deps: GscSyncDailyDeps = {}) {
  const admin = deps.admin ?? createAdminSupabase();
  const trigger = deps.trigger ?? ((p, options) => gscSyncTask.trigger(p, options));
  // O 6:30 czasu warszawskiego data UTC i lokalna są takie same.
  const day = new Date(payload.timestamp).toISOString().slice(0, 10);

  const { data, error } = await admin.from("projects").select("id").not("gsc_property", "is", null);
  if (error) throw new Error(error.message);
  const projects = data ?? [];

  const failures: string[] = [];
  for (const { id } of projects) {
    try {
      await trigger({ projectId: id }, { idempotencyKey: `gsc-sync:${id}:${day}` });
    } catch (err) {
      // jeden projekt nie może zatrzymać pozostałych
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length > 0) throw new Error(`gsc-sync-daily: nie uruchomiono synchronizacji (${failures.length}/${projects.length}): ${failures.join("; ")}`);
  return { triggered: projects.length };
}

export const gscSyncDaily = schedules.task({
  id: "gsc-sync-daily",
  cron: { pattern: "30 6 * * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] },
  run: (payload) => runGscSyncDaily(payload),
});
