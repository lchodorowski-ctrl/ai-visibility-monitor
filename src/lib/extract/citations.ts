import type { Citation } from "@/lib/engines/types";
import { domainMatches } from "@/lib/engines/domain";

export interface ClassifiedCitation extends Citation {
  isOwn: boolean;
  competitorId?: string;
}

export function classifyCitations(
  citations: Citation[],
  ownDomains: string[],
  competitors: { id: string; domains: string[] }[],
): ClassifiedCitation[] {
  return citations.map((c) => {
    const isOwn = domainMatches(c.domain, ownDomains);
    const comp = isOwn ? undefined : competitors.find((k) => domainMatches(c.domain, k.domains));
    return comp ? { ...c, isOwn, competitorId: comp.id } : { ...c, isOwn };
  });
}
