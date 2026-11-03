const WIDTH = 96;
const HEIGHT = 24;
/** Room for the line's round ends and the dot of a lone point. */
const PAD = 2;
const DOT_RADIUS = 1.5;

type Point = { x: number; y: number };

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const isNumber = (v: number | null): v is number => v !== null && Number.isFinite(v);

/**
 * A small trend line (96×24) without axes: the series scaled from its lowest to its highest value, so it shows the
 * shape and the direction, not the size (the numbers are written next to it). A `null` is a gap that keeps its place
 * on the time axis: the line breaks there, and a value left alone between two gaps is drawn as a dot.
 * Fewer than two numbers is not a trend: nothing is drawn. `label` is read by screen readers.
 */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const numbers = values.filter(isNumber);
  if (numbers.length < 2) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const x = (i: number) => PAD + (i * (WIDTH - 2 * PAD)) / (values.length - 1);
  // a flat series (min = max) runs through the middle
  const y = (v: number) => (max === min ? HEIGHT / 2 : PAD + ((max - v) / (max - min)) * (HEIGHT - 2 * PAD));

  const segments: Point[][] = [];
  let current: Point[] = [];
  values.forEach((v, i) => {
    if (isNumber(v)) {
      current.push({ x: x(i), y: y(v) });
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length > 0) segments.push(current);

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}
      className="inline-block shrink-0 text-t0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {segments.map((seg, i) =>
        seg.length === 1
          ? <circle key={i} cx={fmt(seg[0].x)} cy={fmt(seg[0].y)} r={DOT_RADIUS} fill="currentColor" stroke="none" />
          : <path key={i} d={seg.map((p, j) => `${j === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" ")} />)}
    </svg>
  );
}
