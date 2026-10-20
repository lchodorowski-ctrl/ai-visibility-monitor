import Link from "next/link";
import { cn } from "cn";
import { Meta, Rows } from "@/components/psai";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { highlight, type CountRow, type CountsView, type QuoteView } from "@/lib/recommend/evidence-view";
import { isUuid } from "@/lib/validation/uuid";

/** One ranked row: rank, label (flag below it), a bar scaled to the most frequent row, count. */
function CountItem({ r, max }: { r: CountRow; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((r.count / max) * 100)) : 0;
  return (
    <li className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-t2">{String(r.rank).padStart(2, "0")}</span>
      <span className="min-w-0 flex-1">
        {/* names wrap at spaces; only a word too long for the row (a long domain) breaks inside */}
        <span className={cn("block wrap-anywhere text-sm", r.isTarget && "font-semibold text-t0")}>{r.label}</span>
        {r.isTarget && <Meta className="block text-t0">cel rekomendacji</Meta>}
        {r.isOwn && <Meta className="block text-teal">Wasza domena</Meta>}
      </span>
      <span aria-hidden="true" className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-line-2 sm:w-24">
        <span className={cn("block h-full rounded-full", r.isTarget || r.isOwn ? "bg-ink" : "bg-ink/35")} style={{ width: `${width}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums">{r.count}×</span>
    </li>
  );
}

/**
 * Top rows (split into two lists side by side when `wide`) and the rest behind a disclosure,
 * so 50 cited domains never stretch the page.
 */
export function CountList({ view, wide }: { view: CountsView; wide?: boolean }) {
  const half = Math.ceil(view.top.length / 2);
  const columns = wide && view.top.length > 5 ? [view.top.slice(0, half), view.top.slice(half)] : [view.top];
  return (
    <>
      <div className={cn("grid gap-6", columns.length > 1 && "md:grid-cols-2")}>
        {columns.map((rows, i) => (
          <Rows key={i}>{rows.map((r) => <CountItem key={r.label} r={r} max={view.max} />)}</Rows>
        ))}
      </div>
      {view.rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer px-2 py-1 text-sm text-t1 hover:text-t0">Pokaż resztę ({view.rest.length})</summary>
          <Rows className="mt-3">{view.rest.map((r) => <CountItem key={r.label} r={r} max={view.max} />)}</Rows>
        </details>
      )}
    </>
  );
}

export interface StackBlock { key: string; node: React.ReactNode; height: number }

/**
 * Two independent stacks instead of a row grid, so a long list never leaves a gap beside a short one:
 * each block goes to the shorter stack by its rough `height`. On a phone the stacks dissolve (`contents`)
 * and `order` restores the reading order of `blocks`.
 */
export function BalancedColumns({ blocks }: { blocks: StackBlock[] }) {
  const stacks: StackBlock[][] = [[], []];
  const heights = [0, 0];
  for (const b of blocks) {
    const i = heights[0] <= heights[1] ? 0 : 1;
    stacks[i].push(b);
    heights[i] += b.height;
  }
  return (
    <div className="flex flex-col gap-10 md:grid md:grid-cols-2 md:items-start md:gap-6">
      {stacks.map((stack, i) => (
        <div key={i} className="contents md:flex md:flex-col md:gap-10">
          {stack.map((b) => <div key={b.key} style={{ order: blocks.indexOf(b) }}>{b.node}</div>)}
        </div>
      ))}
    </div>
  );
}

export function QuoteCard({ q, terms }: { q: QuoteView; terms: string[] }) {
  const engine = q.engineId ? (ENGINE_LABELS[q.engineId as EngineId] ?? q.engineId) : "Odpowiedź";
  return (
    <li className="flex flex-col rounded-[28px] bg-s1 px-6 py-5 md:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Meta>{engine}</Meta>
        {q.responseId && isUuid(q.responseId) && (
          <Link href={`/app/responses/${q.responseId}`} className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">cała odpowiedź →</Link>
        )}
      </div>
      <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-t1">
        {highlight(q.text, terms).map((s, i) => s.hit
          ? <mark key={i} className="rounded bg-ink/10 px-0.5 font-medium text-t0">{s.text}</mark>
          : <span key={i}>{s.text}</span>)}
      </p>
    </li>
  );
}
