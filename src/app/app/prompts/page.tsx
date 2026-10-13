import { Suspense, cache } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHero, SectionHead, Tile, Rows, Row, Meta, EmptyState, TileSkeleton, ToneDot } from "@/components/psai";
import { pluralPl } from "@/lib/format/plural";
import { INTENTS } from "@/lib/prompts/intents";
import { Heatmap, buildHeatmapRows, promptVisibility } from "@/components/Heatmap";
import { getLatestCells } from "@/lib/metrics/queries";
import { visibilityTone } from "@/lib/metrics/tone";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { countRecommendationsByPrompt } from "@/lib/recommend/queries";
import { addTopic, addPrompt, togglePromptActive, togglePromptKey, deletePrompt } from "./actions";


/** Heatmap of the latest measurement; streams in on its own so the prompt list renders first. */
async function HeatmapSection({ projectId, activePrompts, threshold }: { projectId: string; activePrompts: { id: string; text: string }[]; threshold: number }) {
  const supabase = await createServerSupabase();
  const [{ cells }, recCounts] = await Promise.all([getLatestCells(projectId), countRecommendationsByPrompt(supabase, projectId)]);
  const heatmap = buildHeatmapRows(cells, activePrompts);
  return heatmap.engines.length === 0
    ? <EmptyState title="Brak pomiarów" description="Uruchom pierwszy pomiar na stronie Przegląd."
        action={<Link href="/app" className={buttonVariants()}>Przejdź do przeglądu</Link>} />
    : <Tile><Heatmap rows={heatmap.rows} engines={heatmap.engines} counts={recCounts} threshold={threshold} /></Tile>;
}

/** Status dot of one prompt in the list; reads the same per-request cached cells as the heatmap, so it adds no query and streams in after the list. */
const getPromptRates = cache(async (projectId: string) => {
  const { cells, overall } = await getLatestCells(projectId);
  return promptVisibility(cells, overall);
});

async function PromptDot({ projectId, promptId, threshold }: { projectId: string; promptId: string; threshold: number }) {
  const rate = (await getPromptRates(projectId)).get(promptId);
  return rate === undefined ? null : <ToneDot tone={visibilityTone(rate, threshold)} />;
}

export default async function PromptsPage() {
  const project = await getCurrentProject();
  const threshold = Number(project.low_visibility_threshold);
  const supabase = await createServerSupabase();
  const [{ data: topics, error: topicsError }, { data: prompts, error: promptsError }] = await Promise.all([
    supabase.from("topics").select("*").eq("project_id", project.id).order("name"),
    supabase.from("prompts").select("*").eq("project_id", project.id).order("created_at"),
  ]);
  if (topicsError) throw new Error(topicsError.message);
  if (promptsError) throw new Error(promptsError.message);
  const activePrompts = (prompts ?? []).filter((p) => p.active).map((p) => ({ id: p.id, text: p.text }));
  const topicName = new Map((topics ?? []).map((t) => [t.id, t.name]));
  const topicItems = [{ value: "", label: "(bez tematu)" }, ...(topics ?? []).map((t) => ({ value: t.id, label: t.name }))];
  const intentItems = Object.entries(INTENTS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-20">
      <PageHero eyebrow="Polska Szkoła AI · Prompty" title={pluralPl(prompts?.length ?? 0, ["pytanie", "pytania", "pytań"])}
        actions={<Link href="/app/prompts/generate" className={buttonVariants()}>Generuj propozycje</Link>} />

      <section>
        <SectionHead title="Heatmapa ostatniego pomiaru" />
        <Suspense fallback={<TileSkeleton lines={6} />}>
          <HeatmapSection projectId={project.id} activePrompts={activePrompts} threshold={threshold} />
        </Suspense>
      </section>

      <section>
        <SectionHead title="Lista pytań" meta={<Meta>{pluralPl(prompts?.length ?? 0, ["pytanie", "pytania", "pytań"])}</Meta>} />
        <Tile className="mb-6">
          <form action={addPrompt} className="grid items-center gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
            <Input name="text" required placeholder="Nowe pytanie…" aria-label="Nowe pytanie" />
            <Select name="topic_id" defaultValue="" items={topicItems}>
              <SelectTrigger aria-label="Temat" className="w-full md:min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {topicItems.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select name="intent" defaultValue="informational" items={intentItems}>
              <SelectTrigger aria-label="Intencja" className="w-full md:min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {intentItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label className="flex items-center gap-2 text-sm"><Checkbox name="is_key" /> kluczowy</Label>
            <Button type="submit">Dodaj</Button>
          </form>
        </Tile>
        {(prompts ?? []).length === 0
          ? <EmptyState title="Brak pytań" description="Dodaj pierwsze pytanie powyżej albo wygeneruj propozycje." />
          : <Rows>
              {(prompts ?? []).map((p) => (
                <Row key={p.id} className="gap-y-3">
                  <span className="flex min-w-0 flex-1 basis-64 items-start gap-3 text-[15px] leading-snug">
                    <span className="mt-[0.5em] flex w-2 shrink-0">
                      <Suspense fallback={null}><PromptDot projectId={project.id} promptId={p.id} threshold={threshold} /></Suspense>
                    </span>
                    <span className="min-w-0">{p.text}</span>
                  </span>
                  <Meta>{p.topic_id ? topicName.get(p.topic_id) : "bez tematu"} · {INTENTS[p.intent as keyof typeof INTENTS]}</Meta>
                  <div className="flex items-center gap-5 text-sm">
                    <form action={togglePromptKey}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="is_key" value={String(!p.is_key)} />
                      <Button type="submit" variant="quiet">{p.is_key ? "★" : "☆"} {pluralPl(p.is_key ? 3 : 1, ["próbka", "próbki", "próbek"])}</Button>
                    </form>
                    <form action={togglePromptActive}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <Button type="submit" variant="quiet" className={p.active ? "text-teal" : "text-t2"}>{p.active ? "aktywny" : "wyłączony"}</Button>
                    </form>
                    <form action={deletePrompt}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" variant="danger-quiet">Usuń</Button>
                    </form>
                  </div>
                </Row>
              ))}
            </Rows>}
      </section>

      <section>
        <SectionHead title="Tematy" meta={<Meta>{pluralPl(topics?.length ?? 0, ["temat", "tematy", "tematów"])}</Meta>} />
        <Tile>
          {(topics ?? []).length > 0 && (
            <ul className="mb-6 flex flex-wrap gap-2">
              {(topics ?? []).map((t) => <li key={t.id}><span className="rounded-lg bg-s2 px-3 py-1 text-sm">{t.name}</span></li>)}
            </ul>
          )}
          <form action={addTopic} className="flex flex-wrap gap-3">
            <Input name="name" required placeholder="Nowy temat" aria-label="Nowy temat" className="max-w-xs" />
            <Button type="submit">Dodaj temat</Button>
          </form>
        </Tile>
      </section>
    </div>
  );
}
