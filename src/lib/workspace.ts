import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const DEFAULT_ENGINES = ["openai", "perplexity", "gemini", "google_ai_overview"] as const;

function fail(step: string, error: { message: string }): never {
  throw new Error(`${step}: ${error.message}`);
}

async function createProject(admin: SupabaseClient<Database>, orgId: string): Promise<string> {
  const { data: project, error } = await admin
    .from("projects")
    .insert({ org_id: orgId, name: "Mój projekt", brand_name: "Moja marka", brand_aliases: [], domains: [] })
    .select("id").single();
  if (error) fail("insert project", error);
  if (!project) throw new Error("insert project: brak danych w odpowiedzi");

  const { error: enginesError } = await admin.from("project_engines")
    .insert(DEFAULT_ENGINES.map((engine_id) => ({ project_id: project.id, engine_id })));
  if (enginesError) fail("insert project_engines", enginesError);
  return project.id;
}

export async function ensureWorkspaceWith(
  admin: SupabaseClient<Database>,
  userId: string,
  email: string,
): Promise<{ orgId: string; projectId: string }> {
  const { data: membership, error: membershipError } = await admin
    .from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (membershipError) fail("select membership", membershipError);

  if (membership) {
    const { data: project, error: projectError } = await admin
      .from("projects").select("id").eq("org_id", membership.org_id).order("created_at").limit(1).maybeSingle();
    if (projectError) fail("select project", projectError);
    return { orgId: membership.org_id, projectId: project?.id ?? (await createProject(admin, membership.org_id)) };
  }

  const { data: org, error: orgError } = await admin
    .from("organizations").insert({ name: `Organizacja ${email}` }).select("id").single();
  if (orgError) fail("insert organization", orgError);
  if (!org) throw new Error("insert organization: brak danych w odpowiedzi");

  const { error: insertMembershipError } = await admin
    .from("memberships").insert({ org_id: org.id, user_id: userId, role: "owner" });
  if (insertMembershipError) fail("insert membership", insertMembershipError);

  return { orgId: org.id, projectId: await createProject(admin, org.id) };
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
