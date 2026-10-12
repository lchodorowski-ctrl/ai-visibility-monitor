"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/workspace";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Błąd logowania")}`);
  await ensureWorkspace(data.user.id, data.user.email ?? email);
  redirect("/app");
}
