import OpenAI from "openai";
import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";

type AnyRecord = Record<string, unknown>;

export function parseOpenAIResponse(raw: unknown): { text: string; citations: Citation[] } {
  const output = ((raw as AnyRecord)?.output ?? []) as AnyRecord[];
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const item of output) {
    if (item.type !== "message") continue;
    for (const part of (item.content ?? []) as AnyRecord[]) {
      if (part.type !== "output_text") continue;
      texts.push(String(part.text ?? ""));
      for (const a of (part.annotations ?? []) as AnyRecord[]) {
        if (a.type !== "url_citation") continue;
        const c = toCitation(String(a.url ?? ""), a.title ? String(a.title) : undefined);
        if (c) citations.push(c);
      }
    }
  }
  return { text: texts.join("\n\n").trim(), citations: dedupeCitations(citations) };
}

let client: OpenAI | null = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Brak OPENAI_API_KEY");
  return (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

export const openaiAdapter: EngineAdapter = {
  id: "openai",
  async query(prompt, opts): Promise<EngineResult> {
    const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
    const raw = await getClient().responses.create({
      model,
      input: prompt,
      tools: [
        {
          type: "web_search",
          user_location: { type: "approximate", country: opts.country },
          search_context_size: "low",
        },
      ],
    });
    const { text, citations } = parseOpenAIResponse(raw);
    return {
      text,
      citations,
      model: String(raw.model ?? model),
      raw,
      costUsd: ENGINE_COST_USD.openai,
      noAnswer: text.length === 0,
    };
  },
};
