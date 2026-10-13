// 1 pytanie, 2–4 pytania, 5+ pytań; 12–14 i 112–114 → "pytań"
export function pluralPl(n: number, [one, few, many]: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10, mod100 = abs % 100;
  const form = abs === 1 ? one : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many;
  return `${n} ${form}`;
}
