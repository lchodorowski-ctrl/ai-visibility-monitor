"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { parseList } from "@/lib/validation/settings";
import { generatePromptProposals, type PromptProposal } from "@/lib/prompts/generate";

const Intent = z.enum(["informational", "comparison", "transactional", "brand"]);
const Proposal = z.object({ text: z.string().trim().min(1), topic: z.string().trim(), intent: Intent });

export async function addTopic(formData: FormData) {
  const project = await getCurrentProject();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("topics").insert({ project_id: project.id, name });
  if (error) throw new Error(error.message);
  revalidatePath("/app/prompts");
}

export async function addPrompt(formData: FormData) {
  const project = await getCurrentProject();
  const text = String(formData.get("text") ?? "").trim();
  const topic_id = String(formData.get("topic_id") ?? "") || null;
  const intent = Intent.parse(formData.get("intent") ?? "informational");
  if (!text) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("prompts").insert({ project_id: project.id, text, topic_id, intent, is_key: formData.get("is_key") === "on" });
  if (error) throw new Error(error.message);
  revalidatePath("/app/prompts");
}

export async function togglePromptActive(formData: FormData) {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("prompts").update({ active: formData.get("active") === "true" })
    .eq("id", String(formData.get("id"))).eq("project_id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/prompts");
}

export async function togglePromptKey(formData: FormData) {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("prompts").update({ is_key: formData.get("is_key") === "true" })
    .eq("id", String(formData.get("id"))).eq("project_id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/prompts");
}

export async function deletePrompt(formData: FormData) {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("prompts").delete()
    .eq("id", String(formData.get("id"))).eq("project_id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/prompts");
}

export type GenerateResult = { ok: true; proposals: PromptProposal[] } | { ok: false; error: string };

export async function generateProposals(formData: FormData): Promise<GenerateResult> {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const { data: topics, error } = await supabase.from("topics").select("name").eq("project_id", project.id);
  if (error) throw new Error(error.message);
  const count = Math.min(50, Math.max(1, Math.trunc(Number(formData.get("count") ?? 15)) || 15));
  try {
    const proposals = await generatePromptProposals({
      brandName: project.brand_name,
      facts: project.facts as Record<string, unknown>,
      topics: (topics ?? []).map((t) => t.name),
      seedPhrases: parseList(String(formData.get("seed") ?? "")),
      personas: parseList(String(formData.get("personas") ?? "")),
      count,
    });
    return { ok: true, proposals };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function acceptProposals(formData: FormData) {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const selected = formData.getAll("selected").map((v) => Proposal.parse(JSON.parse(String(v))));
  if (!selected.length) redirect("/app/prompts");
  const { data: existing, error: topicsError } = await supabase.from("topics").select("id, name").eq("project_id", project.id);
  if (topicsError) throw new Error(topicsError.message);
  const topicIds = new Map((existing ?? []).map((t) => [t.name, t.id]));
  for (const name of new Set(selected.map((p) => p.topic).filter(Boolean))) {
    if (!topicIds.has(name)) {
      const { data, error } = await supabase.from("topics").insert({ project_id: project.id, name }).select("id").single();
      if (error) throw new Error(error.message);
      if (data) topicIds.set(name, data.id);
    }
  }
  const { error } = await supabase.from("prompts").insert(selected.map((p) => ({
    project_id: project.id, text: p.text, intent: p.intent, topic_id: topicIds.get(p.topic) ?? null,
  })));
  if (error) throw new Error(error.message);
  revalidatePath("/app/prompts");
  redirect("/app/prompts");
}
