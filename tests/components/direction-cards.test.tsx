import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Tables } from "@/lib/db-types";
import type { ChannelSummary } from "@/lib/trends/direction";

const m = vi.hoisted(() => ({ getDirectionRows: vi.fn() }));
const q = vi.hoisted(() => ({ getGscLastDate: vi.fn(), getGscTotals: vi.fn() }));
vi.mock("@/lib/metrics/queries", () => m);
vi.mock("@/lib/seo/queries", () => q);

import { DirectionCards, DirectionSection } from "@/app/app/overview/direction";

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

const summary = (p: Partial<ChannelSummary> & Pick<ChannelSummary, "key" | "direction">): ChannelSummary => ({
  label: "Kanał", headline: "Nagłówek", detail: "Opis", since: null, href: "/app", ...p,
});

const up = summary({
  key: "ai", direction: "up", label: "Asystenci AI (wszystkie silniki)", headline: "Score 54, +6 pkt",
  detail: "widoczność 42%, +8 pp", since: "2026-10-01", href: "/app/prompts",
});
const down = summary({
  key: "aio", direction: "down", label: "Google AI Overviews", headline: "Widoczność 33%, −7 pp",
  detail: "cytowania 12%, +2 pp", since: "2026-10-15", href: "/app/prompts",
});
const unknown = summary({
  key: "google", direction: "unknown", label: "Google: wyniki wyszukiwania", headline: "Podłącz Search Console",
  detail: "Wpisz usługę w Ustawienia → Google.", href: "/app/google",
});
const flat = summary({ key: "google", direction: "flat", label: "Google: wyniki wyszukiwania", headline: "125 kliknięć, +4%", detail: "średnia pozycja 9,4", href: "/app/google" });

describe("DirectionCards", () => {
  const html = render(<DirectionCards summaries={[up, down, unknown]} headline="W górę: AI. W dół: AI Overviews." />);

  it("zdanie o kierunku jest nagłówkiem sekcji", () => {
    expect(html).toMatch(/<h2[^>]*>W górę: AI\. W dół: AI Overviews\.<\/h2>/);
  });

  it("trzy kafle: etykieta, liczby, opis", () => {
    for (const text of [
      "Asystenci AI (wszystkie silniki)", "Score 54, +6 pkt", "widoczność 42%, +8 pp",
      "Google AI Overviews", "Widoczność 33%, −7 pp", "cytowania 12%, +2 pp",
      "Google: wyniki wyszukiwania", "Podłącz Search Console",
    ]) expect(html).toContain(text);
    expect(html.match(/<a /g)).toHaveLength(3);
  });

  it("strzałki ↑ ↓ z tekstem dla czytników ekranu; sama strzałka jest ukryta przed czytnikiem", () => {
    expect(html).toMatch(/aria-hidden="true"[^>]*>↑</);
    expect(html).toMatch(/aria-hidden="true"[^>]*>↓</);
    expect(html).toMatch(/<span class="sr-only">w górę<\/span>/);
    expect(html).toMatch(/<span class="sr-only">w dół<\/span>/);
    expect(html).toMatch(/<span class="sr-only">brak danych<\/span>/);
  });

  it("bez zmian: strzałka → i tekst „bez zmian”", () => {
    const h = render(<DirectionCards summaries={[flat]} headline="x" />);
    expect(h).toMatch(/aria-hidden="true"[^>]*>→</);
    expect(h).toMatch(/<span class="sr-only">bez zmian<\/span>/);
  });

  it("kolor: teal w górę, red w dół, t2 dla braku danych i bez zmian", () => {
    const arrow = (dir: ChannelSummary) => render(<DirectionCards summaries={[dir]} headline="x" />).match(/<span aria-hidden="true" class="([^"]*)"/)?.[1] ?? "";
    expect(arrow(up)).toContain("text-teal");
    expect(arrow(down)).toContain("text-red");
    expect(arrow(unknown)).toContain("text-t2");
    expect(arrow(flat)).toContain("text-t2");
    expect(arrow(up)).not.toContain("text-red");
    expect(arrow(down)).not.toContain("text-teal");
  });

  it("cały kafel jest linkiem do szczegółów", () => {
    expect(html).toMatch(/<a [^>]*href="\/app\/prompts"/);
    expect(html).toMatch(/<a [^>]*href="\/app\/google"/);
    // link kafla zawiera etykietę, tekst o kierunku i liczby: nazwa dostępna dla czytnika to cała treść
    const first = html.split("<a ")[1];
    expect(first).toContain("Asystenci AI (wszystkie silniki)");
    expect(first).toContain("w górę");
    expect(first).toContain("Score 54, +6 pkt");
  });

  it("data bazy jako „od DD.MM” tylko, gdy jest since", () => {
    expect(html).toContain("od 01.10");
    expect(html).toContain("od 15.10");
    expect(html.match(/od \d\d\.\d\d/g)).toHaveLength(2);
  });

  it("opis okresu porównania zastępuje datę bazy, gdy jej nie ma", () => {
    const h = render(<DirectionCards summaries={[{ ...flat, period: "ostatnie 28 dni wobec poprzednich 28" }]} headline="x" />);
    expect(h).toContain("ostatnie 28 dni wobec poprzednich 28");
    expect(h).not.toMatch(/od \d\d\.\d\d/);
  });

  it("żadnej półpauzy ani pauzy w treści kafli", () => {
    expect(html).not.toMatch(/[\u2013\u2014]/);
  });
});

const metricRow = (p: Partial<Tables<"daily_metrics">>): Tables<"daily_metrics"> => ({
  id: "x", project_id: "p", date: "2026-10-29", engine_id: null, prompt_id: null,
  responses_count: 10, visibility_rate: 0.42, avg_position: 2, citation_rate: 0.2, share_of_voice: 0.4,
  score: 54, computed_at: "2026-10-29T00:00:00Z", ...p,
});

const rows = [
  metricRow({ date: "2026-10-01", score: 48, visibility_rate: 0.34 }),
  metricRow({ date: "2026-10-29", score: 54, visibility_rate: 0.42 }),
  metricRow({ date: "2026-10-01", engine_id: "google_ai_overview", visibility_rate: 0.4, citation_rate: 0.1 }),
  metricRow({ date: "2026-10-29", engine_id: "google_ai_overview", visibility_rate: 0.33, citation_rate: 0.12 }),
];

describe("DirectionSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getDirectionRows.mockResolvedValue(rows);
    q.getGscLastDate.mockResolvedValue("2026-10-31");
    q.getGscTotals.mockImplementation(async (_p: string, from: string) =>
      from === "2026-10-04" ? { clicks: 142, impressions: 4200, position: 9.4 } : { clicks: 120, impressions: 4000, position: 10.6 });
  });
  afterEach(() => vi.restoreAllMocks());

  it("zbiera trzy podsumowania i zdanie o kierunku; okna Search Console z ostatniej daty danych", async () => {
    const html = render(await DirectionSection({ projectId: "p", gscProperty: "sc-domain:polskaszkola.ai" }));
    expect(m.getDirectionRows).toHaveBeenCalledWith("p");
    expect(q.getGscLastDate).toHaveBeenCalledWith("p");
    expect(q.getGscTotals).toHaveBeenCalledWith("p", "2026-10-04", "2026-10-31");
    expect(q.getGscTotals).toHaveBeenCalledWith("p", "2026-09-06", "2026-10-03");
    expect(html).toContain("Score 54, +6 pkt");
    expect(html).toContain(`Widoczność 33%, −7 pp`);
    expect(html).toContain("142 kliknięcia, +18%");
    expect(html).toContain("średnia pozycja 9,4 (lepiej o 1,2 poz.)");
    expect(html).toContain("W górę: AI, Google. W dół: AI Overviews.");
    expect(html).toContain('href="/app/prompts"');
    expect(html).toContain('href="/app/google"');
  });

  it("bez usługi Search Console nie pyta o dane Google i podpowiada podłączenie", async () => {
    for (const gscProperty of [null, "", "   "]) {
      vi.clearAllMocks();
      m.getDirectionRows.mockResolvedValue(rows);
      const html = render(await DirectionSection({ projectId: "p", gscProperty }));
      expect(q.getGscLastDate).not.toHaveBeenCalled();
      expect(q.getGscTotals).not.toHaveBeenCalled();
      expect(html).toContain("Podłącz Search Console");
      expect(html).toContain("W górę: AI. W dół: AI Overviews. Brak danych: Google.");
    }
  });

  it("usługa wpisana, ale jeszcze bez żadnej synchronizacji: „Brak danych z Search Console”", async () => {
    q.getGscLastDate.mockResolvedValue(null);
    const html = render(await DirectionSection({ projectId: "p", gscProperty: "sc-domain:polskaszkola.ai" }));
    expect(q.getGscTotals).not.toHaveBeenCalled();
    expect(html).toContain("Brak danych z Search Console");
  });

  it("błąd odczytu z Search Console nie psuje przeglądu: kafel Google pokazuje brak danych, reszta działa", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    q.getGscLastDate.mockRejectedValue(new Error("Nie udało się pobrać ostatniej daty z Search Console: boom"));
    const html = render(await DirectionSection({ projectId: "p", gscProperty: "sc-domain:polskaszkola.ai" }));
    expect(html).toContain("Brak danych z Search Console");
    expect(html).toContain("Score 54, +6 pkt");
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0][0])).toContain("boom");
  });

  it("bez żadnych pomiarów AI zdanie mówi o braku danych", async () => {
    m.getDirectionRows.mockResolvedValue([]);
    q.getGscLastDate.mockResolvedValue(null);
    const html = render(await DirectionSection({ projectId: "p", gscProperty: null }));
    expect(html).toContain("Za mało danych, żeby ocenić kierunek. Potrzebne są co najmniej dwa pomiary.");
    expect(html.match(/<span class="sr-only">brak danych<\/span>/g)).toHaveLength(3);
  });
});
