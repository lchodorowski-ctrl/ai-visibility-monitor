// Jednorazowo: dodaje konkurentów PSAI wykrytych w pierwszym runie (edytuj w Ustawieniach).
import { createAdminSupabase } from "@/lib/supabase/admin";

const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const competitors = [
  { name: "Akademia PARP", aliases: ["PARP", "Akademia PARP"], domains: ["parp.gov.pl"] },
  { name: "EY Academy of Business", aliases: ["EY Academy", "EY Academy of Business"], domains: ["academyofbusiness.pl"] },
  { name: "PCDK", aliases: ["Polskie Centrum Doradztwa Kadr", "PCDK"], domains: ["pcdk.pl"] },
  { name: "Szkoła Managera", aliases: ["Szkola Managera", "AI w Biurze"], domains: ["szkolamanagera.pl"] },
  { name: "Altkom Akademia", aliases: ["Altkom"], domains: ["altkomakademia.pl"] },
  { name: "Mach & Partner Consulting", aliases: ["Mach & Partner", "Mach Consulting"], domains: ["machconsulting.pl"] },
  { name: "Akademia Leona Koźmińskiego", aliases: ["ALK", "Koźmiński", "Kozminski"], domains: ["kozminski.edu.pl"] },
];

async function main() {
  const admin = createAdminSupabase();
  const { data: existing, error: readErr } = await admin.from("competitors").select("name").eq("project_id", PROJECT_ID);
  if (readErr) throw new Error(readErr.message);
  const have = new Set((existing ?? []).map((c) => c.name));
  const rows = competitors.filter((c) => !have.has(c.name)).map((c) => ({ ...c, project_id: PROJECT_ID }));
  if (rows.length === 0) { console.log("Konkurenci już istnieją — nic nie dodano."); return; }
  const { error } = await admin.from("competitors").insert(rows);
  if (error) throw new Error(error.message);
  console.log(`Dodano ${rows.length} konkurentów:`, rows.map((r) => r.name).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); });
