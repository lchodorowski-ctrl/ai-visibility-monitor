import { runRecommendProject } from "@/trigger/recommend-project";
const t0 = Date.now();
runRecommendProject({ projectId: "22222222-2222-2222-2222-222222222222", runId: null, date: "2026-10-12" })
  .then((r) => { console.log("RESULT", JSON.stringify(r), "in", Math.round((Date.now() - t0) / 1000), "s"); process.exit(0); })
  .catch((e) => { console.error("FAILED", e?.message ?? e); process.exit(1); });
