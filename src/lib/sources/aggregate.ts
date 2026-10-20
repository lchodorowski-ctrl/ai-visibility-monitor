/** Cited domains across all of a project's prompts, counted per answer, for the Sources page. */
import { domainMatches, normalizeDomain } from "@/lib/engines/domain";
import { domainFromTitle, isRedirectHost } from "./redirect";

export const TOP_SOURCES = 20;

/** One `citations` row with the response it belongs to. */
export interface SourceCitation {
  domain: string;
  title: string | null;
  isOwn: boolean;
  competitorId: string | null;
  responseId: string;
  promptId: string;
  engineId: string;
}

export interface SourcePrompt { id: string; text: string; responses: number }
export interface SourceEngine { id: string; responses: number }

export interface SourceRow {
  domain: string;
  rank: number;
  /** Answers citing the domain; several links in one answer count once. */
  responses: number;
  prompts: SourcePrompt[];
  engines: SourceEngine[];
  isOwn: boolean;
  /** Competitor name when the domain belongs to one. */
  competitor: string | null;
}

export interface SourcesView {
  top: SourceRow[];
  rest: SourceRow[];
  /** Highest `responses`, for scaling bars. */
  max: number;
  domains: number;
  /** Answers with at least one counted citation. */
  responses: number;
  own: SourceRow | null;
}

export interface SourcesContext {
  prompts: ReadonlyMap<string, string>;
  competitors: { id: string; name: string; domains: string[] }[];
  ownDomains: string[];
}

/** Real source domain of a citation: normalized, a redirect host replaced by the domain in its title, "" when unknown. */
export function sourceDomain(c: Pick<SourceCitation, "domain" | "title">): string {
  const d = normalizeDomain(c.domain);
  if (!d) return "";
  return isRedirectHost(d) ? domainFromTitle(c.title) : d;
}

interface Acc { responses: Set<string>; prompts: Map<string, Set<string>>; engines: Map<string, Set<string>>; isOwn: boolean; competitorId: string | null }

const add = (m: Map<string, Set<string>>, key: string, responseId: string) => {
  const s = m.get(key) ?? new Set<string>();
  s.add(responseId);
  m.set(key, s);
};

/** Most answers first, ties by `tie` (prompt text, engine id). */
const counted = <T extends { responses: number }>(items: T[], tie: (x: T) => string) =>
  items.sort((a, b) => b.responses - a.responses || tie(a).localeCompare(tie(b)));

/**
 * Domains ranked by the number of answers citing them (then by prompts, then alphabetically). The flags come from the
 * row and, for rows saved before a domain was configured or with a resolved redirect host, from the project's domains.
 * The top `topN` are shown first; the brand's own domain is pinned there even when ranked lower.
 */
export function aggregateSources(rows: SourceCitation[], ctx: SourcesContext, topN = TOP_SOURCES): SourcesView {
  const acc = new Map<string, Acc>();
  const answered = new Set<string>();
  for (const r of rows) {
    const domain = sourceDomain(r);
    if (!domain) continue;
    answered.add(r.responseId);
    const a = acc.get(domain) ?? { responses: new Set(), prompts: new Map(), engines: new Map(), isOwn: false, competitorId: null };
    a.responses.add(r.responseId);
    add(a.prompts, r.promptId, r.responseId);
    add(a.engines, r.engineId, r.responseId);
    a.isOwn ||= r.isOwn;
    a.competitorId ??= r.competitorId;
    acc.set(domain, a);
  }

  const names = new Map(ctx.competitors.map((c) => [c.id, c.name]));
  const ranked: SourceRow[] = [...acc]
    .map(([domain, a]) => {
      const isOwn = a.isOwn || domainMatches(domain, ctx.ownDomains);
      const competitor = isOwn ? null
        : (a.competitorId && names.get(a.competitorId)) || ctx.competitors.find((c) => domainMatches(domain, c.domains))?.name || null;
      return {
        domain, rank: 0, responses: a.responses.size, isOwn, competitor,
        prompts: counted([...a.prompts].map(([id, s]) => ({ id, text: ctx.prompts.get(id) ?? "", responses: s.size })), (p) => p.text),
        engines: counted([...a.engines].map(([id, s]) => ({ id, responses: s.size })), (e) => e.id),
      };
    })
    .sort((a, b) => b.responses - a.responses || b.prompts.length - a.prompts.length || a.domain.localeCompare(b.domain))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const pinned = (r: SourceRow) => r.rank <= topN || r.isOwn;
  return {
    top: ranked.filter(pinned),
    rest: ranked.filter((r) => !pinned(r)),
    max: ranked[0]?.responses ?? 0,
    domains: ranked.length,
    responses: answered.size,
    own: ranked.find((r) => r.isOwn) ?? null,
  };
}
