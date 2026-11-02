import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";
import { dfsRequest, dfsLocationCode } from "@/lib/dataforseo/client";

type AnyRecord = Record<string, unknown>;

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
    const body = [{
      keyword: prompt.slice(0, 700),
      location_code: dfsLocationCode(),
      language_code: "pl",
      device: "desktop",
      load_async_ai_overview: true,
    }];
    const raw = await dfsRequest("POST", "/serp/google/organic/live/advanced", body);
    const { text, citations, noAnswer } = parseDataForSeoResponse(raw);
    const cost = typeof raw.cost === "number" ? raw.cost : ENGINE_COST_USD.google_ai_overview;
    return { text, citations, raw, model: "google_ai_overview", costUsd: cost, noAnswer };
  },
};
