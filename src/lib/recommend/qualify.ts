export interface PromptVisibility {
  promptId: string;
  intent: string;
  overall: { visibilityRate: number; responsesCount: number } | null;
  byEngine: { engineId: string; visibilityRate: number; responsesCount: number }[];
}

/**
 * Picks prompts worth analysing for recommendations: overall visibility below
 * `threshold`, or 0% visibility in at least two engines that actually answered.
 * No valid responses means no data (not zero visibility), so such prompts are skipped.
 * Brand-intent prompts qualify only when below the threshold.
 */
export function qualifyPrompts(rows: PromptVisibility[], threshold: number): string[] {
  return rows
    .filter((r) => {
      if (!r.overall || r.overall.responsesCount === 0) return false;
      const low = r.overall.visibilityRate < threshold;
      const zeroEngines = r.byEngine.filter((e) => e.responsesCount > 0 && e.visibilityRate === 0).length >= 2;
      if (r.intent === "brand" && !low) return false;
      return low || zeroEngines;
    })
    .map((r) => r.promptId);
}
