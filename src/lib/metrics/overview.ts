import type { Tables } from "@/lib/db-types";
import type { MetricRow } from "./aggregate";

export type TrendPoint = { date: string; score: number; visibilityRate: number };
export type Competitor = { name: string; mentions: number };

function toRow(r: Tables<"daily_metrics">): MetricRow {
  return {
    engineId: r.engine_id, promptId: r.prompt_id, responsesCount: r.responses_count,
    visibilityRate: Number(r.visibility_rate), avgPosition: r.avg_position == null ? null : Number(r.avg_position),
    citationRate: Number(r.citation_rate), shareOfVoice: Number(r.share_of_voice), score: Number(r.score),
  };
}

/** Czysta logika kształtowania danych przeglądu (bez I/O) — patrz getOverview w queries.ts. */
export function shapeOverview(
  rows: Tables<"daily_metrics">[],
  mentions: { brand_name: string }[],
): { latest: MetricRow | null; byEngine: MetricRow[]; trend: TrendPoint[]; competitors: Competitor[] } {
  // Wiersze per prompt (prompt_id != null) nie należą do przeglądu.
  // wiersze bez poprawnych odpowiedzi (responses_count === 0) traktujemy jak brak pomiaru
  const base = rows.filter((r) => r.prompt_id === null && r.responses_count > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const latestDate = base.length ? base[base.length - 1].date : null;
  const latestRows = latestDate === null ? [] : base.filter((r) => r.date === latestDate);
  const latestOverall = latestRows.find((r) => r.engine_id === null) ?? null;
  const byEngine = latestRows.filter((r) => r.engine_id !== null).map(toRow);
  const trend = base
    .filter((r) => r.engine_id === null)
    .map((r) => ({ date: r.date, score: Number(r.score), visibilityRate: Number(r.visibility_rate) }));

  const counts = new Map<string, number>();
  for (const m of mentions) counts.set(m.brand_name, (counts.get(m.brand_name) ?? 0) + 1);
  const competitors = [...counts.entries()]
    .map(([name, n]) => ({ name, mentions: n }))
    .sort((a, b) => b.mentions - a.mentions);

  return { latest: latestOverall ? toRow(latestOverall) : null, byEngine, trend, competitors };
}
