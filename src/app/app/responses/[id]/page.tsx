import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { HighlightedText } from "@/components/HighlightedText";

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

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold">{r.prompts?.text}</h1>
      <p className="text-sm text-muted-foreground">{r.engine_id} · {r.model} · {new Date(r.created_at).toLocaleString("pl-PL")} · {Number(r.cost_usd).toFixed(3)} USD</p>
      {r.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{r.error}</p>}
      {r.no_answer && <p className="text-sm text-muted-foreground">Silnik nie zwrócił odpowiedzi AI dla tego pytania.</p>}
      <Card>
        <CardContent>
          <HighlightedText
            text={r.text}
            mentions={r.mentions.map((m) => ({ charIndex: m.char_index, name: m.brand_name, kind: m.brand_kind as "own" | "competitor" }))}
            aliases={aliases}
          />
        </CardContent>
      </Card>
      {r.sentiment && <p className="text-sm"><b>Sentyment:</b> {r.sentiment} — {r.sentiment_summary}</p>}
      <Card>
        <CardHeader><CardTitle>Cytowane źródła ({r.citations.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm">
            {r.citations.map((c) => (
              <li key={c.id} className={c.is_own ? "font-semibold text-green-700 dark:text-green-400" : c.competitor_id ? "text-amber-700 dark:text-amber-400" : ""}>
                <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.title ?? c.url}</a> <span className="text-muted-foreground">({c.domain})</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Surowa odpowiedź API</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(r.raw, null, 2)}</pre>
      </details>
    </div>
  );
}
