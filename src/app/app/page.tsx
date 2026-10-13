import { Suspense } from "react";
import { getCurrentProject } from "@/lib/workspace";
import { getLastRun } from "@/lib/metrics/queries";
import { isRunStale } from "@/lib/runs/stale";
import { PageHero, TileSkeleton, TileInverse } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { RunStatus } from "@/components/RunStatus";
import { runNow } from "./actions";
import { StatsSection, TrendSection, EnginesSection, MentionsSection, TopRecommendationSlot } from "./overview/sections";

export default async function OverviewPage() {
  const project = await getCurrentProject();
  const lastRun = await getLastRun(project.id);
  const running = lastRun?.status === "running" && !isRunStale(lastRun);
  return (
    <div className="space-y-20">
      <div>
        <PageHero eyebrow="Polska Szkoła AI · Przegląd" title="Widoczność w AI"
          actions={<form action={runNow}><Button type="submit" disabled={running}>{running ? "Pomiar w toku…" : "Uruchom pomiar"}</Button></form>} />
        <div className="mt-6"><RunStatus run={lastRun} /></div>
      </div>
      {!lastRun && (
        <TileInverse eyebrow="Pierwszy krok" title={`Uruchom pierwszy pomiar i sprawdź, czy asystenci AI polecają markę ${project.brand_name}.`}
          action={<form action={runNow}><Button type="submit" className="bg-bg text-ink hover:bg-bg/90">Uruchom pomiar</Button></form>} />
      )}
      <Suspense fallback={<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>}>
        <StatsSection projectId={project.id} />
      </Suspense>
      <Suspense fallback={null}><TopRecommendationSlot projectId={project.id} /></Suspense>
      <Suspense fallback={<TileSkeleton lines={6} />}><TrendSection projectId={project.id} /></Suspense>
      <Suspense fallback={<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>}>
        <EnginesSection projectId={project.id} />
      </Suspense>
      <Suspense fallback={<TileSkeleton lines={5} />}><MentionsSection projectId={project.id} brandName={project.brand_name} /></Suspense>
    </div>
  );
}
