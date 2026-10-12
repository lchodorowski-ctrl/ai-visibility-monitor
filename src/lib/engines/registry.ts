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
  if (!isEngineId(id)) throw new Error(`Nieznany silnik: ${id}`);
  return adapters[id];
}

export function isEngineId(s: string): s is EngineId {
  return Object.prototype.hasOwnProperty.call(adapters, s);
}
