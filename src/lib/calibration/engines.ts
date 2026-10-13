export const CALIBRATION_ENGINES = ["openai", "perplexity", "google_ai_overview"] as const;
export type CalibrationEngine = (typeof CALIBRATION_ENGINES)[number];
export const CALIBRATION_ENGINE_LABEL: Record<CalibrationEngine, string> = { openai: "ChatGPT", perplexity: "Perplexity", google_ai_overview: "Google AI Overview" };
export function isCalibrationEngine(v: string): v is CalibrationEngine {
  return (CALIBRATION_ENGINES as readonly string[]).includes(v);
}
