// Sprawdza, czy klucz Anthropic działa (5-tokenowe wywołanie). Klucza nie wypisuje.
// Użycie: npx tsx --env-file=.env.local scripts/check-anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import { createAnthropic } from "@/lib/anthropic";

const MODEL = process.env.ANTHROPIC_SENTIMENT_MODEL ?? "claude-haiku-5-5";

async function main() {
  try {
    await createAnthropic().messages.create({
      model: MODEL,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    console.log(`OK: klucz działa (model ${MODEL})`);
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    const message = e instanceof Error ? e.message : String(e);
    if (status === 400 && /workspace/i.test(message)) {
      console.error("BŁĄD: klucz nie jest przypisany do workspace'u — ustaw ANTHROPIC_WORKSPACE_ID w .env.local");
    } else {
      console.error(`BŁĄD: ${status ?? "brak statusu"} ${message.slice(0, 200)}`);
    }
    process.exit(1);
  }
}

void main();
