import { dfsRequest, dfsLocationCode, PAYMENT_REQUIRED_MESSAGE, type DfsResponse } from "@/lib/dataforseo/client";
import { SERP_DEPTH } from "@/lib/seo/costs";

const TASK_POST_PATH = "/serp/google/organic/task_post";
const TASK_GET_PATH = "/serp/google/organic/task_get/advanced";
/** Limit DataForSEO: najwyżej 100 zadań w jednym task_post. */
const POST_BATCH_SIZE = 100;

const CODE_TASK_CREATED = 20100;
const CODE_PAYMENT_REQUIRED = 40200;
const CODE_NO_RESULTS = 40102;
// Zadanie przekazane do wykonania albo w kolejce: wynik jeszcze nie gotowy.
const PENDING_CODES = [40601, 40602];

const MISSING_TASK_MESSAGE = "DataForSEO nie zwróciło zadania";

export type Device = "desktop" | "mobile";

export interface SerpTaskInput {
  /** Własny znacznik zadania (u nas: id wiersza), DataForSEO zwraca go w `data.tag`. */
  tag: string;
  keyword: string;
  device: Device;
}

export type SerpTaskState =
  | { state: "pending" }
  | { state: "done"; result: unknown; costUsd: number; checkedAt: string | null }
  | { state: "failed"; error: string };

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const isPaymentRequired = (err: unknown): boolean => errorMessage(err) === PAYMENT_REQUIRED_MESSAGE;

/**
 * Wysyła zadania SERP do kolejki standard (paczki po 100), głębokość 100 z AI Overview, bez `stop_crawl_on_match`.
 * POST nie jest ponawiany (ponowienie mogłoby zapłacić dwa razy). Brak środków (HTTP 402 albo zadanie 40200) rzuca błąd;
 * zadanie z innym kodem niż 20100 trafia do `failed`. Awaria całej paczki oznacza `failed` dla jej zadań,
 * a nie wyjątek, żeby nie zgubić zadań z poprzednich paczek, które już zostały opłacone.
 */
export async function postSerpTasks(
  tasks: SerpTaskInput[],
): Promise<{ posted: { tag: string; id: string; costUsd: number }[]; failed: { tag: string; error: string }[] }> {
  const posted: { tag: string; id: string; costUsd: number }[] = [];
  const failed: { tag: string; error: string }[] = [];
  const locationCode = dfsLocationCode();

  for (let from = 0; from < tasks.length; from += POST_BATCH_SIZE) {
    const batch = tasks.slice(from, from + POST_BATCH_SIZE);
    let res: DfsResponse;
    try {
      res = await dfsRequest(
        "POST",
        TASK_POST_PATH,
        batch.map((t) => ({
          keyword: t.keyword,
          location_code: locationCode,
          language_code: "pl",
          depth: SERP_DEPTH,
          load_async_ai_overview: true,
          device: t.device,
          tag: t.tag,
        })),
        { checkTasks: false, retry: { attempts: 1 } },
      );
    } catch (err) {
      if (isPaymentRequired(err)) throw err;
      for (const t of batch) failed.push({ tag: t.tag, error: errorMessage(err) });
      continue;
    }

    const answered = new Set<string>();
    for (const [i, task] of (res.tasks ?? []).entries()) {
      // Tag z odpowiedzi; pozycja w paczce tylko jako zapas, gdyby `data.tag` zabrakło.
      const tag = typeof task.data?.tag === "string" ? task.data.tag : batch[i]?.tag;
      if (tag === undefined) continue;
      answered.add(tag);
      if (task.status_code === CODE_PAYMENT_REQUIRED) throw new Error(PAYMENT_REQUIRED_MESSAGE);
      if (task.status_code === CODE_TASK_CREATED) posted.push({ tag, id: task.id, costUsd: task.cost ?? 0 });
      else failed.push({ tag, error: `DataForSEO task ${task.status_code}: ${task.status_message}` });
    }
    for (const t of batch) if (!answered.has(t.tag)) failed.push({ tag: t.tag, error: MISSING_TASK_MESSAGE });
  }
  return { posted, failed };
}

/** „2026-11-03 13:20:34 +00:00” (format DataForSEO) jako ISO 8601; null, gdy daty nie da się odczytać. */
function toIso(datetime: unknown): string | null {
  if (typeof datetime !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/.exec(datetime.trim());
  const ms = Date.parse(m ? `${m[1]}T${m[2]}${m[3]}` : datetime);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Odbiera wynik zadania SERP. 40601 i 40602 (w toku) to `pending`, 40102 (brak wyników) to `done` z pustym wynikiem.
 * Brak środków leci dalej jako wyjątek, każdy inny błąd to `failed` z komunikatem.
 */
export async function getSerpTask(id: string): Promise<SerpTaskState> {
  let res: DfsResponse;
  try {
    res = await dfsRequest("GET", `${TASK_GET_PATH}/${encodeURIComponent(id)}`, undefined, {
      okTaskCodes: [20000, CODE_NO_RESULTS, ...PENDING_CODES],
    });
  } catch (err) {
    if (isPaymentRequired(err)) throw err;
    return { state: "failed", error: errorMessage(err) };
  }

  const task = res.tasks?.[0];
  if (!task) return { state: "failed", error: MISSING_TASK_MESSAGE };
  if (PENDING_CODES.includes(task.status_code)) return { state: "pending" };

  const costUsd = task.cost ?? res.cost ?? 0;
  if (task.status_code === CODE_NO_RESULTS) return { state: "done", result: null, costUsd, checkedAt: null };
  const result = task.result?.[0] ?? null;
  return { state: "done", result, costUsd, checkedAt: toIso((result as { datetime?: unknown } | null)?.datetime) };
}
