import Link from "next/link";
import { cn } from "cn";
import { PageHero, SectionHead, EmptyState, Meta, StatTile } from "@/components/psai";
import { getCurrentProject } from "@/lib/workspace";
import { fmtDate } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
import { TOP_SOURCES, aggregateSources } from "@/lib/sources/aggregate";
import { getSourcesData } from "@/lib/sources/queries";
import { RANGE_OPTIONS, parseRange, rangeHref, rangeParam, type SourceRange } from "@/lib/sources/range";
import { SourceList } from "./SourceList";

const CHIP = "inline-flex items-center rounded-[8px] border border-line px-3 py-1 text-[13px] transition hover:border-line-3";

function RangeSwitch({ range }: { range: SourceRange }) {
  const active = rangeParam(range);
  return (
    <nav aria-label="Zakres" className="flex flex-wrap gap-2">
      {RANGE_OPTIONS.map((o) => (
        <Link key={o.value} href={rangeHref(o.value)} aria-current={o.value === active ? "page" : undefined}
          className={cn(CHIP, o.value === active && "border-ink bg-ink text-bg hover:border-ink")}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

function scopeLabel(range: SourceRange, runs: { started_at: string }[]): string {
  if (range.kind === "run") return runs[0] ? `Pomiar z ${fmtDate(runs[0].started_at)}` : "Ostatni pomiar";
  return `Ostatnie ${range.days} dni · ${pluralPl(runs.length, ["pomiar", "pomiary", "pomiarów"])}`;
}

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseRange((await searchParams).range);
  const project = await getCurrentProject();
  const data = await getSourcesData(project.id, range);
  const view = aggregateSources(data.citations, { prompts: data.prompts, competitors: data.competitors, ownDomains: project.domains });

  const head = (
    <div className="space-y-6">
      <PageHero eyebrow="Polska Szkoła AI · Źródła" title="Źródła" />
      <p className="max-w-2xl text-t1">
        Domeny, które ChatGPT, Perplexity, Gemini i Google AI Overviews cytują w odpowiedziach na pytania projektu.
        To mapa miejsc, w których marka {project.brand_name} powinna być obecna.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <RangeSwitch range={range} />
        {data.runs.length > 0 && <Meta>{scopeLabel(range, data.runs)}</Meta>}
      </div>
    </div>
  );

  if (data.runs.length === 0 || view.domains === 0) {
    const empty = data.runs.length === 0
      ? range.kind === "run"
        ? { title: "Brak zakończonego pomiaru", description: "Po pierwszym pomiarze zobaczysz tu domeny, które asystenci AI cytują w odpowiedziach." }
        : { title: "Brak pomiarów w tym okresie", description: `W ostatnich ${range.days} dniach nie było pomiaru. Wybierz dłuższy zakres albo uruchom pomiar w Przeglądzie.` }
      : { title: "Brak cytowań", description: "Asystenci AI nie podali żadnych źródeł w odpowiedziach z tego zakresu." };
    return <div className="space-y-10">{head}<EmptyState {...empty} /></div>;
  }

  const own = view.own;
  const competitorDomains = [...view.top, ...view.rest].filter((r) => r.competitor).length;
  const withSources = data.answers > 0 ? Math.min(100, Math.round((view.responses / data.answers) * 100)) : 0;
  return (
    <div className="space-y-16">
      {head}
      <div className="grid gap-6 md:grid-cols-3">
        <StatTile label="Cytowane domeny" value={String(view.domains)}
          detail={competitorDomains > 0 ? `W tym ${pluralPl(competitorDomains, ["domena konkurenta", "domeny konkurentów", "domen konkurentów"])}.` : "Żadna nie należy do konkurentów."} />
        <StatTile label="Odpowiedzi ze źródłami" value={String(withSources)} unit="%"
          detail={`${view.responses} z ${data.answers} odpowiedzi ma co najmniej jedno źródło.`} />
        <StatTile label="Wasza domena" value={String(own?.responses ?? 0)} unit="×"
          detail={own
            ? `${own.domain}, miejsce ${own.rank} z ${view.domains}`
            : project.domains.length > 0
              ? "Asystenci nie zacytowali stron marki w tym zakresie."
              : "Dodaj domeny marki w Ustawieniach, żeby ją oznaczyć."} />
      </div>
      <section>
        <SectionHead title="Najczęściej cytowane" meta={<Meta>top {Math.min(TOP_SOURCES, view.domains)} z {view.domains}</Meta>} />
        <p className="mb-6 max-w-2xl text-sm text-t1">
          Liczba przy domenie to odpowiedzi, w których silnik ją zacytował; kilka linków w jednej odpowiedzi liczy się raz.
          Kliknij domenę, żeby zobaczyć pytania, w których się pojawia.
        </p>
        <SourceList view={view} />
        {data.truncated && (
          <p className="mt-4 text-sm text-t2">Pokazano tylko część cytowań z tego zakresu. Wybierz krótszy zakres, żeby zobaczyć wszystkie.</p>
        )}
      </section>
    </div>
  );
}
