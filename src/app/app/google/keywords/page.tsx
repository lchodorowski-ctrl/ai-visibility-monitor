import { Suspense } from "react";
import { getCurrentProject } from "@/lib/workspace";
import { getGscLastDate } from "@/lib/seo/queries";
import { PageHero, TileSkeleton } from "@/components/psai";
import {
  GapSection, KeywordStatusSection, RankedSection, ResearchSection, SuggestionSection, TrackedSection,
} from "./sections";

export default async function KeywordsPage() {
  const project = await getCurrentProject();
  const hasGscData = (await getGscLastDate(project.id)) !== null;
  return (
    <div className="space-y-20">
      <div>
        <PageHero eyebrow="Polska Szkoła AI · Google" title="Frazy w Google" />
        <div className="mt-6">
          <Suspense fallback={<TileSkeleton lines={2} />}><KeywordStatusSection projectId={project.id} /></Suspense>
        </div>
      </div>
      <Suspense fallback={<TileSkeleton lines={5} />}><RankedSection projectId={project.id} /></Suspense>
      <Suspense fallback={<TileSkeleton lines={6} />}><TrackedSection projectId={project.id} hasGscData={hasGscData} /></Suspense>
      <Suspense fallback={<TileSkeleton lines={5} />}><GapSection projectId={project.id} /></Suspense>
      <Suspense fallback={<TileSkeleton lines={5} />}><SuggestionSection projectId={project.id} /></Suspense>
      <Suspense fallback={<TileSkeleton lines={4} />}><ResearchSection projectId={project.id} ownDomain={project.domains[0] ?? ""} /></Suspense>
    </div>
  );
}
