import type { PromptVisibility } from "./qualify";

export function visibilityByPrompt(metricRows: { prompt_id: string | null; engine_id: string | null; visibility_rate: number | string; responses_count: number }[], prompts: { id: string; intent: string }[]): PromptVisibility[] {
  return prompts.map((p) => {
    const rows = metricRows.filter((r) => r.prompt_id === p.id);
    const overall = rows.find((r) => r.engine_id === null);
    return {
      promptId: p.id, intent: p.intent,
      overall: overall ? { visibilityRate: Number(overall.visibility_rate), responsesCount: overall.responses_count } : null,
      byEngine: rows.filter((r) => r.engine_id !== null).map((r) => ({ engineId: r.engine_id as string, visibilityRate: Number(r.visibility_rate), responsesCount: r.responses_count })),
    };
  });
}
