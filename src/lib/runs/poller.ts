import { isProgressFinished, type RunProgress } from "./progress";

/** `gone`: the endpoint will not answer usefully again (404, redirect to login, non-JSON) - stop polling. */
export type PollResult = RunProgress | "gone";

export interface ProgressPollerOptions {
  /** Throwing (network blip, 5xx) means "try again on the next tick". */
  fetchProgress: () => Promise<PollResult>;
  intervalMs: number;
  onUpdate: (progress: RunProgress) => void;
  /** Called once, after the last update, when the run has nothing left to show. */
  onFinish: (progress: RunProgress) => void;
  isFinished?: (progress: RunProgress) => boolean;
}

/**
 * Self-scheduling poller: the next request is scheduled only after the previous one settled (no overlap),
 * and polling stops on finish, on `gone`, or on `stop()`.
 */
export function createProgressPoller({ fetchProgress, intervalMs, onUpdate, onFinish, isFinished = isProgressFinished }: ProgressPollerOptions) {
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => { timer = setTimeout(tick, intervalMs); };

  async function tick() {
    let result: PollResult | undefined;
    try {
      result = await fetchProgress();
    } catch {
      // retried on the next tick
    }
    if (stopped) return;
    if (result === "gone") { stop(); return; }
    if (result) {
      onUpdate(result);
      if (isFinished(result)) { stop(); onFinish(result); return; }
    }
    schedule();
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    schedule();
  }

  function stop() {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  return { start, stop };
}
