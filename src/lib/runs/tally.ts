export type BatchRun = { ok: true; output: { ok: boolean; costUsd: number } } | { ok: false };

/** Sumuje koszt i liczy nieudane zapytania z wyniku batchTriggerAndWait (child failed = ok: false). */
export function tallyBatch(runs: BatchRun[]): { cost: number; failed: number } {
  let cost = 0;
  let failed = 0;
  for (const r of runs) {
    if (r.ok) { cost += r.output.costUsd; if (!r.output.ok) failed++; }
    else failed++;
  }
  return { cost, failed };
}
