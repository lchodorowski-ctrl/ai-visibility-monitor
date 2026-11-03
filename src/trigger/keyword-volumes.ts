import { task } from "@trigger.dev/sdk";
import { runKeywordVolumes } from "@/lib/seo/keyword-volumes";

export interface KeywordVolumesPayload { projectId: string }

// Płatne wywołania DataForSEO: bez ponowień, żeby awaria nie podwoiła kosztu.
export const keywordVolumesTask = task({
  id: "keyword-volumes",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 900,
  run: (p: KeywordVolumesPayload) => runKeywordVolumes(p),
});
