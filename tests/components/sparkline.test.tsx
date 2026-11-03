import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sparkline } from "@/components/Sparkline";

const render = (values: (number | null)[], label = "Wolumen frazy") => renderToStaticMarkup(<Sparkline values={values} label={label} />);
const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[ />]`, "g")) ?? []).length;
/** Współrzędne punktów jednej ścieżki „M x y L x y …”. */
const points = (html: string) =>
  [...html.matchAll(/ d="([^"]+)"/g)].map((m) => [...m[1].matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((p) => [Number(p[1]), Number(p[2])]));

describe("Sparkline", () => {
  it("obrazek SVG 96×24 z rolą img i opisem dla czytników ekranu", () => {
    const html = render([1, 2, 3], "Wolumen frazy „szkolenia ai” w ostatnich 12 miesiącach: od 1 200 do 1 900");
    expect(html).toContain("<svg");
    expect(html).toContain('width="96"');
    expect(html).toContain('height="24"');
    expect(html).toContain('viewBox="0 0 96 24"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Wolumen frazy „szkolenia ai” w ostatnich 12 miesiącach: od 1 200 do 1 900"');
  });

  it("opis jest zabezpieczony przed znakami specjalnymi", () => {
    const html = render([1, 2], 'a"><script>x</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;");
  });

  it("ciągła seria to jedna linia, a wyższa wartość leży wyżej (mniejsze y)", () => {
    const html = render([10, 20, 30]);
    expect(count(html, "path")).toBe(1);
    const [[a, b, c]] = points(html);
    expect(a[0]).toBeLessThan(b[0]);
    expect(b[0]).toBeLessThan(c[0]);
    expect(a[1]).toBeGreaterThan(b[1]);
    expect(b[1]).toBeGreaterThan(c[1]);
  });

  it("null w środku to przerwa: dwa odcinki, a przerwa zajmuje swoje miejsce na osi", () => {
    const html = render([1, 2, null, 4, 5]);
    expect(count(html, "path")).toBe(2);
    const [left, right] = points(html);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    const step = left[1][0] - left[0][0];
    expect(right[0][0] - left[1][0]).toBeCloseTo(2 * step, 1);
  });

  it("pojedyncza wartość między przerwami to kropka, nie zniknięcie", () => {
    const html = render([1, null, 3, 4]);
    expect(count(html, "path")).toBe(1);
    expect(count(html, "circle")).toBe(1);
  });

  it("wszystkie punkty mieszczą się w ramce obrazka", () => {
    const html = render([0, 5000, null, 120, 3, 5000]);
    for (const seg of points(html)) {
      for (const [x, y] of seg) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(96);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(24);
      }
    }
  });

  it("stała seria to pozioma linia w połowie wysokości", () => {
    const [seg] = points(render([7, 7, 7]));
    expect(new Set(seg.map((p) => p[1]))).toEqual(new Set([12]));
  });

  it("mniej niż dwie wartości liczbowe: nic (jedna kropka nie jest trendem)", () => {
    expect(render([])).toBe("");
    expect(render([5])).toBe("");
    expect(render([null, 5])).toBe("");
    expect(render([null, null, null])).toBe("");
    expect(render([Number.NaN, 5])).toBe("");
  });
});
