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

async function loadSession(projectId: string, id: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("calibrations").select("id, status").eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createCalibration() {
  const project = await getCurrentProject();
  const { user } = await requireUser();
  const run = await getLatestDoneRun(project.id);
  if (!run) throw new Error("Najpierw uruchom pomiar");
  const supabase = await createServerSupabase();
  const { data: prompts, error: pErr } = await supabase.from("prompts").select("id, is_key, created_at").eq("project_id", project.id).eq("active", true);
  if (pErr) throw new Error(pErr.message);
  const chosen = selectPrompts(prompts ?? [], 10);
  const { data: cal, error } = await supabase.from("calibrations").insert({ project_id: project.id, run_id: run.id, created_by: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  const rows = chosen.flatMap((p) => CALIBRATION_ENGINES.map((engine_id) => ({ calibration_id: cal.id, project_id: project.id, prompt_id: p.id, engine_id })));
  if (rows.length) {
    const { error: cErr } = await supabase.from("calibration_checks").insert(rows);
    if (cErr) throw new Error(cErr.message);
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
  assertOpenSession(await loadSession(project.id, id));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("calibrations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("project_id", project.id).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/calibration");
  revalidatePath(`/app/calibration/${id}`);
}

export async function addAliasFromCalibration(formData: FormData) {
  const project = await getCurrentProject();
  const calibrationId = String(formData.get("calibrationId"));
  const merged = mergeAlias(project.brand_aliases, String(formData.get("alias") ?? ""));
  if (!merged) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("projects").update({ brand_aliases: merged }).eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
  if (isUuid(calibrationId)) revalidatePath(`/app/calibration/${calibrationId}`);
}
