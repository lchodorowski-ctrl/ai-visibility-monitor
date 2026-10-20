import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow, Meta, Rows, Row, SectionHead, Tile } from "@/components/psai";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { fmtDate, pct } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
import { toneTextClass, visibilityTone } from "@/lib/metrics/tone";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { getRecommendation } from "@/lib/recommend/queries";
import { TYPE_LABEL, type RecStatus, type RecType } from "@/lib/recommend/labels";
import { targetHost, viewCompetitors, viewDomains, viewQuotes } from "@/lib/recommend/evidence-view";
import { StatusForm } from "../StatusForm";
import { RecommendationMeta, TargetUrl } from "../RecommendationCard";
import { BalancedColumns, CountList, QuoteCard, type StackBlock } from "../Evidence";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);

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
  const domains = viewDomains(ev.cited_domains, { targetUrl: r.target_url, ownDomains: project.domains });
  const competitors = viewCompetitors(ev.competitors_mentioned);
  const quotes = viewQuotes(ev.sample_quotes);
  const host = targetHost(r.target_url);
  const quoteTerms = [...(host ? [host] : []), ...competitors.top.map((c) => c.label)];
  const threshold = Number(project.low_visibility_threshold);
  const validPromptIds = promptIds.filter(isUuid);
  const promptText = new Map<string, string>();
  if (validPromptIds.length > 0) {
    const { data, error } = await supabase.from("prompts").select("id, text").eq("project_id", project.id).in("id", validPromptIds);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) promptText.set(p.id, p.text);
  }
  const hasEvidence = validPromptIds.length + visibility.length + domains.total + competitors.total + quotes.length > 0;

  const promptsBlock = validPromptIds.length > 0 && (
    <div>
      <Meta className="mb-3 block">Pytania</Meta>
      <Rows>
        {validPromptIds.map((pid) => (
          <Row key={pid}>
            <span className="min-w-0 flex-1 text-sm">{promptText.get(pid) ?? "Pytanie usunięte"}</span>
            <span className="flex gap-4 text-sm">
              <Link href={`/app/prompts#${pid}`} className="text-t1 underline-offset-4 hover:text-t0 hover:underline">heatmapa →</Link>
              <Link href={`/app/responses?prompt=${pid}`} className="text-t1 underline-offset-4 hover:text-t0 hover:underline">odpowiedzi →</Link>
            </span>
          </Row>
        ))}
      </Rows>
    </div>
  );
  const visibilityBlock = visibility.length > 0 && (
    <div>
      <Meta className="mb-3 block">Widoczność per silnik</Meta>
      <Rows>{visibility.map(({ engine, v }) => (
        <Row key={engine}>
          <span className="flex-1 text-sm">{ENGINE_LABELS[engine as EngineId] ?? engine}</span>
          <span className={`font-mono text-sm tabular-nums ${toneTextClass(visibilityTone(v, threshold))}`}>{pct(v)}</span>
        </Row>
      ))}</Rows>
    </div>
  );
  /** `wide` splits the top rows into two lists side by side (full-width section). */
  const domainsBlock = (wide: boolean) => domains.total > 0 && (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Meta>Cytowane domeny</Meta>
        <Meta>{pluralPl(domains.total, ["domena", "domeny", "domen"])} · {pluralPl(domains.sum, ["cytowanie", "cytowania", "cytowań"])}</Meta>
      </div>
      <CountList view={domains} wide={wide} />
    </div>
  );
  const competitorsBlock = competitors.total > 0 && (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Meta>Konkurenci w odpowiedziach</Meta>
        <Meta>{pluralPl(competitors.sum, ["wzmianka", "wzmianki", "wzmianek"])}</Meta>
      </div>
      <CountList view={competitors} />
    </div>
  );

  // rough rendered heights (px) per row, only to pick the shorter column
  const listHeight = (v: { top: unknown[]; rest: unknown[] }) => 32 + v.top.length * 44 + (v.rest.length > 0 ? 40 : 0);
  const blocks: StackBlock[] = [
    { key: "prompts", node: promptsBlock, height: 32 + validPromptIds.length * 86 },
    { key: "visibility", node: visibilityBlock, height: 32 + visibility.length * 56 },
    // without competitors the domains get the full width below, split into two lists
    ...(competitors.total > 0 ? [
      { key: "domains", node: domainsBlock(false), height: listHeight(domains) },
      { key: "competitors", node: competitorsBlock, height: listHeight(competitors) },
    ] : []),
  ].filter((b) => b.node);

  return (
    <div className="space-y-10">
      <section className="pt-6">
        <Link href="/app/recommendations" className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">← Rekomendacje</Link>
      </section>

      <Tile className="bg-ink text-bg">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Eyebrow className="text-bg/70">{TYPE_LABEL[r.type as RecType] ?? r.type}</Eyebrow>
          <RecommendationMeta r={r} inverse showStatus />
        </div>
        <h1 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.15]">{r.title}</h1>
        {r.target_url && <div className="mt-3"><TargetUrl url={r.target_url} siteUrl={project.site_url} inverse /></div>}
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
          : <div className="space-y-10">
              <BalancedColumns blocks={blocks} />
              {competitors.total === 0 && domainsBlock(true)}
              {quotes.length > 0 && (
                <div>
                  <Meta className="mb-3 block">Cytaty z odpowiedzi</Meta>
                  <ul className="grid gap-4 md:grid-cols-2">
                    {quotes.map((q, i) => <QuoteCard key={i} q={q} terms={quoteTerms} />)}
                  </ul>
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
