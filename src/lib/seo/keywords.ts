/** Wspólny klucz porównań fraz: NFC, bez brzegowych spacji, małe litery wg `pl`, pojedyncze spacje. Polskie znaki zostają. */
export function normalizeKeyword(text: string): string {
  return text.normalize("NFC").trim().toLocaleLowerCase("pl").replace(/\s+/g, " ");
}

const MAX_KEYWORD_LENGTH = 80;

/**
 * Lista fraz z pola tekstowego: podział po nowych liniach i przecinkach, normalizacja, bez pustych,
 * bez dłuższych niż 80 znaków, bez duplikatów (pierwsze wystąpienie), najwyżej `max` sztuk.
 */
export function parseKeywordList(input: string, max = 200): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of input.split(/[\n,]/)) {
    if (result.length >= max) break;
    const key = normalizeKeyword(part);
    if (key === "" || key.length > MAX_KEYWORD_LENGTH || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

/** Fraza odniesienia w Google Trends, gdy projekt nie ustawił własnej (`projects.trends_anchor`). */
export const DEFAULT_TRENDS_ANCHOR = "szkolenia ai";

/** Etykiety poziomu konkurencji z DataForSEO. */
export const COMPETITION_LABEL: Record<string, string> = { LOW: "niska", MEDIUM: "średnia", HIGH: "wysoka" };
