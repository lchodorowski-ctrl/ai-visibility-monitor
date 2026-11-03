// Ręczne badanie fraz dla projektu PSAI: podpowiedzi do haseł, frazy własnej domeny i luki wobec konkurentów (płatne: DataForSEO).
// Użycie: npx tsx --env-file=.env.local scripts/keyword-research-now.ts [projectId] --seeds "szkolenia ai, kurs chatgpt" [--no-competitors] [--local]
//   --seeds:           hasła startowe oddzielone przecinkami (najwyżej 10)
//   --no-competitors:  bez luk wobec konkurentów (tańsze: tylko podpowiedzi i własna domena)
//   bez --local: uruchamia zadanie keyword-research w Trigger.dev
//   --local:     wykonuje badanie w tym procesie (wymaga SUPABASE_SERVICE_ROLE_KEY, DATAFORSEO_LOGIN i DATAFORSEO_PASSWORD)
import { tasks } from "@trigger.dev/sdk";
import type { keywordResearchTask } from "@/trigger/keyword-research";
import { runKeywordResearch } from "@/lib/seo/keyword-research";
import { parseKeywordList } from "@/lib/seo/keywords";
import { createAdminSupabase } from "@/lib/supabase/admin";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const seedsAt = args.indexOf("--seeds");
const seedsArg = seedsAt === -1 ? undefined : args[seedsAt + 1];
const PROJECT_ID = args.find((a, i) => !a.startsWith("--") && i !== seedsAt + 1) ?? "22222222-2222-2222-2222-222222222222";
const competitors = !flags.has("--no-competitors");

async function main() {
  if (seedsArg === undefined || seedsArg.startsWith("--")) {
    throw new Error('Podaj hasła: --seeds "szkolenia ai, kurs chatgpt"');
  }
  const seeds = parseKeywordList(seedsArg, 10);
  const payload = { projectId: PROJECT_ID, seeds, competitors };

  if (flags.has("--local")) {
    const result = await runKeywordResearch(payload, { admin: createAdminSupabase() });
    console.log("Badanie fraz:", result);
    return;
  }
  const handle = await tasks.trigger<typeof keywordResearchTask>("keyword-research", payload);
  console.log("Uruchomiono keyword-research:", handle.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
