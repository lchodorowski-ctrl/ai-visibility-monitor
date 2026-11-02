// Ręczna synchronizacja Search Console dla projektu PSAI.
// Użycie: npx tsx --env-file=.env.local scripts/gsc-sync-now.ts [projectId] [--backfill] [--local]
//   bez --local: uruchamia zadanie gsc-sync w Trigger.dev
//   --local:     wykonuje synchronizację w tym procesie (wymaga SUPABASE_SERVICE_ROLE_KEY i GOOGLE_SERVICE_ACCOUNT_JSON)
//   --backfill:  pobiera pełne 16 miesięcy zamiast kilku ostatnich dni
import { tasks } from "@trigger.dev/sdk";
import type { gscSyncTask } from "@/trigger/gsc-sync";
import { runGscSync } from "@/lib/seo/gsc-sync";
import { createAdminSupabase } from "@/lib/supabase/admin";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "22222222-2222-2222-2222-222222222222";
const backfill = flags.has("--backfill");

async function main() {
  if (flags.has("--local")) {
    const result = await runGscSync({ projectId: PROJECT_ID, backfill }, { admin: createAdminSupabase() });
    console.log("Synchronizacja Search Console:", result);
    return;
  }
  const handle = await tasks.trigger<typeof gscSyncTask>("gsc-sync", { projectId: PROJECT_ID, backfill });
  console.log("Uruchomiono gsc-sync:", handle.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
