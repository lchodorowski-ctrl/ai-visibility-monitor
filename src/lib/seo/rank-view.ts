import { fmtNumber } from "@/lib/format/number";
import type { SerpFeatures } from "./rank-parse";
import type { RankView } from "./rank-queries";

/*
 * Pure rules for showing a Google position: the wording of a reading, the week-to-week change, the SERP badges and the
 * two signals ("blisko top 3", "rankuje inna strona niż docelowa") that need no data beyond the row itself.
 */

const OUTSIDE_TOP = "poza top 100";
const UP = "↑";
const DOWN = "↓";

/** "52", or "poza top 100" when the domain was not found in the checked depth. */
export const positionText = (p: number | null): string => (p === null ? OUTSIDE_TOP : fmtNumber(p));

export interface RankChange {
  kind: "up" | "down" | "same" | "new" | "lost" | "none";
  /** Places gained or lost; 0 unless `kind` is "up" or "down". */
  places: number;
}

/**
 * Change against the previous finished check. Without one (`prevWeekStart` null) there is nothing to compare, whatever
 * `prevPosition` holds. A lower number is better, so a drop of the number is "up". A position that appears or
 * disappears has no number of places: "new" (was outside the top 100) and "lost" (is outside it now).
 */
export function rankChange(r: Pick<RankView, "position" | "prevPosition" | "prevWeekStart">): RankChange {
  if (r.prevWeekStart === null) return { kind: "none", places: 0 };
  const { position: cur, prevPosition: prev } = r;
  if (cur === null && prev === null) return { kind: "same", places: 0 };
  if (cur === null) return { kind: "lost", places: 0 };
  if (prev === null) return { kind: "new", places: 0 };
  if (cur === prev) return { kind: "same", places: 0 };
  return cur < prev ? { kind: "up", places: prev - cur } : { kind: "down", places: cur - prev };
}

export function rankChangeText(c: RankChange): string {
  switch (c.kind) {
    case "up": return `${UP} ${fmtNumber(c.places)}`;
    case "down": return `${DOWN} ${fmtNumber(c.places)}`;
    case "same": return "bez zmian";
    case "new": return "nowa w top 100";
    case "lost": return "wypadła z top 100";
    case "none": return "";
  }
}

/** Badges of the SERP features worth a glance, in a fixed order. Citing us counts only inside an AI Overview. */
export function featureBadges(f: SerpFeatures): string[] {
  const badges: string[] = [];
  if (f.aiOverview) badges.push(f.aiOverviewCitesUs ? "AI Overview: cytuje Was" : "AI Overview: bez Was");
  if (f.featuredSnippet) badges.push(f.featuredSnippetOurs ? "Fragment wyróżniony: Wasz" : "Fragment wyróżniony");
  if (f.localPack) badges.push("Mapa z firmami");
  if (f.peopleAlsoAsk) badges.push("Pytania (PAA)");
  if (f.knowledgePanelOurs) badges.push("Panel wiedzy: Wasz");
  return badges;
}

const NEAR_TOP3_FROM = 4;
const NEAR_TOP3_TO = 20;
const NEAR_TOP3_MIN_VOLUME = 30;

/** Position 4-20 for a phrase people actually search (monthly volume of at least 30): worth a push to the top 3. */
export const nearTop3 = (position: number | null, volume: number | null): boolean =>
  position !== null && position >= NEAR_TOP3_FROM && position <= NEAR_TOP3_TO && volume !== null && volume >= NEAR_TOP3_MIN_VOLUME;

/** Path of an address without the query, the fragment and the trailing "/" (so "/szkolenia/" and "/szkolenia" agree); null when it is no address. */
function comparablePath(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  return decoded(path).replace(/\/+$/, "");
}

/** Percent-escapes read as text ("%C5%82" is "ł"), so an address and a path typed by hand are compared alike. */
function decoded(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Another page of the site ranks than the one meant for the phrase. Needs both the ranking address and the target path;
 * Google sometimes hides the address behind a redirect (url null), and then nothing can be said.
 */
export function rankedElsewhere(url: string | null, targetPath: string | null): boolean {
  if (url === null || targetPath === null) return false;
  const ranking = comparablePath(url);
  if (ranking === null) return false;
  return ranking !== decoded(targetPath).replace(/\/+$/, "");
}
