import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { searchVolume as defaultSearchVolume } from "@/lib/dataforseo/keywords-data";
import { trendsExplore as defaultTrendsExplore, trendBatches, normalizeTrends, type TrendSeries } from "@/lib/dataforseo/trends";
import { DEFAULT_TRENDS_ANCHOR, normalizeKeyword } from "./keywords";
import { estimateVolumesCost } from "./costs";
import { seoMonthSpend, decideSeoSpend, budgetExceededMessage } from "./budget";
import { startJob, finishJob, type SeoJobStatus } from "./jobs";

type Admin = SupabaseClient<Database>;

/** Poniżej tego wolumenu Google Trends nie ma sensownych danych, więc nie płacimy za zapytanie. */
export const TRENDS_MIN_VOLUME = 50;
/** Najwięcej aktywnych fraz mierzonych w jednym zadaniu (górna granica kosztu). */
export const MAX_TRACKED = 500;
export const NO_KEYWORDS_MESSAGE = "Brak aktywnych fraz";

const WEEK_MS = 7 * 86_400_000;
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RunKeywordVolumesDeps {
  admin?: Admin;
  searchVolume?: typeof defaultSearchVolume;
  trendsExplore?: typeof defaultTrendsExplore;
  now?: () => Date;
}

export interface KeywordVolumesResult {
  status: SeoJobStatus;
  /** Frazy, którym zapisano wolumen. */
  keywords: number;
  /** Frazy, którym zapisano trend Google Trends. */
  trends: number;
  /** Faktyczny koszt DataForSEO (suma pól `cost` odpowiedzi). */
  costUsd: number;
}

/**
 * Ostatni punkt Trends to bieżący, niepełny tydzień (`missing_data`) i pokazałby sztuczny spadek, więc zostają tylko
 * tygodnie, które zaczęły się co najmniej 7 dni przed `now`.
 */
function completeWeeks(points: { week: string; value: number | null }[], now: Date): { week: string; value: number | null }[] {
  return points
    .filter((p) => now.getTime() - Date.parse(`${p.week}T00:00:00Z`) >= WEEK_MS)
    .map(({ week, value }) => ({ week, value }));
}

/**
 * Miesięczny pomiar śledzonych fraz: wolumeny z Google Ads dla wszystkich aktywnych fraz (do `MAX_TRACKED`),
 * potem Google Trends dla tych z wolumenem od `TRENDS_MIN_VOLUME`. Płatne, więc przed pierwszym wywołaniem
 * sprawdza budżet SEO projektu (górny szacunek: każda fraza ma wolumen i trend), a w rejestrze zapisuje faktyczny koszt.
 * Wyjątek zamyka zadanie jako `failed` z kosztem poniesionym do tego momentu i leci dalej.
 */
export async function runKeywordVolumes(payload: { projectId: string }, deps: RunKeywordVolumesDeps = {}): Promise<KeywordVolumesResult> {
  const { projectId } = payload;
  const admin = deps.admin ?? createAdminSupabase();
  const volumes = deps.searchVolume ?? defaultSearchVolume;
  const explore = deps.trendsExplore ?? defaultTrendsExplore;
  const now = deps.now ?? (() => new Date());

  const projectRes = await admin.from("projects").select("seo_budget_usd, trends_anchor").eq("id", projectId).single();
  if (projectRes.error) throw new Error(projectRes.error.message);
  const budget = Number(projectRes.data.seo_budget_usd);
  const anchor = projectRes.data.trends_anchor ?? DEFAULT_TRENDS_ANCHOR;

  const jobId = await startJob(admin, projectId, "keyword_volumes");
  let spent = 0;
  try {
    const trackedRes = await admin.from("keywords").select("id, key").eq("project_id", projectId).eq("active", true)
      .order("created_at", { ascending: true }).limit(MAX_TRACKED);
    if (trackedRes.error) throw new Error(trackedRes.error.message);
    const tracked = trackedRes.data ?? [];
    if (tracked.length === 0) {
      await finishJob(admin, jobId, { status: "skipped", error: NO_KEYWORDS_MESSAGE });
      return { status: "skipped", keywords: 0, trends: 0, costUsd: 0 };
    }

    const estimate = estimateVolumesCost(tracked.length, tracked.length);
    const monthSpent = await seoMonthSpend(admin, projectId, now());
    const decision = decideSeoSpend(monthSpent, estimate, budget);
    if (decision.kind === "budget_exceeded") {
      await finishJob(admin, jobId, {
        status: "budget_exceeded",
        error: budgetExceededMessage(decision.spent, decision.estimate, budget),
        stats: { spentUsd: decision.spent, estimateUsd: decision.estimate, budgetUsd: budget },
      });
      return { status: "budget_exceeded", keywords: 0, trends: 0, costUsd: 0 };
    }

    // 1. Wolumeny. Odpowiedź parujemy z frazami po znormalizowanym kluczu; fraza bez odpowiedzi zostaje nietknięta.
    const volumeRes = await volumes(tracked.map((k) => k.key));
    spent += volumeRes.costUsd;
    const byKey = new Map(volumeRes.items.map((item) => [normalizeKeyword(item.keyword), item]));
    const measuredAt = now().toISOString();
    const trendTargets: { id: string; key: string }[] = [];
    let updated = 0;
    for (const k of tracked) {
      const item = byKey.get(k.key);
      if (!item) continue;
      const { error } = await admin.from("keywords").update({
        search_volume: item.searchVolume,
        competition: item.competition,
        competition_index: item.competitionIndex,
        // Google Ads oddaje szum float32 (2.4000000953674316), a kolumna to numeric(10,2).
        cpc: item.cpc === null ? null : round2(item.cpc),
        monthly_searches: item.monthlySearches,
        volume_updated_at: measuredAt,
      }).eq("id", k.id).eq("project_id", projectId);
      if (error) throw new Error(error.message);
      updated += 1;
      if (item.searchVolume !== null && item.searchVolume >= TRENDS_MIN_VOLUME) trendTargets.push(k);
    }

    // 2. Google Trends: paczki po 4 frazy i kotwica; koszt doliczamy po każdej paczce, żeby awaria nie zgubiła wydanego.
    const batches = trendBatches(trendTargets.map((k) => k.key), anchor);
    // Jedyna fraza z ruchem to sama kotwica: trendBatches jej nie dubluje, więc pytamy o nią osobno.
    if (batches.length === 0 && trendTargets.length > 0) batches.push([anchor]);
    const seriesByBatch: TrendSeries[][] = [];
    for (const batch of batches) {
      const res = await explore(batch);
      spent += res.costUsd;
      seriesByBatch.push(res.series);
    }

    let trends = 0;
    if (seriesByBatch.length > 0) {
      const normalized = normalizeTrends(seriesByBatch, anchor);
      const trendedAt = now();
      for (const k of trendTargets) {
        const points = normalized.get(k.key);
        if (!points) continue;
        const { error } = await admin.from("keywords").update({
          trend: completeWeeks(points, trendedAt),
          trend_updated_at: trendedAt.toISOString(),
        }).eq("id", k.id).eq("project_id", projectId);
        if (error) throw new Error(error.message);
        trends += 1;
      }
    }

    await finishJob(admin, jobId, {
      status: "done",
      costUsd: spent,
      stats: {
        keywords: updated, trendCandidates: trendTargets.length, trends, trendRequests: batches.length,
        missing: tracked.length - updated, estimateUsd: estimate,
      },
    });
    return { status: "done", keywords: updated, trends, costUsd: spent };
  } catch (err) {
    try {
      await finishJob(admin, jobId, { status: "failed", error: errorMessage(err), costUsd: spent });
    } catch (finishErr) {
      // oryginalny błąd jest ważniejszy niż nieudany zapis do rejestru
      console.error("keyword-volumes: nie udało się zamknąć zadania w rejestrze:", errorMessage(finishErr));
    }
    throw err;
  }
}
