import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";
import { withRetry, TransientError, isTransientStatus } from "./retry";

type AnyRecord = Record<string, unknown>;
const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

function pushRefs(list: unknown, out: Citation[]) {
  for (const ref of (list ?? []) as AnyRecord[]) {
    const c = toCitation(String(ref.url ?? ""), ref.title ? String(ref.title) : undefined);
    if (c) out.push(c);
  }
}

export function parseDataForSeoResponse(raw: unknown): { text: string; citations: Citation[]; noAnswer: boolean } {
  const tasks = ((raw as AnyRecord)?.tasks ?? []) as AnyRecord[];
  const results = (tasks[0]?.result ?? []) as AnyRecord[];
  const items = (results[0]?.items ?? []) as AnyRecord[];
  const aio = items.find((i) => i.type === "ai_overview");
  if (!aio) return { text: "", citations: [], noAnswer: true };

  const citations: Citation[] = [];
  pushRefs(aio.references, citations);
  const parts: string[] = [];
  if (typeof aio.markdown === "string" && aio.markdown.trim()) parts.push(aio.markdown.trim());
  const useElementText = parts.length === 0;
  for (const el of (aio.items ?? []) as AnyRecord[]) {
    if (useElementText) {
      for (const candidate of [el.markdown, el.text]) {
        if (typeof candidate === "string" && candidate.trim()) {
          parts.push(candidate.trim());
          break;
        }
      }
    }
    pushRefs(el.references, citations);
    pushRefs(el.links, citations);
  }
  const text = parts.join("\n\n").trim();
  return { text, citations: dedupeCitations(citations), noAnswer: text.length === 0 };
}

export const googleAiOverviewAdapter: EngineAdapter = {
  id: "google_ai_overview",
  async query(prompt): Promise<EngineResult> {
    const login = process.env.DATAFORSEO_LOGIN, password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) throw new Error("Brak DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD");
    const parsedLocation = Number(process.env.DATAFORSEO_LOCATION_CODE);
    const location_code = Number.isInteger(parsedLocation) && parsedLocation > 0 ? parsedLocation : 2616;
    const body = [{
      keyword: prompt.slice(0, 700),
      location_code,
      language_code: "pl",
      device: "desktop",
      load_async_ai_overview: true,
    }];
    const raw = await withRetry(async () => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const message = `DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        throw isTransientStatus(res.status) ? new TransientError(message) : new Error(message);
      }
      const data = (await res.json()) as AnyRecord;
      if (data.status_code !== 20000) throw new Error(`DataForSEO status ${data.status_code}: ${data.status_message}`);
      const taskStatus = ((data.tasks as AnyRecord[])?.[0]?.status_code) as number | undefined;
      if (taskStatus === 40101) {
        // Błąd serwera po stronie DataForSEO (przejściowy) — ponawiamy.
        throw new TransientError(`DataForSEO task ${taskStatus}: ${(data.tasks as AnyRecord[])[0].status_message}`);
      }
      if (taskStatus && taskStatus !== 20000) {
        throw new Error(`DataForSEO task ${taskStatus}: ${(data.tasks as AnyRecord[])[0].status_message}`);
      }
      return data;
    });
    const { text, citations, noAnswer } = parseDataForSeoResponse(raw);
    const cost = typeof raw.cost === "number" ? raw.cost : ENGINE_COST_USD.google_ai_overview;
    return { text, citations, raw, model: "google_ai_overview", costUsd: cost, noAnswer };
  },
};
