"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject, requireUser } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { selectPrompts } from "@/lib/calibration/select";
import { CALIBRATION_ENGINES } from "@/lib/calibration/engines";
import { assertOpenSession, mergeAlias, parseUrls } from "@/lib/calibration/session";
import { getLatestDoneRun } from "@/lib/calibration/queries";
import { CALIBRATION_MESSAGES } from "@/lib/calibration/messages";

async function loadSession(projectId: string, id: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("calibrations").select("id, status").eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const PAGE = 1000;

// Identyfikatory pytań, które mają odpowiedź w danym pomiarze (PostgREST zwraca max 1000 wierszy, więc czytamy stronami).
async function promptIdsWithResponses(projectId: string, runId: string): Promise<Set<string>> {
  const supabase = await createServerSupabase();
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("responses").select("prompt_id").eq("project_id", projectId).eq("run_id", runId).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) ids.add(r.prompt_id);
    if ((data?.length ?? 0) < PAGE) return ids;
  }
}

export async function createCalibration() {
  const project = await getCurrentProject();
  const { user } = await requireUser();
  const run = await getLatestDoneRun(project.id);
  if (!run) throw new Error(CALIBRATION_MESSAGES.noRun);
  const supabase = await createServerSupabase();
  // Podwójne kliknięcie lub drugie okno: wracamy do otwartej kalibracji tego samego pomiaru zamiast tworzyć duplikat.
  const { data: existing, error: eErr } = await supabase.from("calibrations").select("id").eq("project_id", project.id).eq("run_id", run.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (eErr) throw new Error(eErr.message);
  if (existing) redirect(`/app/calibration/${existing.id}`);
  const { data: prompts, error: pErr } = await supabase.from("prompts").select("id, is_key, created_at").eq("project_id", project.id).eq("active", true);
  if (pErr) throw new Error(pErr.message);
  const answered = await promptIdsWithResponses(project.id, run.id);
  const chosen = selectPrompts((prompts ?? []).filter((p) => answered.has(p.id)), 10);
  if (chosen.length === 0) throw new Error(CALIBRATION_MESSAGES.noPrompts);
  const { data: cal, error } = await supabase.from("calibrations").insert({ project_id: project.id, run_id: run.id, created_by: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  const rows = chosen.flatMap((p) => CALIBRATION_ENGINES.map((engine_id) => ({ calibration_id: cal.id, project_id: project.id, prompt_id: p.id, engine_id })));
  const { error: cErr } = await supabase.from("calibration_checks").insert(rows);
  if (cErr) {
    // Kompensacja: nie zostawiamy pustej, otwartej kalibracji.
    const { error: dErr } = await supabase.from("calibrations").delete().eq("project_id", project.id).eq("id", cal.id);
    if (dErr) console.error(`createCalibration: nie udało się usunąć kalibracji ${cal.id}: ${dErr.message}`);
    throw new Error(cErr.message);
  }
  revalidatePath("/app/calibration");
  redirect(`/app/calibration/${cal.id}`);
}

const CheckSchema = z.object({
  id: z.string().refine(isUuid),
  calibrationId: z.string().refine(isUuid),
  mentioned: z.enum(["yes", "no", "unknown"]),
  urls: z.string().max(5000).default(""),
  alias: z.string().max(200).default(""),
});

export async function saveCheck(formData: FormData) {
  const project = await getCurrentProject();
  const f = CheckSchema.parse(Object.fromEntries(formData));
  assertOpenSession(await loadSession(project.id, f.calibrationId));
  const supabase = await createServerSupabase();
  const manual_mentioned = f.mentioned === "unknown" ? null : f.mentioned === "yes";
  const { error } = await supabase.from("calibration_checks")
    .update({ manual_mentioned, manual_urls: parseUrls(f.urls), manual_alias: manual_mentioned ? f.alias.trim() || null : null, updated_at: new Date().toISOString() })
    .eq("project_id", project.id).eq("calibration_id", f.calibrationId).eq("id", f.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/calibration/${f.calibrationId}`);
}

export async function closeCalibration(formData: FormData) {
  const project = await getCurrentProject();
  const id = String(formData.get("id"));
  if (!isUuid(id)) return;
  const session = await loadSession(project.id, id);
  if (!session) return;
  if (session.status === "closed") {
    // Idempotentnie: drugie kliknięcie lub stara karta nie kończą się błędem.
    revalidatePath("/app/calibration");
    revalidatePath(`/app/calibration/${id}`);
    return;
  }
  assertOpenSession(session);
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("calibrations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("project_id", project.id).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/calibration");
  revalidatePath(`/app/calibration/${id}`);
}

const AliasSchema = z.object({
  calibrationId: z.string().optional(),
  alias: z.string().trim().max(200),
});

export async function addAliasFromCalibration(formData: FormData) {
  const project = await getCurrentProject();
  const parsed = AliasSchema.safeParse({ calibrationId: formData.get("calibrationId") ?? undefined, alias: formData.get("alias") ?? "" });
  if (!parsed.success) return;
  const { calibrationId = "", alias } = parsed.data;
  // Nazwa marki też liczy się jako znana fraza, ale do aliasów dopisujemy tylko nową.
  const known = mergeAlias([project.brand_name, ...project.brand_aliases], alias);
  if (!known) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("projects").update({ brand_aliases: [...project.brand_aliases, known[known.length - 1]] }).eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
  if (isUuid(calibrationId)) revalidatePath(`/app/calibration/${calibrationId}`);
}
