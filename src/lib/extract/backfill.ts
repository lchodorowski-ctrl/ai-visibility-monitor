import { extractMentions, type BrandDef } from "./brands";
import { classifyCitations } from "./citations";

/** Wiersz tabeli `mentions` zapisany przy pomiarze. */
export interface StoredMention {
  id: string;
  brand_kind: string;
  brand_name: string;
  competitor_id: string | null;
  position: number;
  char_index: number;
}

export interface MentionInsert {
  kind: "competitor";
  name: string;
  competitorId: string;
  position: number;
  charIndex: number;
}

/** Zapisany wiersz, którego pozycja różni się od rankingu wszystkich marek (po dopisaniu konkurentów). */
export interface PositionFix {
  id: string;
  kind: "own" | "competitor";
  from: number;
  to: number;
}

export interface MentionBackfill {
  inserts: MentionInsert[];
  positionFixes: PositionFix[];
}

/**
 * Wyznacza wzmianki konkurentów, których brakuje w zapisanej odpowiedzi, tą samą ekstrakcją co pomiar.
 * Zapisanych wierszy nie usuwa ani nie dopisuje własnej marki (nawet gdy dzisiejsze aliasy ją znajdują).
 * Pozycja to kolejność wszystkich marek w tekście, więc nowe wiersze dostają miejsce w rankingu zapisanych
 * wierszy i dopisanych konkurentów (po char_index), czyli to, co zapisałby run z dzisiejszą listą konkurentów.
 * Zapisane wiersze, których pozycja przez to się zdezaktualizowała, trafiają do positionFixes: to wywołujący
 * decyduje, czy je przepisać (pozycja własnej marki wpływa na avg_position w daily_metrics).
 */
export function planMentionBackfill(
  response: { text: string; noAnswer: boolean; stored: StoredMention[] },
  brands: BrandDef[],
): MentionBackfill {
  // jak processResponse: odpowiedź bez treści merytorycznej nie ma wzmianek
  if (response.noAnswer) return { inserts: [], positionFixes: [] };
  const { stored } = response;
  const haveIds = new Set(stored.map((m) => m.competitor_id).filter((id): id is string => id != null));
  // competitor_id zeruje się po usunięciu konkurenta (on delete set null), więc rozpoznajemy też po nazwie
  const haveNames = new Set(stored.filter((m) => m.brand_kind === "competitor").map((m) => m.brand_name));
  const missing = extractMentions(response.text, brands).filter(
    (m) => m.kind === "competitor" && m.competitorId != null && !haveIds.has(m.competitorId) && !haveNames.has(m.name),
  );

  // remisy jak w extractMentions: własna marka pierwsza; między zapisanymi wierszami zostaje ich kolejność
  const ranked = [
    ...stored.map((s) => ({ charIndex: s.char_index, own: s.brand_kind === "own", stored: s, insert: null })),
    ...missing.map((m) => ({ charIndex: m.charIndex, own: false, stored: null, insert: m })),
  ].sort((a, b) => a.charIndex - b.charIndex || Number(b.own) - Number(a.own)
    || (a.stored?.position ?? Infinity) - (b.stored?.position ?? Infinity));

  // positionFixes liczymy także wtedy, gdy nic nie brakuje: po samym --apply drugi przebieg z --renumber
  // musi jeszcze zobaczyć nieaktualną pozycję własnej marki
  const plan: MentionBackfill = { inserts: [], positionFixes: [] };
  ranked.forEach((r, i) => {
    const position = i + 1;
    if (r.insert) {
      plan.inserts.push({ kind: "competitor", name: r.insert.name, competitorId: r.insert.competitorId!, position, charIndex: r.insert.charIndex });
    } else if (r.stored && r.stored.position !== position) {
      plan.positionFixes.push({ id: r.stored.id, kind: r.own ? "own" : "competitor", from: r.stored.position, to: position });
    }
  });
  return plan;
}

/** competitor_id cytowania według dzisiejszej klasyfikacji; cytowanie własnej domeny nigdy nie należy do konkurenta. */
export function competitorForCitation(
  citation: { url: string; domain: string; is_own: boolean },
  ownDomains: string[],
  competitors: { id: string; domains: string[] }[],
): string | null {
  if (citation.is_own) return null;
  const [c] = classifyCitations([{ url: citation.url, domain: citation.domain }], ownDomains, competitors);
  return c.competitorId ?? null;
}
