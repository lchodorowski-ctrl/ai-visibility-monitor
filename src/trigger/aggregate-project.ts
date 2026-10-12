import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeMetrics, type ResponseFacts } from "@/lib/metrics/aggregate";
import { upsertDailyMetrics } from "@/lib/metrics/persist";

export interface AggregateProjectPayload {
  projectId: string;
  runId: string;
  date: string; // YYYY-MM-DD
}

export const aggregateProject = task({
  id: "aggregate-project",
  run: async (payload: AggregateProjectPayload) => {
    const admin = createAdminSupabase();
    const { data: responses, error } = await admin
      .from("responses").select("id, prompt_id, engine_id, no_answer, error").eq("run_id", payload.runId);
    if (error) throw new Error(error.message);
    const ids = (responses ?? []).map((r) => r.id);
    const [{ data: mentions, error: mentionsError }, { data: citations, error: citationsError }] = await Promise.all([
      admin.from("mentions").select("response_id, brand_kind, position").in("response_id", ids),
      admin.from("citations").select("response_id, is_own").in("response_id", ids),
    ]);
    if (mentionsError) throw new Error(mentionsError.message);
    if (citationsError) throw new Error(citationsError.message);
    const facts: ResponseFacts[] = (responses ?? []).map((r) => {
      const ms = (mentions ?? []).filter((m) => m.response_id === r.id);
      const own = ms.find((m) => m.brand_kind === "own");
      return {
        promptId: r.prompt_id, engineId: r.engine_id,
        noAnswer: r.no_answer, error: Boolean(r.error),
        ownMentioned: Boolean(own), ownPosition: own?.position ?? null,
        ownCited: (citations ?? []).some((c) => c.response_id === r.id && c.is_own),
        brandsMentioned: ms.length,
      };
    });
    const rows = computeMetrics(facts);
    await upsertDailyMetrics(admin, payload.projectId, payload.date, rows);
    return { rows: rows.length, score: rows[0]?.score ?? 0 };
  },
});
