export const pct = (v: number) => `${Math.round(v * 100)}%`;

const dateFmt = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));

// --- Polish number formatting (decimal comma, plain spaces) ---------------------------------------------------------

const MINUS = "\u2212";

/** Intl separates thousands with no-break spaces (U+00A0, U+202F); the app writes plain spaces. */
export const plainSpaces = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

const decimalFormats = new Map<number, Intl.NumberFormat>();

/**
 * Fixed number of decimals with a decimal comma and plain-space thousands: `fmtDecimal(12345.67, 1)` is "12 345,7".
 * Like `pl-PL` in Intl, four-digit numbers are not grouped ("4200").
 */
export function fmtDecimal(n: number, digits = 1): string {
  let f = decimalFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    decimalFormats.set(digits, f);
  }
  return plainSpaces(f.format(n));
}

/** Whole number: "12 345". */
export const fmtNumber = (n: number): string => fmtDecimal(n, 0);

const compactFormat = new Intl.NumberFormat("pl-PL", { notation: "compact" });

/** Short form for chart axes: "950", "12 tys.", "1,2 mln". */
export const fmtCompact = (n: number): string => plainSpaces(compactFormat.format(n));

/** Signed value with U+2212 for negatives: "+0,3", "−5"; a value that rounds to zero has no sign. */
export function fmtSignedNumber(n: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(Math.abs(n) * factor) / factor;
  const sign = rounded === 0 ? "" : n > 0 ? "+" : MINUS;
  return `${sign}${fmtDecimal(rounded, digits)}`;
}

/** Relative change as a signed percentage: 0.2 is "+20%", -0.145 is "−15%", a change that rounds to zero is "0%". */
export function fmtSignedPercent(change: number, digits = 0): string {
  return `${fmtSignedNumber(change * 100, digits)}%`;
}

/**
 * Average position change in places, rounded to the 0.1 that is shown: negative is better (a lower number), positive is
 * worse, 0 below 0.05; null when either position is missing. The text and every verdict take this one number, so an
 * arrow never disagrees with "lepiej o 0,5 poz." (rounding the two positions separately could).
 */
export function positionChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null) return null;
  const d = cur - prev;
  const places = Math.round(Math.abs(d) * 10) / 10;
  return places === 0 ? 0 : Math.sign(d) * places;
}

/**
 * Average position change in words: a lower position is better, so a relative percentage would read the wrong way.
 * "lepiej o 2,6 poz.", "gorzej o 0,3 poz.", "bez zmian" below 0.05; null when either position is missing.
 */
export function positionChangeText(cur: number | null, prev: number | null): string | null {
  const d = positionChange(cur, prev);
  if (d === null) return null;
  if (d === 0) return "bez zmian";
  return `${d < 0 ? "lepiej" : "gorzej"} o ${fmtDecimal(Math.abs(d))} poz.`;
}

/** "2026-10-31" as "31.10". */
export const fmtDayMonth = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
