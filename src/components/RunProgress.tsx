"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Meta, ProgressBar } from "@/components/psai";
import { isProgressFinished, stageLabel, type RunProgress as Progress } from "@/lib/runs/progress";
import { createProgressPoller, type PollResult } from "@/lib/runs/poller";

export const POLL_INTERVAL_MS = 5000;

async function fetchProgress(runId: string, signal: AbortSignal): Promise<PollResult> {
  const res = await fetch(`/api/runs/${runId}/progress`, { cache: "no-store", signal });
  if (res.status >= 500) throw new Error(`progress: ${res.status}`);
  // 404, an expired session redirected to /login (HTML) or any other non-JSON answer: do not poll further
  if (!res.ok || res.redirected || !res.headers.get("content-type")?.includes("application/json")) return "gone";
  return (await res.json()) as Progress;
}

/**
 * Live progress of a measurement. Polls while it is running or its recommendations are still being generated,
 * and refreshes the server-rendered status twice at most: when the run leaves `running` and when everything is done.
 */
export function RunProgress({ runId, initial }: { runId: string; initial: Progress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const refreshed = useRef(new Set<"status-changed" | "finished">());
  const refreshOnce = (key: "status-changed" | "finished") => {
    if (refreshed.current.has(key)) return;
    refreshed.current.add(key);
    router.refresh();
  };
  // the latest closure, so the long-lived poller never calls a stale router
  const refreshRef = useRef(refreshOnce);
  useEffect(() => { refreshRef.current = refreshOnce; });

  useEffect(() => {
    if (isProgressFinished(initial)) { refreshRef.current("finished"); return; }
    const controller = new AbortController();
    let lastStatus = initial.status;
    const poller = createProgressPoller({
      intervalMs: POLL_INTERVAL_MS,
      fetchProgress: () => fetchProgress(runId, controller.signal),
      onUpdate: (p) => {
        setProgress(p);
        if (lastStatus === "running" && p.status !== "running") refreshRef.current("status-changed");
        lastStatus = p.status;
      },
      onFinish: () => refreshRef.current("finished"),
    });
    poller.start();
    return () => { controller.abort(); poller.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` only seeds the first run of the poller
  }, [runId]);

  if (isProgressFinished(progress) || progress.stage === "done") return null;

  const label = stageLabel(progress.stage);
  if (!label) {
    const { done, total, percent } = progress;
    return (
      <div>
        <ProgressBar value={percent / 100} label="Postęp pomiaru" className="mt-3" />
        <Meta className="mt-2 block">Zapytania: {done} z {total} ({percent}%)</Meta>
      </div>
    );
  }
  return (
    <div>
      <div role="progressbar" aria-label={label} className="mt-3 h-1.5 overflow-hidden rounded-full bg-line-2">
        <div className="h-full w-full animate-pulse rounded-full bg-ink motion-reduce:w-1/3" />
      </div>
      <Meta className="mt-2 block">{label}</Meta>
    </div>
  );
}
