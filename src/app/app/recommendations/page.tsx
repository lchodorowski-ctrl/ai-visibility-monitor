import { EmptyState, PageHero } from "@/components/psai";

export default function RecommendationsPage() {
  return (
    <div className="space-y-10">
      <PageHero eyebrow="Polska Szkoła AI · Rekomendacje" title="Rekomendacje" />
      <EmptyState title="Jeszcze nic do pokazania" description="Rekomendacje pojawią się po pierwszym pomiarze z analizą." />
    </div>
  );
}
