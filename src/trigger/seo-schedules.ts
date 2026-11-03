import { schedules } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rankWeekStart } from "@/lib/seo/rank-check";
import { gscSyncTask, type GscSyncPayload } from "./gsc-sync";
import { keywordVolumesTask, type KeywordVolumesPayload } from "./keyword-volumes";
import { rankCheckTask, type RankCheckPayload } from "./rank-check";

/** Uruchamia zadanie dla każdego projektu osobno: błąd jednego nie zatrzymuje pozostałych, ale kończy całość błędem. */
async function triggerEach(label: string, what: string, ids: string[], run: (id: string) => Promise<unknown>): Promise<number> {
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await run(id);
    } catch (err) {
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length > 0) throw new Error(`${label}: nie uruchomiono ${what} (${failures.length}/${ids.length}): ${failures.join("; ")}`);
  return ids.length;
}

export interface GscSyncDailyDeps {
  admin?: SupabaseClient<Database>;
  /** Uruchamia zadanie synchronizacji dla jednego projektu; wstrzykiwane w testach. */
  trigger?: (payload: GscSyncPayload, options: { idempotencyKey: string }) => Promise<unknown>;
}

/** Codzienna synchronizacja Search Console: osobne zadanie dla każdego projektu z ustawioną usługą. */
export async function runGscSyncDaily(payload: { timestamp: Date | string }, deps: GscSyncDailyDeps = {}) {
  const admin = deps.admin ?? createAdminSupabase();
  const trigger = deps.trigger ?? ((p, options) => gscSyncTask.trigger(p, options));
  // O 6:30 czasu warszawskiego data UTC i lokalna są takie same.
  const day = new Date(payload.timestamp).toISOString().slice(0, 10);

  const { data, error } = await admin.from("projects").select("id").not("gsc_property", "is", null);
  if (error) throw new Error(error.message);
  const projects = data ?? [];

  const triggered = await triggerEach("gsc-sync-daily", "synchronizacji", projects.map((p) => p.id),
    (id) => trigger({ projectId: id }, { idempotencyKey: `gsc-sync:${id}:${day}` }));
  return { triggered };
}

export const gscSyncDaily = schedules.task({
  id: "gsc-sync-daily",
  cron: { pattern: "30 6 * * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] },
  run: (payload) => runGscSyncDaily(payload),
});

export interface KeywordVolumesMonthlyDeps {
  admin?: SupabaseClient<Database>;
  /** Uruchamia pomiar wolumenów dla jednego projektu; wstrzykiwane w testach. */
  trigger?: (payload: KeywordVolumesPayload, options: { idempotencyKey: string }) => Promise<unknown>;
}

/** Miesięczny pomiar wolumenów i trendów: osobne zadanie dla każdego projektu z co najmniej jedną aktywną frazą. */
export async function runKeywordVolumesMonthly(payload: { timestamp: Date | string }, deps: KeywordVolumesMonthlyDeps = {}) {
  const admin = deps.admin ?? createAdminSupabase();
  const trigger = deps.trigger ?? ((p, options) => keywordVolumesTask.trigger(p, options));
  // O 5:00 czasu warszawskiego drugiego dnia miesiąca miesiąc UTC i lokalny są takie same.
  const month = new Date(payload.timestamp).toISOString().slice(0, 7);

  // `!inner` zostawia tylko projekty, które mają pasujące frazy (bez limitu wierszy na samych frazach).
  const { data, error } = await admin.from("projects").select("id, keywords!inner(id)").eq("keywords.active", true);
  if (error) throw new Error(error.message);
  const projects = data ?? [];

  const triggered = await triggerEach("keyword-volumes-monthly", "pomiaru", projects.map((p) => p.id),
    (id) => trigger({ projectId: id }, { idempotencyKey: `keyword-volumes:${id}:${month}` }));
  return { triggered };
}

export const keywordVolumesMonthly = schedules.task({
  id: "keyword-volumes-monthly",
  cron: { pattern: "0 5 2 * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] },
  run: (payload) => runKeywordVolumesMonthly(payload),
});

export interface RankCheckWeeklyDeps {
  admin?: SupabaseClient<Database>;
  /** Uruchamia sprawdzenie pozycji dla jednego projektu; wstrzykiwane w testach. */
  trigger?: (payload: RankCheckPayload, options: { idempotencyKey: string }) => Promise<unknown>;
}

/** Cotygodniowe sprawdzenie pozycji: osobne zadanie dla każdego projektu z co najmniej jedną aktywną frazą. */
export async function runRankCheckWeekly(payload: { timestamp: Date | string }, deps: RankCheckWeeklyDeps = {}) {
  const admin = deps.admin ?? createAdminSupabase();
  const trigger = deps.trigger ?? ((p, options) => rankCheckTask.trigger(p, options));
  // Klucz to poniedziałek tygodnia według daty warszawskiej: ten sam tydzień nie uruchomi pomiaru dwa razy.
  const week = rankWeekStart(new Date(payload.timestamp));

  const { data, error } = await admin.from("projects").select("id, keywords!inner(id)").eq("keywords.active", true);
  if (error) throw new Error(error.message);
  const projects = data ?? [];

  const triggered = await triggerEach("rank-check-weekly", "sprawdzenia pozycji", projects.map((p) => p.id),
    (id) => trigger({ projectId: id }, { idempotencyKey: `rank-check:${id}:${week}` }));
  return { triggered };
}

export const rankCheckWeekly = schedules.task({
  id: "rank-check-weekly",
  cron: { pattern: "0 4 * * 1", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] },
  run: (payload) => runRankCheckWeekly(payload),
});
