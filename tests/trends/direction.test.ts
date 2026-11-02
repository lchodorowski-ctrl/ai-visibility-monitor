import { describe, it, expect } from "vitest";
import type { Tables } from "@/lib/db-types";
import {
  DIRECTION_THRESHOLDS, pickBaseline, higherIsBetter, lowerIsBetter, aiSummary, aioSummary, googleSummary, overallHeadline,
  type ChannelSummary,
} from "@/lib/trends/direction";

const MINUS = "−";

const row = (p: Partial<Tables<"daily_metrics">>): Tables<"daily_metrics"> => ({
  id: "x", project_id: "proj", date: "2026-10-29", engine_id: null, prompt_id: null,
  responses_count: 10, visibility_rate: 0.42, avg_position: 2, citation_rate: 0.2, share_of_voice: 0.4,
  score: 54, computed_at: "2026-10-29T00:00:00Z", ...p,
});

const pts = (...dates: string[]) => dates.map((date) => ({ date }));

describe("DIRECTION_THRESHOLDS", () => {
  it("progi z założeń zadania", () => {
    expect(DIRECTION_THRESHOLDS).toEqual({
      scorePoints: 3, ratePoints: 0.05, clicksRelative: 0.1, clicksMinBase: 20, positionPlaces: 0.5, impressionsGrowth: 0.1,
      baselineDays: 28, staleDays: 7,
    });
  });
});

describe("pickBaseline", () => {
  it("najnowszy punkt sprzed co najmniej 28 dni", () => {
    const points = pts("2026-10-01", "2026-10-08", "2026-10-15", "2026-10-29");
    expect(pickBaseline(points, "2026-10-29")?.date).toBe("2026-10-01");
  });

  it("punkt dokładnie sprzed 28 dni wystarcza; starszy punkt przegrywa z nowszym spełniającym warunek", () => {
    const points = pts("2026-09-01", "2026-10-01", "2026-10-02", "2026-10-29");
    expect(pickBaseline(points, "2026-10-29")?.date).toBe("2026-10-01");
  });

  it("bez tak starego punktu bierze najstarszy wcześniejszy od najnowszej daty", () => {
    expect(pickBaseline(pts("2026-10-22", "2026-10-29"), "2026-10-29")?.date).toBe("2026-10-22");
    expect(pickBaseline(pts("2026-10-25", "2026-10-22", "2026-10-29"), "2026-10-29")?.date).toBe("2026-10-22");
  });

  it("jeden punkt (sam najnowszy) albo pusta lista to null", () => {
    expect(pickBaseline(pts("2026-10-29"), "2026-10-29")).toBeNull();
    expect(pickBaseline([], "2026-10-29")).toBeNull();
  });

  it("kolejność wejścia nie ma znaczenia, a punkty zachowują swoje pola", () => {
    const points = [{ date: "2026-10-29", v: 1 }, { date: "2026-10-01", v: 2 }, { date: "2026-10-15", v: 3 }, { date: "2026-10-08", v: 4 }];
    expect(pickBaseline(points, "2026-10-29")).toEqual({ date: "2026-10-01", v: 2 });
  });

  it("liczba dni jest parametrem; granica przez miesiąc i rok", () => {
    expect(pickBaseline(pts("2026-10-22", "2026-10-29"), "2026-10-29", 7)?.date).toBe("2026-10-22");
    expect(pickBaseline(pts("2025-12-31", "2026-01-15", "2026-01-28"), "2026-01-28")?.date).toBe("2025-12-31");
  });
});

describe("higherIsBetter i lowerIsBetter", () => {
  it("różnica od progu w górę to zmiana, poniżej progu to flat", () => {
    expect(higherIsBetter(54, 48, 3)).toBe("up");
    expect(higherIsBetter(49, 54, 3)).toBe("down");
    expect(higherIsBetter(52, 54, 3)).toBe("flat");
    expect(higherIsBetter(54, 54, 3)).toBe("flat");
  });

  it("różnica równa progowi już się liczy jako zmiana", () => {
    expect(higherIsBetter(57, 54, 3)).toBe("up");
    expect(higherIsBetter(51, 54, 3)).toBe("down");
  });

  it("granica progu nie zależy od błędów zmiennoprzecinkowych (0,45 - 0,40 to 0,0499...)", () => {
    expect(higherIsBetter(0.45, 0.4, 0.05)).toBe("up");
    expect(higherIsBetter(0.35, 0.4, 0.05)).toBe("down");
    expect(higherIsBetter(0.44, 0.4, 0.05)).toBe("flat");
  });

  it("lowerIsBetter: niższa wartość to lepiej (pozycja)", () => {
    expect(lowerIsBetter(9.4, 12, 0.5)).toBe("up");
    expect(lowerIsBetter(12, 9.4, 0.5)).toBe("down");
    expect(lowerIsBetter(9.4, 9.7, 0.5)).toBe("flat");
    expect(lowerIsBetter(9, 9.5, 0.5)).toBe("up");
  });

  it("brak albo nieskończona wartość to unknown", () => {
    expect(higherIsBetter(Number.NaN, 5, 1)).toBe("unknown");
    expect(lowerIsBetter(5, Number.POSITIVE_INFINITY, 1)).toBe("unknown");
  });
});

describe("aiSummary", () => {
  const series = (base: number, latest: number, baseVis = 0.34, latestVis = 0.42) => [
    row({ date: "2026-10-01", score: base, visibility_rate: baseVis }),
    row({ date: "2026-10-29", score: latest, visibility_rate: latestVis }),
  ];

  it("Score 48 → 54: w górę, „+6 pkt”, widoczność ze zmianą w pp, data bazy i link", () => {
    const s = aiSummary(series(48, 54));
    expect(s).toEqual({
      key: "ai", label: "Asystenci AI (wszystkie silniki)", direction: "up",
      headline: "Score 54, +6 pkt", detail: "widoczność 42%, +8 pp", since: "2026-10-01", href: "/app/prompts",
    });
  });

  it("Score 54 → 52: bez zmian (poniżej progu 3 pkt)", () => {
    expect(aiSummary(series(54, 52)).direction).toBe("flat");
  });

  it("Score 54 → 49: w dół, „−5 pkt” z minusem U+2212", () => {
    const s = aiSummary(series(54, 49, 0.5, 0.45));
    expect(s.direction).toBe("down");
    expect(s.headline).toBe(`Score 49, ${MINUS}5 pkt`);
    expect(s.detail).toBe(`widoczność 45%, ${MINUS}5 pp`);
  });

  it("zmiana dokładnie o 3 pkt to już kierunek", () => {
    expect(aiSummary(series(54, 57)).direction).toBe("up");
    expect(aiSummary(series(54, 51)).direction).toBe("down");
  });

  it("bez zmiany Score nagłówek mówi „bez zmian”, a nie „0 pkt”", () => {
    const s = aiSummary(series(54, 54, 0.42, 0.42));
    expect(s.headline).toBe("Score 54, bez zmian");
    expect(s.detail).toBe("widoczność 42%, bez zmian");
  });

  it("porównuje z pomiarem sprzed 28 dni, a nie z poprzednim", () => {
    const s = aiSummary([
      row({ date: "2026-10-01", score: 40 }),
      row({ date: "2026-10-15", score: 60 }),
      row({ date: "2026-10-29", score: 54 }),
    ]);
    expect(s.since).toBe("2026-10-01");
    expect(s.headline).toBe("Score 54, +14 pkt");
  });

  it("bierze tylko wiersze ogólne: bez wierszy silników i pytań", () => {
    const s = aiSummary([
      row({ date: "2026-10-01", score: 48 }),
      row({ date: "2026-10-01", score: 10, engine_id: "openai" }),
      row({ date: "2026-10-29", score: 54 }),
      row({ date: "2026-10-29", score: 99, engine_id: "gemini" }),
      row({ date: "2026-10-29", score: 1, prompt_id: "p1" }),
      row({ date: "2026-10-29", score: 2, prompt_id: "p1", engine_id: "openai" }),
    ]);
    expect(s.headline).toBe("Score 54, +6 pkt");
  });

  it("wiersz bez poprawnych odpowiedzi (responses_count 0) to brak pomiaru, nie spadek do zera", () => {
    const s = aiSummary([
      row({ date: "2026-10-01", score: 48 }),
      row({ date: "2026-10-22", score: 52 }),
      row({ date: "2026-10-29", score: 0, responses_count: 0, visibility_rate: 0 }),
    ]);
    expect(s.headline).toBe("Score 52, +4 pkt");
    expect(s.since).toBe("2026-10-01");
  });

  it("liczby z bazy mogą przyjść jako napisy", () => {
    const s = aiSummary([
      row({ date: "2026-10-01", score: "48" as unknown as number, visibility_rate: "0.34" as unknown as number, responses_count: "8" as unknown as number }),
      row({ date: "2026-10-29", score: "54" as unknown as number, visibility_rate: "0.42" as unknown as number, responses_count: "10" as unknown as number }),
    ]);
    expect(s.direction).toBe("up");
    expect(s.headline).toBe("Score 54, +6 pkt");
    expect(s.detail).toBe("widoczność 42%, +8 pp");
  });

  it("jeden pomiar: nieznany kierunek, wartości bez porównania i bez daty bazy", () => {
    const s = aiSummary([row({})]);
    expect(s.direction).toBe("unknown");
    expect(s.headline).toBe("Score 54");
    expect(s.detail).toBe("widoczność 42%, brak wcześniejszego pomiaru do porównania");
    expect(s.since).toBeNull();
    expect(s.href).toBe("/app/prompts");
  });

  it("brak pomiarów: nieznany kierunek i zachęta do pomiaru", () => {
    const s = aiSummary([]);
    expect(s).toMatchObject({ key: "ai", direction: "unknown", headline: "Brak pomiarów", since: null });
    expect(s.detail).toBe("Uruchom pomiar, żeby zobaczyć kierunek.");
  });
});

describe("aioSummary", () => {
  const aio = (base: number, latest: number, baseCit = 0.1, latestCit = 0.12) => [
    row({ date: "2026-10-01", engine_id: "google_ai_overview", visibility_rate: base, citation_rate: baseCit, score: 50 }),
    row({ date: "2026-10-29", engine_id: "google_ai_overview", visibility_rate: latest, citation_rate: latestCit, score: 20 }),
  ];

  it("widoczność 0,40 → 0,33: w dół, „−7 pp”, cytowania w opisie", () => {
    const s = aioSummary(aio(0.4, 0.33));
    expect(s).toEqual({
      key: "aio", label: "Google AI Overviews", direction: "down",
      headline: `Widoczność 33%, ${MINUS}7 pp`, detail: "cytowania 12%, +2 pp", since: "2026-10-01", href: "/app/prompts",
    });
  });

  it("kierunek z widoczności, nie ze Score: Score spada, a widoczność rośnie o 8 pp", () => {
    expect(aioSummary(aio(0.3, 0.38)).direction).toBe("up");
  });

  it("zmiana o 5 pp to już kierunek, o 4 pp to jeszcze nie", () => {
    expect(aioSummary(aio(0.4, 0.35)).direction).toBe("down");
    expect(aioSummary(aio(0.4, 0.45)).direction).toBe("up");
    expect(aioSummary(aio(0.4, 0.36)).direction).toBe("flat");
  });

  it("kierunek zgadza się z liczbą na ekranie: różnica liczy się z zaokrąglonych procentów", () => {
    // 0,406 to 41%, 0,357 to 36%: na ekranie "−5 pp", choć surowa różnica to 0,049
    const s = aioSummary(aio(0.406, 0.357, 0.1, 0.1));
    expect(s.direction).toBe("down");
    expect(s.headline).toBe(`Widoczność 36%, ${MINUS}5 pp`);
  });

  it("bierze tylko silnik google_ai_overview, wiersze ogólne i innych silników są pomijane", () => {
    const s = aioSummary([
      ...aio(0.4, 0.33),
      row({ date: "2026-10-01", visibility_rate: 0.9 }),
      row({ date: "2026-10-29", visibility_rate: 0.9 }),
      row({ date: "2026-10-29", engine_id: "openai", visibility_rate: 0.9 }),
      row({ date: "2026-10-29", engine_id: "google_ai_overview", prompt_id: "p1", visibility_rate: 0.9 }),
    ]);
    expect(s.headline).toBe(`Widoczność 33%, ${MINUS}7 pp`);
  });

  it("jeden pomiar albo brak: nieznany kierunek", () => {
    const one = aioSummary([row({ engine_id: "google_ai_overview", visibility_rate: 0.33, citation_rate: 0.12 })]);
    expect(one).toMatchObject({ direction: "unknown", headline: "Widoczność 33%", since: null });
    expect(one.detail).toBe("cytowania 12%, brak wcześniejszego pomiaru do porównania");
    expect(aioSummary([])).toMatchObject({ key: "aio", direction: "unknown", headline: "Brak pomiarów", since: null });
  });
});

describe("googleSummary", () => {
  const t = (clicks: number | null, position: number | null, impressions: number | null = 1000) => ({ clicks, impressions, position });
  const now = new Date("2026-11-02T10:00:00Z");

  it("kliknięcia 120 → 142: w górę, „+18%”, średnia pozycja ze zmianą słowami, link do Google", () => {
    const s = googleSummary(t(142, 9.4), t(120, 10.6), true);
    expect(s).toMatchObject({
      key: "google", label: "Google: wyniki wyszukiwania", direction: "up",
      headline: "142 kliknięcia, +18%", detail: "średnia pozycja 9,4 (lepiej o 1,2 poz.)", href: "/app/google",
    });
  });

  it("kliknięcia 142 → 120: w dół, „−15%” z minusem U+2212", () => {
    const s = googleSummary(t(120, 9.4), t(142, 9.4), true);
    expect(s.direction).toBe("down");
    expect(s.headline).toBe(`120 kliknięć, ${MINUS}15%`);
    expect(s.detail).toBe("średnia pozycja 9,4 (bez zmian)");
  });

  it("zmiana o równe 10% to już kierunek, 9% jeszcze nie", () => {
    expect(googleSummary(t(110, 9), t(100, 9), true).direction).toBe("up");
    expect(googleSummary(t(90, 9), t(100, 9), true).direction).toBe("down");
    expect(googleSummary(t(109, 9), t(100, 9), true).direction).toBe("flat");
  });

  it("kierunek zgadza się z procentem na ekranie (zaokrąglona zmiana)", () => {
    // 109,6 / 100 → "+10%" na ekranie, więc w górę
    expect(googleSummary(t(1096, 9), t(1000, 9), true).direction).toBe("up");
  });

  it("kliknięcia bez wyraźnej zmiany: rozstrzyga średnia pozycja", () => {
    const up = googleSummary(t(125, 9.4), t(120, 12), true);
    expect(up.direction).toBe("up");
    expect(up.headline).toBe("125 kliknięć, +4%");
    expect(googleSummary(t(125, 12.5), t(120, 9.4), true).direction).toBe("down");
    expect(googleSummary(t(125, 9.4), t(120, 9.6), true).direction).toBe("flat");
  });

  it("wyraźna zmiana kliknięć wygrywa z pozycją, która poszła w przeciwną stronę", () => {
    expect(googleSummary(t(142, 14), t(120, 9), true).direction).toBe("up");
  });

  it("za mała baza (poniżej 20 kliknięć): kliknięcia nie rozstrzygają, pozycja tak; bez procentu", () => {
    const s = googleSummary(t(9, 9.4), t(15, 12), true);
    expect(s.direction).toBe("up");
    expect(s.headline).toBe("9 kliknięć (poprzednio 15)");
    expect(s.detail).toBe("średnia pozycja 9,4 (lepiej o 2,6 poz.)");
  });

  it("za mała baza i brak pozycji: nieznany kierunek; baza 20 kliknięć już wystarcza", () => {
    expect(googleSummary(t(9, null), t(15, null), true).direction).toBe("unknown");
    expect(googleSummary(t(9, null), t(19, null), true).direction).toBe("unknown");
    expect(googleSummary(t(10, null), t(20, null), true).direction).toBe("down");
  });

  it("flat po kliknięciach i brak pozycji: flat", () => {
    expect(googleSummary(t(125, null), t(120, null), true).direction).toBe("flat");
  });

  it("zero kliknięć po spadku z dużej bazy to „−100%”", () => {
    const s = googleSummary(t(0, null), t(50, 8), true);
    expect(s.direction).toBe("down");
    expect(s.headline).toBe(`0 kliknięć, ${MINUS}100%`);
  });

  it("odmiana: 1 kliknięcie, 2-4 kliknięcia, 5 i 12 kliknięć, duże liczby ze spacją tysięcy", () => {
    const h = (n: number) => googleSummary(t(n, 9), t(n, 9), true).headline;
    expect(h(22)).toBe("22 kliknięcia, bez zmian");
    expect(h(25)).toBe("25 kliknięć, bez zmian");
    expect(h(112)).toBe("112 kliknięć, bez zmian");
    expect(h(12345)).toBe("12 345 kliknięć, bez zmian");
    expect(googleSummary(t(1, 9), t(30, 9), true).headline).toBe(`1 kliknięcie, ${MINUS}97%`);
  });

  it("opis okresu porównania: 28 dni do ostatniej daty danych wobec poprzednich 28, bez daty bazy", () => {
    const s = googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2026-10-31", now });
    expect(s.since).toBeNull();
    expect(s.period).toBe("28 dni do 31.10 wobec poprzednich 28");
  });

  it("bez poprzedniego okna opis okresu nie obiecuje porównania; bez daty ostatnich danych jest ogólny", () => {
    expect(googleSummary(t(142, 9.4), null, true, { lastDate: "2026-10-31", now }).period).toBe("28 dni do 31.10");
    expect(googleSummary(t(142, 9.4), t(120, 10.6), true).period).toBe("ostatnie 28 dni wobec poprzednich 28");
  });

  it("nieskonfigurowane Search Console: „Podłącz Search Console”, nieznany kierunek, link do Google", () => {
    const s = googleSummary(null, null, false);
    expect(s).toMatchObject({ key: "google", direction: "unknown", headline: "Podłącz Search Console", since: null, href: "/app/google" });
    expect(s.detail).toBe("Wpisz usługę w Ustawienia → Google.");
    // dane, które i tak by przyszły, nie zmieniają stanu
    expect(googleSummary(t(142, 9.4), t(120, 10), false).headline).toBe("Podłącz Search Console");
  });

  it("brak danych: „Brak danych z Search Console”", () => {
    for (const cur of [null, t(null, null, null)]) {
      const s = googleSummary(cur, t(120, 10), true);
      expect(s).toMatchObject({ direction: "unknown", headline: "Brak danych z Search Console", since: null });
      expect(s.detail).toBe("Kliknij Synchronizuj na stronie Google.");
    }
  });

  it("poprzednie okno bez danych (dziura w danych): bieżące liczby bez kierunku", () => {
    const s = googleSummary(t(142, 9.4), t(null, null, null), true);
    expect(s.direction).toBe("unknown");
    expect(s.headline).toBe("142 kliknięcia");
    expect(s.detail).toBe("średnia pozycja 9,4, brak poprzednich 28 dni do porównania");
  });

  it("za krótka historia (prev = null): kierunek nieznany, liczby bez procentu, jasny komunikat z datą pierwszych danych", () => {
    const s = googleSummary(t(142, 9.4), null, true, { lastDate: "2026-10-31", firstDate: "2026-09-21", now });
    expect(s.direction).toBe("unknown");
    expect(s.headline).toBe("142 kliknięcia");
    expect(s.detail).toBe("średnia pozycja 9,4. Za krótka historia do porównania (dane od 21.09)");
    expect(s.headline + s.detail).not.toContain("%");
  });

  it("za krótka historia bez znanej pierwszej daty i bez średniej pozycji", () => {
    expect(googleSummary(t(142, 9.4), null, true, { lastDate: "2026-10-31", now }).detail).toBe("średnia pozycja 9,4. Za krótka historia do porównania");
    expect(googleSummary(t(142, null), null, true, { lastDate: "2026-10-31", firstDate: "2026-09-21", now }).detail)
      .toBe("brak danych o średniej pozycji. Za krótka historia do porównania (dane od 21.09)");
  });

  it("brak średniej pozycji w bieżącym oknie", () => {
    expect(googleSummary(t(142, null), t(120, 10), true).detail).toBe("brak danych o średniej pozycji");
  });
});

describe("googleSummary: zaokrąglona zmiana pozycji i ruch wyświetleń", () => {
  const t = (clicks: number | null, position: number | null, impressions: number | null = 1000) => ({ clicks, impressions, position });

  it("strzałka zgadza się z tekstem: 0,48 pokazane jako „lepiej o 0,5 poz.” to już kierunek w górę", () => {
    const exact = googleSummary(t(125, 9), t(120, 9.48), true);
    expect(exact.detail).toBe("średnia pozycja 9,0 (lepiej o 0,5 poz.)");
    expect(exact.direction).toBe("up");
    // po zaokrągleniu samych pozycji (9,1 i 9,5) wyszłoby 0,4, a tekst mówi 0,5
    const rounded = googleSummary(t(125, 9.06), t(120, 9.54), true);
    expect(rounded.detail).toBe("średnia pozycja 9,1 (lepiej o 0,5 poz.)");
    expect(rounded.direction).toBe("up");
  });

  it("0,42 pokazane jako „lepiej o 0,4 poz.” to jeszcze bez zmian (po zaokrągleniu samych pozycji wyszłoby 0,5)", () => {
    const s = googleSummary(t(125, 9.04), t(120, 9.46), true);
    expect(s.detail).toContain("lepiej o 0,4 poz.");
    expect(s.direction).toBe("flat");
  });

  it("w drugą stronę: gorzej o 0,5 poz. to już spadek", () => {
    const s = googleSummary(t(125, 9.54), t(120, 9.06), true);
    expect(s.detail).toContain("gorzej o 0,5 poz.");
    expect(s.direction).toBe("down");
  });

  it("pozycja gorsza, ale wyświetleń o ponad 10% więcej (mała baza kliknięć): bez zmian zamiast spadku", () => {
    const s = googleSummary(t(9, 12, 1150), t(15, 9.4, 1000), true);
    expect(s.detail).toBe("średnia pozycja 12,0 (gorzej o 2,6 poz.)");
    expect(s.direction).toBe("flat");
  });

  it("to samo, gdy kliknięcia są bez wyraźnej zmiany i rozstrzyga pozycja", () => {
    expect(googleSummary(t(125, 12.5, 1200), t(120, 9.4, 1000), true).direction).toBe("flat");
  });

  it("wzrost wyświetleń o równe 10% albo mniej nie łagodzi spadku; spadek wyświetleń tym bardziej", () => {
    expect(googleSummary(t(9, 12, 1100), t(15, 9.4, 1000), true).direction).toBe("down");
    expect(googleSummary(t(9, 12, 900), t(15, 9.4, 1000), true).direction).toBe("down");
    expect(googleSummary(t(9, 12, 1101), t(15, 9.4, 1000), true).direction).toBe("flat");
  });

  it("brak wyświetleń w poprzednim oknie (null albo 0) nie zmienia werdyktu", () => {
    expect(googleSummary(t(9, 12, 1150), t(15, 9.4, null), true).direction).toBe("down");
    expect(googleSummary(t(9, 12, 1150), t(15, 9.4, 0), true).direction).toBe("down");
  });

  it("wyraźny spadek kliknięć wygrywa i nie jest łagodzony wzrostem wyświetleń", () => {
    expect(googleSummary(t(100, 12, 2000), t(150, 9, 1000), true).direction).toBe("down");
  });

  it("poprawa pozycji zostaje w górę niezależnie od wyświetleń", () => {
    expect(googleSummary(t(9, 9.4, 1150), t(15, 12, 1000), true).direction).toBe("up");
  });
});

describe("googleSummary: nieaktualne dane", () => {
  const t = (clicks: number | null, position: number | null, impressions: number | null = 1000) => ({ clicks, impressions, position });
  const now = new Date("2026-11-02T10:00:00Z");

  it("ostatnie dane starsze niż 7 dni: nieznany kierunek, komunikat o nieaktualnych danych z datą", () => {
    const s = googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2026-10-25", now });
    expect(s).toMatchObject({
      key: "google", direction: "unknown", headline: "Dane z Search Console są nieaktualne", since: null, href: "/app/google",
      detail: "ostatnie dane: 25.10. Sprawdź synchronizację na stronie Google.",
    });
  });

  it("dokładnie 7 dni to jeszcze świeże dane; 8 dni to już nieaktualne", () => {
    expect(googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2026-10-26", now }).direction).toBe("up");
    expect(googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2026-10-25", now }).direction).toBe("unknown");
  });

  it("dzień liczy się w UTC, niezależnie od godziny", () => {
    expect(googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2026-10-26", now: new Date("2026-11-02T23:59:59Z") }).direction).toBe("up");
    expect(googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2026-10-26", now: new Date("2026-11-03T00:00:00Z") }).direction).toBe("unknown");
  });

  it("bez wstrzykniętego czasu używa bieżącego: dane sprzed lat są nieaktualne", () => {
    expect(googleSummary(t(142, 9.4), t(120, 10.6), true, { lastDate: "2020-01-01" }).headline).toBe("Dane z Search Console są nieaktualne");
  });

  it("nieaktualność nie przesłania stanów „Podłącz” i „Brak danych”", () => {
    expect(googleSummary(null, null, false, { lastDate: "2026-01-01", now }).headline).toBe("Podłącz Search Console");
    expect(googleSummary(null, null, true, { lastDate: "2026-01-01", now }).headline).toBe("Brak danych z Search Console");
  });
});

describe("overallHeadline", () => {
  const s = (key: ChannelSummary["key"], direction: ChannelSummary["direction"]): ChannelSummary =>
    ({ key, label: key, direction, headline: "", detail: "", since: null, href: "/" });

  it("wszystkie w górę", () => {
    expect(overallHeadline([s("ai", "up"), s("aio", "up"), s("google", "up")])).toBe("Idziemy w górę we wszystkich kanałach");
  });

  it("wszystkie w dół", () => {
    expect(overallHeadline([s("ai", "down"), s("aio", "down"), s("google", "down")])).toBe("Spadamy we wszystkich kanałach");
  });

  it("mieszane: grupy z krótkimi etykietami, puste grupy pomijane", () => {
    expect(overallHeadline([s("ai", "up"), s("aio", "down"), s("google", "flat")])).toBe("W górę: AI. W dół: AI Overviews. Bez zmian: Google.");
    expect(overallHeadline([s("ai", "up"), s("aio", "down"), s("google", "up")])).toBe("W górę: AI, Google. W dół: AI Overviews.");
    expect(overallHeadline([s("ai", "flat"), s("aio", "flat"), s("google", "up")])).toBe("W górę: Google. Bez zmian: AI, AI Overviews.");
  });

  it("wszystkie bez zmian to też grupa, nie „wszędzie w górę”", () => {
    expect(overallHeadline([s("ai", "flat"), s("aio", "flat"), s("google", "flat")])).toBe("Bez zmian: AI, AI Overviews, Google.");
  });

  it("kanał bez danych nie jest liczony do kierunku, ale nie znika ze zdania", () => {
    expect(overallHeadline([s("ai", "up"), s("aio", "up"), s("google", "unknown")])).toBe("W górę: AI, AI Overviews. Brak danych: Google.");
    expect(overallHeadline([s("ai", "up"), s("aio", "down"), s("google", "unknown")])).toBe("W górę: AI. W dół: AI Overviews. Brak danych: Google.");
  });

  it("żaden kanał nie ma znanego kierunku: za mało danych", () => {
    const text = "Za mało danych, żeby ocenić kierunek. Potrzebne są co najmniej dwa pomiary.";
    expect(overallHeadline([s("ai", "unknown"), s("aio", "unknown"), s("google", "unknown")])).toBe(text);
    expect(overallHeadline([])).toBe(text);
  });

  it("zdania nie zawierają półpauz ani pauz", () => {
    const all = overallHeadline([s("ai", "up"), s("aio", "down"), s("google", "unknown")]);
    expect(all).not.toMatch(/[\u2013\u2014]/);
  });
});
