import { task, wait } from "@trigger.dev/sdk";
import { runRankCheck } from "@/lib/seo/rank-check";

export interface RankCheckPayload { projectId: string }

// Płatne wywołania DataForSEO: bez ponowień, żeby awaria nie podwoiła kosztu (wiersze `pending` z id zadania
// odbierze następne uruchomienie). Oczekiwanie na wyniki to `wait.for`: zwalnia maszynę, a maxDuration to czas obliczeń, więc postój się do niego nie liczy.
export const rankCheckTask = task({
  id: "rank-check",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 900,
  run: (p: RankCheckPayload) => runRankCheck(p, {
    sleep: async (ms) => {
      await wait.for({ seconds: Math.round(ms / 1000) });
    },
  }),
});
