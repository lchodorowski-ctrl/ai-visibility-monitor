export type EngineId = "openai" | "perplexity" | "gemini" | "google_ai_overview";

export interface EngineQueryOptions {
  locale: string;   // "pl-PL"
  country: string;  // "PL"
}

export interface Citation {
  url: string;
  domain: string;
  title?: string;
}

export interface EngineResult {
  text: string;
  citations: Citation[];
  model: string;
  raw: unknown;
  costUsd: number;
  noAnswer?: boolean;
}

export interface EngineAdapter {
  id: EngineId;
  query(prompt: string, opts: EngineQueryOptions): Promise<EngineResult>;
}
