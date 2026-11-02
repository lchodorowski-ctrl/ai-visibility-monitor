import { describe, it, expect } from "vitest";
import {
  THRESHOLDS,
  DEFAULT_CTR,
  ctrCurve,
  expectedCtr,
  strikingDistance,
  lowCtr,
  cannibalization,
  newAndLost,
  type Metrics,
  type QueryWindow,
  type PageMetrics,
  type QueryPage,
} from "@/lib/seo/opportunities";

const m = (clicks: number, impressions: number, position: number | null): Metrics => ({ clicks, impressions, position });
const empty = m(0, 0, null);
const win = (query: string, cur: Metrics, prev: Metrics = empty): QueryWindow => ({ query, cur, prev });
const qp = (query: string, page: string, clicks: number, impressions: number, position: number | null = 5): QueryPage => ({
  query,
  page,
  clicks,
  impressions,
  position,
});

describe("stałe", () => {
  it("progi i krzywa domyślna mają wartości z planu", () => {
    expect(THRESHOLDS).toEqual({
      strikingMin: 4,
      strikingMax: 20,
      strikingMinImpressions: 50,
      lowCtrRatio: 0.5,
      lowCtrMinImpressions: 100,
      cannibalShare: 0.2,
      cannibalMinImpressions: 30,
      newLostMinImpressions: 10,
      curveMinImpressions: 200,
    });
    expect([...DEFAULT_CTR]).toEqual([0.28, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02]);
  });
});

describe("expectedCtr", () => {
  it("bierze pozycje 1-10 z krzywej domyślnej po zaokrągleniu", () => {
    expect(expectedCtr(1)).toBe(0.28);
    expect(expectedCtr(3.4)).toBe(0.11);
    expect(expectedCtr(3.6)).toBe(0.08);
    expect(expectedCtr(10)).toBe(0.02);
  });
  it("podnosi pozycje poniżej 1 do 1", () => {
    expect(expectedCtr(0.2)).toBe(0.28);
  });
  it("daje 0.01 dla pozycji 11-20 i 0.005 dalej", () => {
    expect(expectedCtr(10.6)).toBe(0.01);
    expect(expectedCtr(11)).toBe(0.01);
    expect(expectedCtr(20)).toBe(0.01);
    expect(expectedCtr(20.4)).toBe(0.01);
    expect(expectedCtr(20.6)).toBe(0.005);
    expect(expectedCtr(40)).toBe(0.005);
  });
  it("używa podanej krzywej dla pozycji 1-10, ale nie dla dalszych", () => {
    const curve = [0.4, 0.2, 0.1, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02];
    expect(expectedCtr(1.2, curve)).toBe(0.4);
    expect(expectedCtr(2, curve)).toBe(0.2);
    expect(expectedCtr(15, curve)).toBe(0.01);
  });
});

describe("ctrCurve", () => {
  it("przy małych danych zwraca krzywą domyślną", () => {
    expect(ctrCurve([])).toEqual([...DEFAULT_CTR]);
    expect(ctrCurve([m(60, 150, 1)])).toEqual([...DEFAULT_CTR]);
  });
  it("przy 250 wyświetleniach na pozycji 1 i 100 kliknięciach daje własny CTR 0.4", () => {
    const curve = ctrCurve([m(100, 250, 1)]);
    expect(curve).toHaveLength(10);
    expect(curve[0]).toBe(0.4);
    expect(curve.slice(1)).toEqual([...DEFAULT_CTR].slice(1));
  });
  it("sumuje wiersze z tej samej zaokrąglonej pozycji i ma próg 200 wyświetleń włącznie", () => {
    expect(ctrCurve([m(40, 120, 2.2), m(40, 80, 1.6)])[1]).toBe(0.4);
    expect(ctrCurve([m(40, 120, 2.2), m(39, 79, 1.6)])[1]).toBe(DEFAULT_CTR[1]);
  });
  it("pomija pozycje null i spoza 1-10", () => {
    const curve = ctrCurve([m(0, 500, null), m(100, 500, 11), m(100, 500, 10.6)]);
    expect(curve).toEqual([...DEFAULT_CTR]);
  });
  it("wlicza pozycję poniżej 1 do pozycji 1, tak jak expectedCtr", () => {
    expect(ctrCurve([m(100, 250, 0.4)])[0]).toBe(0.4);
  });
  it("zwraca krzywą, którą expectedCtr wykorzystuje", () => {
    expect(expectedCtr(1, ctrCurve([m(100, 250, 1)]))).toBe(0.4);
  });
});

describe("strikingDistance", () => {
  const curve = [...DEFAULT_CTR];
  it("przepuszcza pozycję 7.2 ze 120 wyświetleniami i liczy potencjał względem pozycji 3", () => {
    const [op, ...rest] = strikingDistance([win("jak zacząć", m(3, 120, 7.2))], curve);
    expect(rest).toEqual([]);
    expect(op.kind).toBe("striking");
    expect(op).toMatchObject({ query: "jak zacząć", clicks: 3, impressions: 120, position: 7.2 });
    if (op.kind === "cannibal") throw new Error("zły rodzaj");
    expect(op.ctr).toBeCloseTo(0.025);
    expect(op.potentialClicks).toBeCloseTo(120 * (0.11 - 0.025));
  });
  it("odrzuca pozycję 3.9, pozycję 21, 40 wyświetleń i brak pozycji", () => {
    const rows = [
      win("a", m(5, 200, 3.9)),
      win("b", m(5, 200, 21)),
      win("c", m(1, 40, 7)),
      win("d", m(0, 200, null)),
    ];
    expect(strikingDistance(rows, curve)).toEqual([]);
  });
  it("ma włącznie granice 4, 20 i 50 wyświetleń", () => {
    const rows = [win("a", m(1, 50, 4)), win("b", m(1, 50, 20))];
    expect(strikingDistance(rows, curve).map((o) => o.kind === "striking" && o.query).sort()).toEqual(["a", "b"]);
  });
  it("sortuje malejąco po potencjale", () => {
    const rows = [win("mały", m(2, 60, 9)), win("duży", m(2, 900, 5)), win("średni", m(5, 300, 8))];
    const out = strikingDistance(rows, curve);
    expect(out.map((o) => o.kind === "striking" && o.query)).toEqual(["duży", "średni", "mały"]);
    expect(out[0].potentialClicks).toBeGreaterThan(out[1].potentialClicks);
    expect(out[1].potentialClicks).toBeGreaterThan(out[2].potentialClicks);
  });
  it("nie schodzi poniżej zera, gdy CTR jest wyższy od oczekiwanego na pozycji 3", () => {
    const [op] = strikingDistance([win("marka", m(60, 100, 4))], curve);
    expect(op.potentialClicks).toBe(0);
  });
  it("korzysta z podanej krzywej", () => {
    const own = [0.4, 0.3, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    const [op] = strikingDistance([win("a", m(0, 100, 6))], own);
    expect(op.potentialClicks).toBeCloseTo(20);
  });
});

describe("lowCtr", () => {
  const curve = [...DEFAULT_CTR];
  it("łapie stronę na pozycji 2 z CTR 0.03 przy 400 wyświetleniach (oczekiwane 0.15)", () => {
    const page: PageMetrics = { page: "/kurs", clicks: 12, impressions: 400, position: 2 };
    const [op, ...rest] = lowCtr([page], curve);
    expect(rest).toEqual([]);
    expect(op.kind).toBe("low_ctr");
    if (op.kind === "cannibal") throw new Error("zły rodzaj");
    expect(op).toMatchObject({ page: "/kurs", clicks: 12, impressions: 400, position: 2 });
    expect(op.query).toBeUndefined();
    expect(op.ctr).toBeCloseTo(0.03);
    expect(op.potentialClicks).toBeCloseTo(400 * (0.15 - 0.03));
  });
  it("dla okna frazy bierze bieżący okres i zwraca frazę", () => {
    const [op] = lowCtr([win("kurs ai", m(12, 400, 2), m(100, 400, 2))], curve);
    if (op.kind === "cannibal") throw new Error("zły rodzaj");
    expect(op.query).toBe("kurs ai");
    expect(op.page).toBeUndefined();
    expect(op.clicks).toBe(12);
  });
  it("odrzuca mało wyświetleń, pozycję poniżej 10, brak pozycji i CTR równy połowie oczekiwanego", () => {
    const items: PageMetrics[] = [
      { page: "/a", clicks: 0, impressions: 99, position: 2 },
      { page: "/b", clicks: 0, impressions: 400, position: 10.5 },
      { page: "/c", clicks: 0, impressions: 400, position: null },
      { page: "/d", clicks: 30, impressions: 400, position: 2 },
    ];
    expect(lowCtr(items, curve)).toEqual([]);
  });
  it("ma włącznie granice 100 wyświetleń i pozycji 10", () => {
    const items: PageMetrics[] = [
      { page: "/a", clicks: 0, impressions: 100, position: 5 },
      { page: "/b", clicks: 0, impressions: 400, position: 10 },
    ];
    expect(lowCtr(items, curve)).toHaveLength(2);
  });
  it("sortuje malejąco po potencjale", () => {
    const items: PageMetrics[] = [
      { page: "/mala", clicks: 0, impressions: 100, position: 5 },
      { page: "/duza", clicks: 0, impressions: 1000, position: 1 },
    ];
    expect(lowCtr(items, curve).map((o) => o.kind === "low_ctr" && o.page)).toEqual(["/duza", "/mala"]);
  });
});

describe("cannibalization", () => {
  it("łapie frazę z podziałem 60/40 między dwie strony", () => {
    const rows = [qp("kurs ai", "/a", 8, 60, 3), qp("kurs ai", "/b", 2, 40, 6)];
    const [op, ...rest] = cannibalization(rows);
    expect(rest).toEqual([]);
    expect(op.kind).toBe("cannibal");
    if (op.kind !== "cannibal") throw new Error("zły rodzaj");
    expect(op.query).toBe("kurs ai");
    expect(op.impressions).toBe(100);
    expect(op.pages).toEqual([
      { page: "/a", impressions: 60, position: 3 },
      { page: "/b", impressions: 40, position: 6 },
    ]);
    expect(op.potentialClicks).toBeCloseTo(100 * (0.28 - 0.1));
  });
  it("pomija frazę z podziałem 90/10", () => {
    expect(cannibalization([qp("kurs ai", "/a", 8, 90), qp("kurs ai", "/b", 1, 10)])).toEqual([]);
  });
  it("pomija frazę z jedną stroną i frazę z mniej niż 30 wyświetleniami łącznie", () => {
    const rows = [
      qp("sama", "/a", 1, 100),
      qp("mała", "/a", 0, 15),
      qp("mała", "/b", 0, 14),
    ];
    expect(cannibalization(rows)).toEqual([]);
  });
  it("ma włącznie granice 30 wyświetleń i udziału 0.2", () => {
    expect(cannibalization([qp("a", "/a", 0, 15), qp("a", "/b", 0, 15)])).toHaveLength(1);
    expect(cannibalization([qp("b", "/a", 0, 80), qp("b", "/b", 0, 20)])).toHaveLength(1);
  });
  it("wymienia tylko strony z udziałem co najmniej 0.2, a liczy łączne wyświetlenia frazy", () => {
    const rows = [qp("a", "/a", 5, 50), qp("a", "/b", 3, 40), qp("a", "/c", 0, 10)];
    const [op] = cannibalization(rows);
    if (op.kind !== "cannibal") throw new Error("zły rodzaj");
    expect(op.impressions).toBe(100);
    expect(op.pages.map((p) => p.page)).toEqual(["/a", "/b"]);
  });
  it("nie zwraca ujemnego potencjału, gdy CTR frazy przekracza oczekiwany na pozycji 1", () => {
    const [op] = cannibalization([qp("marka", "/a", 40, 50), qp("marka", "/b", 20, 50)]);
    expect(op.potentialClicks).toBe(0);
  });
  it("traktuje frazy niezależnie i sortuje malejąco po potencjale", () => {
    const rows = [
      qp("mała", "/a", 0, 20), qp("mała", "/b", 0, 20),
      qp("duża", "/a", 0, 300), qp("duża", "/b", 0, 200),
    ];
    const out = cannibalization(rows);
    expect(out.map((o) => o.kind === "cannibal" && o.query)).toEqual(["duża", "mała"]);
  });
});

describe("newAndLost", () => {
  it("oznacza frazę jako nową, gdy poprzednio nie miała wyświetleń, a teraz ma co najmniej 10", () => {
    const [op, ...rest] = newAndLost([win("nowa", m(2, 25, 8), empty)]);
    expect(rest).toEqual([]);
    expect(op.kind).toBe("new");
    if (op.kind === "cannibal") throw new Error("zły rodzaj");
    expect(op).toMatchObject({ query: "nowa", clicks: 2, impressions: 25, position: 8 });
    expect(op.ctr).toBeCloseTo(0.08);
    expect(op.potentialClicks).toBe(2);
  });
  it("oznacza frazę jako utraconą, gdy teraz nie ma wyświetleń, a poprzednio miała co najmniej 10", () => {
    const [op, ...rest] = newAndLost([win("stara", empty, m(7, 40, 5))]);
    expect(rest).toEqual([]);
    expect(op.kind).toBe("lost");
    if (op.kind === "cannibal") throw new Error("zły rodzaj");
    expect(op).toMatchObject({ query: "stara", clicks: 7, impressions: 40, position: 5 });
    expect(op.potentialClicks).toBe(7);
  });
  it("ma próg 10 wyświetleń włącznie w obu kierunkach", () => {
    const rows = [
      win("nowa 10", m(0, 10, 9), empty),
      win("nowa 9", m(0, 9, 9), empty),
      win("stara 10", empty, m(0, 10, 9)),
      win("stara 9", empty, m(0, 9, 9)),
    ];
    expect(newAndLost(rows).map((o) => [o.kind, o.kind !== "cannibal" && o.query]).sort()).toEqual([
      ["lost", "stara 10"],
      ["new", "nowa 10"],
    ]);
  });
  it("pomija frazy obecne w obu oknach i w żadnym", () => {
    const rows = [win("obie", m(1, 30, 5), m(1, 30, 5)), win("żadne", empty, empty), win("prawie", m(1, 30, 5), m(0, 1, 40))];
    expect(newAndLost(rows)).toEqual([]);
  });
  it("sortuje malejąco po wyświetleniach w oknie, w którym fraza istnieje (nie po kliknięciach)", () => {
    const rows = [
      win("mało wyświetleń, dużo klików", m(9, 20, 8), empty),
      win("dużo wyświetleń, zero klików", m(0, 200, 8), empty),
      win("utracona", empty, m(1, 60, 4)),
    ];
    expect(newAndLost(rows).map((o) => o.kind !== "cannibal" && o.query)).toEqual([
      "dużo wyświetleń, zero klików",
      "utracona",
      "mało wyświetleń, dużo klików",
    ]);
  });
  it("zwraca też frazy bez kliknięć (nie odfiltrowuje ich po potencjale)", () => {
    const ops = newAndLost([win("nowa", m(0, 30, 9), empty), win("stara", empty, m(0, 25, 7))]);
    expect(ops.map((o) => [o.kind, o.potentialClicks])).toEqual([["new", 0], ["lost", 0]]);
  });
});
