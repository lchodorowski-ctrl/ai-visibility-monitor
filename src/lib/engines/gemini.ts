import { GoogleGenAI } from "@google/genai";
import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";

type AnyRecord = Record<string, unknown>;

export function parseGeminiResponse(raw: unknown): { text: string; citations: Citation[] } {
  const r = (raw as AnyRecord | null) ?? {};
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const step of (r.steps ?? []) as AnyRecord[]) {
    if (step.type !== "model_output") continue;
    for (const part of (step.content ?? []) as AnyRecord[]) {
      if (part.type !== "text") continue;
      texts.push(String(part.text ?? ""));
      for (const a of (part.annotations ?? []) as AnyRecord[]) {
        if (a.type !== "url_citation") continue;
        const c = toCitation(String(a.url ?? ""), a.title ? String(a.title) : undefined);
        if (c) citations.push(c);
      }
    }
  }
  const text = typeof r.output_text === "string" && r.output_text.trim()
    ? r.output_text.trim()
    : texts.join("\n\n").trim();
  return { text, citations: dedupeCitations(citations) };
}

let client: GoogleGenAI | null = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Brak GEMINI_API_KEY");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

export const geminiAdapter: EngineAdapter = {
  id: "gemini",
  async query(prompt): Promise<EngineResult> {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
    const raw = await getClient().interactions.create({
      model,
      input: prompt,
      tools: [{ type: "google_search" }],
    });
    const { text, citations } = parseGeminiResponse(raw);
    return {
      text, citations, raw,
      model: String((raw as unknown as AnyRecord).model ?? model),
      costUsd: ENGINE_COST_USD.gemini,
      noAnswer: text.length === 0,
    };
  },
};
