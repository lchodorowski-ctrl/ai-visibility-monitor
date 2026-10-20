// Naprawia domeny cytowań Gemini zapisane jako host przekierowania (vertexaisearch.cloud.google.com):
// prawdziwa domena jest w tytule cytowania. Przelicza is_own i competitor_id, a potem daily_metrics
// dla każdego dnia z poprawionymi cytowaniami (koszt 0, bez zapytań do silników).
// Kopia cytowań w responses.citations (jsonb) zostaje bez zmian: nic jej nie czyta.
// Domyślnie tylko pokazuje, co by zmienił; zapis: --apply.
// Użycie: npx tsx --env-file=.env.local scripts/fix-gemini-citation-domains.ts [projectId] [--apply]
import { createAdminSupabase } from "@/lib/supabase/admin";
import { REDIRECT_HOSTS, domainFromTitle } from "@/lib/engines/domain";
import { classifyCitations } from "@/lib/extract/citations";
import { runAggregateProject } from "@/trigger/aggregate-project";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "22222222-2222-2222-2222-222222222222";
const PAGE = 1000;
const CHUNK = 200;

async function main() {
  const admin = createAdminSupabase();
  const [projectRes, compsRes] = await Promise.all([
    admin.from("projects").select("brand_name, domains").eq("id", PROJECT_ID).single(),
    admin.from("competitors").select("id, domains").eq("project_id", PROJECT_ID),
  ]);
  if (projectRes.error) throw new Error(`projects: ${projectRes.error.message}`);
  if (compsRes.error) throw new Error(`competitors: ${compsRes.error.message}`);
  const project = projectRes.data;
  const competitors = compsRes.data ?? [];

  type Cit = { id: string; url: string; title: string | null; is_own: boolean; competitor_id: string | null; responses: { runs: { started_at: string } | null } | null };
  const rows: Cit[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("citations")
      .select("id, url, title, is_own, competitor_id, responses(runs(started_at))")
      .eq("project_id", PROJECT_ID).in("domain", REDIRECT_HOSTS)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`citations: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Cit[]));
    if ((data ?? []).length < PAGE) break;
  }

  // one update per resulting (domain, is_own, competitor_id), so a few hundred rows need a few dozen calls
  const groups = new Map<string, { domain: string; is_own: boolean; competitor_id: string | null; ids: string[] }>();
  const dates = new Set<string>();
  const byDomain = new Map<string, number>();
  let unresolved = 0, ownBefore = 0, ownAfter = 0;
  for (const c of rows) {
    const domain = domainFromTitle(c.title);
    if (!domain) { unresolved++; continue; }
    const [k] = classifyCitations([{ url: c.url, domain }], project.domains, competitors);
    const key = `${domain}|${k.isOwn}|${k.competitorId ?? ""}`;
    const g = groups.get(key) ?? { domain, is_own: k.isOwn, competitor_id: k.competitorId ?? null, ids: [] };
    g.ids.push(c.id);
    groups.set(key, g);
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
    if (c.is_own) ownBefore++;
    if (k.isOwn) ownAfter++;
    const started = c.responses?.runs?.started_at;
    if (started) dates.add(started.slice(0, 10));
  }

  const days = [...dates].sort();
  console.log(`Projekt ${PROJECT_ID} (${project.brand_name}), domeny marki: ${project.domains.join(", ") || "brak"}`);
  console.log(`Cytowania z hostem przekierowania: ${rows.length}, do poprawy: ${rows.length - unresolved}, bez domeny w tytule (zostają): ${unresolved}`);
  console.log(`Cytowania własnej domeny: ${ownBefore} -> ${ownAfter}; cytowania konkurentów po naprawie: ${[...groups.values()].filter((g) => g.competitor_id).reduce((s, g) => s + g.ids.length, 0)}`);
  console.log("Najczęstsze domeny po naprawie:", [...byDomain].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([d, n]) => `${d} ${n}×`).join(", ") || "brak");
  console.log(`Dni do przeliczenia (${days.length}): ${days.join(", ") || "brak"}`);
  if (!apply) { console.log("\nTylko podgląd. Zapis: dodaj --apply."); return; }

  let updated = 0;
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += CHUNK) {
      const ids = g.ids.slice(i, i + CHUNK);
      const { error } = await admin.from("citations")
        .update({ domain: g.domain, is_own: g.is_own, competitor_id: g.competitor_id })
        .in("id", ids).eq("project_id", PROJECT_ID);
      if (error) throw new Error(`citations update: ${error.message}`);
      updated += ids.length;
    }
  }
  console.log(`\nZaktualizowano ${updated} cytowań.`);
  for (const date of days) {
    const r = await runAggregateProject({ projectId: PROJECT_ID, runId: "fix-gemini-citation-domains", date }, admin);
    console.log(`  ${date}: przeliczono ${r.rows} wierszy, wynik ${r.score}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
