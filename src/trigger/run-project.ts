import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isEngineId } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { planQueries, estimateCost } from "@/lib/runs/plan";
import { decideRun } from "@/lib/runs/guard";
import { tallyBatch } from "@/lib/runs/tally";
import { monthSpend } from "@/lib/budget";
import { queryEngine } from "./query-engine";
import { aggregateProject } from "./aggregate-project";
import { recommendProject } from "./recommend-project";

export interface RunProjectPayload {
  projectId: string;
  source: "manual" | "cron";
}

export const runProject = task({
  id: "run-project",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 3600,
  run: async (payload: RunProjectPayload) => {
    const admin = createAdminSupabase();
    const { projectId } = payload;

    const [projectRes, promptsRes, enginesRes, competitorsRes] = await Promise.all([
      admin.from("projects").select("*").eq("id", projectId).single(),
      admin.from("prompts").select("id, text, is_key").eq("project_id", projectId).eq("active", true),
      admin.from("project_engines").select("engine_id").eq("project_id", projectId).eq("enabled", true),
      admin.from("competitors").select("id, name, aliases, domains").eq("project_id", projectId),
    ]);
    for (const res of [projectRes, promptsRes, enginesRes, competitorsRes]) {
      if (res.error) throw new Error(res.error.message);
    }
    const project = projectRes.data;
    if (!project) throw new Error(`Projekt ${projectId} nie istnieje`);
    const prompts = promptsRes.data ?? [];
    const competitors = competitorsRes.data ?? [];

    const engineIds = (enginesRes.data ?? []).map((e) => e.engine_id).filter(isEngineId) as EngineId[];
    const jobs = planQueries(prompts, engineIds);

    // wiersz runu powstaje przed decyzją, żeby runy empty/budget_exceeded też były widoczne w historii
    const { data: run, error: runError } = await admin.from("runs")
      .insert({ project_id: projectId, trigger_source: payload.source, queries_total: jobs.length })
      .select("id").single();
    if (runError) throw new Error(runError.message);
    const runId = run.id;

    // data snapshotu ustalana na starcie runu (run przez północ UTC nie rozbije metryk na dwa dni)
    const date = new Date().toISOString().slice(0, 10);
    let cost = 0;
    let failed = 0;

    // po utworzeniu wiersza runu każdy błąd musi zamknąć run jako failed (nie zostawiamy "running")
    try {
      const spent = await monthSpend(admin, projectId);
      const estimate = estimateCost(jobs);
      const budget = Number(project.monthly_budget_usd);
      const decision = decideRun(jobs.length, spent, estimate, budget);
      if (decision.kind === "empty") {
        const { error } = await admin.from("runs").update({ status: "empty", finished_at: new Date().toISOString(), error: "Brak aktywnych promptów lub silników" }).eq("id", runId);
        if (error) throw new Error(error.message);
        return { runId, status: "empty" as const };
      }
      if (decision.kind === "budget_exceeded") {
        const { error } = await admin.from("runs").update({
          status: "budget_exceeded", finished_at: new Date().toISOString(),
          error: `Budżet ${budget} USD: wydano ${spent.toFixed(2)}, pomiar kosztowałby ~${estimate.toFixed(2)}`,
        }).eq("id", runId);
        if (error) throw new Error(error.message);
        return { runId, status: "budget_exceeded" as const };
      }

      const brand = {
        brandName: project.brand_name, aliases: project.brand_aliases, domains: project.domains,
        locale: project.locale, country: project.country,
      };
      const results = await queryEngine.batchTriggerAndWait(
        jobs.map((job) => ({ payload: { runId, projectId, job, project: brand, competitors } })),
      );

      ({ cost, failed } = tallyBatch(results.runs));

      // wszystkie zapytania nieudane: nie agregujemy (nie zapisujemy zer), zamykamy run jako failed
      if (failed === jobs.length) {
        const { error: allFailedError } = await admin.from("runs").update({
          status: "failed", finished_at: new Date().toISOString(), cost_usd: cost, queries_failed: failed,
          error: "Wszystkie zapytania nie powiodły się",
        }).eq("id", runId);
        if (allFailedError) throw new Error(allFailedError.message);
        return { runId, status: "failed" as const, cost, failed, total: jobs.length };
      }

      const agg = await aggregateProject.triggerAndWait({ projectId, runId, date });
      const aggregationError = agg.ok ? null : `aggregation failed: ${String(agg.error)}`;

      // rekomendacje liczą się w tle (trigger, nie triggerAndWait) — run kończy się od razu;
      // nieudane zlecenie rekomendacji nie psuje udanego pomiaru (logujemy i idziemy dalej)
      if (!aggregationError) {
        try {
          await recommendProject.trigger({ projectId, runId, date });
        } catch (err) {
          console.error(`run-project: nie udało się zlecić recommend-project dla runu ${runId}:`, err instanceof Error ? err.message : String(err));
        }
      }

      const status = aggregationError ? ("failed" as const) : ("done" as const);
      const { error: finishError } = await admin.from("runs").update({
        status, finished_at: new Date().toISOString(), cost_usd: cost, queries_failed: failed,
        ...(aggregationError ? { error: aggregationError } : {}),
      }).eq("id", runId);
      if (finishError) throw new Error(finishError.message);

      return { runId, status, cost, failed, total: jobs.length };
    } catch (err) {
      const { error: closeError } = await admin.from("runs").update({
        status: "failed", error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(), cost_usd: cost,
      }).eq("id", runId);
      if (closeError) console.error(`run-project: nie udało się oznaczyć runu ${runId} jako failed: ${closeError.message}`);
      throw err;
    }
  },
});
