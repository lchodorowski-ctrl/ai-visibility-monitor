export const STALE_RUN_MINUTES = 60;

/** Run w statusie `running` startujący dawniej niż 60 minut temu uznajemy za przerwany. */
export function isRunStale(run: { status: string; started_at: string }, now: Date = new Date()): boolean {
  return run.status === "running" && now.getTime() - new Date(run.started_at).getTime() > STALE_RUN_MINUTES * 60_000;
}

/** Recommendations are generated after the run is already `done`; past this we assume the background task died. */
export const RECOMMEND_TTL_MINUTES = 45;

/**
 * Whether a measurement still has something to show progress for: it is running (and not stale), or it has
 * finished its queries/aggregation but the recommendations stage has not closed yet (`done` with stage != `done`).
 */
export function isRunInFlight(
  run: { status: string; stage: string; started_at: string; finished_at: string | null },
  now: Date = new Date(),
): boolean {
  if (run.status === "running") return !isRunStale(run, now);
  if (run.status === "done" && run.stage !== "done" && run.finished_at) {
    return now.getTime() - new Date(run.finished_at).getTime() <= RECOMMEND_TTL_MINUTES * 60_000;
  }
  return false;
}
