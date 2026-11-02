import { withRetry, TransientError, isTransientStatus } from "@/lib/engines/retry";

export const DFS_BASE = "https://api.dataforseo.com/v3";

// HTTP 402 / zadanie 40200: na przedpłaconym koncie skończyło się saldo.
export const PAYMENT_REQUIRED_MESSAGE =
  "DataForSEO: brak środków na koncie (Payment Required). Doładuj saldo na app.dataforseo.com i uruchom pomiar ponownie.";

const DEFAULT_LOCATION_CODE = 2616; // Polska

export interface DfsTask {
  id: string;
  status_code: number;
  status_message: string;
  cost?: number;
  result?: unknown[] | null;
  data?: Record<string, unknown>;
}

export interface DfsResponse {
  status_code: number;
  status_message: string;
  cost?: number;
  tasks?: DfsTask[];
}

export interface DfsRequestOptions {
  /** Kody zadań uznawane za sukces (domyślnie tylko 20000). */
  okTaskCodes?: number[];
  /** Czy sprawdzać status każdego zadania (domyślnie tak). */
  checkTasks?: boolean;
  retry?: { attempts?: number; baseDelayMs?: number };
}

export function dfsLocationCode(): number {
  const parsed = Number(process.env.DATAFORSEO_LOCATION_CODE);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LOCATION_CODE;
}

function checkTaskStatuses(tasks: DfsTask[], okTaskCodes: number[]) {
  for (const task of tasks) {
    const code = task.status_code;
    // Zadanie bez kodu traktujemy jak poprawne (tak samo robił adapter AIO).
    if (typeof code !== "number") continue;
    // Błąd serwera po stronie DataForSEO (przejściowy) - ponawiamy.
    if (code === 40101) throw new TransientError(`DataForSEO task ${code}: ${task.status_message}`);
    if (code === 40200) throw new Error(PAYMENT_REQUIRED_MESSAGE);
    if (!okTaskCodes.includes(code)) throw new Error(`DataForSEO task ${code}: ${task.status_message}`);
  }
}

export async function dfsRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown[],
  opts: DfsRequestOptions = {},
): Promise<DfsResponse> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("Brak DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD");

  const { okTaskCodes = [20000], checkTasks = true, retry } = opts;
  const headers = {
    Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
    "Content-Type": "application/json",
  };

  return withRetry(async () => {
    const res = await fetch(`${DFS_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 402) throw new Error(PAYMENT_REQUIRED_MESSAGE);
    if (!res.ok) {
      const message = `DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
      throw isTransientStatus(res.status) ? new TransientError(message) : new Error(message);
    }
    const data = (await res.json()) as DfsResponse;
    if (data.status_code !== 20000) throw new Error(`DataForSEO status ${data.status_code}: ${data.status_message}`);
    if (checkTasks) checkTaskStatuses(data.tasks ?? [], okTaskCodes);
    return data;
  }, retry);
}
