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

/** `done` is the responses count; pass `null` when the stage needs no count (all queries are behind us). */
export function toRunProgress(run: { status: string; stage: string; queries_total: number }, done: number | null): RunProgress {
  const d = done ?? run.queries_total;
  return { status: run.status, stage: run.stage, done: d, total: run.queries_total, percent: progressOf(d, run.queries_total) };
}

const TERMINAL_STATUSES = ["failed", "empty", "budget_exceeded"];

/**
 * Nothing left to wait for: the run failed or never started, or it is done and its last stage closed.
 * (`running` with stage `done` is not finished yet: the status flip is still to come.)
 */
export function isProgressFinished(p: Pick<RunProgress, "status" | "stage">): boolean {
  return TERMINAL_STATUSES.includes(p.status) || (p.status === "done" && p.stage === "done");
}

/** Only the query stage needs a `responses` count; later stages have all queries behind them. */
export function needsResponseCount(stage: string): boolean {
  return stage === "queries";
}
