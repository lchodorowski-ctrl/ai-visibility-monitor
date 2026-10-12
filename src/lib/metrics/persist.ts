import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { MetricRow } from "./aggregate";

export async function upsertDailyMetrics(
  admin: SupabaseClient<Database>,
  projectId: string,
  date: string, // YYYY-MM-DD
  rows: MetricRow[],
) {
  // pusta tablica nie może skasować istniejącego snapshotu dnia
  if (rows.length === 0) return;
  // unikalny indeks używa coalesce(), więc upsert robimy przez delete + insert dla tej daty
  const { error: delErr } = await admin.from("daily_metrics").delete().eq("project_id", projectId).eq("date", date);
  if (delErr) throw new Error(delErr.message);
  const { error } = await admin.from("daily_metrics").insert(
    rows.map((m) => ({
      project_id: projectId, date,
      engine_id: m.engineId, prompt_id: m.promptId,
      responses_count: m.responsesCount,
      visibility_rate: m.visibilityRate, avg_position: m.avgPosition,
      citation_rate: m.citationRate, share_of_voice: m.shareOfVoice, score: m.score,
    })),
  );
  if (error) throw new Error(error.message);
}
