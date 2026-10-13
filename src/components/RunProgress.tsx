"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Meta, ProgressBar } from "@/components/psai";
import { stageLabel, type RunProgress as Progress } from "@/lib/runs/progress";

export const POLL_INTERVAL_MS = 5000;

const isFinished = (p: Progress) => p.status !== "running" || p.stage === "done";

/** Live progress of a running measurement; refreshes the server-rendered status once it ends. */
export function RunProgress({ runId, initial }: { runId: string; initial: Progress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const refreshed = useRef(false);
  const finished = isFinished(progress);

  useEffect(() => {
    if (finished) return;
    let cancelled = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/progress`, { cache: "no-store", signal: controller.signal });
        if (!res.ok || cancelled) return;
        setProgress((await res.json()) as Progress);
      } catch {
        // a missed poll (network blip, abort on unmount) is retried on the next tick
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [runId, finished]);

  useEffect(() => {
    if (!finished || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [finished, router]);

  if (finished) return null;

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
        <div className="h-full w-full animate-pulse rounded-full bg-ink" />
      </div>
      <Meta className="mt-2 block">{label}</Meta>
    </div>
  );
}
