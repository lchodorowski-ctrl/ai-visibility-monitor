import type { EngineAdapter, EngineId } from "./types";
import { openaiAdapter } from "./openai";
import { perplexityAdapter } from "./perplexity";
import { geminiAdapter } from "./gemini";
import { googleAiOverviewAdapter } from "./google-ai-overview";

export { ENGINE_COST_USD } from "./costs";

export const ENGINE_LABELS: Record<EngineId, string> = {
  openai: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini", google_ai_overview: "Google AI Overviews",
};

const adapters: Record<EngineId, EngineAdapter> = {
  openai: openaiAdapter,
  perplexity: perplexityAdapter,
  gemini: geminiAdapter,
  google_ai_overview: googleAiOverviewAdapter,
};

export function getAdapter(id: EngineId): EngineAdapter {
  const a = adapters[id];
  if (!a) throw new Error(`Nieznany silnik: ${id}`);
  return a;
}

export function isEngineId(s: string): s is EngineId {
  return s in adapters;
}
