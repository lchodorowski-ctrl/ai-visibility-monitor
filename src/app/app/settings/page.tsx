import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, SectionHead, Tile, Rows, Row, Meta, EmptyState } from "@/components/psai";
import { pluralPl } from "@/lib/format/plural";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject, DEFAULT_ENGINES } from "@/lib/workspace";
import { updateProjectSettings, addCompetitor, deleteCompetitor, toggleEngine } from "./actions";

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT (OpenAI)", perplexity: "Perplexity", gemini: "Gemini", google_ai_overview: "Google AI Overviews",
};

const chip = "rounded-lg bg-s2 px-3 py-1 text-sm";

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
    <div className="space-y-20">
      <PageHero eyebrow="Polska Szkoła AI · Ustawienia" title="Ustawienia" />

      <form action={updateProjectSettings} className="space-y-20">
        <section>
          <SectionHead title="Marka" />
          <Tile>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="brand_name">Nazwa marki</Label>
                <Input id="brand_name" name="brand_name" defaultValue={project.brand_name} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brand_aliases">Aliasy (po przecinku)</Label>
                <Input id="brand_aliases" name="brand_aliases" defaultValue={project.brand_aliases.join(", ")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="domains">Domeny (po przecinku)</Label>
                <Input id="domains" name="domains" defaultValue={project.domains.join(", ")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="monthly_budget_usd">Miesięczny budżet API (USD)</Label>
                <Input id="monthly_budget_usd" name="monthly_budget_usd" type="number" step="1" min="0" defaultValue={String(project.monthly_budget_usd)} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="facts">Karta faktów (JSON)</Label>
                <Textarea id="facts" name="facts" rows={6} defaultValue={JSON.stringify(project.facts, null, 2)} className="font-mono text-xs" />
              </div>
            </div>
          </Tile>
        </section>

        <section>
          <SectionHead title="Strona" />
          <Tile>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="site_url">Adres strony do analizy</Label>
                <Input id="site_url" name="site_url" type="url" required defaultValue={project.site_url} placeholder="https://" />
                <Meta>Dziś wersja robocza na Netlify; po przepięciu domeny wpisz https://www.polskaszkola.ai</Meta>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="low_visibility_threshold">Próg niskiej widoczności (0–1)</Label>
                <Input id="low_visibility_threshold" name="low_visibility_threshold" type="number" step="0.01" min="0" max="1" required defaultValue={String(project.low_visibility_threshold)} />
                <Meta>Pytania z widocznością poniżej progu trafiają do rekomendacji.</Meta>
              </div>
            </div>
          </Tile>
        </section>

        <Button type="submit">Zapisz ustawienia</Button>
      </form>

      <section>
        <SectionHead title="Konkurenci" meta={<Meta>{pluralPl(competitors?.length ?? 0, ["konkurent", "konkurenci", "konkurentów"])}</Meta>} />
        {(competitors ?? []).length === 0
          ? <EmptyState title="Brak konkurentów" description="Dodaj pierwszego konkurenta poniżej." />
          : <Rows>
              {(competitors ?? []).map((c) => (
                <Row key={c.id} className="gap-y-3">
                  <span className="min-w-0 basis-48 text-[15px] font-medium">{c.name}</span>
                  <ul className="flex min-w-0 flex-1 basis-64 flex-wrap gap-2">
                    {c.aliases.map((a) => <li key={`a-${a}`} className={chip}>{a}</li>)}
                    {c.domains.map((d) => <li key={`d-${d}`} className={chip}>{d}</li>)}
                  </ul>
                  <form action={deleteCompetitor}>
                    <input type="hidden" name="id" value={c.id} />
                    <Button type="submit" variant="danger-quiet">Usuń</Button>
                  </form>
                </Row>
              ))}
            </Rows>}
        <Tile className="mt-6">
          <form action={addCompetitor} className="grid items-center gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            <Input name="name" required placeholder="Nazwa" aria-label="Nazwa" />
            <Input name="aliases" placeholder="Aliasy" aria-label="Aliasy" />
            <Input name="domains" placeholder="Domeny" aria-label="Domeny" />
            <Button type="submit">Dodaj konkurenta</Button>
          </form>
        </Tile>
      </section>

      <section>
        <SectionHead title="Silniki" />
        <Rows>
          {DEFAULT_ENGINES.map((id) => {
            const on = enabled.get(id) ?? false;
            return (
              <Row key={id} className="justify-between">
                <span className="text-[15px]">{ENGINE_LABELS[id]}</span>
                <form action={toggleEngine}>
                  <input type="hidden" name="engine_id" value={id} />
                  <input type="hidden" name="enabled" value={String(!on)} />
                  <Button type="submit" variant="quiet" className={on ? "text-teal" : "text-t2"}>{on ? "włączony" : "wyłączony"}</Button>
                </form>
              </Row>
            );
          })}
        </Rows>
      </section>
    </div>
  );
}
