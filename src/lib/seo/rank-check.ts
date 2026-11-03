import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeDomainInput } from "@/lib/validation/settings";
import {
  postSerpTasks as defaultPostSerpTasks, getSerpTask as defaultGetSerpTask, type Device, type SerpTaskInput,
} from "@/lib/dataforseo/serp";
import { estimateRankCost } from "./costs";
import { passSeoBudget } from "./budget";
import { startJob, finishJob, failJob, errorMessage, type SeoJobStatus } from "./jobs";
import { parseSerp, type RankReading } from "./rank-parse";
import { NO_KEYWORDS_MESSAGE } from "./keyword-volumes";

type Admin = SupabaseClient<Database>;

/** Najwięcej aktywnych fraz sprawdzanych w tygodniu (górna granica kosztu: 100 fraz × 2 urządzenia ≈ 1,32 USD). */
export const MAX_RANK_KEYWORDS = 100;
/** Odstęp między odbiorami wyników z kolejki standard DataForSEO. */
export const POLL_INTERVAL_MS = 60_000;
/** Tyle odbiorów (przy minucie to godzina) i wiersze bez wyniku zostają `pending`: odbierze je kolejne uruchomienie. */
export const MAX_POLLS = 60;
export const DEVICES = ["desktop", "mobile"] as const satisfies readonly Device[];
export const NOTHING_TO_CHECK_MESSAGE = "Pozycje z tego tygodnia są już sprawdzone";
export const NO_DOMAIN_MESSAGE = "Projekt nie ma ustawionej domeny";
export const NOT_COLLECTED_MESSAGE = "Wynik nie został odebrany";

/** Wiersze `pending` z poprzedniego tygodnia jeszcze odbieramy (to samo okno obejmuje bieżący tydzień), starsze uznajemy za utracone. */
const RESUME_WEEKS = 1;
/** Tyle odbiorów albo zapisów naraz (DataForSEO i baza nie dostają wszystkiego jednocześnie). */
const CONCURRENCY = 5;

const WARSAW_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Poniedziałek tygodnia (YYYY-MM-DD) według kalendarza warszawskiego: o północy z niedzieli na poniedziałek zaczyna się
 * nowy tydzień pomiaru, także gdy w UTC jest jeszcze niedziela.
 */
export function rankWeekStart(now: Date): string {
  const parts = Object.fromEntries(WARSAW_DATE.formatToParts(now).map((p) => [p.type, p.value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - sinceMonday * 86_400_000).toISOString().slice(0, 10);
}

export interface RunRankCheckDeps {
  admin?: Admin;
  postSerpTasks?: typeof defaultPostSerpTasks;
  getSerpTask?: typeof defaultGetSerpTask;
  /** Oczekiwanie między odbiorami; w Trigger.dev `wait.for` (zwalnia maszynę), domyślnie zwykły `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface RankCheckResult {
  status: SeoJobStatus;
  /** Zadania przyjęte przez DataForSEO w tym uruchomieniu. */
  posted: number;
  /** Wiersze z zapisanym wynikiem w tym uruchomieniu (także wznowione z poprzedniego). */
  done: number;
  /** Wiersze zakończone błędem w tym uruchomieniu (odrzucone przy wysyłce albo przy odbiorze). */
  failed: number;
  /** Wiersze nadal bez wyniku po `MAX_POLLS` odbiorach. */
  pending: number;
  /** Koszt zadań wysłanych w tym uruchomieniu: faktyczny dla odebranych, z `task_post` dla pozostałych. */
  costUsd: number;
}

const emptyResult = (status: SeoJobStatus): RankCheckResult => ({ status, posted: 0, done: 0, failed: 0, pending: 0, costUsd: 0 });
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Data poniedziałku sprzed `weeks` tygodni od poniedziałku `week` (YYYY-MM-DD). */
const weeksBefore = (week: string, weeks: number): string => new Date(Date.parse(`${week}T00:00:00Z`) - weeks * 7 * 86_400_000).toISOString().slice(0, 10);

/** Zadanie SERP u dostawcy, na którego wynik czekamy: wiersz `rank_checks` i id zadania DataForSEO. */
interface Waiting {
  id: string;
  taskId: string;
}

/**
 * Wykonuje `fn` po `size` elementów naraz. Gdy coś w paczce się nie uda, czeka na resztę tej paczki (nic nie zostaje
 * w locie) i rzuca pierwszy błąd; kolejnych paczek już nie zaczyna.
 */
async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const settled = await Promise.allSettled(items.slice(i, i + size).map(fn));
    const rejected = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) throw rejected.reason;
  }
}

/**
 * Wykonuje `fn` dla każdego elementu, po `size` naraz, i nie przerywa po błędzie: wynik każdego elementu (w jego
 * kolejności) jest w zwróconej liście. Dla zapisów, które muszą się spróbować wszystkie (id opłaconych zadań).
 */
async function settleInChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.allSettled(items.slice(i, i + size).map(fn))));
  return results;
}

const rejections = (results: PromiseSettledResult<void>[]): unknown[] =>
  results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason);

/**
 * Cotygodniowe sprawdzenie pozycji aktywnych fraz projektu w Google: jedno zadanie SERP z kolejki standard DataForSEO
 * na parę fraza × urządzenie, wynik odbierany po kilku minutach.
 *
 * Tygodniowy limit `MAX_RANK_KEYWORDS` fraz jest twardy: frazy, które mają już wiersz w tym tygodniu (w dowolnym
 * statusie), zachowują miejsce, a nowe (np. fraza, która wskoczyła na górę listy wolumenów) dochodzą tylko do limitu
 * pomniejszonego o liczbę fraz z wierszami; kolejność wśród nowych to wolumen malejąco, bez wolumenu na końcu.
 *
 * Wiersze `rank_checks` tygodnia (według daty warszawskiej) niosą stan: `done` pomijamy, `pending` z id zadania tylko
 * odbieramy (nic nie płacimy drugi raz), a brak wiersza, `failed` i `pending` bez id zadania wysyłamy. Odbieramy też
 * wiersze `pending` z id z poprzedniego tygodnia; wszystkie starsze `pending` (i te bez id) oznaczamy jako `failed`.
 * Płatne, więc przed wysyłką sprawdza budżet SEO projektu (górny szacunek na wysyłane pary), a w rejestrze zapisuje
 * najpierw szacunek (rezerwacja), a na końcu koszt wysłanych zadań. Odmowa budżetu nie wstrzymuje odbioru już opłaconych
 * zadań (odbiór jest darmowy): są odbierane, a wynik to `budget_exceeded` (rejestr zamyka bramka). Odbiór trwa najwyżej
 * `MAX_POLLS` podejść: co nie zdążyło, zostaje `pending` i odbierze to następne uruchomienie.
 * Wyjątek zamyka zadanie jako `failed` z kosztem już wysłanych zadań i leci dalej; gdy wysyłka przerwała się wyjątkiem
 * (np. brak środków), koszt jest nieznany, więc zostaje rezerwacja (szacunek). Gdy dostawca odrzucił wszystkie zadania
 * (np. brak danych logowania), też jest to wyjątek, a wiersze zostają `pending` bez id: ponowi je następne uruchomienie.
 * Błąd zapisu id opłaconych zadań nie przerywa pozostałych zapisów ani odbioru: wyjątek leci dopiero na końcu.
 * Brak aktywnych fraz albo domeny zamyka zadanie jako `skipped`, ale dopiero po odebraniu opłaconych zadań (bez wysyłki
 * i bez bramki budżetu). Wynik, którego parser nie przeczyta, kończy błędem tylko swój wiersz; brak kosztu w `task_get`
 * zostawia cenę z `task_post`.
 */
export async function runRankCheck(payload: { projectId: string }, deps: RunRankCheckDeps = {}): Promise<RankCheckResult> {
  const { projectId } = payload;
  const admin = deps.admin ?? createAdminSupabase();
  const post = deps.postSerpTasks ?? defaultPostSerpTasks;
  const get = deps.getSerpTask ?? defaultGetSerpTask;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => new Date());

  const projectRes = await admin.from("projects").select("seo_budget_usd, domains").eq("id", projectId).single();
  if (projectRes.error) throw new Error(projectRes.error.message);
  const budget = Number(projectRes.data.seo_budget_usd);
  // Własne domeny dla parsera: wszystkie domeny projektu, normalizowane jak w ustawieniach.
  const ownDomains = [...new Set((projectRes.data.domains ?? []).map(normalizeDomainInput).filter((d) => d !== ""))];

  const jobId = await startJob(admin, projectId, "rank_check");
  /** Koszt zadań wysłanych w tym uruchomieniu po id wiersza: cena z `task_post`, po odbiorze faktyczna. */
  const sentCosts = new Map<string, number>();
  const spent = () => [...sentCosts.values()].reduce((sum, cost) => sum + cost, 0);
  /** Koszt wysyłki, która trwa i jeszcze nie odpowiedziała: gdy przerwie ją wyjątek, nie wiemy, ile pobrano. */
  let unconfirmedUsd = 0;
  /** Zadanie zamknięte przez bramkę budżetu: późniejszy błąd nie może go ponownie otworzyć jako `failed`. */
  let jobClosed = false;
  /** Konkurenci projektu dla parsera (czytani na początku uruchomienia). */
  let competitors: { name: string; domains: string[] }[] = [];

  /**
   * Odbiera czekające zadania: co `POLL_INTERVAL_MS` pyta o nie (po `CONCURRENCY` naraz) i zapisuje gotowe, najwyżej
   * `MAX_POLLS` razy. Wynik, którego parser nie przeczyta, kończy błędem tylko swój wiersz (zadanie jest opłacone
   * i nic lepszego nie zwróci), a odbiór pozostałych trwa. Brak kosztu w `task_get` zostawia cenę z `task_post`.
   */
  const collect = async (toCollect: Waiting[]): Promise<{ done: number; failed: number; waiting: Waiting[] }> => {
    const ctx = { ownDomains, competitors };
    let waiting = toCollect;
    let done = 0;
    let failed = 0;
    for (let poll = 0; poll < MAX_POLLS && waiting.length > 0; poll += 1) {
      await sleep(POLL_INTERVAL_MS);
      const stillWaiting: Waiting[] = [];
      await inChunks(waiting, CONCURRENCY, async (w) => {
        const state = await get(w.taskId);
        if (state.state === "pending") {
          stillWaiting.push(w);
          return;
        }
        if (state.state === "failed") {
          const { error } = await admin.from("rank_checks").update({ status: "failed", error: state.error })
            .eq("id", w.id).eq("project_id", projectId);
          if (error) throw new Error(error.message);
          failed += 1;
          return;
        }
        // Faktyczny koszt, o ile dostawca go podał; bez niego zostaje cena z `task_post` (wiersz i koszt uruchomienia).
        const actualCost = state.costUsd === null ? {} : { cost_usd: state.costUsd };
        const settleCost = () => {
          // Do kosztu tego uruchomienia wchodzą tylko zadania wysłane w nim; wznowione zapłacono wcześniej.
          if (state.costUsd !== null && sentCosts.has(w.id)) sentCosts.set(w.id, state.costUsd);
        };
        let reading: RankReading;
        try {
          reading = parseSerp(state.result, ctx);
        } catch (err) {
          const { error } = await admin.from("rank_checks").update({ status: "failed", error: errorMessage(err), ...actualCost })
            .eq("id", w.id).eq("project_id", projectId);
          if (error) throw new Error(error.message);
          settleCost();
          failed += 1;
          return;
        }
        const { error } = await admin.from("rank_checks").update({
          status: "done",
          position: reading.position,
          rank_absolute: reading.rankAbsolute,
          url: reading.url,
          breadcrumb: reading.breadcrumb,
          features: reading.features as unknown as NonNullable<Json>,
          top10: reading.top10 as unknown as NonNullable<Json>,
          competitors: reading.competitors as unknown as NonNullable<Json>,
          ...actualCost,
          checked_at: state.checkedAt ?? now().toISOString(),
          error: null,
        }).eq("id", w.id).eq("project_id", projectId);
        if (error) throw new Error(error.message);
        done += 1;
        settleCost();
      });
      waiting = stillWaiting;
    }
    return { done, failed, waiting };
  };

  /**
   * Zamyka zadanie jako `skipped` z powodem, ale najpierw odbiera opłacone i nieodebrane zadania (z id z tego albo
   * z poprzedniego tygodnia): odbiór jest darmowy i bez wysyłki, więc nie wymaga ani fraz, ani domeny, ani budżetu.
   * Bez własnej domeny parser nie znajdzie naszej pozycji (null), ale zapisze top 10, cechy SERP i konkurentów.
   */
  const skipAfterCollecting = async (message: string): Promise<RankCheckResult> => {
    const earliest = weeksBefore(rankWeekStart(now()), RESUME_WEEKS);
    const res = await admin.from("rank_checks").select("id, dfs_task_id")
      .eq("project_id", projectId).eq("status", "pending").not("dfs_task_id", "is", null).gte("week_start", earliest);
    if (res.error) throw new Error(res.error.message);
    const paid = (res.data ?? []).flatMap((r) => (r.dfs_task_id ? [{ id: r.id, taskId: r.dfs_task_id }] : []));
    const { done, failed, waiting } = await collect(paid);
    await finishJob(admin, jobId, {
      status: "skipped", error: message, stats: { resumed: paid.length, done, failed, pending: waiting.length },
    });
    return { status: "skipped", posted: 0, done, failed, pending: waiting.length, costUsd: 0 };
  };

  try {
    const competitorsRes = await admin.from("competitors").select("name, domains").eq("project_id", projectId);
    if (competitorsRes.error) throw new Error(competitorsRes.error.message);
    competitors = competitorsRes.data ?? [];

    // Aktywne frazy: najwyższy wolumen pierwszy, bez wolumenu na końcu; `id` rozstrzyga remisy, żeby drugie uruchomienie
    // w tym samym tygodniu widziało tę samą kolejność.
    const keywordsRes = await admin.from("keywords").select("id, key").eq("project_id", projectId).eq("active", true)
      .order("search_volume", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_RANK_KEYWORDS);
    if (keywordsRes.error) throw new Error(keywordsRes.error.message);
    const ranked = keywordsRes.data ?? [];
    if (ranked.length === 0) return await skipAfterCollecting(NO_KEYWORDS_MESSAGE);
    if (ownDomains.length === 0) return await skipAfterCollecting(NO_DOMAIN_MESSAGE);

    // 1. Wiersze tego tygodnia: z nich wynika, które frazy mają już miejsce w limicie i co jest sprawdzone.
    const week = rankWeekStart(now());
    const weekRes = await admin.from("rank_checks").select("id, keyword_id, device, status, dfs_task_id")
      .eq("project_id", projectId).eq("week_start", week);
    if (weekRes.error) throw new Error(weekRes.error.message);
    const weekRows = weekRes.data ?? [];
    const existing = new Map(weekRows.map((r) => [`${r.keyword_id}:${r.device}`, r]));
    const placed = new Set(weekRows.map((r) => r.keyword_id));

    // Frazy z wierszami zachowują miejsce, także gdy ich wolumen spadł poniżej pierwszych 100 (te dobieramy osobno).
    const known = new Set(ranked.map((k) => k.id));
    const lowerRanked = [...placed].filter((id) => !known.has(id));
    const placedOutside: { id: string; key: string }[] = [];
    if (lowerRanked.length > 0) {
      const res = await admin.from("keywords").select("id, key").eq("project_id", projectId).eq("active", true).in("id", lowerRanked);
      if (res.error) throw new Error(res.error.message);
      placedOutside.push(...(res.data ?? []));
    }
    // Nowych fraz jest tyle, ile zostało z limitu po frazach, które już mają wiersze w tym tygodniu (także nieaktywnych).
    let room = Math.max(0, MAX_RANK_KEYWORDS - placed.size);
    const keywords: { id: string; key: string }[] = [];
    for (const k of ranked) {
      if (placed.has(k.id)) keywords.push(k);
      else if (room > 0) {
        keywords.push(k);
        room -= 1;
      }
    }
    keywords.push(...placedOutside);

    let waiting: Waiting[] = [];
    const toSend: { keywordId: string; key: string; device: Device }[] = [];
    for (const k of keywords) {
      for (const device of DEVICES) {
        const row = existing.get(`${k.id}:${device}`);
        if (row?.status === "done") continue;
        if (row?.status === "pending" && row.dfs_task_id) waiting.push({ id: row.id, taskId: row.dfs_task_id });
        else toSend.push({ keywordId: k.id, key: k.key, device });
      }
    }

    // 2. Zlecone w poprzednich tygodniach i nieodebrane: z id z poprzedniego tygodnia odbieramy, resztę zamykamy błędem.
    const earlierRes = await admin.from("rank_checks").select("id, dfs_task_id, week_start")
      .eq("project_id", projectId).eq("status", "pending").lt("week_start", week);
    if (earlierRes.error) throw new Error(earlierRes.error.message);
    const oldestResumed = weeksBefore(week, RESUME_WEEKS);
    const stale: string[] = [];
    for (const row of earlierRes.data ?? []) {
      if (row.dfs_task_id && row.week_start >= oldestResumed) waiting.push({ id: row.id, taskId: row.dfs_task_id });
      else stale.push(row.id);
    }
    if (stale.length > 0) {
      const { error } = await admin.from("rank_checks").update({ status: "failed", error: NOT_COLLECTED_MESSAGE })
        .in("id", stale).eq("project_id", projectId);
      if (error) throw new Error(error.message);
    }

    if (toSend.length === 0 && waiting.length === 0) {
      await finishJob(admin, jobId, { status: "skipped", error: NOTHING_TO_CHECK_MESSAGE, stats: { stale: stale.length } });
      return emptyResult("skipped");
    }
    const resumed = waiting.length;

    // 3. Wysyłka: bramka budżetu, wiersze `pending`, zadania z tagiem równym id wiersza. Odmowa bramki zamyka zadanie,
    // ale odbiór już opłaconych zadań (niżej) i tak się odbywa.
    const estimate = estimateRankCost(toSend.length);
    const mayPost = toSend.length === 0 || (await passSeoBudget(admin, { projectId, jobId, estimate, budget, now: now() }));
    if (!mayPost) jobClosed = true;

    let posted = 0;
    let failed = 0;
    const writeErrors: unknown[] = [];
    if (mayPost && toSend.length > 0) {
      // Zapis czyści też id zadania po wcześniejszej próbie: wiersz `pending` bez id jest ponawiany, a ze starym id odbierałby martwe zadanie.
      const upsertRes = await admin.from("rank_checks").upsert(
        toSend.map((s) => ({
          project_id: projectId, keyword_id: s.keywordId, device: s.device, week_start: week, status: "pending", dfs_task_id: null, error: null,
        })),
        { onConflict: "keyword_id,device,week_start" },
      ).select("id, keyword_id, device");
      if (upsertRes.error) throw new Error(upsertRes.error.message);
      const rowIds = new Map((upsertRes.data ?? []).map((r) => [`${r.keyword_id}:${r.device}`, r.id]));
      const tasks: SerpTaskInput[] = toSend.map((s) => {
        const tag = rowIds.get(`${s.keywordId}:${s.device}`);
        if (!tag) throw new Error(`rank_checks: brak wiersza dla frazy "${s.key}" (${s.device})`);
        return { tag, keyword: s.key, device: s.device };
      });

      unconfirmedUsd = estimate;
      const sent = await post(tasks);
      unconfirmedUsd = 0;
      // Koszt zapisujemy od razu: od tej chwili każdy wyjątek zamyka zadanie z kosztem wysłanych zadań.
      for (const p of sent.posted) sentCosts.set(p.tag, p.costUsd);
      // Nic nie przyjęto, a są odrzucenia (brak danych logowania, nieczynne API): to awaria całości, a nie pojedyncze frazy.
      // Wiersze zostają `pending` bez id, więc następne uruchomienie wyśle je ponownie.
      if (sent.posted.length === 0 && sent.failed.length > 0) throw new Error(sent.failed[0].error);

      // Id opłaconych zadań zapisujemy wszystkie, nawet gdy któryś zapis padnie: zgubione id to ponowna wysyłka i druga opłata.
      // Odbieramy wiersze z zapisanym id, a błąd zapisu zgłaszamy po odbiorze.
      const idWrites = await settleInChunks(sent.posted, CONCURRENCY, async (p) => {
        const { error } = await admin.from("rank_checks").update({ dfs_task_id: p.id, cost_usd: p.costUsd })
          .eq("id", p.tag).eq("project_id", projectId);
        if (error) throw new Error(error.message);
      });
      const failedWrites = await settleInChunks(sent.failed, CONCURRENCY, async (f) => {
        const { error } = await admin.from("rank_checks").update({ status: "failed", error: f.error })
          .eq("id", f.tag).eq("project_id", projectId);
        if (error) throw new Error(error.message);
      });
      writeErrors.push(...rejections(idWrites), ...rejections(failedWrites));
      posted = sent.posted.length;
      failed = sent.failed.length;
      waiting = [
        ...waiting,
        ...sent.posted.filter((_, i) => idWrites[i].status === "fulfilled").map((p) => ({ id: p.tag, taskId: p.id })),
      ];
    }

    // 4. Odbiór: co minutę pytamy o czekające zadania (po kilka naraz), gotowe zapisujemy.
    const collected = await collect(waiting);
    waiting = collected.waiting;
    failed += collected.failed;
    const done = collected.done;

    if (writeErrors.length > 0) throw writeErrors[0];
    // Zadanie zamknęła już bramka budżetu (`budget_exceeded`): zostaje takie, a wynik niesie to, co odebrano.
    if (!mayPost) return { status: "budget_exceeded", posted: 0, done, failed, pending: waiting.length, costUsd: 0 };

    const costUsd = spent();
    await finishJob(admin, jobId, {
      status: "done",
      costUsd,
      stats: { posted, resumed, done, failed, pending: waiting.length, stale: stale.length, estimateUsd: estimate },
    });
    return { status: "done", posted, done, failed, pending: waiting.length, costUsd };
  } catch (err) {
    if (!jobClosed) await failJob(admin, jobId, err, spent() + unconfirmedUsd, "rank-check");
    throw err;
  }
}
