import { task } from "@trigger.dev/sdk";
import { runGscSync } from "@/lib/seo/gsc-sync";

export interface GscSyncPayload { projectId: string; backfill?: boolean }

export const gscSyncTask = task({
  id: "gsc-sync",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 2 },
  maxDuration: 1800,
  run: (p: GscSyncPayload) => runGscSync(p),
});
