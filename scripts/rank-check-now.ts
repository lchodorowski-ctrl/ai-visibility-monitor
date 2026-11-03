// Ręczne sprawdzenie pozycji śledzonych fraz projektu PSAI w Google (płatne: DataForSEO, kolejka standard, do ok. 1,32 USD).
// Użycie: npx tsx --env-file=.env.local scripts/rank-check-now.ts [projectId] [--local]
//   bez --local: uruchamia zadanie rank-check w Trigger.dev (czeka na wyniki przez wait.for)
//   --local:     wykonuje sprawdzenie w tym procesie, z prawdziwym setTimeout między odbiorami (do godziny);
//                wymaga SUPABASE_SERVICE_ROLE_KEY, DATAFORSEO_LOGIN i DATAFORSEO_PASSWORD
import { tasks } from "@trigger.dev/sdk";
import type { rankCheckTask } from "@/trigger/rank-check";
import { runRankCheck } from "@/lib/seo/rank-check";
import { createAdminSupabase } from "@/lib/supabase/admin";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "22222222-2222-2222-2222-222222222222";

async function main() {
  if (flags.has("--local")) {
    const result = await runRankCheck({ projectId: PROJECT_ID }, { admin: createAdminSupabase() });
    console.log("Sprawdzenie pozycji:", result);
    return;
  }
  const handle = await tasks.trigger<typeof rankCheckTask>("rank-check", { projectId: PROJECT_ID });
  console.log("Uruchomiono rank-check:", handle.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
