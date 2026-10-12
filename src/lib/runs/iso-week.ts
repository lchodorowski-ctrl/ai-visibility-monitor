// Klucz tygodnia ISO 8601 w UTC, np. "2026-W42" (używany jako idempotencyKey crona)
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // pon=1 … niedz=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // czwartek tego tygodnia wyznacza rok ISO
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
