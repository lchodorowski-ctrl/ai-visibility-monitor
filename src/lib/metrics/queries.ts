import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db-types";
import type { MetricRow } from "./aggregate";
import { shapeOverview } from "./overview";

export async function getOverview(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<{
  latest: MetricRow | null;
  byEngine: MetricRow[];
  trend: { date: string; score: number; visibilityRate: number }[];
  competitors: { name: string; mentions: number }[];
  lastRun: Tables<"runs"> | null;
}> {
  const { data: all, error: metricsError } = await supabase
    .from("daily_metrics").select("*").eq("project_id", projectId).is("prompt_id", null).order("date");
  if (metricsError) throw new Error(`Nie udało się pobrać metryk: ${metricsError.message}`);

  const { data: lastRun, error: runError } = await supabase
    .from("runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (runError) throw new Error(`Nie udało się pobrać ostatniego runu: ${runError.message}`);

  let mentions: { brand_name: string }[] = [];
  if (lastRun) {
    const { data, error: mentionsError } = await supabase
      .from("mentions").select("brand_name, response_id, responses!inner(run_id)")
      .eq("project_id", projectId).eq("responses.run_id", lastRun.id);
    if (mentionsError) throw new Error(`Nie udało się pobrać wzmianek: ${mentionsError.message}`);
    mentions = data ?? [];
  }

  return { ...shapeOverview(all ?? [], mentions), lastRun: lastRun ?? null };
}
