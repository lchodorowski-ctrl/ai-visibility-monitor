import { foldText, escapeRegex } from "@/lib/extract/normalize";
import { domainMatches, normalizeDomain } from "@/lib/engines/domain";
import { getText } from "@/lib/site/crawl";
import { stripTags } from "@/lib/site/extract";

/**
 * Is the brand already on a cited off-site page, so an offsite recommendation starts from the page as it is.
 * brandPresent null = not checked (fetch failed, not 2xx, PDF, JS-only shell); the other fields are then empty.
 * mentions = matching entries (list items, table rows, sections under headings, links) or, on pages without them, text matches;
 * firstPositionRatio = where the first one sits, 0 = top, 1 = bottom.
 */
export interface TargetPresence { url: string; brandPresent: boolean | null; mentions: number; firstPositionRatio: number | null; linked: boolean }
type Presence = Omit<TargetPresence, "url">;
export interface PresenceBrand { name: string; aliases: string[]; domains: string[] }

/** Off-site pages checked per prompt; they are fetched in parallel, so a prompt waits at most one timeout. */
export const MAX_TARGETS = 5;
export const TARGET_TIMEOUT_MS = 8000;
// less visible text than this is a JS-rendered shell or a login wall: "absent" would be a guess
const MIN_TEXT_CHARS = 300;
// a kind of entry (<li>, <tr>, heading, <a>) counts only when a page has at least this many
const MIN_ENTRIES = 5;

const UNKNOWN: Presence = { brandPresent: null, mentions: 0, firstPositionRatio: null, linked: false };
const HREF = /<a\b[^>]*?\shref\s*=\s*["']([^"']*)["'][^>]*>/gi;

/** Folded visible text, by default with every link's href inlined, so a bare link to the brand's site counts as a mention. */
const textOf = (html: string, hrefs = true) => foldText(stripTags(hrefs ? html.replace(HREF, (_, href: string) => ` ${href} `) : html));
const ratio = (a: number, b: number) => Math.round((a / b) * 100) / 100;

/**
 * Entries starting at each <tag>: up to its closing tag (`closed`) or, for headings, up to the next heading of that
 * level (the card or section under it). A split, not a lazy <li>…</li> match: closing tags are optional and that would
 * scan to the end once per entry.
 */
const segments = (html: string, tag: string, closed: boolean) =>
  html.split(new RegExp(`<${tag}\\b`, "i")).slice(1).map((e) => `<${tag}${closed ? e.split(new RegExp(`</${tag}>`, "i"))[0] : e}`);

/** Name, aliases and own domains as whole words, case/diacritic-insensitive ("PSAI" does not match "kopsaid"); null when there is nothing to look for. */
function brandRegex(brand: PresenceBrand): RegExp | null {
  const needles = [...new Set([brand.name, ...brand.aliases, ...brand.domains.map(normalizeDomain)].map((s) => foldText(s).trim()).filter(Boolean))];
  if (!needles.length) return null;
  const alt = needles.sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "gu");
}

/** Brand presence in a page's HTML: plain string matching, no model call. */
export function detectBrandPresence(html: string, brand: PresenceBrand): Presence {
  const re = brandRegex(brand);
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  const text = textOf(body);
  if (!re || text.length < MIN_TEXT_CHARS) return UNKNOWN;
  const hits = [...text.matchAll(re)];
  if (!hits.length) return { ...UNKNOWN, brandPresent: false };
  const linked = [...body.matchAll(HREF)].some(([, href]) => /^(?:https?:)?\/\//i.test(href) && domainMatches(href, brand.domains));
  // directories and rankings are lists, cards under headings or bare links: the entry index says more than the character offset
  // a section under a heading also holds the opening tag of the next card (often a link wrapping it), so there only text counts
  const headings = ["h2", "h3", "h4"].map((h): [string[], boolean] => [segments(body, h, false), false]).sort((a, b) => b[0].length - a[0].length);
  const kinds: [string[], boolean][] = [[segments(body, "li", true), true], [segments(body, "tr", true), true], ...headings, [segments(body, "a", true), true]];
  for (const [entries, hrefs] of kinds) {
    if (entries.length < MIN_ENTRIES) continue;
    const at = entries.flatMap((e, i) => (textOf(e, hrefs).search(re) >= 0 ? [i] : []));
    if (at.length) return { brandPresent: true, mentions: at.length, firstPositionRatio: ratio(at[0] + 1, entries.length), linked };
  }
  return { brandPresent: true, mentions: hits.length, firstPositionRatio: ratio(hits[0].index ?? 0, text.length), linked };
}

/** Off-site candidates among the cited URLs (most cited first): absolute http(s), not on the brand's own domains, at most `max`. */
export function offsiteTargets(citedUrls: string[], ownDomains: string[], max = MAX_TARGETS): string[] {
  return [...new Set(citedUrls.filter((u) => /^https?:\/\//i.test(u) && !domainMatches(u, ownDomains)))].slice(0, max);
}

/**
 * Checks a prompt's off-site candidate pages: one GET each, no retries. Results are cached per URL for the
 * checker's lifetime (one recommend run), since one directory page is often cited for several prompts.
 * Never rejects: any failure is "unknown" and generation goes on.
 */
export function targetPresenceChecker(brand: PresenceBrand, fetchImpl: typeof fetch = fetch, timeoutMs = TARGET_TIMEOUT_MS) {
  const cache = new Map<string, Promise<TargetPresence>>();
  const check = (url: string) => {
    let p = cache.get(url);
    if (!p) {
      p = getText(fetchImpl, url, timeoutMs)
        .then(({ status, body }) => (status >= 200 && status < 300 && body && !body.startsWith("%PDF") ? detectBrandPresence(body, brand) : UNKNOWN))
        .catch(() => UNKNOWN)
        .then((r) => ({ url, ...r }));
      cache.set(url, p);
    }
    return p;
  };
  return (citedUrls: string[]) => Promise.all(offsiteTargets(citedUrls, brand.domains).map(check));
}
