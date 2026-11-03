"use server";
import { createHash } from "node:crypto";
import { tasks } from "@trigger.dev/sdk";
import { revalidatePath } from "next/cache";
import type { keywordVolumesTask } from "@/trigger/keyword-volumes";
import type { keywordResearchTask } from "@/trigger/keyword-research";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { getGscLastDate, getQueryWindows } from "@/lib/seo/queries";
import { gscWindows } from "@/lib/seo/overview";
import { MAX_KEYWORD_LENGTH, normalizeKeyword, parseKeywordList } from "@/lib/seo/keywords";
import { MAX_SEEDS } from "@/lib/seo/keyword-research";

/*
 * Every action takes the project from the session (`getCurrentProject`) and writes through the session client, so RLS
 * limits it to the user's organization; the form supplies only the id of a row and the user's change. Anything that
 * does not look like what the form sends (an id that is not a uuid, a path without a leading slash) is ignored.
 */

const PAGE = "/app/google/keywords";
/** Phrases taken from Search Console at once. */
const IMPORT_LIMIT = 50;
/** Search Console queries looked through for the import (the SQL function returns them largest by impressions first). */
const GSC_QUERY_LIMIT = 500;
const TARGET_PATH_MAX = 200;
const TARGET_PATH_RE = /^\/\S*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEN_MINUTES_MS = 600_000;

/** A suggestion's source as the source of the phrase created from it. */
const KEYWORD_SOURCE = { labs: "suggestion", ranked: "ranked", gap: "gap" } as const;

const text = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

const rowId = (formData: FormData): string | null => {
  const id = text(formData, "id");
  return UUID_RE.test(id) ? id : null;
};

const tenMinuteWindow = () => Math.floor(Date.now() / TEN_MINUTES_MS);

const fail = (what: string, error: { message: string }): never => {
  throw new Error(`${what}: ${error.message}`);
};

/** Phrases that are already in `keywords` are left as they are: the unique key `(project_id, key)` ignores the repeat. */
const IGNORE_DUPLICATES = { onConflict: "project_id,key", ignoreDuplicates: true } as const;

export async function addKeywords(formData: FormData) {
  const project = await getCurrentProject();
  const keys = parseKeywordList(text(formData, "keywords"));
  if (keys.length === 0) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("keywords").upsert(
    keys.map((key) => ({ project_id: project.id, text: key, key, source: "manual" })),
    IGNORE_DUPLICATES,
  );
  if (error) fail("Nie udało się dodać fraz", error);
  revalidatePath(PAGE);
}

/** Field `active` is the new state ("true" or "false"), like `enabled` in the engines toggle. */
export async function toggleKeyword(formData: FormData) {
  const project = await getCurrentProject();
  const id = rowId(formData);
  if (!id) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("keywords")
    .update({ active: text(formData, "active") === "true" }).eq("id", id).eq("project_id", project.id);
  if (error) fail("Nie udało się zmienić frazy", error);
  revalidatePath(PAGE);
}

export async function deleteKeyword(formData: FormData) {
  const project = await getCurrentProject();
  const id = rowId(formData);
  if (!id) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("keywords").delete().eq("id", id).eq("project_id", project.id);
  if (error) fail("Nie udało się usunąć frazy", error);
  revalidatePath(PAGE);
}

/** The page a phrase should rank with: a path starting with "/", or empty to clear it. Anything else changes nothing. */
export async function setTargetPath(formData: FormData) {
  const project = await getCurrentProject();
  const id = rowId(formData);
  const raw = text(formData, "target_path").trim();
  if (!id) return;
  if (raw !== "" && !(raw.length <= TARGET_PATH_MAX && TARGET_PATH_RE.test(raw))) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("keywords")
    .update({ target_path: raw === "" ? null : raw }).eq("id", id).eq("project_id", project.id);
  if (error) fail("Nie udało się zapisać strony", error);
  revalidatePath(PAGE);
}

/**
 * Tracks a suggested phrase and marks the suggestion `accepted`. The phrase goes first: if the second write fails,
 * the suggestion stays in the inbox next to a tracked phrase (and is hidden there) rather than vanishing without one.
 * The volume and CPC the suggestion carries come along, so the phrase does not show "brak danych" until the next measurement.
 */
export async function acceptSuggestion(formData: FormData) {
  const project = await getCurrentProject();
  const id = rowId(formData);
  if (!id) return;
  const supabase = await createServerSupabase();
  const { data: s, error } = await supabase.from("keyword_suggestions")
    .select("id, key, text, source, search_volume, cpc").eq("id", id).eq("project_id", project.id).maybeSingle();
  if (error) fail("Nie udało się wczytać podpowiedzi", error);
  if (!s) return;
  const source = KEYWORD_SOURCE[s.source as keyof typeof KEYWORD_SOURCE];
  if (!source) return;

  const { error: insertError } = await supabase.from("keywords").upsert(
    { project_id: project.id, key: s.key, text: s.text, source, search_volume: s.search_volume, cpc: s.cpc },
    IGNORE_DUPLICATES,
  );
  if (insertError) fail("Nie udało się dodać frazy", insertError);
  const { error: statusError } = await supabase.from("keyword_suggestions")
    .update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", id).eq("project_id", project.id);
  if (statusError) fail("Nie udało się zapisać podpowiedzi", statusError);
  revalidatePath(PAGE);
}

export async function dismissSuggestion(formData: FormData) {
  const project = await getCurrentProject();
  const id = rowId(formData);
  if (!id) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("keyword_suggestions")
    .update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", id).eq("project_id", project.id);
  if (error) fail("Nie udało się odrzucić podpowiedzi", error);
  revalidatePath(PAGE);
}

/**
 * Takes the 50 queries with the most impressions in the last 28 days of Search Console data that are not tracked yet.
 * Does nothing before the first sync. Queries are compared by `normalizeKeyword`; one that is empty or longer than a
 * phrase may be is skipped. Not `parseKeywordList`: it splits on commas, and a query may contain one.
 */
export async function importFromGsc() {
  const project = await getCurrentProject();
  const lastDate = await getGscLastDate(project.id);
  if (!lastDate) return;
  const rows = await getQueryWindows(project.id, gscWindows(lastDate), GSC_QUERY_LIMIT);

  const supabase = await createServerSupabase();
  // PostgREST caps a read at 1000 rows; a phrase beyond that is still safe: the unique key ignores the repeat
  const { data: trackedRows, error } = await supabase.from("keywords").select("key").eq("project_id", project.id);
  if (error) fail("Nie udało się wczytać fraz", error);
  const taken = new Set((trackedRows ?? []).map((r) => r.key));

  const keys: string[] = [];
  const byImpressions = [...rows].sort((a, b) => b.cur.impressions - a.cur.impressions);
  for (const r of byImpressions) {
    if (keys.length >= IMPORT_LIMIT) break;
    if (r.cur.impressions <= 0) continue;
    const key = normalizeKeyword(r.query);
    if (key === "" || key.length > MAX_KEYWORD_LENGTH || taken.has(key)) continue;
    taken.add(key);
    keys.push(key);
  }
  if (keys.length === 0) return;

  const { error: insertError } = await supabase.from("keywords").upsert(
    keys.map((key) => ({ project_id: project.id, text: key, key, source: "gsc" })),
    IGNORE_DUPLICATES,
  );
  if (insertError) fail("Nie udało się zaimportować fraz", insertError);
  revalidatePath(PAGE);
}

/** Starts a volume and trend measurement of the active phrases. Two clicks within 10 minutes share one run (the cost is paid once). */
export async function refreshVolumes() {
  const project = await getCurrentProject();
  // an unreachable Trigger must not throw into the page; the status section shows whether a run actually started
  try {
    await tasks.trigger<typeof keywordVolumesTask>(
      "keyword-volumes",
      { projectId: project.id },
      { idempotencyKey: `keyword-volumes:${project.id}:${tenMinuteWindow()}`, idempotencyKeyTTL: "10m" },
    );
  } catch (e) {
    console.error("keyword-volumes trigger failed", e instanceof Error ? e.message : e);
  }
  revalidatePath(PAGE);
}

/**
 * Starts a phrase research (paid, checked against the SEO budget by the task). The idempotency key carries a short
 * fingerprint of the form: a double click shares one run, but a different search within 10 minutes is not swallowed.
 */
export async function runResearch(formData: FormData) {
  const project = await getCurrentProject();
  const seeds = parseKeywordList(text(formData, "seeds"), MAX_SEEDS);
  const competitors = text(formData, "competitors") === "on";
  const fingerprint = createHash("sha256").update(JSON.stringify({ seeds, competitors })).digest("hex").slice(0, 16);
  try {
    await tasks.trigger<typeof keywordResearchTask>(
      "keyword-research",
      { projectId: project.id, seeds, competitors },
      { idempotencyKey: `keyword-research:${project.id}:${fingerprint}:${tenMinuteWindow()}`, idempotencyKeyTTL: "10m" },
    );
  } catch (e) {
    console.error("keyword-research trigger failed", e instanceof Error ? e.message : e);
  }
  revalidatePath(PAGE);
}
