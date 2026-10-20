/** Evidence (jsonb) of a recommendation shaped for the detail page; validated defensively, works for legacy rows too. */
import { domainMatches, isRedirectHost, normalizeDomain } from "@/lib/engines/domain";

export const TOP_ROWS = 10;

export interface CountRow { label: string; count: number; rank: number; isTarget: boolean; isOwn: boolean }
export interface CountsView { top: CountRow[]; rest: CountRow[]; max: number; total: number; sum: number }

const record = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** `[{ <key>: string, count }]` → rows, duplicates folded (max count), most frequent first, ties by label. */
function countRows(raw: unknown, key: "domain" | "name"): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of Array.isArray(raw) ? raw : []) {
    const r = record(x);
    const label = typeof r?.[key] === "string" ? (r[key] as string).trim() : "";
    if (!label) continue;
    m.set(label, Math.max(m.get(label) ?? 0, Number(r?.count) || 0));
  }
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Top rows plus the rest; flagged rows ranked below the top are pinned into it so they never hide behind "show more". */
function split(rows: Omit<CountRow, "rank">[]): CountsView {
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const pinned = (r: CountRow) => r.rank <= TOP_ROWS || r.isTarget || r.isOwn;
  return {
    top: ranked.filter(pinned),
    rest: ranked.filter((r) => !pinned(r)),
    max: ranked[0]?.count ?? 0,
    total: ranked.length,
    sum: ranked.reduce((s, r) => s + r.count, 0),
  };
}

/** Host of an absolute target URL ("https://aiprzewodnik.pl/x" → "aiprzewodnik.pl"); a site path has none. */
export function targetHost(targetUrl: string | null): string | null {
  const t = targetUrl?.trim() ?? "";
  if (!/^https?:\/\//i.test(t)) return null;
  return normalizeDomain(t) || null;
}

/** Cited domains without engine redirect hosts, with the recommendation's target and the brand's own domains flagged. */
export function viewDomains(raw: unknown, opts: { targetUrl: string | null; ownDomains: string[] }): CountsView {
  const host = targetHost(opts.targetUrl);
  return split(countRows(raw, "domain")
    .filter((d) => !isRedirectHost(d.label))
    .map((d) => ({ ...d, isTarget: host != null && domainMatches(d.label, [host]), isOwn: domainMatches(d.label, opts.ownDomains) })));
}

export function viewCompetitors(raw: unknown): CountsView {
  return split(countRows(raw, "name").map((c) => ({ ...c, isTarget: false, isOwn: false })));
}

/**
 * Legacy quotes were `"[engine] " + 300 chars`, so one of exactly that length was cut at the end. The window
 * opened 400 chars before a competitor name, so a lowercase start means it was also cut mid-answer, often mid-word.
 */
const LEGACY_QUOTE_CHARS = 300;
const STARTS_MID_TEXT = /^[a-ząćęłńóśźż]/;

export interface QuoteView { engineId: string | null; responseId: string | null; text: string }

export function viewQuotes(raw: unknown): QuoteView[] {
  const out: QuoteView[] = [];
  for (const q of Array.isArray(raw) ? raw : []) {
    if (typeof q === "string") {
      const m = /^\[([a-z_]+)\] ?([\s\S]*)$/.exec(q);
      let body = m ? m[2] : q;
      // only the "[engine] …" format was written by the old slicing code; a window that opened
      // between words starts with whitespace, one that opened inside a word with its lowercase tail
      const cutEnd = m != null && body.length >= LEGACY_QUOTE_CHARS;
      const midWord = m != null && STARTS_MID_TEXT.test(body);
      const cutStart = midWord || (m != null && /^\s/.test(body));
      if (cutEnd) body = body.replace(/\s*\S*$/, "");
      if (midWord) body = body.replace(/^\S*\s+/, "");
      const text = plainExcerpt(body);
      if (text) out.push({ engineId: m?.[1] ?? null, responseId: null, text: `${cutStart ? "…" : ""}${text}${cutEnd ? "…" : ""}` });
      continue;
    }
    const r = record(q);
    const text = plainExcerpt(typeof r?.text === "string" ? r.text : "");
    if (!text) continue;
    out.push({
      engineId: typeof r?.engine_id === "string" ? r.engine_id : null,
      responseId: typeof r?.response_id === "string" ? r.response_id : null,
      text,
    });
  }
  return out;
}

/** Source marker for a cited URL: `[aiprzewodnik.pl]`, nothing for redirect hosts or junk. */
function sourceMarker(url: string): string {
  const d = normalizeDomain(url);
  return d && !isRedirectHost(d) ? ` [${d}]` : "";
}

/**
 * Markdown answer fragment → one line of plain text. Citation links (`[[1]](url)`, `[1](url)`) become the
 * cited domain in brackets, because which source an engine cites is the evidence; other links keep their text.
 */
export function plainExcerpt(md: string): string {
  return md
    .replace(/\[\[?\d+\]?\]\((https?:\/\/[^)\s]*)\)?/g, (_, url: string) => sourceMarker(url))
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]*)\)/g, "$1")
    .replace(/\[\[?\d+\]?\]/g, "")
    // table cells become words; newlines stay so line-start list markers are still found below
    .replace(/[ \t]*\|[ \t]*/g, " ")
    // headings and rules (also table separators) show up mid-line once an answer was flattened ("… --- ### 1. …")
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/(^|\s)(?::?-{3,}:?|\*{3,}|_{3,})(?=\s|$)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

export interface Segment { text: string; hit: boolean }

/** Splits text into plain and highlighted runs for every case-insensitive occurrence of a term (longest term wins on overlap). */
export function highlight(text: string, terms: string[]): Segment[] {
  const needles = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3))].sort((a, b) => b.length - a.length);
  if (needles.length === 0) return text ? [{ text, hit: false }] : [];
  const lower = text.toLowerCase();
  // offsets in `lower` must match `text`; true for Polish, not for every script ("İ")
  if (lower.length !== text.length) return [{ text, hit: false }];
  const out: Segment[] = [];
  let i = 0, plainFrom = 0;
  while (i < text.length) {
    const n = needles.find((x) => lower.startsWith(x, i));
    if (!n) { i++; continue; }
    if (i > plainFrom) out.push({ text: text.slice(plainFrom, i), hit: false });
    out.push({ text: text.slice(i, i + n.length), hit: true });
    i += n.length;
    plainFrom = i;
  }
  if (plainFrom < text.length) out.push({ text: text.slice(plainFrom), hit: false });
  return out;
}
