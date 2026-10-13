import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropic } from "@/lib/anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  summary: z.string().describe("Jedno zdanie po polsku: jak odpowiedź opisuje markę"),
});
export type Sentiment = z.infer<typeof SentimentSchema>["sentiment"];
export type SentimentResult = z.infer<typeof SentimentSchema>;

const SYSTEM = `Oceniasz, jak odpowiedź asystenta AI przedstawia wskazaną markę.
- positive: polecana, chwalona, wskazana jako dobry wybór
- neutral: wymieniona bez oceny
- negative: krytykowana, odradzana
- mixed: zalety i wady
Oceniaj wyłącznie fragmenty dotyczące tej marki.`;

let client: Anthropic | null = null;

export async function analyzeSentiment(
  text: string,
  brandName: string,
  aliases: string[],
): Promise<SentimentResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= createAnthropic();
  const model = process.env.ANTHROPIC_SENTIMENT_MODEL ?? "claude-haiku-5-5";
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Marka: ${brandName} (aliasy: ${aliases.join(", ") || "brak"})\n\nOdpowiedź AI:\n${text}`,
      }],
      output_config: { format: zodOutputFormat(SentimentSchema) },
    });
    return res.parsed_output ?? null;
  } catch (err) {
    console.error("analyzeSentiment failed", err);
    return null;
  }
}
