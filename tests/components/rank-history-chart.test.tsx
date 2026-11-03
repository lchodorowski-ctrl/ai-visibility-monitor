import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RankHistoryPoint } from "@/lib/seo/rank-queries";

// Przy renderowaniu na serwerze ResponsiveContainer nie ma rozmiaru i nie rysuje wykresu, więc recharts jest atrapą,
// która pokazuje właściwości elementów (bez dzieci i funkcji) oraz wynik `tickFormatter` na przykładowej dacie.
vi.mock("recharts", () => {
  const stub = (name: string) => {
    function Stub({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) {
      const sample = typeof props.tickFormatter === "function" ? (props.tickFormatter as (v: string) => string)("2026-11-02") : undefined;
      return <div data-chart={name} data-sample={sample} data-props={JSON.stringify(props)}>{children}</div>;
    }
    Stub.displayName = `Stub(${name})`;
    return Stub;
  };
  return {
    ResponsiveContainer: stub("ResponsiveContainer"), LineChart: stub("LineChart"), Line: stub("Line"), XAxis: stub("XAxis"),
    YAxis: stub("YAxis"), Tooltip: stub("Tooltip"), CartesianGrid: stub("CartesianGrid"),
  };
});

import { RankHistoryChart } from "@/components/RankHistoryChart";

const render = (points: RankHistoryPoint[]) => renderToStaticMarkup(<RankHistoryChart points={points} />);
const NO_DASHES = /[\u2013\u2014]/;

const points: RankHistoryPoint[] = [
  { weekStart: "2026-10-19", desktop: 41, mobile: null },
  { weekStart: "2026-10-26", desktop: 37, mobile: 52 },
  { weekStart: "2026-11-02", desktop: null, mobile: 45 },
];

/** Właściwości (JSON) i atrybut próbki pierwszego elementu danego typu, opcjonalnie z danym `dataKey`. */
function element(html: string, name: string, dataKey?: string): { props: Record<string, unknown>; sample: string | null } {
  const tags = [...html.matchAll(new RegExp(`<div data-chart="${name}"([^>]*)>`, "g"))];
  for (const [, attrs] of tags) {
    const props = JSON.parse(/data-props="([^"]*)"/.exec(attrs)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    if (dataKey === undefined || props.dataKey === dataKey) return { props, sample: /data-sample="([^"]*)"/.exec(attrs)?.[1] ?? null };
  }
  throw new Error(`brak elementu ${name} ${dataKey ?? ""}`);
}

describe("RankHistoryChart", () => {
  it("mniej niż dwa tygodnie to komunikat zamiast wykresu", () => {
    for (const few of [[], points.slice(0, 1)]) {
      const html = render(few);
      expect(html).toContain("Historia pojawi się po drugim pomiarze.");
      expect(html).not.toContain("data-chart");
    }
  });

  it("każdy pomiar bez pozycji na obu urządzeniach: zdanie zamiast pustego wykresu", () => {
    const html = render([
      { weekStart: "2026-10-26", desktop: null, mobile: null },
      { weekStart: "2026-11-02", desktop: null, mobile: null },
    ]);
    expect(html).toContain("We wszystkich pomiarach fraza była poza top 100.");
    expect(html).not.toContain("data-chart");
    expect(html).not.toContain("Historia pojawi się po drugim pomiarze.");
    expect(html).not.toMatch(NO_DASHES);
  });

  it("jeden pomiar z pozycją (na którymkolwiek urządzeniu) to już wykres, nie zdanie", () => {
    for (const withPosition of [{ desktop: 80, mobile: null }, { desktop: null, mobile: 100 }]) {
      const html = render([{ weekStart: "2026-10-26", desktop: null, mobile: null }, { weekStart: "2026-11-02", ...withPosition }]);
      expect(html).toContain('data-chart="LineChart"');
      expect(html).not.toContain("We wszystkich pomiarach");
    }
  });

  it("podpowiedź pokazuje też tydzień, w którym oba urządzenia nie mają pozycji (filterNull wyłączone)", () => {
    expect(element(render(points), "Tooltip").props.filterNull).toBe(false);
  });

  it("oś Y jest odwrócona: pozycja 1 na górze, skala 1 do 100", () => {
    const { props } = element(render(points), "YAxis");
    expect(props.reversed).toBe(true);
    expect(props.domain).toEqual([1, 100]);
    expect(props.allowDecimals).toBe(false);
  });

  it("dwie linie z danych: komputer ciągła, telefon przerywana, null to przerwa, a nie połączenie", () => {
    const html = render(points);
    const desktop = element(html, "Line", "desktop").props;
    const mobile = element(html, "Line", "mobile").props;
    expect(desktop.strokeDasharray).toBeUndefined();
    expect(typeof mobile.strokeDasharray).toBe("string");
    expect(desktop.connectNulls).not.toBe(true);
    expect(mobile.connectNulls).not.toBe(true);
    expect(desktop.name).toBe("Komputer");
    expect(mobile.name).toBe("Telefon");
    expect(element(html, "LineChart").props.data).toEqual(points);
  });

  it("oś X podpisana datą tygodnia w formacie dd.mm", () => {
    const x = element(render(points), "XAxis");
    expect(x.props.dataKey).toBe("weekStart");
    expect(x.sample).toBe("02.11");
  });

  it("legenda i tabela dla czytników ekranu z pozycjami każdego tygodnia", () => {
    const html = render(points);
    expect(html).toContain("Komputer (linia ciągła)");
    expect(html).toContain("Telefon (linia przerywana)");
    expect(html).toContain("<caption>Pozycje frazy w Google, tydzień po tygodniu</caption>");
    const rows = [...html.matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((m) => m.slice(1, 4));
    expect(rows).toEqual([
      ["2026-10-19", "41", "brak pozycji"],
      ["2026-10-26", "37", "52"],
      ["2026-11-02", "brak pozycji", "45"],
    ]);
    expect(html).not.toMatch(NO_DASHES);
  });
});
