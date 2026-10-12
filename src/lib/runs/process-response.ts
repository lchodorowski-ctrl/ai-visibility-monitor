import type { EngineId, EngineResult } from "@/lib/engines/types";
import { extractMentions, type BrandDef, type Mention } from "@/lib/extract/brands";
import { classifyCitations, type ClassifiedCitation } from "@/lib/extract/citations";
import { analyzeSentiment, type SentimentResult } from "@/lib/extract/sentiment";
import type { ResponseFacts } from "@/lib/metrics/aggregate";

export interface ProjectBrand { brandName: string; aliases: string[]; domains: string[] }
export interface CompetitorBrand { id: string; name: string; aliases: string[]; domains: string[] }

export interface ProcessedResponse {
  facts: ResponseFacts;
  mentions: Mention[];
  citations: ClassifiedCitation[];
  sentiment: SentimentResult | null;
}

export async function processResponse(
  input: { promptId: string; engineId: EngineId; result: EngineResult; project: ProjectBrand; competitors: CompetitorBrand[] },
  deps: { sentiment?: typeof analyzeSentiment } = {},
): Promise<ProcessedResponse> {
  const { promptId, engineId, result, project, competitors } = input;
  const brands: BrandDef[] = [
    { kind: "own", name: project.brandName, aliases: project.aliases },
    ...competitors.map((c) => ({ kind: "competitor" as const, name: c.name, aliases: c.aliases, competitorId: c.id })),
  ];
  const mentions = result.noAnswer ? [] : extractMentions(result.text, brands);
  const citations = classifyCitations(result.citations, project.domains, competitors);
  const own = mentions.find((m) => m.kind === "own");
  const sentimentFn = deps.sentiment ?? analyzeSentiment;
  const sentiment = own ? await sentimentFn(result.text, project.brandName, project.aliases) : null;
  return {
    facts: {
      promptId, engineId,
      noAnswer: Boolean(result.noAnswer), error: false,
      ownMentioned: Boolean(own), ownPosition: own?.position ?? null,
      ownCited: citations.some((c) => c.isOwn),
      brandsMentioned: mentions.length,
    },
    mentions, citations, sentiment,
  };
}
