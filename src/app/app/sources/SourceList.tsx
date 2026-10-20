import Link from "next/link";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { Meta, Rows } from "@/components/psai";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { pluralPl } from "@/lib/format/plural";
import type { SourceRow, SourcesView } from "@/lib/sources/aggregate";

const engineLabel = (id: string) => ENGINE_LABELS[id as EngineId] ?? id;
// the same engine order in every row, so a glance down the list compares like with like
const ENGINE_ORDER: string[] = Object.keys(ENGINE_LABELS);
const engineIndex = (id: string) => { const i = ENGINE_ORDER.indexOf(id); return i < 0 ? ENGINE_ORDER.length : i; };
const inEngineOrder = (engines: SourceRow["engines"]) => [...engines].sort((a, b) => engineIndex(a.id) - engineIndex(b.id));

/** One ranked domain; opening it lists the prompts whose answers cite it. */
function SourceItem({ r, max }: { r: SourceRow; max: number }) {
  const width = max > 0 ? Math.max(4, Math.round((r.responses / max) * 100)) : 0;
  const engines = inEngineOrder(r.engines);
  return (
    <li className="border-t border-line first:border-t-0">
      <details className="group">
        <summary className="-mx-2 flex cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-bg/60 [&::-webkit-details-marker]:hidden">
          <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-t2">{String(r.rank).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1">
            {/* only a word too long for the row (a long domain) breaks inside */}
            <span className={cn("block wrap-anywhere text-sm", r.isOwn && "font-semibold text-t0")}>{r.domain}</span>
            <Meta className="block">
              {pluralPl(r.prompts.length, ["pytanie", "pytania", "pytań"])} · {engines.map((e) => engineLabel(e.id)).join(", ")}
            </Meta>
            {r.isOwn && <Meta className="block text-teal">Wasza domena</Meta>}
            {r.competitor && <Meta className="block text-t0">Konkurent: {r.competitor}</Meta>}
          </span>
          {/* on a phone the bar would squeeze the domain; the count alone carries the ranking there */}
          <span aria-hidden="true" className="hidden h-1 w-24 shrink-0 overflow-hidden rounded-full bg-line-2 sm:block">
            <span className={cn("block h-full rounded-full", r.isOwn ? "bg-ink" : "bg-ink/35")} style={{ width: `${width}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums">
            <span aria-hidden="true">{r.responses}×</span>
            <span className="sr-only">{pluralPl(r.responses, ["odpowiedź", "odpowiedzi", "odpowiedzi"])}</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-t2 transition group-open:rotate-90" />
        </summary>
        <div className="pb-5 pl-9 pr-2">
          <ul className="space-y-2">
            {r.prompts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <Link href={`/app/responses?prompt=${p.id}`} className="min-w-0 flex-1 basis-64 text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">
                  {p.text || "Pytanie bez treści"}
                </Link>
                <Meta className="shrink-0">{pluralPl(p.responses, ["odpowiedź", "odpowiedzi", "odpowiedzi"])}</Meta>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <Meta>{engines.map((e) => `${engineLabel(e.id)} ${e.responses}`).join(" · ")}</Meta>
            <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">
              Otwórz stronę ↗
            </a>
          </div>
        </div>
      </details>
    </li>
  );
}

/** Top domains and the rest behind a disclosure, so hundreds of cited domains never stretch the page. */
export function SourceList({ view }: { view: SourcesView }) {
  return (
    <>
      <Rows>{view.top.map((r) => <SourceItem key={r.domain} r={r} max={view.max} />)}</Rows>
      {view.rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer px-2 py-1 text-sm text-t1 hover:text-t0">Pokaż resztę ({view.rest.length})</summary>
          <Rows className="mt-3">{view.rest.map((r) => <SourceItem key={r.domain} r={r} max={view.max} />)}</Rows>
        </details>
      )}
    </>
  );
}
