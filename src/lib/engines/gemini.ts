import type { EngineAdapter } from "./types";
export const geminiAdapter: EngineAdapter = {
  id: "gemini",
  async query() { throw new Error("gemini: adapter jeszcze niezaimplementowany (Task 8)"); },
};
