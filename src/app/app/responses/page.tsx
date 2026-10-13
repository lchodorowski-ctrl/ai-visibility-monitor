import Link from "next/link";
import { getCurrentProject } from "@/lib/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { ENGINE_LABELS, isEngineId } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { fmtDate } from "@/lib/format/number";
import { RESPONSES_PAGE as PAGE, SENTIMENT_LABELS, isValidCursor, nextPageHref } from "@/lib/responses/paging";
import { PageHero, Rows, Row, Meta, EmptyState } from "@/components/psai";
import { buttonVariants } from "@/components/ui/button";

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<{ engine?: string; prompt?: string; before?: string }> }) {
  const { engine, prompt, before } = await searchParams;
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  let q = supabase.from("responses")
    .select("id, engine_id, created_at, no_answer, error, sentiment, prompts(text), mentions(brand_kind)")
    .eq("project_id", project.id).order("created_at", { ascending: false }).limit(PAGE + 1);
  if (engine && isEngineId(engine)) q = q.eq("engine_id", engine);
  if (prompt && isUuid(prompt)) q = q.eq("prompt_id", prompt);
  if (isValidCursor(before)) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).slice(0, PAGE);
  const hasMore = (data ?? []).length > PAGE;
  const next = nextPageHref(
    { engine: engine && isEngineId(engine) ? engine : undefined, prompt: prompt && isUuid(prompt) ? prompt : undefined },
    rows.at(-1)?.created_at ?? "",
  );

  return (
    <div className="space-y-10">
      <PageHero eyebrow="Polska Szkoła AI · Odpowiedzi" title="Odpowiedzi" />
      {rows.length === 0
        ? <EmptyState title="Brak odpowiedzi" description="Po pierwszym pomiarze zobaczysz tu każdą odpowiedź asystentów AI z zaznaczonymi wzmiankami." />
        : <Rows>
            {rows.map((r) => {
              const own = r.mentions.some((m) => m.brand_kind === "own");
              const state = r.error ? <span className="text-red">błąd</span> : r.no_answer ? <span className="text-t2">brak odpowiedzi</span> : own ? <span className="text-teal">wzmianka</span> : <span className="text-t2">bez wzmianki</span>;
              return (
                <Row key={r.id} href={`/app/responses/${r.id}`} className="gap-y-2">
                  <span className="min-w-0 flex-1 basis-full text-sm leading-snug md:basis-64">{r.prompts?.text}</span>
                  <span className="text-sm md:w-28">{state}</span>
                  <Meta className="md:w-56 md:text-right">
                    {ENGINE_LABELS[r.engine_id as EngineId] ?? r.engine_id} · {fmtDate(r.created_at)}{r.sentiment ? ` · ${SENTIMENT_LABELS[r.sentiment] ?? r.sentiment}` : ""}
                  </Meta>
                </Row>
              );
            })}
          </Rows>}
      {hasMore && <div className="flex justify-center"><Link href={next} className={buttonVariants({ variant: "outline" })}>Pokaż starsze</Link></div>}
    </div>
  );
}
