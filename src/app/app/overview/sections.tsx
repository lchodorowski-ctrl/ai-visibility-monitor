import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getTopRecommendation } from "@/lib/recommend/queries";
import { RecommendationCard } from "@/app/app/recommendations/RecommendationCard";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { getLatestMetrics, getTrend, getLastRun, getMentionCounts } from "@/lib/metrics/queries";
import { pct } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
import { StatTile, Tile, Rows, Row, Meta, SectionHead, EmptyState } from "@/components/psai";
import { TrendChart } from "@/components/TrendChart";

export async function StatsSection({ projectId }: { projectId: string }) {
  const { latest } = await getLatestMetrics(projectId);
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <StatTile label="AI Visibility Score" value={latest ? String(latest.score) : "—"} detail="0–100, łączy widoczność, cytowania i udział" progress={latest ? latest.score / 100 : undefined} />
      <StatTile label="Visibility rate" value={latest ? String(Math.round(latest.visibilityRate * 100)) : "—"} unit={latest ? "%" : undefined}
        detail={latest?.avgPosition ? `średnia pozycja ${latest.avgPosition.toFixed(1)}` : "odpowiedzi z wzmianką o marce"} progress={latest?.visibilityRate} />
      <StatTile label="Citation rate" value={latest ? String(Math.round(latest.citationRate * 100)) : "—"} unit={latest ? "%" : undefined} detail="odpowiedzi z linkiem do Waszej domeny" progress={latest?.citationRate} />
      <StatTile label="Share of voice" value={latest ? String(Math.round(latest.shareOfVoice * 100)) : "—"} unit={latest ? "%" : undefined} detail="udział wśród wszystkich wymienionych marek" progress={latest?.shareOfVoice} />
    </div>
  );
}

export async function TrendSection({ projectId }: { projectId: string }) {
  const trend = await getTrend(projectId);
  return (
    <Tile>
      <SectionHead title="Trend score" meta={<Meta>{pluralPl(trend.length, ["pomiar", "pomiary", "pomiarów"])}</Meta>} />
      <TrendChart data={trend} />
    </Tile>
  );
}

export async function EnginesSection({ projectId }: { projectId: string }) {
  const { byEngine } = await getLatestMetrics(projectId);
  const ids = Object.keys(ENGINE_LABELS) as EngineId[];
  return (
    <section>
      <SectionHead title="Silniki" />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {ids.map((id) => {
          const row = byEngine.find((e) => e.engineId === id) ?? null;
          return (
            <Tile key={id} className={row ? "" : "bg-s2"}>
              <h3 className="text-xl font-semibold">{ENGINE_LABELS[id]}</h3>
              <p className="mt-4 text-[48px] font-semibold leading-none tracking-[-0.03em]">{row ? pct(row.visibilityRate) : "—"}</p>
              <Meta className="mt-auto pt-6">{row ? `cytowania ${pct(row.citationRate)} · score ${row.score} · pozycja ${row.avgPosition?.toFixed(1) ?? "—"}` : "brak danych w tym pomiarze"}</Meta>
            </Tile>
          );
        })}
      </div>
    </section>
  );
}

export async function MentionsSection({ projectId, brandName }: { projectId: string; brandName: string }) {
  const run = await getLastRun(projectId);
  const counts = run ? await getMentionCounts(projectId, run.id) : [];
  const own = counts.find((c) => c.name === brandName);
  return (
    <section>
      <SectionHead title="Wzmianki w ostatnim pomiarze" meta={own ? <Meta>{pluralPl(own.mentions, ["wzmianka o was", "wzmianki o was", "wzmianek o was"])}</Meta> : undefined} />
      {counts.length > 0 && !own && <Meta className="mb-4 block">Brak wzmianek o {brandName} w tym pomiarze</Meta>}
      {counts.length === 0
        ? <EmptyState title="Brak wzmianek" description="Po pierwszym pomiarze zobaczysz tu, które marki wymieniają asystenci AI." />
        : <Rows>{counts.map((c) => (
            <Row key={c.name} className={c.name === brandName ? "font-semibold" : ""}>
              <span className="flex-1">{c.name}</span><span className="font-mono text-sm tabular-nums">{c.mentions}</span>
            </Row>))}</Rows>}
    </section>
  );
}

export async function TopRecommendationSlot({ projectId }: { projectId: string }) {
  const supabase = await createServerSupabase();
  const top = await getTopRecommendation(supabase, projectId);
  return (
    <section>
      <SectionHead title="Najważniejsza rekomendacja"
        actions={<Link href="/app/recommendations" className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">Wszystkie rekomendacje →</Link>} />
      {top
        ? <RecommendationCard r={top} inverse />
        : <EmptyState title="Brak otwartych rekomendacji" description="Nowe pojawią się po następnym pomiarze albo po kliknięciu Odśwież na stronie Rekomendacje." />}
    </section>
  );
}
