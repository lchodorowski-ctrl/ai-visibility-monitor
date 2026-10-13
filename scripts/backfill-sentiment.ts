// Uzupełnia brakujący sentyment zapisanych odpowiedzi (jak w runie: tylko odpowiedzi, w których wystąpiła własna marka).
// Użycie: npx tsx --env-file=.env.local scripts/backfill-sentiment.ts [projectId] [--limit N] [--dry-run]
import { createAdminSupabase } from "@/lib/supabase/admin";
import { analyzeSentiment } from "@/lib/extract/sentiment";

const CONCURRENCY = 4;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
if (limitIdx >= 0 && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit wymaga dodatniej liczby całkowitej");
const PROJECT_ID = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit") ?? "22222222-2222-2222-2222-222222222222";

async function main() {
  const admin = createAdminSupabase();
  const { data: project, error: pErr } = await admin.from("projects").select("brand_name, brand_aliases").eq("id", PROJECT_ID).single();
  if (pErr) throw new Error(`projects select: ${pErr.message}`);

  // Run analizuje sentyment tylko, gdy w odpowiedzi jest własna marka (process-response.ts), więc backfill robi to samo:
  // dla odpowiedzi bez wzmianki "neutral" byłoby fałszywym sygnałem. Inner join na mentions odfiltrowuje takie wiersze.
  const { data, error } = await admin.from("responses")
    .select("id, text, created_at, mentions!inner(brand_kind)")
    .eq("project_id", PROJECT_ID).is("sentiment", null).eq("no_answer", false).is("error", null).neq("text", "")
    .eq("mentions.brand_kind", "own")
    .order("created_at", { ascending: true }).limit(5000);
  if (error) throw new Error(`responses select: ${error.message}`);
  const seen = new Set<string>();
  const rows = (data ?? []).filter((r) => r.text.trim() !== "" && !seen.has(r.id) && seen.add(r.id)).slice(0, limit);
  console.log(`Do uzupełnienia: ${rows.length} odpowiedzi (projekt ${PROJECT_ID})${dryRun ? " [dry-run]" : ""}`);
  if (dryRun) return;

  let next = 0, processed = 0, updated = 0, skippedNull = 0, failed = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      try {
        const res = await analyzeSentiment(row.text, project!.brand_name, project!.brand_aliases);
        if (!res) skippedNull++;
        else {
          const { error: upErr } = await admin.from("responses").update({ sentiment: res.sentiment, sentiment_summary: res.summary }).eq("id", row.id).eq("project_id", PROJECT_ID);
          if (upErr) throw new Error(`responses update: ${upErr.message}`);
          updated++;
        }
      } catch (e) {
        failed++;
        console.error(`Błąd dla ${row.id}:`, e instanceof Error ? e.message : e);
      }
      if (++processed % 20 === 0) console.log(`  ${processed}/${rows.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Gotowe: przetworzono ${processed}, zaktualizowano ${updated}, pominięto (null) ${skippedNull}, błędy ${failed}`);
  if (failed > 0) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
