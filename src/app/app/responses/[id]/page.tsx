import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { fmtDate } from "@/lib/format/number";
import { SENTIMENT_LABELS } from "@/lib/responses/paging";
import { HighlightedText } from "@/components/HighlightedText";
import { Eyebrow, SectionHead, Tile, Rows, Row, Meta, EmptyState } from "@/components/psai";

export default async function ResponsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const [{ data: r, error }, { data: competitors, error: competitorsError }] = await Promise.all([
    supabase.from("responses").select("*, prompts(text), mentions(*), citations(*)").eq("id", id).eq("project_id", project.id).maybeSingle(),
    supabase.from("competitors").select("name, aliases").eq("project_id", project.id),
  ]);
  if (error) throw new Error(error.message);
  if (competitorsError) throw new Error(competitorsError.message);
  if (!r) notFound();
  const aliases: Record<string, string[]> = { [project.brand_name]: project.brand_aliases };
  for (const c of competitors ?? []) aliases[c.name] = c.aliases;
  const engine = ENGINE_LABELS[r.engine_id as EngineId] ?? r.engine_id;

  return (
    <div className="space-y-10">
      <section className="pt-6">
        <Eyebrow className="mb-3 break-words">{engine} · {r.model} · {fmtDate(r.created_at)} · {Number(r.cost_usd).toFixed(3)} USD</Eyebrow>
        <h1 className="max-w-4xl text-[clamp(28px,4vw,44px)] font-semibold leading-[1.1]">{r.prompts?.text}</h1>
      </section>

      {r.error && <EmptyState tone="error" title="Błąd zapytania" description={r.error} />}
      {r.no_answer && !r.error && <EmptyState title="Brak odpowiedzi" description="Silnik nie zwrócił odpowiedzi AI dla tego pytania." />}

      {!r.error && !r.no_answer && (
        <Tile>
          <HighlightedText
            text={r.text}
            mentions={r.mentions.map((m) => ({ charIndex: m.char_index, name: m.brand_name, kind: m.brand_kind as "own" | "competitor" }))}
            aliases={aliases}
          />
        </Tile>
      )}

      {r.sentiment && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Meta>Sentyment · {SENTIMENT_LABELS[r.sentiment] ?? r.sentiment}</Meta>
          {r.sentiment_summary && <p className="min-w-0 flex-1 basis-64 text-t1">{r.sentiment_summary}</p>}
        </div>
      )}

      <section>
        <SectionHead title="Cytowane źródła" meta={<Meta>{r.citations.length}</Meta>} />
        {r.citations.length === 0
          ? <EmptyState title="Brak cytowań" description="Ta odpowiedź nie zawiera cytowanych źródeł." />
          : <Rows>
              {r.citations.map((c) => (
                <Row key={c.id} className="gap-y-2">
                  <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 basis-64 break-words text-sm leading-snug underline-offset-4 hover:underline">
                    {c.title ?? c.url}
                    <span className="block font-mono text-[11px] text-t2">{c.domain}</span>
                  </a>
                  {c.is_own
                    ? <Meta className="text-teal">Wasza domena</Meta>
                    : c.competitor_id ? <Meta>Konkurent</Meta> : null}
                </Row>
              ))}
            </Rows>}
      </section>

      <Tile>
        <details>
          <summary className="cursor-pointer text-sm text-t1 hover:text-t0">Surowa odpowiedź API</summary>
          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-bg p-4 font-mono text-xs text-t1">{JSON.stringify(r.raw, null, 2)}</pre>
        </details>
      </Tile>
    </div>
  );
}
