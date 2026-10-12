import type { EngineAdapter } from "./types";
export const openaiAdapter: EngineAdapter = {
  id: "openai",
  async query() { throw new Error("openai: adapter jeszcze niezaimplementowany (Task 6)"); },
};
