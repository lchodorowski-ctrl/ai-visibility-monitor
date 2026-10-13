import { CALIBRATION_ENGINES, type CalibrationEngine } from "./engines";

export type ApiResponse = { id: string; error: string | null; no_answer: boolean; ownMention: boolean; domains: string[] };
export type ApiOutcome = "mentioned" | "absent" | "no_data";
export type RowResult = "match" | "api_only" | "manual_only" | "skipped";
export type CalibrationRow = { promptId: string; engineId: CalibrationEngine; result: RowResult };
export type EngineAgreement = { engineId: CalibrationEngine; agreed: number; checked: number; rate: number | null };
export type CalibrationTone = "good" | "weak" | "bad";

export function apiOutcome(responses: ApiResponse[]): ApiOutcome {
  const valid = responses.filter((r) => !r.error && !r.no_answer);
  if (valid.length === 0) return "no_data";
  return valid.some((r) => r.ownMention) ? "mentioned" : "absent";
}

export function compareRow(manual: boolean | null, api: ApiOutcome): RowResult {
  if (manual === null || api === "no_data") return "skipped";
  const apiYes = api === "mentioned";
  if (manual === apiYes) return "match";
  return apiYes ? "api_only" : "manual_only";
}

export function agreementByEngine(rows: CalibrationRow[]): EngineAgreement[] {
  return CALIBRATION_ENGINES.map((engineId) => {
    const own = rows.filter((r) => r.engineId === engineId && r.result !== "skipped");
    const agreed = own.filter((r) => r.result === "match").length;
    return { engineId, agreed, checked: own.length, rate: own.length ? agreed / own.length : null };
  });
}

// Bez `new URL`: URL punycode'uje niełacińskie hosty (np. "śmieci" → "xn--…"), które muszą być odrzucane.
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function normalizeDomain(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  const withoutScheme = t.replace(/^https?:\/\//i, "");
  const host = withoutScheme.split(/[/?#:]/, 1)[0].toLowerCase().replace(/^www\./, "");
  return DOMAIN_RE.test(host) ? host : null;
}

export function citationCoverage(manualUrls: string[], apiDomains: string[]): { matched: number; total: number } {
  const manual = new Set(manualUrls.map(normalizeDomain).filter((d): d is string => d !== null));
  const api = new Set(apiDomains.map((d) => normalizeDomain(d)).filter((d): d is string => d !== null));
  let matched = 0;
  for (const d of manual) if (api.has(d)) matched++;
  return { matched, total: manual.size };
}

export function calibrationTone(rate: number): CalibrationTone {
  return rate >= 0.8 ? "good" : rate >= 0.6 ? "weak" : "bad";
}

const TONE_CLASS: Record<CalibrationTone, string> = { good: "text-teal", weak: "text-t0", bad: "text-red" };

export function calibrationToneClass(rate: number): string {
  return TONE_CLASS[calibrationTone(rate)];
}
