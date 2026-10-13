import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { RecStatus, RecType } from "./labels";
import { evidencePromptIds } from "./fingerprint";

export type RecFilters = { status?: RecStatus | "open"; type?: RecType; prompt?: string };
export type RecommendationRow = Database["public"]["Tables"]["recommendations"]["Row"] & { prompts: { text: string } | null };
export type RecommendationDetail = Database["public"]["Tables"]["recommendations"]["Row"] & { prompts: { id: string; text: string } | null };

/** Prompts a recommendation belongs to: its own prompt_id plus prompts merged into it (evidence.prompt_ids). */
export function recommendationPromptIds(r: { prompt_id: string | null; evidence?: unknown }): string[] {
  return [...new Set([...(r.prompt_id ? [r.prompt_id] : []), ...evidencePromptIds(r.evidence)])];
}

export function applyFilters<T extends { status: string; type: string; prompt_id: string | null; evidence?: unknown }>(rows: T[], f: RecFilters): T[] {
  const status = f.status ?? "open";
  return rows.filter((r) =>
    (status === "open" ? r.status === "todo" || r.status === "doing" : r.status === status)
    && (!f.type || r.type === f.type)
    && (!f.prompt || recommendationPromptIds(r).includes(f.prompt)));
}

/** Open-recommendation count per prompt; a merged recommendation counts once for every prompt it covers. */
export function countByPrompt(rows: { prompt_id: string | null; evidence?: unknown }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) for (const id of recommendationPromptIds(r)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** All of the project's recommendations (newest priority first, capped at 500); filter in memory with applyFilters. */
export async function fetchRecommendationRows(supabase: SupabaseClient<Database>, projectId: string): Promise<RecommendationRow[]> {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(text)")
    .eq("project_id", projectId).order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as RecommendationRow[];
}

export const listRecommendations = cache(async (supabase: SupabaseClient<Database>, projectId: string, f: RecFilters) =>
  applyFilters(await fetchRecommendationRows(supabase, projectId), f));

/** Open recommendations (todo|doing): how many, and when the newest of them last changed (ISO string or null). */
export function summarizeOpen(rows: { status: string; updated_at: string }[]): { count: number; lastUpdated: string | null } {
  const open = rows.filter((r) => r.status === "todo" || r.status === "doing");
  const lastUpdated = open.reduce<string | null>((max, r) => (max === null || Date.parse(r.updated_at) > Date.parse(max) ? r.updated_at : max), null);
  return { count: open.length, lastUpdated };
}

export const getRecommendation = cache(async (supabase: SupabaseClient<Database>, projectId: string, id: string) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(id, text)")
    .eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RecommendationDetail | null;
});

export const countRecommendationsByPrompt = cache(async (supabase: SupabaseClient<Database>, projectId: string) => {
  // no prompt_id filter: a recommendation without its own prompt may still cover prompts via evidence.prompt_ids
  const { data, error } = await supabase.from("recommendations").select("prompt_id, evidence")
    .eq("project_id", projectId).in("status", ["todo", "doing"]);
  if (error) throw new Error(error.message);
  return countByPrompt(data ?? []);
});

export const getTopRecommendation = cache(async (supabase: SupabaseClient<Database>, projectId: string) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(text)")
    .eq("project_id", projectId).eq("status", "todo").order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RecommendationRow | null;
});
