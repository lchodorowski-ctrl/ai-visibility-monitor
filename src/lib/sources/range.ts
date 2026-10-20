/** Time range of the Sources page: the last finished measurement or the last N days (`?range=run|30|90`). */
export type SourceRange = { kind: "run" } | { kind: "days"; days: number };

export const RANGE_OPTIONS = [
  { value: "run", label: "Ostatni pomiar" },
  { value: "30", label: "30 dni" },
  { value: "90", label: "90 dni" },
] as const;

export type RangeParam = (typeof RANGE_OPTIONS)[number]["value"];

export function parseRange(raw: string | string[] | undefined): SourceRange {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "30" || v === "90" ? { kind: "days", days: Number(v) } : { kind: "run" };
}

export function rangeParam(r: SourceRange): RangeParam {
  return r.kind === "days" && (r.days === 30 || r.days === 90) ? (String(r.days) as RangeParam) : "run";
}

export function rangeHref(value: RangeParam): string {
  return value === "run" ? "/app/sources" : `/app/sources?range=${value}`;
}

/** Start of the window, N days before `now` (ISO timestamp). */
export function sinceIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
