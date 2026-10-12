export const STALE_RUN_MINUTES = 60;

/** Run w statusie `running` startujący dawniej niż 60 minut temu uznajemy za przerwany. */
export function isRunStale(run: { status: string; started_at: string }, now: Date = new Date()): boolean {
  return run.status === "running" && now.getTime() - new Date(run.started_at).getTime() > STALE_RUN_MINUTES * 60_000;
}
