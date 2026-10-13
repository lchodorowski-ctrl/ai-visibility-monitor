// Scala zdublowane rekomendacje po nowym fingerprincie (cel zamiast tytułu) i przelicza fingerprinty pozostałych.
// W grupie zostaje wiersz o najwyższym priority (remis: najstarszy), reszta trafia do jego evidence i jest usuwana.
// Użycie: npx tsx --env-file=.env.local scripts/dedupe-recommendations.ts [projectId] [--dry-run]
import { createAdminSupabase } from "@/lib/supabase/admin";
import { fingerprintFor, mergeEvidence, type Evidence } from "@/lib/recommend/fingerprint";

// the most advanced status wins, so a todo keeper never swallows a row the user already acted on
const STATUS_RANK: Record<string, number> = { done: 3, doing: 2, dismissed: 1, todo: 0 };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "22222222-2222-2222-2222-222222222222";

const EMPTY: Evidence = { prompt_ids: [], visibility_by_engine: {}, cited_domains: [], cited_urls: [], competitors_mentioned: [], sample_quotes: [] };
/** evidence is jsonb, so older or partial blobs get defaults before mergeEvidence. */
const asEvidence = (e: unknown): Evidence => ({ ...EMPTY, ...(e && typeof e === "object" && !Array.isArray(e) ? (e as Partial<Evidence>) : {}) });

async function main() {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("recommendations")
    .select("id, type, title, target_url, evidence, impact, effort, priority, status, fingerprint, created_at")
    .eq("project_id", PROJECT_ID).order("created_at", { ascending: true }).limit(5000);
  if (error) throw new Error(`recommendations select: ${error.message}`);
  const rows = data ?? [];

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const fp = fingerprintFor(r);
    groups.set(fp, [...(groups.get(fp) ?? []), r]);
  }

  let mergedGroups = 0, deleted = 0, renamed = 0;
  for (const [fp, group] of groups) {
    // rows are ordered by created_at, so a stable sort by priority keeps the oldest first on ties
    const sorted = [...group].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const keeper = sorted[0], rest = sorted.slice(1);
    if (rest.length > 0) {
      mergedGroups++;
      console.log(`\nGrupa ${fp.slice(0, 8)} (${keeper.type}, ${rest.length + 1} wiersze) zostaje: "${keeper.title}" [priority ${keeper.priority}, ${keeper.status}]`);
      for (const r of rest) console.log(`  scalone: "${r.title}" [priority ${r.priority}, ${r.status}]${r.status !== keeper.status ? "  UWAGA: inny status niż zwycięzca" : ""}`);
      const status = group.reduce((best, r) => ((STATUS_RANK[r.status] ?? 0) > (STATUS_RANK[best] ?? 0) ? r.status : best), keeper.status);
      if (status !== keeper.status) console.log(`  status zwycięzcy: ${keeper.status} -> ${status}`);
      if (!dryRun) {
        const evidence = rest.reduce((acc, r) => mergeEvidence(acc, asEvidence(r.evidence)), asEvidence(keeper.evidence));
        const { error: upErr } = await admin.from("recommendations").update({
          evidence: evidence as never,
          impact: Math.max(...group.map((r) => r.impact)), effort: Math.max(...group.map((r) => r.effort)),
          status, updated_at: new Date().toISOString(),
        }).eq("id", keeper.id).eq("project_id", PROJECT_ID);
        if (upErr) throw new Error(`recommendations update: ${upErr.message}`);
        const { error: delErr } = await admin.from("recommendations").delete().in("id", rest.map((r) => r.id)).eq("project_id", PROJECT_ID);
        if (delErr) throw new Error(`recommendations delete: ${delErr.message}`);
      }
      deleted += rest.length;
    }
    // after deleting the duplicates, so the (project_id, fingerprint) unique index cannot clash
    if (keeper.fingerprint !== fp) {
      if (rest.length === 0) console.log(`\nNowy fingerprint: "${keeper.title}"`);
      if (!dryRun) {
        const { error: fpErr } = await admin.from("recommendations").update({ fingerprint: fp }).eq("id", keeper.id).eq("project_id", PROJECT_ID);
        if (fpErr) throw new Error(`recommendations fingerprint update: ${fpErr.message}`);
      }
      renamed++;
    }
  }
  console.log(`\n${dryRun ? "[dry-run] " : ""}Przed: ${rows.length}, po: ${rows.length - deleted}; scalono grup: ${mergedGroups}, usunięto: ${deleted}, zmieniono fingerprint: ${renamed}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
