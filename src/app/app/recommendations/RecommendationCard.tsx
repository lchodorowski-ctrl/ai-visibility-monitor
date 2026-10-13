import Link from "next/link";
import { cn } from "cn";
import { Eyebrow, Meta, Tile } from "@/components/psai";
import { TYPE_LABEL, STATUS_LABEL, effortLabel, priorityLabel, type RecStatus, type RecType } from "@/lib/recommend/labels";
import type { RecommendationRow } from "@/lib/recommend/queries";
import { StatusForm } from "./StatusForm";

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** priority is a generated column (nullable in the types); fall back to the same formula. */
export function priorityOf(r: { priority: number | null; impact: number; effort: number }): number {
  return r.priority ?? r.impact * 2 - r.effort;
}

export function TargetUrl({ url, inverse }: { url: string; inverse?: boolean }) {
  const cls = cn("block max-w-full truncate font-mono text-xs underline-offset-4 hover:underline", inverse ? "text-bg/80" : "text-t1");
  return /^https?:\/\//i.test(url)
    ? <a href={url} target="_blank" rel="noreferrer" className={cls}>{url}</a>
    : <Link href={url} className={cls}>{url}</Link>;
}

export function RecommendationMeta({ r, inverse }: { r: RecommendationRow; inverse?: boolean }) {
  const status = r.status as RecStatus;
  const statusTone = inverse ? "" : status === "done" ? "text-teal" : status === "dismissed" ? "text-red" : "";
  return (
    <Meta className={inverse ? "text-bg/70" : undefined}>
      priorytet {priorityLabel(priorityOf(r))} · wysiłek {effortLabel(r.effort)}
      {status !== "todo" && STATUS_LABEL[status] && <> · <span className={statusTone}>{STATUS_LABEL[status].toLowerCase()}</span></>}
    </Meta>
  );
}

export function RecommendationCard({ r, inverse }: { r: RecommendationRow; inverse?: boolean }) {
  const type = TYPE_LABEL[r.type as RecType] ?? r.type;
  return (
    <Tile as="div" className={inverse ? "bg-ink text-bg" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Eyebrow className={inverse ? "text-bg/70" : undefined}>{type}</Eyebrow>
        <RecommendationMeta r={r} inverse={inverse} />
      </div>
      <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.01em]">{r.title}</h3>
      <p className={cn("mt-2 text-[14px]", inverse ? "text-bg/80" : "text-t1")}>{r.summary}</p>
      {r.prompts?.text && <Meta className={cn("mt-4 block normal-case tracking-normal", inverse && "text-bg/70")}>Pytanie: {truncate(r.prompts.text, 90)}</Meta>}
      {r.target_url && <div className="mt-2"><TargetUrl url={r.target_url} inverse={inverse} /></div>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-6">
        <StatusForm id={r.id} status={r.status as RecStatus} inverse={inverse} />
        <Link href={`/app/recommendations/${r.id}`} aria-label={`Szczegóły: ${r.title}`}
          className={cn("text-sm underline-offset-4 hover:underline", inverse ? "text-bg" : "text-t1 hover:text-t0")}>
          Szczegóły →
        </Link>
      </div>
    </Tile>
  );
}
