export type RunStage = "queries" | "aggregating" | "recommending" | "done";

export interface RunProgress {
  status: string;
  stage: string;
  done: number;
  total: number;
  percent: number;
}

/** Share of finished queries as a whole percent, clamped to 0–100 (a zero total means no progress to show). */
export function progressOf(done: number, total: number): number {
  if (!(total > 0) || !(done > 0)) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

const STAGE_LABEL: Record<string, string> = {
  aggregating: "Agregacja wyników…",
  recommending: "Generowanie rekomendacji…",
};

/** Label of the post-query stages; `queries` and `done` have no fixed label (queries show a counter). */
export function stageLabel(stage: string): string | null {
  return STAGE_LABEL[stage] ?? null;
}

export function toRunProgress(run: { status: string; stage: string; queries_total: number }, done: number): RunProgress {
  return { status: run.status, stage: run.stage, done, total: run.queries_total, percent: progressOf(done, run.queries_total) };
}
