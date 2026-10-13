// Ręczne uruchomienie crawla mapy strony dla projektu PSAI.
import { tasks } from "@trigger.dev/sdk";
import type { crawlSiteTask } from "@/trigger/crawl-site";

const PROJECT_ID = process.argv[2] ?? "22222222-2222-2222-2222-222222222222";
tasks.trigger<typeof crawlSiteTask>("crawl-site", { projectId: PROJECT_ID })
  .then((h) => console.log("Uruchomiono crawl-site:", h.id))
  .catch((e) => { console.error(e); process.exit(1); });
