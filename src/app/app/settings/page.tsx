import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject, DEFAULT_ENGINES } from "@/lib/workspace";
import { updateProjectSettings, addCompetitor, deleteCompetitor, toggleEngine } from "./actions";

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT (OpenAI)", perplexity: "Perplexity", gemini: "Gemini", google_ai_overview: "Google AI Overviews",
};

export default async function SettingsPage() {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const [{ data: competitors, error: competitorsError }, { data: engines, error: enginesError }] = await Promise.all([
    supabase.from("competitors").select("*").eq("project_id", project.id).order("name"),
    supabase.from("project_engines").select("*").eq("project_id", project.id),
  ]);
  if (competitorsError) throw new Error(competitorsError.message);
  if (enginesError) throw new Error(enginesError.message);
  const enabled = new Map((engines ?? []).map((e) => [e.engine_id, e.enabled]));

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h1 className="text-xl font-semibold">Marka</h1>
        <form action={updateProjectSettings} className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="brand_name">Nazwa marki</Label>
            <Input id="brand_name" name="brand_name" defaultValue={project.brand_name} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="brand_aliases">Aliasy (po przecinku)</Label>
            <Input id="brand_aliases" name="brand_aliases" defaultValue={project.brand_aliases.join(", ")} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="domains">Domeny (po przecinku)</Label>
            <Input id="domains" name="domains" defaultValue={project.domains.join(", ")} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="monthly_budget_usd">Miesięczny budżet API (USD)</Label>
            <Input id="monthly_budget_usd" name="monthly_budget_usd" type="number" step="1" defaultValue={String(project.monthly_budget_usd)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="facts">Karta faktów (JSON)</Label>
            <Textarea id="facts" name="facts" rows={5} defaultValue={JSON.stringify(project.facts, null, 2)} className="font-mono text-xs" />
          </div>
          <Button type="submit" className="w-fit">Zapisz</Button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Konkurenci</h2>
        <Card className="mt-3">
          <CardContent>
            <Table>
              <TableBody>
                {(competitors ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {c.aliases.map((a) => <Badge key={`a-${a}`} variant="secondary">{a}</Badge>)}
                        {c.domains.map((d) => <Badge key={`d-${d}`} variant="outline">{d}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={deleteCompetitor}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="destructive" size="sm">Usuń</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <form action={addCompetitor} className="mt-3 grid grid-cols-4 gap-2 text-sm">
          <Input name="name" required placeholder="Nazwa" aria-label="Nazwa" />
          <Input name="aliases" placeholder="Aliasy" aria-label="Aliasy" />
          <Input name="domains" placeholder="Domeny" aria-label="Domeny" />
          <Button type="submit">Dodaj</Button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Silniki</h2>
        <div className="mt-3 space-y-2 text-sm">
          {DEFAULT_ENGINES.map((id) => {
            const on = enabled.get(id) ?? false;
            return (
              <Card key={id} size="sm">
                <CardContent className="flex items-center justify-between">
                  <span>{ENGINE_LABELS[id]}</span>
                  <form action={toggleEngine}>
                    <input type="hidden" name="engine_id" value={id} />
                    <input type="hidden" name="enabled" value={String(!on)} />
                    <Button type="submit" variant={on ? "default" : "outline"} size="sm">{on ? "Włączony" : "Wyłączony"}</Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
