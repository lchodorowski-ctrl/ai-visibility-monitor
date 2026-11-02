import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getGoogleAuth, type GoogleAuth } from "@/lib/google/auth";
import { fetchAllRows, type GscRow } from "@/lib/google/gsc";
import { startJob, finishJob, type SeoJobStatus } from "./jobs";

type Admin = SupabaseClient<Database>;

export const NO_PROPERTY_MESSAGE = "Brak usługi Search Console w Ustawieniach → Google";

/** Search Console trzyma dane 16 miesięcy; tyle też pobieramy przy pełnej synchronizacji. */
const BACKFILL_MONTHS = 16;
/**
 * Synchronizacja kończy się na dziś − 2 dni (UTC), nie na wczoraj: zadanie rusza o 06:30 w Warszawie, czyli 21:30 poprzedniego
 * dnia w Pacific (strefie, w której Search Console liczy dzień), więc "wczoraj UTC" to jeszcze niepełny dzień.
 */
const END_LAG_DAYS = 2;
/** Najnowsze dni bywają jeszcze korygowane, więc każda synchronizacja przelicza kilka ostatnich (5 dni do końca okna). */
const REFRESH_DAYS = 5;
const REFRESH_OVERLAP_DAYS = 2;
const UPSERT_CHUNK = 1000;
const DAY_MS = 86_400_000;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Okna dat do pobrania (włącznie z oboma końcami). Koniec to zawsze dziś − 2 dni (UTC).
 * Pełna synchronizacja (`backfill` albo brak danych): miesięczne okna od pierwszego dnia miesiąca sprzed
 * 16 miesięcy. Przyrostowa: jedno okno od `min(dziś − 6 dni, ostatnia data − 2 dni)`, czyli co najmniej 5 dni do końca.
 */
export function syncWindows(o: { today: Date; lastDate: string | null; backfill: boolean }): { start: string; end: string }[] {
  const end = addDays(isoDay(o.today), -END_LAG_DAYS);
  if (!o.backfill && o.lastDate !== null) {
    const start = addDays(end, -(REFRESH_DAYS - 1));
    const overlapStart = addDays(o.lastDate, -REFRESH_OVERLAP_DAYS);
    return [{ start: start < overlapStart ? start : overlapStart, end }];
  }
  const windows: { start: string; end: string }[] = [];
  const year = o.today.getUTCFullYear();
  const month = o.today.getUTCMonth();
  for (let i = -BACKFILL_MONTHS; ; i++) {
    const start = isoDay(new Date(Date.UTC(year, month + i, 1)));
    if (start > end) break;
    const monthEnd = isoDay(new Date(Date.UTC(year, month + i + 1, 0)));
    windows.push({ start, end: monthEnd < end ? monthEnd : end });
  }
  return windows;
}

/** Ścieżka adresu (bez hosta, zapytania i fragmentu); tekst, który nie jest adresem, zostaje bez zmian. */
export function toPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

interface Metrics { clicks: number; impressions: number; position: number }

/**
 * Scala wiersze o tym samym kluczu (np. warianty tej samej strony: z www i bez, z parametrami):
 * kliknięcia i wyświetlenia się sumują, pozycja jest średnią ważoną wyświetleniami, do 2 miejsc.
 * Przy zerowej sumie wyświetleń waga nie istnieje, więc pozycja to zwykła średnia.
 */
export function mergeRows<K extends string>(rows: ({ key: K } & Metrics)[]): ({ key: K } & Metrics)[] {
  const acc = new Map<K, { clicks: number; impressions: number; weighted: number; plain: number; n: number }>();
  for (const r of rows) {
    const a = acc.get(r.key) ?? { clicks: 0, impressions: 0, weighted: 0, plain: 0, n: 0 };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.weighted += r.position * r.impressions;
    a.plain += r.position;
    a.n += 1;
    acc.set(r.key, a);
  }
  return [...acc].map(([key, a]) => ({
    key,
    clicks: a.clicks,
    impressions: a.impressions,
    position: Math.round((a.impressions > 0 ? a.weighted / a.impressions : a.plain / a.n) * 100) / 100,
  }));
}

export interface RunGscSyncDeps {
  admin?: Admin;
  auth?: GoogleAuth;
  fetchRows?: typeof fetchAllRows;
  now?: () => Date;
}

export interface GscSyncResult {
  status: SeoJobStatus;
  /** Dni kalendarzowe objęte pobraniem (suma długości okien), nie liczba dni z danymi. */
  days: number;
  siteRows: number;
  pageRows: number;
  queryRows: number;
}

type Fetched = { rows: GscRow[]; invalid: number };

/** GSC zawsze zwraca pozycję; wiersz bez liczbowej pozycji odrzucamy, bo baza nie przyjmie `null` dla wyświetleń > 0. */
function usable(rows: GscRow[]): Fetched {
  const ok = rows.filter((r) => Number.isFinite(r.position));
  return { rows: ok, invalid: rows.length - ok.length };
}

/** Wiersze po scaleniu według klucza złożonego z wymiarów; `parts` rozbija klucz z powrotem na wymiary. */
function mergeBy(rows: GscRow[], keyOf: (r: GscRow) => string[]) {
  const merged = mergeRows(rows.map((r) => ({ key: JSON.stringify(keyOf(r)), clicks: r.clicks, impressions: r.impressions, position: r.position })));
  return merged.map(({ key, ...metrics }) => ({ parts: JSON.parse(key) as string[], ...metrics }));
}

async function upsertChunks<Row>(rows: Row[], save: (chunk: Row[]) => PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await save(rows.slice(i, i + UPSERT_CHUNK));
    if (error) throw new Error(error.message);
  }
}

export async function runGscSync(payload: { projectId: string; backfill?: boolean }, deps: RunGscSyncDeps = {}): Promise<GscSyncResult> {
  const { projectId } = payload;
  const admin = deps.admin ?? createAdminSupabase();
  const now = deps.now ?? (() => new Date());

  const projectRes = await admin.from("projects").select("gsc_property").eq("id", projectId).single();
  if (projectRes.error) throw new Error(projectRes.error.message);
  const property = projectRes.data.gsc_property;

  const jobId = await startJob(admin, projectId, "gsc_sync");
  if (!property) {
    await finishJob(admin, jobId, { status: "skipped", error: NO_PROPERTY_MESSAGE });
    return { status: "skipped", days: 0, siteRows: 0, pageRows: 0, queryRows: 0 };
  }

  try {
    // Klucz konta usługi czytamy dopiero tu, żeby jego brak zapisał się jako nieudane zadanie, a nie przerwał przed zapisem.
    const auth = deps.auth ?? getGoogleAuth();
    const fetchRows = deps.fetchRows ?? fetchAllRows;

    let lastDate: string | null = null;
    if (!payload.backfill) {
      const last = await admin.from("gsc_site_daily").select("date").eq("project_id", projectId)
        .order("date", { ascending: false }).limit(1).maybeSingle();
      if (last.error) throw new Error(last.error.message);
      lastDate = last.data?.date ?? null;
    }

    const windows = syncWindows({ today: now(), lastDate, backfill: payload.backfill === true });
    let days = 0, siteRows = 0, pageRows = 0, queryRows = 0, invalidRows = 0;

    for (const w of windows) {
      const window = { startDate: w.start, endDate: w.end, dataState: "all" as const };
      const site = usable(await fetchRows(auth, property, { ...window, dimensions: ["date"] }));
      const page = usable(await fetchRows(auth, property, { ...window, dimensions: ["date", "page"] }));
      const query = usable(await fetchRows(auth, property, { ...window, dimensions: ["date", "query", "page", "device"] }));
      invalidRows += site.invalid + page.invalid + query.invalid;

      const siteMerged = mergeBy(site.rows, (r) => [r.keys[0]]);
      const pageMerged = mergeBy(page.rows, (r) => [r.keys[0], toPath(r.keys[1])]);
      const queryMerged = mergeBy(query.rows, (r) => [r.keys[0], r.keys[1], toPath(r.keys[2]), r.keys[3].toLowerCase()]);

      // Tabela serwisu na końcu: jej ostatnia data wyznacza początek następnej synchronizacji,
      // więc nie może wyprzedzić stron i fraz, gdyby zapis się przerwał.
      await upsertChunks(
        queryMerged.map(({ parts: [date, q, p, device], ...m }) => ({ project_id: projectId, date, query: q, page: p, device, ...m })),
        (chunk) => admin.from("gsc_query_daily").upsert(chunk, { onConflict: "project_id,date,query,page,device" }),
      );
      await upsertChunks(
        pageMerged.map(({ parts: [date, p], ...m }) => ({ project_id: projectId, date, page: p, ...m })),
        (chunk) => admin.from("gsc_page_daily").upsert(chunk, { onConflict: "project_id,date,page" }),
      );
      await upsertChunks(
        siteMerged.map(({ parts: [date], ...m }) => ({ project_id: projectId, date, ...m })),
        (chunk) => admin.from("gsc_site_daily").upsert(chunk, { onConflict: "project_id,date" }),
      );

      days += Math.round((Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / DAY_MS) + 1;
      siteRows += siteMerged.length;
      pageRows += pageMerged.length;
      queryRows += queryMerged.length;
    }

    await finishJob(admin, jobId, { status: "done", stats: { days, windows: windows.length, siteRows, pageRows, queryRows, invalidRows } });
    return { status: "done", days, siteRows, pageRows, queryRows };
  } catch (err) {
    try {
      await finishJob(admin, jobId, { status: "failed", error: errorMessage(err) });
    } catch (finishErr) {
      // oryginalny błąd jest ważniejszy niż nieudany zapis do rejestru
      console.error("gsc-sync: nie udało się zamknąć zadania w rejestrze:", errorMessage(finishErr));
    }
    throw err;
  }
}
