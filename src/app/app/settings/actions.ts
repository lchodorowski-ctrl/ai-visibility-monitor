"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { tasks } from "@trigger.dev/sdk";
import type { crawlSiteTask } from "@/trigger/crawl-site";
import { ProjectSettingsSchema, CompetitorSchema } from "@/lib/validation/settings";
import { siteUrlChanged } from "@/lib/site/url-changed";

export async function updateProjectSettings(formData: FormData) {
  const project = await getCurrentProject();
  const parsed = ProjectSettingsSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("projects").update(parsed).eq("id", project.id);
  if (error) throw new Error(error.message);
  if (siteUrlChanged(project.site_url, parsed.site_url)) {
    // a failed trigger must never fail the settings save; the next recommendation run recrawls a stale map anyway
    try {
      await tasks.trigger<typeof crawlSiteTask>(
        "crawl-site",
        { projectId: project.id },
        { idempotencyKey: `crawl-site:${project.id}:${Math.floor(Date.now() / 60000)}`, idempotencyKeyTTL: "1m" },
      );
    } catch (e) {
      console.error("crawl-site trigger failed after site_url change", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath("/app/settings");
}

export async function addCompetitor(formData: FormData) {
  const project = await getCurrentProject();
  const parsed = CompetitorSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("competitors").insert({ ...parsed, project_id: project.id });
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function deleteCompetitor(formData: FormData) {
  const project = await getCurrentProject();
  const id = String(formData.get("id"));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("competitors").delete().eq("id", id).eq("project_id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function toggleEngine(formData: FormData) {
  const project = await getCurrentProject();
  const engine_id = String(formData.get("engine_id"));
  const enabled = formData.get("enabled") === "true";
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("project_engines").upsert({ project_id: project.id, engine_id, enabled });
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}
