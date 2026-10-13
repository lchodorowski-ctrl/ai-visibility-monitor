export const RESPONSES_PAGE = 100;

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "pozytywny", neutral: "neutralny", negative: "negatywny", mixed: "mieszany",
};

export function isValidCursor(s: string | undefined): s is string {
  return !!s && !Number.isNaN(Date.parse(s));
}

/** Link „Pokaż starsze”: zachowuje filtry, kursor = created_at ostatniego wiersza. */
export function nextPageHref(filters: { engine?: string; prompt?: string }, lastCreatedAt: string): string {
  const p = new URLSearchParams();
  if (filters.engine) p.set("engine", filters.engine);
  if (filters.prompt) p.set("prompt", filters.prompt);
  p.set("before", lastCreatedAt);
  return `/app/responses?${p}`;
}
