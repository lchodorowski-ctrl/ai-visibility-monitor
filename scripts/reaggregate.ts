// Przelicza snapshot dnia bez ponownych zapytań do silników (koszt 0).
import { tasks } from "@trigger.dev/sdk";
import type { aggregateProject } from "@/trigger/aggregate-project";
import { createAdminSupabase } from "@/lib/supabase/admin";

const PROJECT_ID = process.argv[2] ?? "22222222-2222-2222-2222-222222222222";
async function main() {
  const admin = createAdminSupabase();
  const { data: run, error } = await admin.from("runs").select("id, started_at")
    .eq("project_id", PROJECT_ID).order("started_at", { ascending: false }).limit(1).single();
  if (error || !run) throw new Error(error?.message ?? "brak runów");
  const date = process.argv[3] ?? run.started_at.slice(0, 10);
  const h = await tasks.trigger<typeof aggregateProject>("aggregate-project", { projectId: PROJECT_ID, runId: run.id, date });
  console.log(`Uruchomiono aggregate-project dla ${date}:`, h.id);
}
main().catch((e) => { console.error(e); process.exit(1); });
