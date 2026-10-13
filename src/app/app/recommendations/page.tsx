import { Suspense } from "react";
import Link from "next/link";
import { cn } from "cn";
import { PageHero, EmptyState, Meta, TileSkeleton } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { getLastRun } from "@/lib/metrics/queries";
import { isRunStale } from "@/lib/runs/stale";
import { isUuid } from "@/lib/validation/uuid";
import { fmtDate } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
import { applyFilters, fetchRecommendationRows, summarizeOpen, type RecFilters, type RecommendationRow } from "@/lib/recommend/queries";
import { TYPE_LABEL, type RecType } from "@/lib/recommend/labels";
import { refreshRecommendations } from "./actions";
import { RecommendationCard, truncate } from "./RecommendationCard";

type SP = { status?: string; type?: string; prompt?: string };
type StatusParam = "open" | "done" | "dismissed";

const STATUS_CHIPS: { value: StatusParam; label: string }[] = [
  { value: "open", label: "Otwarte" }, { value: "done", label: "Zrobione" }, { value: "dismissed", label: "Odrzucone" },
];
const CHIP = "inline-flex items-center rounded-[8px] border border-line px-3 py-1 text-[13px] transition hover:border-line-3";

function parseFilters(sp: SP): { status: StatusParam; type?: RecType; prompt?: string } {
  const status: StatusParam = sp.status === "done" || sp.status === "dismissed" ? sp.status : "open";
  const type = sp.type && sp.type in TYPE_LABEL ? (sp.type as RecType) : undefined;
  const prompt = sp.prompt && isUuid(sp.prompt) ? sp.prompt : undefined;
  return { status, type, prompt };
}

function href(f: { status: StatusParam; type?: RecType; prompt?: string }): string {
  const q = new URLSearchParams();
  if (f.status !== "open") q.set("status", f.status);
  if (f.type) q.set("type", f.type);
  if (f.prompt) q.set("prompt", f.prompt);
  const s = q.toString();
  return s ? `/app/recommendations?${s}` : "/app/recommendations";
}

function Chip({ to, active, children, label }: { to: string; active?: boolean; children: React.ReactNode; label?: string }) {
  return (
    <Link href={to} aria-current={active ? "page" : undefined} aria-label={label}
      className={cn(CHIP, active && "border-ink bg-ink text-bg hover:border-ink")}>
      {children}
    </Link>
  );
}

async function Filters({ projectId, f }: { projectId: string; f: ReturnType<typeof parseFilters> }) {
  let promptText: string | null = null;
  if (f.prompt) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.from("prompts").select("text").eq("project_id", projectId).eq("id", f.prompt).maybeSingle();
    if (error) throw new Error(error.message);
    promptText = data?.text ?? null;
  }
  return (
    <div className="space-y-3">
      <nav aria-label="Status rekomendacji" className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => <Chip key={c.value} to={href({ ...f, status: c.value })} active={f.status === c.value}>{c.label}</Chip>)}
      </nav>
      <nav aria-label="Typ rekomendacji" className="flex flex-wrap gap-2">
        <Chip to={href({ ...f, type: undefined })} active={!f.type}>Wszystkie</Chip>
        {(Object.keys(TYPE_LABEL) as RecType[]).map((t) => <Chip key={t} to={href({ ...f, type: t })} active={f.type === t}>{TYPE_LABEL[t]}</Chip>)}
      </nav>
      {f.prompt && (
        <div className="flex flex-wrap gap-2">
          <Chip to={href({ ...f, prompt: undefined })} label="Usuń filtr pytania">
            Pytanie: {promptText ? truncate(promptText, 60) : "nieznane"} <span aria-hidden="true" className="ml-2">×</span>
          </Chip>
        </div>
      )}
    </div>
  );
}

async function List({ rowsPromise, siteUrl, f }: { rowsPromise: Promise<RecommendationRow[]>; siteUrl: string; f: ReturnType<typeof parseFilters> }) {
  const filters: RecFilters = { status: f.status, type: f.type, prompt: f.prompt };
  const rows = applyFilters(await rowsPromise, filters);
  if (rows.length === 0) return <EmptyState title="Brak rekomendacji" description="Uruchom run albo kliknij Odśwież." />;
  const firstInverse = f.status === "open" && !f.type && !f.prompt;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {rows.map((r, i) => <li key={r.id} className="min-w-0"><RecommendationCard r={r} siteUrl={siteUrl} inverse={firstInverse && i === 0} /></li>)}
    </ul>
  );
}

/** Open count and last change, computed from the same rows the list renders (one query). */
async function HeroMeta({ rowsPromise }: { rowsPromise: Promise<RecommendationRow[]> }) {
  const { count, lastUpdated } = summarizeOpen(await rowsPromise);
  return (
    <Meta>
      {pluralPl(count, ["otwarta rekomendacja", "otwarte rekomendacje", "otwartych rekomendacji"])}
      {" · ostatnia aktualizacja: "}{lastUpdated ? fmtDate(lastUpdated) : "brak"}
    </Meta>
  );
}

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const project = await getCurrentProject();
  // site_url is NOT NULL and validated as a URL in Settings, so only a running measurement blocks a refresh
  const lastRun = await getLastRun(project.id);
  const running = lastRun?.status === "running" && !isRunStale(lastRun);
  // one query feeds both the hero summary and the list; each streams in its own Suspense boundary
  const rowsPromise = fetchRecommendationRows(await createServerSupabase(), project.id);
  return (
    <div className="space-y-10">
      <div>
        <PageHero eyebrow="Rekomendacje" title="Co zrobić, żeby asystenci nas polecali"
          actions={
            <form action={refreshRecommendations} className="flex flex-wrap items-center gap-3">
              {running && <Meta>Pomiar w toku</Meta>}
              <Button type="submit" variant="quiet" disabled={running}>Odśwież rekomendacje</Button>
            </form>
          } />
        <div className="mt-4 min-h-4"><Suspense fallback={null}><HeroMeta rowsPromise={rowsPromise} /></Suspense></div>
        <p className="mt-4 max-w-2xl text-t1">Z odpowiedzi AI i mapy Waszej strony. Nowe po każdym runie.</p>
      </div>
      <Suspense fallback={null}><Filters projectId={project.id} f={f} /></Suspense>
      <Suspense fallback={<div className="grid gap-4 md:grid-cols-2"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>}>
        <List rowsPromise={rowsPromise} siteUrl={project.site_url} f={f} />
      </Suspense>
    </div>
  );
}
