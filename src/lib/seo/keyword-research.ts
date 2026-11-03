import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  keywordSuggestions as defaultKeywordSuggestions,
  rankedKeywords as defaultRankedKeywords,
  type RankedKeyword,
} from "@/lib/dataforseo/labs";
import { normalizeDomainInput } from "@/lib/validation/settings";
import { normalizeKeyword, parseKeywordList } from "./keywords";
import { estimateResearchCost } from "./costs";
import { seoMonthSpend, decideSeoSpend, budgetExceededMessage } from "./budget";
import { startJob, finishJob, type SeoJobStatus } from "./jobs";

type Admin = SupabaseClient<Database>;

export const MAX_SEEDS = 10;
export const MAX_COMPETITORS = 7;
/** Luka to fraza, na którą konkurent jest w pierwszej dwudziestce, a my nie rankujemy wcale. */
export const GAP_MAX_POSITION = 20;
export const NOTHING_TO_CHECK_MESSAGE = "Brak haseł i domeny projektu do sprawdzenia";

const SUGGESTION_LIMIT = 50;
const RANKED_LIMIT = 100;
/** Zapytanie `in` trafia do adresu URL, więc klucze czytamy paczkami. */
const KEY_CHUNK = 100;
const UPSERT_CHUNK = 500;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const round2 = (n: number) => Math.round(n * 100) / 100;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export interface RunKeywordResearchDeps {
  admin?: Admin;
  keywordSuggestions?: typeof defaultKeywordSuggestions;
  rankedKeywords?: typeof defaultRankedKeywords;
  now?: () => Date;
}

export interface KeywordResearchResult {
  status: SeoJobStatus;
  /** Podpowiedzi zapisane (nowe i odświeżone) po pominięciu fraz już śledzonych. */
  suggestions: number;
  /** Faktyczny koszt DataForSEO (suma pól `cost` odpowiedzi). */
  costUsd: number;
}

// `type`, nie `interface`: trafia do kolumny jsonb, a typ Json wymaga sygnatury indeksu
type CompetitorPosition = { name: string; domain: string; position: number; url: string };

/** Źródła od najsłabszego: przy kolizji frazy wygrywa wyższe, a słabsze tylko uzupełnia braki. */
type Source = "labs" | "gap" | "ranked";
const PRECEDENCE: Record<Source, number> = { labs: 0, gap: 1, ranked: 2 };

interface Suggestion {
  key: string;
  seed: string | null;
  source: Source;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  ownPosition: number | null;
  ownUrl: string | null;
  competitorPositions: CompetitorPosition[];
}

function mergeSuggestions(a: Suggestion, b: Suggestion): Suggestion {
  const [low, high] = PRECEDENCE[a.source] <= PRECEDENCE[b.source] ? [a, b] : [b, a];
  return {
    key: high.key,
    source: high.source,
    seed: high.seed ?? low.seed,
    searchVolume: high.searchVolume ?? low.searchVolume,
    keywordDifficulty: high.keywordDifficulty ?? low.keywordDifficulty,
    cpc: high.cpc ?? low.cpc,
    ownPosition: high.ownPosition ?? low.ownPosition,
    ownUrl: high.ownUrl ?? low.ownUrl,
    competitorPositions: high.competitorPositions.length > 0 ? high.competitorPositions : low.competitorPositions,
  };
}

/** Najlepsza (najniższa) pozycja domeny na każdą frazę; klucz to `normalizeKeyword`. */
function bestPositions(items: RankedKeyword[]): Map<string, RankedKeyword> {
  const best = new Map<string, RankedKeyword>();
  for (const item of items) {
    const key = normalizeKeyword(item.keyword);
    const prev = best.get(key);
    if (!prev || item.position < prev.position) best.set(key, item);
  }
  return best;
}

async function trackedAmong(admin: Admin, projectId: string, keys: string[]): Promise<Set<string>> {
  const tracked = new Set<string>();
  for (const part of chunks(keys, KEY_CHUNK)) {
    const { data, error } = await admin.from("keywords").select("key").eq("project_id", projectId).in("key", part);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) tracked.add(row.key);
  }
  return tracked;
}

async function statusesAmong(admin: Admin, projectId: string, keys: string[]): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  for (const part of chunks(keys, KEY_CHUNK)) {
    const { data, error } = await admin.from("keyword_suggestions").select("key, status").eq("project_id", projectId).in("key", part);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) statuses.set(row.key, row.status);
  }
  return statuses;
}

/**
 * Badanie fraz na żądanie (DataForSEO Labs): podpowiedzi do haseł, frazy, na które nasza domena już rankuje,
 * a przy `competitors` luki, czyli frazy z pierwszej dwudziestki konkurentów, na które my nie rankujemy.
 * Wyniki trafiają do skrzynki `keyword_suggestions` (klucz `project_id, key`): odświeżają dane, ale zachowują status
 * wybrany przez użytkownika, a frazy już śledzone są pomijane. Płatne, więc najpierw bramka budżetu SEO;
 * w rejestrze zostaje faktyczny koszt, także gdy zadanie padnie w trakcie.
 */
export async function runKeywordResearch(
  payload: { projectId: string; seeds: string[]; competitors: boolean },
  deps: RunKeywordResearchDeps = {},
): Promise<KeywordResearchResult> {
  const { projectId } = payload;
  const admin = deps.admin ?? createAdminSupabase();
  const suggest = deps.keywordSuggestions ?? defaultKeywordSuggestions;
  const ranked = deps.rankedKeywords ?? defaultRankedKeywords;
  const now = deps.now ?? (() => new Date());

  const projectRes = await admin.from("projects").select("domains, seo_budget_usd").eq("id", projectId).single();
  if (projectRes.error) throw new Error(projectRes.error.message);
  const budget = Number(projectRes.data.seo_budget_usd);
  const seeds = parseKeywordList(payload.seeds.join("\n"), MAX_SEEDS);
  // Labs oczekuje samej domeny (bez protokołu, www i ścieżki); własna to pierwsza z ustawień projektu.
  const own = normalizeDomainInput(projectRes.data.domains[0] ?? "") || undefined;

  const jobId = await startJob(admin, projectId, "keyword_research");
  let spent = 0;
  try {
    // Luki wymagają własnej domeny: bez niej każda fraza konkurenta wyglądałaby na lukę.
    let rivals: { name: string; domain: string }[] = [];
    if (payload.competitors && own) {
      const rivalsRes = await admin.from("competitors").select("name, domains").eq("project_id", projectId).order("name", { ascending: true });
      if (rivalsRes.error) throw new Error(rivalsRes.error.message);
      rivals = (rivalsRes.data ?? [])
        .map((c) => ({ name: c.name, domain: normalizeDomainInput(c.domains[0] ?? "") }))
        .filter((c) => c.domain !== "" && c.domain !== own)
        .slice(0, MAX_COMPETITORS);
    }

    const domains = (own ? 1 : 0) + rivals.length;
    if (seeds.length === 0 && domains === 0) {
      await finishJob(admin, jobId, { status: "skipped", error: NOTHING_TO_CHECK_MESSAGE });
      return { status: "skipped", suggestions: 0, costUsd: 0 };
    }

    const estimate = estimateResearchCost({ seeds: seeds.length, domains });
    const decision = decideSeoSpend(await seoMonthSpend(admin, projectId, now()), estimate, budget);
    if (decision.kind === "budget_exceeded") {
      await finishJob(admin, jobId, {
        status: "budget_exceeded",
        error: budgetExceededMessage(decision.spent, decision.estimate, budget),
        stats: { spentUsd: decision.spent, estimateUsd: decision.estimate, budgetUsd: budget },
      });
      return { status: "budget_exceeded", suggestions: 0, costUsd: 0 };
    }

    const found = new Map<string, Suggestion>();
    const add = (s: Suggestion) => {
      const prev = found.get(s.key);
      // to samo źródło drugi raz (np. fraza z dwóch haseł): zostaje pierwsze
      if (prev && prev.source === s.source) return;
      found.set(s.key, prev ? mergeSuggestions(prev, s) : s);
    };
    const empty = { ownPosition: null, ownUrl: null, competitorPositions: [] };

    // 1. Podpowiedzi do haseł
    for (const seed of seeds) {
      const res = await suggest(seed, SUGGESTION_LIMIT);
      spent += res.costUsd;
      for (const item of res.items) {
        add({ key: normalizeKeyword(item.keyword), seed, source: "labs", searchVolume: item.searchVolume, keywordDifficulty: item.keywordDifficulty, cpc: item.cpc, ...empty });
      }
    }

    // 2. Własna widoczność: frazy, na które już rankujemy
    const ownKeys = new Set<string>();
    if (own) {
      const res = await ranked(own, RANKED_LIMIT);
      spent += res.costUsd;
      for (const [key, item] of bestPositions(res.items)) {
        ownKeys.add(key);
        add({
          key, seed: null, source: "ranked", searchVolume: item.searchVolume, keywordDifficulty: item.keywordDifficulty, cpc: item.cpc,
          ownPosition: item.position, ownUrl: item.url, competitorPositions: [],
        });
      }
    }

    // 3. Luki: pierwsza dwudziestka konkurentów na frazy, na które my nie rankujemy
    const gaps = new Map<string, Suggestion>();
    for (const rival of rivals) {
      const res = await ranked(rival.domain, RANKED_LIMIT);
      spent += res.costUsd;
      for (const [key, item] of bestPositions(res.items)) {
        if (item.position > GAP_MAX_POSITION || ownKeys.has(key)) continue;
        const position: CompetitorPosition = { name: rival.name, domain: rival.domain, position: item.position, url: item.url };
        const prev = gaps.get(key);
        gaps.set(key, prev
          ? { ...prev, searchVolume: prev.searchVolume ?? item.searchVolume, keywordDifficulty: prev.keywordDifficulty ?? item.keywordDifficulty,
              cpc: prev.cpc ?? item.cpc, competitorPositions: [...prev.competitorPositions, position] }
          : { key, seed: null, source: "gap", searchVolume: item.searchVolume, keywordDifficulty: item.keywordDifficulty, cpc: item.cpc,
              ownPosition: null, ownUrl: null, competitorPositions: [position] });
      }
    }
    for (const gap of gaps.values()) add({ ...gap, competitorPositions: [...gap.competitorPositions].sort((x, y) => x.position - y.position) });

    const countBySource = (source: Source) => [...found.values()].filter((s) => s.source === source).length;

    // 4. Zapis: bez fraz już śledzonych, ze statusem sprzed badania
    const keys = [...found.keys()];
    const tracked = await trackedAmong(admin, projectId, keys);
    const fresh = [...found.values()].filter((s) => !tracked.has(s.key));
    const statuses = await statusesAmong(admin, projectId, fresh.map((s) => s.key));
    const updatedAt = now().toISOString();
    const rows = fresh.map((s) => ({
      project_id: projectId,
      key: s.key,
      text: s.key,
      seed: s.seed,
      source: s.source,
      search_volume: s.searchVolume,
      keyword_difficulty: s.keywordDifficulty,
      // Labs oddaje szum float32 (2.4000000953674316), a kolumna to numeric(10,2).
      cpc: s.cpc === null ? null : round2(s.cpc),
      own_position: s.ownPosition,
      own_url: s.ownUrl,
      competitor_positions: s.competitorPositions,
      status: statuses.get(s.key) ?? "new",
      updated_at: updatedAt,
    }));
    for (const part of chunks(rows, UPSERT_CHUNK)) {
      const { error } = await admin.from("keyword_suggestions").upsert(part, { onConflict: "project_id,key" });
      if (error) throw new Error(error.message);
    }

    await finishJob(admin, jobId, {
      status: "done",
      costUsd: spent,
      stats: {
        seeds: seeds.length, domains, labs: countBySource("labs"), ranked: countBySource("ranked"), gap: countBySource("gap"),
        skippedTracked: found.size - fresh.length, written: rows.length, estimateUsd: estimate,
      },
    });
    return { status: "done", suggestions: rows.length, costUsd: spent };
  } catch (err) {
    try {
      await finishJob(admin, jobId, { status: "failed", error: errorMessage(err), costUsd: spent });
    } catch (finishErr) {
      // oryginalny błąd jest ważniejszy niż nieudany zapis do rejestru
      console.error("keyword-research: nie udało się zamknąć zadania w rejestrze:", errorMessage(finishErr));
    }
    throw err;
  }
}
