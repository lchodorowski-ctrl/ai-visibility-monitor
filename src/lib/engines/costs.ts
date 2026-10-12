import type { EngineId } from "./types";

// Szacunkowy koszt 1 zapytania (USD) — używany przez cost guard PRZED wysłaniem.
// Rzeczywisty koszt zapisujemy w responses.cost_usd, jeśli API go zwraca.
export const ENGINE_COST_USD: Record<EngineId, number> = {
  openai: 0.012,            // web search ~$10/1k + tokeny gpt-5.4-mini
  perplexity: 0.006,        // preset fast
  gemini: 0.014,            // $14/1k po wyczerpaniu 5000 darmowych/mies.
  google_ai_overview: 0.004, // DataForSEO live advanced + async AIO
};
