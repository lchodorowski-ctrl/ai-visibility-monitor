import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Opportunity, QueryWindow, PageMetrics, QueryPage } from "@/lib/seo/opportunities";

const q = vi.hoisted(() => ({
  getGscTotals: vi.fn(), getGscSeries: vi.fn(), getQueryWindows: vi.fn(), getTopPages: vi.fn(), getQueryPages: vi.fn(), getSeoStatus: vi.fn(),
}));
const GscTrendChart = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/lib/seo/queries", () => q);
vi.mock("@/components/GscTrendChart", () => ({ GscTrendChart }));
vi.mock("@/app/app/google/actions", () => ({ syncGscNow: vi.fn() }));

import {
  OpportunityList, StatusSection, GscStatsSection, GscTrendSection, OpportunitiesSection, TopQueriesSection, TopPagesSection,
} from "@/app/app/google/sections";

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

const metrics = (clicks: number, impressions: number, position: number | null) => ({ clicks, impressions, position });
const window_ = (query: string, cur: ReturnType<typeof metrics>, prev = metrics(0, 0, null)): QueryWindow => ({ query, cur, prev });

describe("OpportunityList", () => {
  const items: Opportunity[] = [
    { kind: "striking", query: "kurs ai wrocław", clicks: 3, impressions: 120, position: 7.2, ctr: 0.025, potentialClicks: 25.4 },
    { kind: "low_ctr", page: "/artykuly/chatgpt-w-pracy", clicks: 12, impressions: 400, position: 2, ctr: 0.03, potentialClicks: 48 },
    {
      kind: "cannibal", query: "szkolenia z ai", impressions: 320, potentialClicks: 31,
      pages: [{ page: "/szkolenia", impressions: 200, position: 5.1 }, { page: "/blog/szkolenia-ai", impressions: 120, position: 8.4 }],
    },
    { kind: "new", query: "nowa fraza o agentach", clicks: 6, impressions: 15, position: 9, ctr: 0.4, potentialClicks: 6 },
    { kind: "lost", query: "utracona fraza o promptach", clicks: 9, impressions: 40, position: 6, ctr: 0.225, potentialClicks: 9 },
  ];

  it("pokazuje frazę albo stronę i „+N kliknięć/28 dni” dla szans każdego rodzaju", () => {
    const html = render(<OpportunityList items={items} />);
    expect(html).toContain("kurs ai wrocław");
    expect(html).toContain("/artykuly/chatgpt-w-pracy");
    expect(html).toContain("szkolenia z ai");
    expect(html).toContain("nowa fraza o agentach");
    expect(html).toContain("utracona fraza o promptach");
    expect(html).toContain("+25 kliknięć/28 dni");
    expect(html).toContain("+48 kliknięć/28 dni");
    expect(html).toContain("+31 kliknięć/28 dni");
    expect(html).toContain("+6 kliknięć/28 dni");
    expect(html).toContain("\u22129 kliknięć/28 dni"); // utracona: minus U+2212
  });

  it("pokazuje pozycję i wyświetlenia; pozycja z polskim przecinkiem", () => {
    const html = render(<OpportunityList items={items.slice(0, 1)} />);
    expect(html).toContain("pozycja 7,2");
    expect(html).toContain("wyświetlenia 120");
  });

  it("kanibalizacja: liczba to „wyświetlenia frazy”, a konkurujące strony mają wyświetlenia i pozycje", () => {
    const html = render(<OpportunityList items={items.slice(2, 3)} />);
    expect(html).toContain("wyświetlenia frazy 320");
    // każda konkurująca strona w osobnych liniach: ścieżka, potem wyświetlenia i pozycja
    expect(html).toContain(">/szkolenia<");
    expect(html).toContain(">wyświetlenia 200 · pozycja 5,1<");
    expect(html).toContain(">/blog/szkolenia-ai<");
    expect(html).toContain(">wyświetlenia 120 · pozycja 8,4<");
  });

  it("żaden tekst nie jest łamany w środku słowa (bez break-all)", () => {
    expect(render(<OpportunityList items={items} />)).not.toContain("break-all");
  });

  it("nowe i utracone frazy mają oznaczenie rodzaju", () => {
    const html = render(<OpportunityList items={items.slice(3)} />);
    expect(html).toContain("nowa</span>");
    expect(html).toContain("utracona</span>");
  });

  it("utracona fraza: liczby z poprzedniego okna są tak opisane, a potencjał ma minus; nowa ma plus i bez dopisku", () => {
    const lost = render(<OpportunityList items={items.slice(4)} />);
    expect(lost).toContain("pozycja 6,0 · wyświetlenia 40 (poprzednio)");
    expect(lost).toContain("\u22129 kliknięć/28 dni");
    expect(lost).not.toContain("+9 kliknięć");
    const added = render(<OpportunityList items={items.slice(3, 4)} />);
    expect(added).toContain("+6 kliknięć/28 dni");
    expect(added).not.toContain("(poprzednio)");
    expect(added).not.toContain("\u2212");
  });

  it("odmienia „kliknięcie” i nie pokazuje „+0”", () => {
    const one = (potentialClicks: number): Opportunity => ({ kind: "striking", query: "q", clicks: 0, impressions: 100, position: 8, ctr: 0, potentialClicks });
    expect(render(<OpportunityList items={[one(1.2)]} />)).toContain("+1 kliknięcie/28 dni");
    expect(render(<OpportunityList items={[one(3)]} />)).toContain("+3 kliknięcia/28 dni");
    expect(render(<OpportunityList items={[one(0.3)]} />)).toContain("+1 kliknięcie/28 dni");
  });

  it("pusta lista pokazuje „Brak szans w tej grupie”", () => {
    const html = render(<OpportunityList items={[]} />);
    expect(html).toContain("Brak szans w tej grupie");
  });
});

// the button's class list contains "disabled:" variants, so look for the attribute itself
const syncDisabled = (html: string) => /<button[^>]*\sdisabled=""[^>]*>Synchronizuj<\/button>/.test(html);

describe("StatusSection", () => {
  const props = { projectId: "p", gscProperty: "sc-domain:polskaszkola.ai", lastDate: "2026-10-31", seoBudget: 10, aiBudget: 20 };
  const status = (lastSync: Record<string, unknown> | null, seoSpent = 0.5, aiSpent = 12.3) => q.getSeoStatus.mockResolvedValue({ lastSync, seoSpent, aiSpent });
  beforeEach(() => vi.clearAllMocks());

  it("pokazuje ostatnią synchronizację, wydatki SEO i AI oraz przycisk „Synchronizuj”", async () => {
    status({ status: "done", error: null, started_at: "2026-11-02T04:30:00Z", finished_at: "2026-11-02T04:31:00Z" });
    const html = render(await StatusSection(props));
    expect(html).toContain("Ostatnia synchronizacja");
    expect(html).toContain("zakończona");
    expect(html).toContain("Wydatki w tym miesiącu: SEO 0.50 / 10.00 USD, AI 12.30 / 20.00 USD");
    expect(html).toContain("Synchronizuj");
    expect(html).toContain("31.10.2026");
    expect(q.getSeoStatus).toHaveBeenCalledWith("p");
  });

  it("nieudana synchronizacja pokazuje treść błędu", async () => {
    status({ status: "failed", error: "Brak dostępu do usługi (403)", started_at: "2026-11-02T04:30:00Z", finished_at: null });
    const html = render(await StatusSection(props));
    expect(html).toContain("nieudana");
    expect(html).toContain("Brak dostępu do usługi (403)");
  });

  it("bez synchronizacji pokazuje notkę, a bez usługi przycisk jest wyłączony", async () => {
    status(null, 0, 0);
    const html = render(await StatusSection({ ...props, gscProperty: null, lastDate: null }));
    expect(html).toContain("Jeszcze nie było żadnej synchronizacji.");
    expect(syncDisabled(html)).toBe(true);
  });

  it("usługa złożona z samych spacji też wyłącza przycisk; wpisana usługa go włącza", async () => {
    status(null, 0, 0);
    const blank = render(await StatusSection({ ...props, gscProperty: "   " }));
    expect(syncDisabled(blank)).toBe(true);
    expect(syncDisabled(render(await StatusSection(props)))).toBe(false);
  });
});

describe("GscStatsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cztery kafle z wartościami i zmianą wobec poprzednich 28 dni", async () => {
    q.getGscTotals.mockImplementation(async (_p: string, from: string) =>
      from === "2026-10-04" ? { clicks: 142, impressions: 4200, position: 9.4 } : { clicks: 120, impressions: 4000, position: 11 });
    const html = render(await GscStatsSection({ projectId: "p", lastDate: "2026-10-31" }));
    expect(q.getGscTotals).toHaveBeenCalledWith("p", "2026-10-04", "2026-10-31");
    expect(q.getGscTotals).toHaveBeenCalledWith("p", "2026-09-06", "2026-10-03");
    for (const label of ["Kliknięcia", "Wyświetlenia", "CTR", "Średnia pozycja"]) expect(html).toContain(label);
    expect(html).toContain(">142<");
    expect(html).toContain(">4200<");
    expect(html).toContain(">3,4<"); // 142 / 4200 = 3,38%
    expect(html).toContain(">9,4<");
    expect(html).toContain("28 dni · +18% wobec poprzednich 28");
    expect(html).toContain("28 dni · +5% wobec poprzednich 28");
    // pozycja: bezwzględna zmiana słowami (niższa liczba = lepiej), nie procent
    expect(html).toContain("28 dni · lepiej o 1,6 poz."); // 11 → 9,4
    expect(html).not.toContain("wobec poprzednich 28\"><"); // bez dopisku procentowego przy pozycji
    expect(html.match(/wobec poprzednich 28/g)).toHaveLength(3);
  });

  const positions = async (cur: number | null, prev: number | null) => {
    q.getGscTotals.mockImplementation(async (_p: string, from: string) => ({ clicks: 10, impressions: 100, position: from === "2026-10-04" ? cur : prev }));
    return render(await GscStatsSection({ projectId: "p", lastDate: "2026-10-31" }));
  };

  it("średnia pozycja: „lepiej o”, gdy liczba spadła, „gorzej o”, gdy wzrosła, z przecinkiem dziesiętnym", async () => {
    expect(await positions(9.4, 9.7)).toContain("28 dni · lepiej o 0,3 poz.");
    expect(await positions(9.7, 9.4)).toContain("28 dni · gorzej o 0,3 poz.");
    expect(await positions(20.2, 8)).toContain("28 dni · gorzej o 12,2 poz.");
  });

  it("średnia pozycja: „bez zmian” poniżej 0,05; od 0,05 już zmiana", async () => {
    expect(await positions(9.4, 9.42)).toContain("28 dni · bez zmian");
    expect(await positions(9.42, 9.4)).toContain("28 dni · bez zmian");
    expect(await positions(9.4, 9.5)).toContain("28 dni · lepiej o 0,1 poz.");
  });

  it("średnia pozycja bez poprzedniej wartości: tylko „28 dni”", async () => {
    const html = await positions(9.4, null);
    expect(html).toContain(">28 dni<");
    expect(html).not.toMatch(/poz\./);
  });

  it("bez poprzedniego okna i bez danych: kreski i komunikat o braku porównania", async () => {
    q.getGscTotals.mockResolvedValue({ clicks: null, impressions: null, position: null });
    const html = render(await GscStatsSection({ projectId: "p", lastDate: "2026-10-31" }));
    expect(html.match(/>brak</g)).toHaveLength(4);
    expect(html).toContain("28 dni · brak danych do porównania");
  });
});

describe("GscTrendSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("przekazuje do wykresu serię z uzupełnionymi dniami bez wiersza", async () => {
    q.getGscSeries.mockResolvedValue([
      { date: "2026-10-01", clicks: 3, impressions: 30, position: 5 },
      { date: "2026-10-03", clicks: 2, impressions: 20, position: 6 },
    ]);
    render(await GscTrendSection({ projectId: "p" }));
    expect(q.getGscSeries).toHaveBeenCalledWith("p", 90);
    const data = (GscTrendChart.mock.calls[0] as unknown as [{ data: { date: string; clicks: number }[] }])[0].data;
    expect(data.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(data[1].clicks).toBe(0);
  });
});

describe("OpportunitiesSection", () => {
  beforeEach(() => vi.clearAllMocks());

  const windows: QueryWindow[] = [
    window_("fraza blisko top 3", metrics(1, 200, 8)),
    window_("fraza nowa", metrics(6, 15, 9)),
    window_("fraza utracona", metrics(0, 0, null), metrics(9, 40, 6)),
  ];
  const pages: PageMetrics[] = [{ page: "/strona-z-niskim-ctr", clicks: 4, impressions: 400, position: 2 }];
  const queryPages: QueryPage[] = [
    { query: "fraza kanibalizowana", page: "/a", clicks: 0, impressions: 60, position: 5 },
    { query: "fraza kanibalizowana", page: "/b", clicks: 0, impressions: 40, position: 7 },
  ];

  function arrange(w = windows) {
    q.getQueryWindows.mockResolvedValue(w);
    q.getTopPages.mockResolvedValue(pages);
    q.getQueryPages.mockResolvedValue(queryPages);
  }

  it("cztery grupy z szansami liczonymi z okna bieżącego i poprzedniego", async () => {
    arrange();
    const html = render(await OpportunitiesSection({ projectId: "p", lastDate: "2026-10-31" }));
    for (const heading of ["Blisko top 3", "Niski CTR", "Kanibalizacja", "Nowe i utracone frazy"]) expect(html).toContain(heading);
    expect(html).toContain("fraza blisko top 3");
    expect(html).toContain("+21 kliknięć/28 dni"); // 200 * (0,11 - 0,005)
    expect(html).toContain("/strona-z-niskim-ctr");
    expect(html).toContain("+56 kliknięć/28 dni"); // 400 * (0,15 - 0,01)
    expect(html).toContain("fraza kanibalizowana");
    expect(html).toContain("+28 kliknięć/28 dni"); // 100 * 0,28
    expect(html).toContain("fraza nowa");
    expect(html).toContain("fraza utracona");
    expect(q.getQueryWindows).toHaveBeenCalledWith("p", { cur: { from: "2026-10-04", to: "2026-10-31" }, prev: { from: "2026-09-06", to: "2026-10-03" } }, 500);
    expect(q.getQueryPages).toHaveBeenCalledWith("p", "2026-10-04", "2026-10-31");
  });

  it("ukrywa szanse bez potencjału i pokazuje najwyżej pięć na grupę", async () => {
    const before = metrics(5, 100, 9); // fraza istniała w poprzednim oknie: nie jest „nowa” ani „utracona”
    const many = Array.from({ length: 8 }, (_, i) => window_(`fraza ${i}`, metrics(0, 100 + i * 10, 15), before));
    const zero = window_("fraza zerowa", metrics(30, 100, 15), before); // CTR 0,3 > CTR top 3, brak potencjału
    arrange([...many, zero]);
    q.getTopPages.mockResolvedValue([]);
    q.getQueryPages.mockResolvedValue([]);
    const html = render(await OpportunitiesSection({ projectId: "p", lastDate: "2026-10-31" }));
    expect(html).not.toContain("fraza zerowa");
    expect(html.match(/fraza \d/g)).toHaveLength(5);
    expect(html).toContain("fraza 7"); // największy potencjał
    expect(html).not.toContain("fraza 2");
    expect(html).toContain("Brak szans w tej grupie");
  });
});

describe("TopQueriesSection i TopPagesSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("top frazy po kliknięciach z notką o ukrytych rzadkich frazach", async () => {
    q.getQueryWindows.mockResolvedValue([
      window_("mało klików", metrics(2, 500, 4)),
      window_("dużo klików", metrics(40, 900, 3)),
      window_("tylko poprzednio", metrics(0, 0, null), metrics(5, 80, 5)),
    ]);
    const html = render(await TopQueriesSection({ projectId: "p", lastDate: "2026-10-31" }));
    expect(html.indexOf("dużo klików")).toBeGreaterThan(-1);
    expect(html.indexOf("dużo klików")).toBeLessThan(html.indexOf("mało klików"));
    expect(html).not.toContain("tylko poprzednio");
    expect(html).toContain("Suma kliknięć fraz jest niższa niż stron: Google ukrywa rzadkie frazy.");
  });

  it("top strony: dziesięć najlepszych z pozycją i wyświetleniami", async () => {
    q.getTopPages.mockResolvedValue(Array.from({ length: 12 }, (_, i) => ({ page: `/strona-${i}`, clicks: 100 - i, impressions: i === 0 ? 12345 : 1000, position: 4.25 })));
    const html = render(await TopPagesSection({ projectId: "p", lastDate: "2026-10-31" }));
    expect(html).toContain("/strona-0");
    expect(html).toContain("/strona-9");
    expect(html).not.toContain("/strona-10");
    expect(html).toContain("pozycja 4,3");
    expect(html).toContain("wyświetlenia 12 345"); // zwykła spacja, nie twarda
    expect(html).not.toContain("\u00a0");
  });

  it("stan pusty bez danych", async () => {
    q.getQueryWindows.mockResolvedValue([]);
    q.getTopPages.mockResolvedValue([]);
    expect(render(await TopQueriesSection({ projectId: "p", lastDate: "2026-10-31" }))).toContain("Brak fraz w tym okresie");
    expect(render(await TopPagesSection({ projectId: "p", lastDate: "2026-10-31" }))).toContain("Brak stron w tym okresie");
  });
});
