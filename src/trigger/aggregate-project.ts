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
    // snapshot dnia = unia wszystkich runów rozpoczętych tego dnia (UTC); payload.runId służy tylko do logów
    const dayStart = `${payload.date}T00:00:00Z`;
    const dayEnd = new Date(Date.parse(dayStart) + 24 * 3600 * 1000).toISOString();
    const { data: dayRuns, error: runsError } = await admin
      .from("runs").select("id").eq("project_id", payload.projectId)
      .gte("started_at", dayStart).lt("started_at", dayEnd);
    if (runsError) throw new Error(runsError.message);
    const runIds = (dayRuns ?? []).map((r) => r.id);
    console.log(`aggregate-project: ${payload.date}, run ${payload.runId}, runów z dnia: ${runIds.length}`);
    // Wzmianki i cytowania pobieramy przez relację (embedded select), a nie przez `.in(ids)` —
    // lista id odpowiedzi w URL rosła z każdym runem dnia i przekraczała limit długości URI.
    const { data: responses, error } = await admin
      .from("responses")
      .select("id, prompt_id, engine_id, no_answer, error, mentions(brand_kind, position), citations(is_own)")
      .in("run_id", runIds)
      .limit(5000);
    if (error) throw new Error(error.message);
    const facts: ResponseFacts[] = (responses ?? []).map((r) => {
      const ms = r.mentions ?? [];
      const own = ms.find((m) => m.brand_kind === "own");
      return {
        promptId: r.prompt_id, engineId: r.engine_id,
        noAnswer: r.no_answer, error: Boolean(r.error),
        ownMentioned: Boolean(own), ownPosition: own?.position ?? null,
        ownCited: (r.citations ?? []).some((c) => c.is_own),
        brandsMentioned: ms.length,
      };
    });
    const rows = computeMetrics(facts);
    await upsertDailyMetrics(admin, payload.projectId, payload.date, rows);
    return { rows: rows.length, score: rows[0]?.score ?? 0 };
  },
});
