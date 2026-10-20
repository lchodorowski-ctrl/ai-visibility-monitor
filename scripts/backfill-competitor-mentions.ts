// Uzupełnia wzmianki i cytowania konkurentów w zapisanych odpowiedziach (koszt 0, bez zapytań do silników).
// Runy sprzed dodania konkurentów (produkcja: do 2026-10-20) nie mają ich wzmianek, więc share of voice liczył
// tylko własną markę. Skrypt wylicza wzmianki tą samą ekstrakcją co pomiar (extractMentions z dzisiejszą listą
// konkurentów), dopisuje brakujące wiersze mentions (brand_kind = 'competitor'), przeklasyfikowuje
// citations.competitor_id i przelicza daily_metrics dla dni z nowymi wzmiankami. Pomija odpowiedzi z błędem
// i runy w trakcie (ich wzmianki mogą się jeszcze zapisywać).
//
// Pozycja (position) to kolejność wszystkich marek w tekście. Dopisany konkurent dostaje miejsce w pełnym rankingu,
// tak jak w nowym runie. Wiersz własnej marki zostaje nietknięty, ale jego pozycja (w starych runach zawsze 1,
// bo była jedyną marką) przestaje się zgadzać, gdy konkurent pada w tekście wcześniej. Podgląd pokazuje, ile to
// odpowiedzi i jak zmieniłaby się średnia pozycja dnia. --renumber przepisuje też kolumnę position zapisanych
// wierszy (bez usuwania), żeby historia była porównywalna z nowymi runami; można go dodać także w późniejszym przebiegu.
// daily_metrics nie czyta citations.competitor_id, więc same zmiany cytowań nie wymagają przeliczenia dni.
//
// Domyślnie tylko pokazuje, co by zmienił; zapis: --apply. Idempotentny: drugi przebieg nic nie dopisze.
// Użycie: npx tsx --env-file=.env.local scripts/backfill-competitor-mentions.ts [projectId] [--apply] [--renumber]
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { planMentionBackfill, competitorForCitation, type MentionInsert, type PositionFix, type StoredMention } from "@/lib/extract/backfill";
import { brandDefs } from "@/lib/runs/process-response";
import { computeMetrics, type ResponseFacts } from "@/lib/metrics/aggregate";
import { runAggregateProject } from "@/trigger/aggregate-project";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const renumber = args.includes("--renumber");
const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "22222222-2222-2222-2222-222222222222";
const PAGE = 500;
const CHUNK = 200;
const ENGINES = Object.keys(ENGINE_LABELS) as EngineId[];

type Resp = {
  id: string; prompt_id: string; engine_id: string; text: string; no_answer: boolean;
  runs: { started_at: string; status: string } | null;
  mentions: StoredMention[];
  citations: { is_own: boolean }[];
};
type Cit = { id: string; url: string; domain: string; is_own: boolean; competitor_id: string | null; responses: { engine_id: string } | null };

async function main() {
  const admin = createAdminSupabase();
  const [projectRes, compsRes] = await Promise.all([
    admin.from("projects").select("brand_name, brand_aliases, domains").eq("id", PROJECT_ID).single(),
    admin.from("competitors").select("id, name, aliases, domains").eq("project_id", PROJECT_ID).order("name"),
  ]);
  if (projectRes.error) throw new Error(`projects: ${projectRes.error.message}`);
  if (compsRes.error) throw new Error(`competitors: ${compsRes.error.message}`);
  const project = projectRes.data;
  const competitors = compsRes.data ?? [];
  const names = new Map(competitors.map((c) => [c.id, c.name]));
  console.log(`Projekt ${PROJECT_ID} (${project.brand_name}), konkurenci: ${competitors.length}`);
  if (!competitors.length) { console.log("Brak konkurentów: nie ma czego uzupełniać."); return; }
  const brands = brandDefs({ brandName: project.brand_name, aliases: project.brand_aliases, domains: project.domains }, competitors);

  const responses = await fetchAll<Resp>((from) => admin.from("responses")
    .select("id, prompt_id, engine_id, text, no_answer, runs(started_at, status), mentions(id, brand_kind, brand_name, competitor_id, position, char_index), citations(is_own)")
    .eq("project_id", PROJECT_ID).is("error", null).order("id").range(from, from + PAGE - 1), "responses");

  const inserts: (MentionInsert & { responseId: string })[] = [];
  const fixes: PositionFix[] = [];
  const mentionCounts = new Counter();
  const insertDays = new Set<string>();
  const fixDays = new Set<string>();
  const facts = new Map<string, { now: ResponseFacts[]; after: ResponseFacts[]; renumbered: ResponseFacts[] }>();
  let skippedRunning = 0, responsesWithInserts = 0, ownStale = 0;
  for (const r of responses) {
    if (!r.runs || r.runs.status === "running") { skippedRunning++; continue; }
    const day = r.runs.started_at.slice(0, 10);
    const plan = planMentionBackfill({ text: r.text, noAnswer: r.no_answer, stored: r.mentions }, brands);
    for (const m of plan.inserts) {
      inserts.push({ ...m, responseId: r.id });
      mentionCounts.add(m.competitorId, r.engine_id);
    }
    fixes.push(...plan.positionFixes);
    if (plan.inserts.length) { responsesWithInserts++; insertDays.add(day); }
    if (plan.positionFixes.length) fixDays.add(day);
    const ownFix = plan.positionFixes.find((f) => f.kind === "own");
    if (ownFix) ownStale++;

    // fakty jak w runAggregateProject: teraz, po dopisaniu, po dopisaniu z przepisanymi pozycjami
    const own = r.mentions.find((m) => m.brand_kind === "own");
    const base = { promptId: r.prompt_id, engineId: r.engine_id, noAnswer: r.no_answer, error: false, ownMentioned: Boolean(own), ownCited: r.citations.some((c) => c.is_own) };
    const d = facts.get(day) ?? { now: [], after: [], renumbered: [] };
    const brandsAfter = r.mentions.length + plan.inserts.length;
    d.now.push({ ...base, ownPosition: own?.position ?? null, brandsMentioned: r.mentions.length });
    d.after.push({ ...base, ownPosition: own?.position ?? null, brandsMentioned: brandsAfter });
    d.renumbered.push({ ...base, ownPosition: ownFix?.to ?? own?.position ?? null, brandsMentioned: brandsAfter });
    facts.set(day, d);
  }

  const citations = await fetchAll<Cit>((from) => admin.from("citations")
    .select("id, url, domain, is_own, competitor_id, responses(engine_id)")
    .eq("project_id", PROJECT_ID).order("id").range(from, from + PAGE - 1), "citations");
  const citationGroups = new Map<string | null, string[]>();
  const assigned = new Counter();
  const unassigned = new Counter();
  for (const c of citations) {
    const next = competitorForCitation(c, project.domains, competitors);
    if (next === c.competitor_id) continue;
    citationGroups.set(next, [...(citationGroups.get(next) ?? []), c.id]);
    const engine = c.responses?.engine_id ?? "?";
    if (next) assigned.add(next, engine);
    if (c.competitor_id) unassigned.add(c.competitor_id, engine);
  }
  const citationChanges = [...citationGroups.values()].reduce((s, ids) => s + ids.length, 0);

  const days = [...new Set([...insertDays, ...(renumber ? fixDays : [])])].sort();
  console.log(`Odpowiedzi bez błędu: ${responses.length}${skippedRunning ? ` (pominięte z runów w trakcie: ${skippedRunning})` : ""}`);
  console.log(`\nWzmianki konkurentów do dopisania: ${inserts.length} w ${responsesWithInserts} odpowiedziach`);
  printCounts(mentionCounts, names);
  console.log(`\nCytowania ze zmienionym competitor_id: ${citationChanges} z ${citations.length}`);
  console.log("Cytowania konkurentów, które dojdą:");
  printCounts(assigned, names);
  if (unassigned.total()) {
    console.log("Cytowania, które stracą obecnego konkurenta (domena już do niego nie pasuje):");
    printCounts(unassigned, names);
  }

  const ownFixes = fixes.filter((f) => f.kind === "own").length;
  console.log(`\nPozycja własnej marki: w ${ownStale} odpowiedziach konkurent pada w tekście wcześniej, więc zapisana pozycja`
    + ` nie zgadza się z rankingiem wszystkich marek (wiersze do przepisania: własna marka ${ownFixes}, konkurenci ${fixes.length - ownFixes}).`);
  console.log(renumber
    ? "--renumber: pozycje tych wierszy zostaną przepisane (tylko kolumna position)."
    : "Bez --renumber zostają bez zmian (wiersz własnej marki nietknięty).");

  console.log(`\nDni do przeliczenia (${days.length}): ${days.join(", ") || "brak"}`);
  const shown = [...new Set([...insertDays, ...fixDays])].sort();
  if (shown.length) {
    console.log("Wynik dnia (wszystkie silniki i pytania), teraz → po zapisie:");
    table(["dzień", "odpowiedzi", "share of voice", "śr. pozycja", "śr. poz. z --renumber", "wynik", "wynik z --renumber"], shown.map((day) => {
      const d = facts.get(day)!;
      const [now, after, ren] = [d.now, d.after, d.renumbered].map((f) => computeMetrics(f)[0]);
      return [day, now?.responsesCount ?? 0, `${pct(now?.shareOfVoice)} → ${pct(after?.shareOfVoice)}`,
        `${pos(now?.avgPosition)} → ${pos(after?.avgPosition)}`, pos(ren?.avgPosition),
        `${now?.score ?? "-"} → ${after?.score ?? "-"}`, String(ren?.score ?? "-")];
    }));
  }
  if (!apply) { console.log(`\nTylko podgląd. Zapis: dodaj --apply${renumber ? "" : " (pozycje własnej marki: --apply --renumber)"}.`); return; }

  for (let i = 0; i < inserts.length; i += PAGE) {
    const { error } = await admin.from("mentions").insert(inserts.slice(i, i + PAGE).map((m) => ({
      response_id: m.responseId, project_id: PROJECT_ID, brand_kind: m.kind, brand_name: m.name,
      competitor_id: m.competitorId, position: m.position, char_index: m.charIndex,
    })));
    if (error) throw new Error(`mentions insert: ${error.message}`);
  }
  console.log(`\nDopisano ${inserts.length} wzmianek konkurentów.`);

  if (renumber && fixes.length) {
    const byPosition = new Map<number, string[]>();
    for (const f of fixes) byPosition.set(f.to, [...(byPosition.get(f.to) ?? []), f.id]);
    for (const [position, ids] of byPosition) await updateIn("mentions", { position }, ids);
    console.log(`Przepisano pozycje ${fixes.length} wierszy.`);
  }

  for (const [competitorId, ids] of citationGroups) await updateIn("citations", { competitor_id: competitorId }, ids);
  console.log(`Zaktualizowano competitor_id w ${citationChanges} cytowaniach.`);

  for (const date of days) {
    const r = await runAggregateProject({ projectId: PROJECT_ID, runId: "backfill-competitor-mentions", date }, admin);
    console.log(`  ${date}: przeliczono ${r.rows} wierszy, wynik ${r.score}`);
  }

  async function updateIn(tableName: "mentions" | "citations", values: { position: number } | { competitor_id: string | null }, ids: string[]) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error } = await admin.from(tableName).update(values).in("id", ids.slice(i, i + CHUNK)).eq("project_id", PROJECT_ID);
      if (error) throw new Error(`${tableName} update: ${error.message}`);
    }
  }
}

async function fetchAll<T>(page: (from: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** Licznik konkurent × silnik. */
class Counter {
  private m = new Map<string, Map<string, number>>();
  add(competitorId: string, engine: string) {
    const row = this.m.get(competitorId) ?? new Map<string, number>();
    row.set(engine, (row.get(engine) ?? 0) + 1);
    this.m.set(competitorId, row);
  }
  get(competitorId: string, engine: string) { return this.m.get(competitorId)?.get(engine) ?? 0; }
  row(competitorId: string) { return [...(this.m.get(competitorId)?.values() ?? [])].reduce((a, b) => a + b, 0); }
  ids() { return [...this.m.keys()]; }
  total() { return this.ids().reduce((s, id) => s + this.row(id), 0); }
}

function printCounts(counts: Counter, names: Map<string, string>) {
  if (!counts.total()) { console.log("  brak"); return; }
  const ids = [...new Set([...names.keys(), ...counts.ids()])].filter((id) => counts.row(id) > 0);
  table(["konkurent", ...ENGINES.map((e) => ENGINE_LABELS[e]), "razem"], [
    ...ids.map((id) => [names.get(id) ?? id, ...ENGINES.map((e) => counts.get(id, e)), counts.row(id)]),
    ["razem", ...ENGINES.map((e) => ids.reduce((s, id) => s + counts.get(id, e), 0)), counts.total()],
  ]);
}

function table(header: string[], rows: (string | number)[][]) {
  const all = [header, ...rows].map((r) => r.map(String));
  const width = header.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  for (const r of all) console.log("  " + r.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join("  "));
}

const pct = (v: number | undefined) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
const pos = (v: number | null | undefined) => (v == null ? "-" : v.toFixed(2));

main().catch((e) => { console.error(e); process.exit(1); });
