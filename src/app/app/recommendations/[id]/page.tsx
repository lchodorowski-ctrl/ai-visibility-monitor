import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow, Meta, Rows, Row, SectionHead, Tile } from "@/components/psai";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { fmtDate, pct } from "@/lib/format/number";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { getRecommendation } from "@/lib/recommend/queries";
import { TYPE_LABEL, STATUS_LABEL, effortLabel, priorityLabel, type RecStatus, type RecType } from "@/lib/recommend/labels";
import { StatusForm } from "../StatusForm";
import { TargetUrl, priorityOf } from "../RecommendationCard";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
const counted = (v: unknown, key: "domain" | "name"): { label: string; count: number }[] =>
  Array.isArray(v)
    ? v.flatMap((x) => (x && typeof x === "object" && typeof (x as Record<string, unknown>)[key] === "string"
        ? [{ label: (x as Record<string, string>)[key], count: Number((x as Record<string, unknown>).count) || 0 }] : []))
    : [];

export default async function RecommendationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const r = await getRecommendation(supabase, project.id, id);
  if (!r) notFound();

  const status = r.status as RecStatus;
  const steps = strings(r.action_steps);
  const outline = strings(r.suggested_outline);
  const ev = (r.evidence && typeof r.evidence === "object" && !Array.isArray(r.evidence) ? r.evidence : {}) as Record<string, unknown>;
  const promptIds = strings(ev.prompt_ids);
  const visibility = Object.entries(ev.visibility_by_engine && typeof ev.visibility_by_engine === "object" ? (ev.visibility_by_engine as Record<string, unknown>) : {})
    .flatMap(([engine, v]) => (typeof v === "number" ? [{ engine, v }] : []));
  const domains = counted(ev.cited_domains, "domain");
  const competitors = counted(ev.competitors_mentioned, "name");
  const quotes = strings(ev.sample_quotes);
  const validPromptIds = promptIds.filter(isUuid);
  const promptText = new Map<string, string>();
  if (validPromptIds.length > 0) {
    const { data, error } = await supabase.from("prompts").select("id, text").eq("project_id", project.id).in("id", validPromptIds);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) promptText.set(p.id, p.text);
  }
  const hasEvidence = validPromptIds.length + visibility.length + domains.length + competitors.length + quotes.length > 0;

  return (
    <div className="space-y-10">
      <section className="pt-6">
        <Link href="/app/recommendations" className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">← Rekomendacje</Link>
      </section>

      <Tile className="bg-ink text-bg">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Eyebrow className="text-bg/70">{TYPE_LABEL[r.type as RecType] ?? r.type}</Eyebrow>
          <Meta className="text-bg/70">priorytet {priorityLabel(priorityOf(r))} · wysiłek {effortLabel(r.effort)} · {(STATUS_LABEL[status] ?? r.status).toLowerCase()}</Meta>
        </div>
        <h1 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.15]">{r.title}</h1>
        {r.target_url && <div className="mt-3"><TargetUrl url={r.target_url} inverse /></div>}
        {r.prompts?.text && <Meta className="mt-4 block normal-case tracking-normal text-bg/70">Pytanie: {r.prompts.text}</Meta>}
      </Tile>

      <div className="grid gap-6 md:grid-cols-2">
        <Tile>
          <SectionHead title="Dlaczego" />
          <p className="text-t1">{r.rationale ?? r.summary}</p>
        </Tile>
        <Tile>
          <SectionHead title="Kroki" />
          {steps.length === 0
            ? <Meta>brak kroków</Meta>
            : <ol className="space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="font-mono text-xs tabular-nums text-t2">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 text-[15px]">{s}</span>
                  </li>
                ))}
              </ol>}
        </Tile>
        {outline.length > 0 && (
          <Tile className="md:col-span-2">
            <SectionHead title="Zarys treści" />
            <ul className="space-y-2 text-[15px]">
              {outline.map((p, i) => <li key={i} className="flex gap-3"><span aria-hidden="true" className="text-t2">–</span><span className="min-w-0 flex-1">{p}</span></li>)}
            </ul>
          </Tile>
        )}
      </div>

      <section>
        <SectionHead title="Dowody" />
        {!hasEvidence
          ? <Tile><Meta>brak zapisanych dowodów</Meta></Tile>
          : <div className="grid gap-6 md:grid-cols-2">
              {validPromptIds.length > 0 && (
                <div>
                  <Meta className="mb-3 block">Pytania</Meta>
                  <Rows>
                    {validPromptIds.map((pid) => (
                      <Row key={pid} href={`/app/prompts#${pid}`}>
                        <span className="min-w-0 flex-1 text-sm">{promptText.get(pid) ?? "Pytanie usunięte"}</span>
                        <Meta>heatmapa →</Meta>
                      </Row>
                    ))}
                  </Rows>
                </div>
              )}
              {visibility.length > 0 && (
                <div>
                  <Meta className="mb-3 block">Widoczność per silnik</Meta>
                  <Rows>{visibility.map(({ engine, v }) => (
                    <Row key={engine}><span className="flex-1 text-sm">{ENGINE_LABELS[engine as EngineId] ?? engine}</span><span className="font-mono text-sm tabular-nums">{pct(v)}</span></Row>
                  ))}</Rows>
                </div>
              )}
              {domains.length > 0 && (
                <div>
                  <Meta className="mb-3 block">Cytowane domeny</Meta>
                  <Rows>{domains.map((d) => (
                    <Row key={d.label}><span className="min-w-0 flex-1 break-all text-sm">{d.label}</span><span className="font-mono text-sm tabular-nums">{d.count}×</span></Row>
                  ))}</Rows>
                </div>
              )}
              {competitors.length > 0 && (
                <div>
                  <Meta className="mb-3 block">Konkurenci w odpowiedziach</Meta>
                  <Rows>{competitors.map((c) => (
                    <Row key={c.label}><span className="min-w-0 flex-1 text-sm">{c.label}</span><span className="font-mono text-sm tabular-nums">{c.count}×</span></Row>
                  ))}</Rows>
                </div>
              )}
              {quotes.length > 0 && (
                <div className="md:col-span-2">
                  <Meta className="mb-3 block">Cytaty z odpowiedzi</Meta>
                  <div className="space-y-3">
                    {quotes.map((q, i) => <blockquote key={i} className="rounded-[28px] bg-s1 px-6 py-4 font-mono text-xs leading-relaxed text-t1 md:px-8">{q}</blockquote>)}
                  </div>
                </div>
              )}
            </div>}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <StatusForm id={r.id} status={status} />
        <Meta>utworzono {fmtDate(r.created_at)} · zmieniono {fmtDate(r.updated_at)}</Meta>
      </section>
    </div>
  );
}
