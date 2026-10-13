"use server";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import type { recommendProject } from "@/trigger/recommend-project";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { isRunStale } from "@/lib/runs/stale";

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
  const supabase = await createServerSupabase();
  const [runsRes, metricsRes] = await Promise.all([
    supabase.from("runs").select("status, started_at").eq("project_id", project.id).eq("status", "running"),
    supabase.from("daily_metrics").select("date").eq("project_id", project.id).order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (runsRes.error) throw new Error(runsRes.error.message);
  if (metricsRes.error) throw new Error(metricsRes.error.message);
  // a measurement in progress triggers recommend-project itself when it finishes (stale "running" rows do not block)
  if ((runsRes.data ?? []).some((r) => !isRunStale(r))) return;
  // the latest snapshot, not today's date: without today's metrics only the technical rules would run
  const date = metricsRes.data?.date ?? new Date().toISOString().slice(0, 10);
  await tasks.trigger<typeof recommendProject>(
    "recommend-project",
    { projectId: project.id, runId: null, date },
    // a double click (or two tabs) within 10 minutes enqueues one run, not two paid ones
    { idempotencyKey: `recommend-refresh:${project.id}:${date}`, idempotencyKeyTTL: "10m" },
  );
  revalidatePath("/app/recommendations");
}
