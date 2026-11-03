import { task } from "@trigger.dev/sdk";
import { runKeywordResearch } from "@/lib/seo/keyword-research";

export interface KeywordResearchPayload { projectId: string; seeds: string[]; competitors: boolean }

// Płatne wywołania DataForSEO: bez ponowień, żeby awaria nie podwoiła kosztu.
export const keywordResearchTask = task({
  id: "keyword-research",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 900,
  run: (p: KeywordResearchPayload) => runKeywordResearch(p),
});
