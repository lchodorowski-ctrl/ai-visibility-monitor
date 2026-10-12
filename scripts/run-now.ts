// Ręczne uruchomienie runu dla projektu PSAI (to samo, co przycisk „Uruchom teraz”).
import { tasks } from "@trigger.dev/sdk";
import type { runProject } from "@/trigger/run-project";

const PROJECT_ID = process.argv[2] ?? "22222222-2222-2222-2222-222222222222";
tasks.trigger<typeof runProject>("run-project", { projectId: PROJECT_ID, source: "manual" })
  .then((h) => console.log("Uruchomiono run-project:", h.id))
  .catch((e) => { console.error(e); process.exit(1); });
