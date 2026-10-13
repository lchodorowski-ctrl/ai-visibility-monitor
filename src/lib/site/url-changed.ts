function normalize(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    // trailing slash and fragment do not change which site is crawled
    u.hash = "";
    return u.href.replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** True when the site URL points somewhere else (ignoring a trailing slash, host case and fragment). */
export function siteUrlChanged(prev: string | null | undefined, next: string): boolean {
  return normalize(prev ?? "") !== normalize(next);
}
