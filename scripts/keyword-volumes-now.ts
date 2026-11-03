// Ręczny pomiar wolumenów Google Ads i Google Trends dla śledzonych fraz projektu PSAI (płatne: DataForSEO).
// Użycie: npx tsx --env-file=.env.local scripts/keyword-volumes-now.ts [projectId] [--local]
//   bez --local: uruchamia zadanie keyword-volumes w Trigger.dev
//   --local:     wykonuje pomiar w tym procesie (wymaga SUPABASE_SERVICE_ROLE_KEY, DATAFORSEO_LOGIN i DATAFORSEO_PASSWORD)
import { tasks } from "@trigger.dev/sdk";
import type { keywordVolumesTask } from "@/trigger/keyword-volumes";
import { runKeywordVolumes } from "@/lib/seo/keyword-volumes";
import { createAdminSupabase } from "@/lib/supabase/admin";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "22222222-2222-2222-2222-222222222222";

async function main() {
  if (flags.has("--local")) {
    const result = await runKeywordVolumes({ projectId: PROJECT_ID }, { admin: createAdminSupabase() });
    console.log("Pomiar wolumenów:", result);
    return;
  }
  const handle = await tasks.trigger<typeof keywordVolumesTask>("keyword-volumes", { projectId: PROJECT_ID });
  console.log("Uruchomiono keyword-volumes:", handle.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
