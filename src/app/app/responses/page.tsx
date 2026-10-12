import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { ENGINE_LABELS, isEngineId } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<{ engine?: string; prompt?: string }> }) {
  const { engine, prompt } = await searchParams;
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  let q = supabase.from("responses")
    .select("id, engine_id, created_at, no_answer, error, sentiment, prompts(text), mentions(brand_kind)")
    .eq("project_id", project.id).order("created_at", { ascending: false }).limit(200);
  if (engine && isEngineId(engine)) q = q.eq("engine_id", engine);
  if (prompt && isUuid(prompt)) q = q.eq("prompt_id", prompt);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Odpowiedzi</h1>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Silnik</TableHead><TableHead>Prompt</TableHead><TableHead>Nasza marka</TableHead><TableHead>Sentyment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => {
                const own = r.mentions.some((m) => m.brand_kind === "own");
                return (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleString("pl-PL")}</TableCell>
                    <TableCell><Badge variant="secondary">{ENGINE_LABELS[r.engine_id as EngineId] ?? r.engine_id}</Badge></TableCell>
                    <TableCell className="whitespace-normal"><Link href={`/app/responses/${r.id}`} className="underline">{r.prompts?.text}</Link></TableCell>
                    <TableCell>{r.error ? <span className="text-red-700 dark:text-red-400">błąd</span> : r.no_answer ? <span className="text-muted-foreground">brak odpowiedzi</span> : own ? "✅" : "—"}</TableCell>
                    <TableCell>{r.sentiment ?? ""}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
