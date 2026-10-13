// Ręczne uruchomienie generowania rekomendacji dla projektu PSAI.
// Użycie: npx tsx --env-file=.env.local scripts/recommend-now.ts [projectId] [YYYY-MM-DD]
import { tasks } from "@trigger.dev/sdk";
import type { recommendProject } from "@/trigger/recommend-project";

const PROJECT_ID = process.argv[2] ?? "22222222-2222-2222-2222-222222222222";
const DATE = process.argv[3] ?? new Date().toISOString().slice(0, 10);
tasks.trigger<typeof recommendProject>("recommend-project", { projectId: PROJECT_ID, runId: null, date: DATE })
  .then((h) => console.log("Uruchomiono recommend-project:", h.id))
  .catch((e) => { console.error(e); process.exit(1); });
