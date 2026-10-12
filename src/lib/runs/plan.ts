import type { EngineId } from "@/lib/engines/types";
import { ENGINE_COST_USD } from "@/lib/engines/registry";

export const KEY_PROMPT_SAMPLES = 3;

export interface QueryJob {
  promptId: string;
  promptText: string;
  engineId: EngineId;
  sampleIdx: number;
}

export function planQueries(
  prompts: { id: string; text: string; is_key: boolean }[],
  engines: EngineId[],
): QueryJob[] {
  const jobs: QueryJob[] = [];
  for (const p of prompts) {
    const samples = p.is_key ? KEY_PROMPT_SAMPLES : 1;
    for (const engineId of engines) {
      for (let sampleIdx = 0; sampleIdx < samples; sampleIdx++) {
        jobs.push({ promptId: p.id, promptText: p.text, engineId, sampleIdx });
      }
    }
  }
  return jobs;
}

export function estimateCost(jobs: QueryJob[]): number {
  return jobs.reduce((s, j) => s + ENGINE_COST_USD[j.engineId], 0);
}
