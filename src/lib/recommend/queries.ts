import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { RecStatus, RecType } from "./labels";

export type RecFilters = { status?: RecStatus | "open"; type?: RecType; prompt?: string };
export type RecommendationRow = Database["public"]["Tables"]["recommendations"]["Row"] & { prompts: { text: string } | null };
export type RecommendationDetail = Database["public"]["Tables"]["recommendations"]["Row"] & { prompts: { id: string; text: string } | null };

export function applyFilters<T extends { status: string; type: string; prompt_id: string | null }>(rows: T[], f: RecFilters): T[] {
  const status = f.status ?? "open";
  return rows.filter((r) =>
    (status === "open" ? r.status === "todo" || r.status === "doing" : r.status === status)
    && (!f.type || r.type === f.type)
    && (!f.prompt || r.prompt_id === f.prompt));
}

export const listRecommendations = cache(async (supabase: SupabaseClient<Database>, projectId: string, f: RecFilters) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(text)")
    .eq("project_id", projectId).order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return applyFilters((data ?? []) as RecommendationRow[], f);
});

export const getRecommendation = cache(async (supabase: SupabaseClient<Database>, projectId: string, id: string) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(id, text)")
    .eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RecommendationDetail | null;
});

export const countRecommendationsByPrompt = cache(async (supabase: SupabaseClient<Database>, projectId: string) => {
  const { data, error } = await supabase.from("recommendations").select("prompt_id")
    .eq("project_id", projectId).in("status", ["todo", "doing"]).not("prompt_id", "is", null);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of data ?? []) if (r.prompt_id) out[r.prompt_id] = (out[r.prompt_id] ?? 0) + 1;
  return out;
});

export const getTopRecommendation = cache(async (supabase: SupabaseClient<Database>, projectId: string) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(text)")
    .eq("project_id", projectId).eq("status", "todo").order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RecommendationRow | null;
});
