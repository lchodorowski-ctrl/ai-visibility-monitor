import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db-types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MetricRow } from "./aggregate";
import { shapeOverview } from "./overview";

function daysAgoIso(days: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const getOverallRows = cache(async (projectId: string, days: number) => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("daily_metrics").select("*").eq("project_id", projectId).is("prompt_id", null)
    .gte("date", daysAgoIso(days)).order("date");
  if (error) throw new Error(`Nie udało się pobrać metryk: ${error.message}`);
  return data ?? [];
});

export const getLatestMetrics = cache(async (projectId: string) => {
  const rows = await getOverallRows(projectId, 90);
  const { latest, byEngine } = shapeOverview(rows, []);
  return { latest, byEngine };
});

export const getTrend = cache(async (projectId: string, days = 90) => {
  const rows = await getOverallRows(projectId, days);
  return shapeOverview(rows, []).trend;
});

export const getLastRun = cache(async (projectId: string): Promise<Tables<"runs"> | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Nie udało się pobrać ostatniego pomiaru: ${error.message}`);
  return data ?? null;
});

// PostgREST obcina odpowiedź do max_rows (1000), więc pobieramy stronami aż do niepełnej strony.
const MENTIONS_PAGE = 1000;

export const getMentionCounts = cache(async (projectId: string, runId: string) => {
  const supabase = await createServerSupabase();
  const mentions: { brand_name: string }[] = [];
  for (let from = 0; ; from += MENTIONS_PAGE) {
    const { data, error } = await supabase
      .from("mentions").select("brand_name, response_id, responses!inner(run_id)")
      .eq("project_id", projectId).eq("responses.run_id", runId)
      .order("id").range(from, from + MENTIONS_PAGE - 1);
    if (error) throw new Error(`Nie udało się pobrać wzmianek: ${error.message}`);
    const page = data ?? [];
    mentions.push(...page);
    if (page.length < MENTIONS_PAGE) break;
  }
  return shapeOverview([], mentions).competitors;
});

// Zachowane dla zgodności z istniejącą stroną; nowe ekrany używają funkcji powyżej bezpośrednio.
export async function getOverview(_supabase: SupabaseClient<Database>, projectId: string): Promise<{
  latest: MetricRow | null;
  byEngine: MetricRow[];
  trend: { date: string; score: number; visibilityRate: number }[];
  competitors: { name: string; mentions: number }[];
  lastRun: Tables<"runs"> | null;
}> {
  const [{ latest, byEngine }, trend, lastRun] = await Promise.all([
    getLatestMetrics(projectId), getTrend(projectId), getLastRun(projectId),
  ]);
  const competitors = lastRun ? await getMentionCounts(projectId, lastRun.id) : [];
  return { latest, byEngine, trend, competitors, lastRun };
}
