"use server";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import type { recommendProject } from "@/trigger/recommend-project";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";

const Status = z.enum(["todo", "doing", "done", "dismissed"]);

export async function setRecommendationStatus(formData: FormData) {
  const project = await getCurrentProject();
  const id = String(formData.get("id")); const status = Status.parse(formData.get("status"));
  if (!isUuid(id)) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recommendations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("project_id", project.id);
  if (error) throw new Error(error.message);
  for (const p of ["/app/recommendations", `/app/recommendations/${id}`, "/app", "/app/prompts"]) revalidatePath(p);
}

export async function refreshRecommendations() {
  const project = await getCurrentProject();
  await tasks.trigger<typeof recommendProject>("recommend-project", { projectId: project.id, runId: null, date: new Date().toISOString().slice(0, 10) });
  revalidatePath("/app/recommendations");
}
