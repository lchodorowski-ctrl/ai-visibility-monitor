import { createAnthropic } from "@/lib/anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const ProposalSchema = z.object({
  prompts: z.array(z.object({
    text: z.string().describe("Naturalne pytanie po polsku, jakie użytkownik zadałby asystentowi AI"),
    topic: z.string().describe("Nazwa tematu (klastra)"),
    intent: z.enum(["informational", "comparison", "transactional", "brand"]),
  })),
});
export type PromptProposal = z.infer<typeof ProposalSchema>["prompts"][number];

const SYSTEM = `Tworzysz zestaw pytań do monitorowania widoczności marki w asystentach AI (ChatGPT, Gemini, Perplexity, Google AI Overviews).
Zasady:
- Pytania po polsku, tak jak piszą prawdziwi użytkownicy (różna długość, czasem potoczne).
- Większość pytań NIE zawiera nazwy marki (intencje informational/comparison/transactional); tylko intent "brand" ją zawiera.
- Pokryj różne persony i etapy decyzji: szukam informacji, porównuję, chcę kupić.
- Unikaj duplikatów i pytań, których nie da się sensownie zadać asystentowi.`;

export async function generatePromptProposals(input: {
  brandName: string; facts: Record<string, unknown>; topics: string[]; seedPhrases: string[]; personas: string[]; count: number;
}): Promise<PromptProposal[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Brak ANTHROPIC_API_KEY");
  const client = createAnthropic();
  const res = await client.messages.parse({
    model: process.env.ANTHROPIC_GENERATOR_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(ProposalSchema) },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        `Marka: ${input.brandName}`,
        `Karta faktów: ${JSON.stringify(input.facts)}`,
        `Istniejące tematy: ${input.topics.join("; ") || "brak"}`,
        `Frazy seed: ${input.seedPhrases.join("; ") || "brak"}`,
        `Persony: ${input.personas.join("; ") || "ogólny użytkownik"}`,
        `Wygeneruj ${input.count} pytań.`,
      ].join("\n"),
    }],
  });
  return res.parsed_output?.prompts ?? [];
}
