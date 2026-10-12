import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";
import { withRetry, TransientError, isTransientStatus } from "./retry";

type AnyRecord = Record<string, unknown>;
const ENDPOINT = "https://api.perplexity.ai/v1/agent";

export function parsePerplexityResponse(raw: unknown): { text: string; citations: Citation[] } {
  const output = ((raw as AnyRecord)?.output ?? []) as AnyRecord[];
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const item of output) {
    if (item.type === "search_results") {
      for (const r of (item.results ?? []) as AnyRecord[]) {
        const c = toCitation(String(r.url ?? ""), r.title ? String(r.title) : undefined);
        if (c) citations.push(c);
      }
    }
    if (item.type === "message") {
      for (const part of (item.content ?? []) as AnyRecord[]) {
        if (part.type === "output_text") texts.push(String(part.text ?? ""));
      }
    }
  }
  return { text: texts.join("\n\n").trim(), citations: dedupeCitations(citations) };
}

export const perplexityAdapter: EngineAdapter = {
  id: "perplexity",
  async query(prompt): Promise<EngineResult> {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) throw new Error("Brak PERPLEXITY_API_KEY");
    const preset = process.env.PERPLEXITY_PRESET ?? "fast";
    const raw = await withRetry(async () => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ preset, input: prompt }),
      });
      if (!res.ok) {
        const message = `Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
        throw isTransientStatus(res.status) ? new TransientError(message) : new Error(message);
      }
      return (await res.json()) as AnyRecord;
    });
    const { text, citations } = parsePerplexityResponse(raw);
    return {
      text, citations, raw,
      model: String(raw.model ?? `preset:${preset}`),
      costUsd: ENGINE_COST_USD.perplexity,
      noAnswer: text.length === 0,
    };
  },
};
