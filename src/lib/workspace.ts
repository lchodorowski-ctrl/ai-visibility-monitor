import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const DEFAULT_ENGINES = ["openai", "perplexity", "gemini", "google_ai_overview"] as const;

export async function ensureWorkspaceWith(
  admin: SupabaseClient<Database>,
  userId: string,
  email: string,
): Promise<{ orgId: string; projectId: string }> {
  const { data: membership } = await admin
    .from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();

  if (membership) {
    const { data: project } = await admin
      .from("projects").select("id").eq("org_id", membership.org_id).order("created_at").limit(1).maybeSingle();
    return { orgId: membership.org_id, projectId: project?.id ?? "" };
  }

  const { data: org } = await admin
    .from("organizations").insert({ name: `Organizacja ${email}` }).select("id").single();
  await admin.from("memberships").insert({ org_id: org!.id, user_id: userId, role: "owner" });
  const { data: project } = await admin
    .from("projects")
    .insert({ org_id: org!.id, name: "Mój projekt", brand_name: "Moja marka", brand_aliases: [], domains: [] })
    .select("id").single();
  await admin.from("project_engines")
    .insert(DEFAULT_ENGINES.map((engine_id) => ({ project_id: project!.id, engine_id })));
  return { orgId: org!.id, projectId: project!.id };
}

export async function ensureWorkspace(userId: string, email: string) {
  return ensureWorkspaceWith(createAdminSupabase(), userId, email);
}

export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getCurrentProject() {
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects").select("*").order("created_at").limit(1).maybeSingle();
  if (!project) {
    await ensureWorkspace(user.id, user.email ?? "");
    redirect("/app");
  }
  return project;
}
