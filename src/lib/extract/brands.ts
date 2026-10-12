import { foldText, escapeRegex } from "./normalize";

export interface BrandDef {
  kind: "own" | "competitor";
  name: string;
  aliases: string[];
  competitorId?: string;
}

export interface Mention {
  kind: "own" | "competitor";
  name: string;
  competitorId?: string;
  position: number;
  charIndex: number;
}

function firstIndex(folded: string, alias: string): number {
  const a = foldText(alias).trim();
  if (!a) return -1;
  // granice: początek/koniec lub znak, który nie jest literą ani cyfrą (unicode)
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escapeRegex(a)})(?=$|[^\\p{L}\\p{N}])`, "u");
  const m = re.exec(folded);
  if (!m) return -1;
  return m.index + m[0].length - m[1].length;
}

export function extractMentions(text: string, brands: BrandDef[]): Mention[] {
  if (!text) return [];
  const folded = foldText(text);
  const found: Omit<Mention, "position">[] = [];
  for (const b of brands) {
    const aliases = [b.name, ...b.aliases];
    let best = -1;
    for (const alias of aliases) {
      const i = firstIndex(folded, alias);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) found.push({ kind: b.kind, name: b.name, competitorId: b.competitorId, charIndex: best });
  }
  found.sort((x, y) => x.charIndex - y.charIndex);
  return found.map((f, i) => ({ ...f, position: i + 1 }));
}
