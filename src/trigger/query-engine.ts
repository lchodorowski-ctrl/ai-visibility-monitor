import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/engines/registry";
import { runQueryEngine, type QueryEnginePayload } from "@/lib/runs/query-engine-core";

export type { QueryEnginePayload };

export const queryEngine = task({
  id: "query-engine",
  queue: { concurrencyLimit: 4 },
  retry: { maxAttempts: 2 },
  run: async (payload: QueryEnginePayload) =>
    runQueryEngine(createAdminSupabase(), getAdapter(payload.job.engineId), payload),
});
