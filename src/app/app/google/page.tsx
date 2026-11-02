import { Suspense } from "react";
import Link from "next/link";
import { getCurrentProject } from "@/lib/workspace";
import { getGscLastDate, getSeoStatus } from "@/lib/seo/queries";
import { overviewState } from "@/lib/seo/overview";
import { PageHero, TileSkeleton, EmptyState } from "@/components/psai";
import { buttonVariants } from "@/components/ui/button";
import {
  StatusSection, GscStatsSection, GscTrendSection, OpportunitiesSection, TopQueriesSection, TopPagesSection,
} from "./sections";

export default async function GooglePage() {
  const project = await getCurrentProject();
  const [lastDate, { lastSync }] = await Promise.all([getGscLastDate(project.id), getSeoStatus(project.id)]);
  const state = overviewState({ gscProperty: project.gsc_property, lastDate, lastJob: lastSync });
  return (
    <div className="space-y-20">
      <div>
        <PageHero eyebrow="Polska Szkoła AI · Google" title="Widoczność w Google" />
        <div className="mt-6">
          <Suspense fallback={<TileSkeleton lines={2} />}>
            <StatusSection projectId={project.id} gscProperty={project.gsc_property} lastDate={lastDate}
              seoBudget={Number(project.seo_budget_usd)} aiBudget={Number(project.monthly_budget_usd)} />
          </Suspense>
        </div>
      </div>
      {state === "no_property" && (
        <EmptyState title="Search Console nie jest podłączony" description="Wpisz usługę w Ustawienia → Google i dodaj konto usługi w Search Console."
          action={<Link href="/app/settings" className={buttonVariants({ variant: "outline" })}>Otwórz Ustawienia</Link>} />
      )}
      {state === "no_data" && (
        <EmptyState title="Brak danych z Search Console" description="Kliknij Synchronizuj. Pierwsze pobranie obejmuje 16 miesięcy." />
      )}
      {state === "error" && (
        <EmptyState tone="error" title="Synchronizacja nie powiodła się" description={lastSync?.error || "Nie udało się pobrać danych z Search Console."} />
      )}
      {state === "ok" && lastDate && (
        <>
          <Suspense fallback={<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>}>
            <GscStatsSection projectId={project.id} lastDate={lastDate} />
          </Suspense>
          <Suspense fallback={<TileSkeleton lines={6} />}><GscTrendSection projectId={project.id} /></Suspense>
          <Suspense fallback={<TileSkeleton lines={6} />}><OpportunitiesSection projectId={project.id} lastDate={lastDate} /></Suspense>
          <Suspense fallback={<TileSkeleton lines={5} />}><TopQueriesSection projectId={project.id} lastDate={lastDate} /></Suspense>
          <Suspense fallback={<TileSkeleton lines={5} />}><TopPagesSection projectId={project.id} lastDate={lastDate} /></Suspense>
        </>
      )}
    </div>
  );
}
