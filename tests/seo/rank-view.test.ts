import { describe, it, expect } from "vitest";
import {
  positionText, rankChange, rankChangeText, featureBadges, nearTop3, rankedElsewhere,
} from "@/lib/seo/rank-view";
import type { SerpFeatures } from "@/lib/seo/rank-parse";

const NO_DASHES = /[\u2013\u2014]/;
const features = (over: Partial<SerpFeatures> = {}): SerpFeatures => ({
  aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false,
  localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false, ...over,
});

describe("positionText", () => {
  it("pozycja jako liczba, a brak pozycji to „poza top 100”", () => {
    expect(positionText(52)).toBe("52");
    expect(positionText(1)).toBe("1");
    expect(positionText(null)).toBe("poza top 100");
  });
});

describe("rankChange", () => {
  it("niższa liczba to awans (up), wyższa to spadek (down), ta sama to same", () => {
    expect(rankChange({ position: 49, prevPosition: 52, prevWeekStart: "2026-10-26" })).toEqual({ kind: "up", places: 3 });
    expect(rankChange({ position: 54, prevPosition: 52, prevWeekStart: "2026-10-26" })).toEqual({ kind: "down", places: 2 });
    expect(rankChange({ position: 52, prevPosition: 52, prevWeekStart: "2026-10-26" })).toEqual({ kind: "same", places: 0 });
  });

  it("bez poprzedniego pomiaru (prevWeekStart null) nie ma zmiany, także gdy prevPosition jest liczbą", () => {
    expect(rankChange({ position: 49, prevPosition: null, prevWeekStart: null })).toEqual({ kind: "none", places: 0 });
    expect(rankChange({ position: null, prevPosition: null, prevWeekStart: null })).toEqual({ kind: "none", places: 0 });
    expect(rankChange({ position: 49, prevPosition: 52, prevWeekStart: null })).toEqual({ kind: "none", places: 0 });
  });

  it("było poza top 100, a teraz jest liczba: nowa w top 100 (new); odwrotnie: wypadła (lost)", () => {
    expect(rankChange({ position: 37, prevPosition: null, prevWeekStart: "2026-10-26" })).toEqual({ kind: "new", places: 0 });
    expect(rankChange({ position: null, prevPosition: 37, prevWeekStart: "2026-10-26" })).toEqual({ kind: "lost", places: 0 });
  });

  it("poza top 100 w obu tygodniach to bez zmian", () => {
    expect(rankChange({ position: null, prevPosition: null, prevWeekStart: "2026-10-26" })).toEqual({ kind: "same", places: 0 });
  });
});

describe("rankChangeText", () => {
  it("strzałka i liczba miejsc, bez zmian, nowa, wypadła, a brak poprzedniego pomiaru to pusty tekst", () => {
    expect(rankChangeText({ kind: "up", places: 3 })).toBe("↑ 3");
    expect(rankChangeText({ kind: "down", places: 2 })).toBe("↓ 2");
    expect(rankChangeText({ kind: "same", places: 0 })).toBe("bez zmian");
    expect(rankChangeText({ kind: "new", places: 0 })).toBe("nowa w top 100");
    expect(rankChangeText({ kind: "lost", places: 0 })).toBe("wypadła z top 100");
    expect(rankChangeText({ kind: "none", places: 0 })).toBe("");
  });

  it("żaden tekst nie ma myślnika (en ani em dash)", () => {
    for (const kind of ["up", "down", "same", "new", "lost", "none"] as const) {
      expect(rankChangeText({ kind, places: 4 })).not.toMatch(NO_DASHES);
    }
  });
});

describe("featureBadges", () => {
  it("bez cech SERP nie ma odznak", () => {
    expect(featureBadges(features())).toEqual([]);
  });

  it("AI Overview: cytuje Was albo bez Was", () => {
    expect(featureBadges(features({ aiOverview: true, aiOverviewCitesUs: true }))).toEqual(["AI Overview: cytuje Was"]);
    expect(featureBadges(features({ aiOverview: true }))).toEqual(["AI Overview: bez Was"]);
  });

  it("cytowanie bez samego AI Overview nie daje odznaki (flaga cytowania znaczy coś tylko z AI Overview)", () => {
    expect(featureBadges(features({ aiOverviewCitesUs: true }))).toEqual([]);
  });

  it("fragment wyróżniony: Wasz albo bez dopisku", () => {
    expect(featureBadges(features({ featuredSnippet: true, featuredSnippetOurs: true }))).toEqual(["Fragment wyróżniony: Wasz"]);
    expect(featureBadges(features({ featuredSnippet: true }))).toEqual(["Fragment wyróżniony"]);
  });

  it("wszystkie odznaki w ustalonej kolejności", () => {
    const all = features({
      aiOverview: true, aiOverviewCitesUs: false, featuredSnippet: true, featuredSnippetOurs: true,
      localPack: true, peopleAlsoAsk: true, knowledgePanelOurs: true,
    });
    expect(featureBadges(all)).toEqual([
      "AI Overview: bez Was", "Fragment wyróżniony: Wasz", "Mapa z firmami", "Pytania (PAA)", "Panel wiedzy: Wasz",
    ]);
  });

  it("panel wiedzy tylko gdy Wasz, a mapa i pytania osobno", () => {
    expect(featureBadges(features({ localPack: true }))).toEqual(["Mapa z firmami"]);
    expect(featureBadges(features({ peopleAlsoAsk: true }))).toEqual(["Pytania (PAA)"]);
    expect(featureBadges(features({ knowledgePanelOurs: true }))).toEqual(["Panel wiedzy: Wasz"]);
  });
});

describe("nearTop3", () => {
  it("pozycje 4-20 z wolumenem co najmniej 30", () => {
    expect(nearTop3(4, 30)).toBe(true);
    expect(nearTop3(20, 30)).toBe(true);
    expect(nearTop3(12, 1900)).toBe(true);
  });

  it("poza zakresem pozycji: top 3, 21 i dalej, brak pozycji", () => {
    expect(nearTop3(3, 1000)).toBe(false);
    expect(nearTop3(1, 1000)).toBe(false);
    expect(nearTop3(21, 1000)).toBe(false);
    expect(nearTop3(null, 1000)).toBe(false);
  });

  it("wolumen poniżej 30 albo nieznany nie wystarcza", () => {
    expect(nearTop3(10, 29)).toBe(false);
    expect(nearTop3(10, null)).toBe(false);
  });
});

describe("rankedElsewhere", () => {
  it("ścieżka adresu różna od docelowej: rankuje inna strona", () => {
    expect(rankedElsewhere("https://polskaszkola.ai/blog/ai", "/szkolenia")).toBe(true);
  });

  it("ta sama ścieżka (także z końcowym ukośnikiem po jednej ze stron) to ta sama strona", () => {
    expect(rankedElsewhere("https://polskaszkola.ai/szkolenia.html", "/szkolenia.html/")).toBe(false);
    expect(rankedElsewhere("https://polskaszkola.ai/szkolenia/", "/szkolenia")).toBe(false);
    expect(rankedElsewhere("https://polskaszkola.ai/szkolenia", "/szkolenia")).toBe(false);
  });

  it("zapytanie i fragment adresu nie zmieniają ścieżki", () => {
    expect(rankedElsewhere("https://polskaszkola.ai/szkolenia?utm=x#cena", "/szkolenia")).toBe(false);
  });

  it("strona główna: adres bez ścieżki to „/”", () => {
    expect(rankedElsewhere("https://polskaszkola.ai", "/")).toBe(false);
    expect(rankedElsewhere("https://polskaszkola.ai/", "/")).toBe(false);
    expect(rankedElsewhere("https://polskaszkola.ai/kontakt", "/")).toBe(true);
  });

  it("nieznany adres (przekierowanie Google) albo brak docelowej strony: nie ma czego porównać", () => {
    expect(rankedElsewhere(null, "/szkolenia")).toBe(false);
    expect(rankedElsewhere("https://polskaszkola.ai/blog", null)).toBe(false);
    expect(rankedElsewhere(null, null)).toBe(false);
  });

  it("adres, którego nie da się rozebrać, nie jest dowodem na inną stronę", () => {
    expect(rankedElsewhere("to nie jest adres", "/szkolenia")).toBe(false);
  });

  it("polskie znaki w ścieżce: zapis z procentami w adresie to ta sama strona co wpisana ręcznie", () => {
    expect(rankedElsewhere("https://polskaszkola.ai/szkolenia-wroc%C5%82aw", "/szkolenia-wrocław")).toBe(false);
    expect(rankedElsewhere("https://polskaszkola.ai/szkolenia-warszawa", "/szkolenia-wrocław")).toBe(true);
  });
});
