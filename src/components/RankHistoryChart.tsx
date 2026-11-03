"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { RankHistoryPoint } from "@/lib/seo/rank-queries";
import { fmtDay, fmtDayMonth, fmtNumber } from "@/lib/format/number";

const tick = { fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-t2)" } as const;

// Computer: solid ink line; phone: dashed grey line, so the two stay apart without relying on colour.
const DESKTOP = "var(--color-ink)";
const PHONE = "var(--color-t2)";

/** Google positions run from 1 (top of the chart) down to the checked depth of 100. */
const DOMAIN: [number, number] = [1, 100];
const TICKS = [1, 10, 25, 50, 75, 100];

/** A week without a position: outside the top 100, or the check of that device did not finish. */
const positionOrNone = (p: number | null) => (p === null ? "brak pozycji" : fmtNumber(p));

function RankTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: RankHistoryPoint }[]; label?: string | number }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-line-2 bg-bg px-3 py-2 text-xs text-t0">
      <div className="mb-1 font-mono text-t2">{`tydzień od ${fmtDay(String(label))}`}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: DESKTOP }} />
        <span className="text-t1">Komputer</span>
        <span className="font-semibold tabular-nums">{positionOrNone(p.desktop)}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span aria-hidden className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: PHONE }} />
        <span className="text-t1">Telefon</span>
        <span className="font-semibold tabular-nums">{positionOrNone(p.mobile)}</span>
      </div>
    </div>
  );
}

/**
 * Weekly Google positions of a phrase. A lower number is better, so the axis is reversed: position 1 on top. A week
 * without a position (`null`) is a gap in the line, not a point at the bottom; the dots keep a week that stands alone
 * between two gaps visible.
 */
export function RankHistoryChart({ points }: { points: RankHistoryPoint[] }) {
  if (points.length < 2) return <p className="text-t1">Historia pojawi się po drugim pomiarze.</p>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-t1">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-5 rounded-full" style={{ background: DESKTOP }} />Komputer (linia ciągła)
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: PHONE }} />Telefon (linia przerywana)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeWidth={1} />
          <XAxis dataKey="weekStart" tickFormatter={fmtDayMonth} tick={tick} tickLine={false} axisLine={{ stroke: "var(--color-line-2)" }} minTickGap={24} />
          <YAxis reversed domain={DOMAIN} ticks={TICKS} interval={0} allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={RankTooltip} cursor={{ stroke: "var(--color-line-3)", strokeWidth: 1 }} />
          <Line
            type="linear" dataKey="desktop" name="Komputer" stroke={DESKTOP} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            dot={{ r: 3, fill: DESKTOP, stroke: DESKTOP }} activeDot={{ r: 5, fill: DESKTOP, stroke: "var(--color-bg)", strokeWidth: 2 }} isAnimationActive={false}
          />
          <Line
            type="linear" dataKey="mobile" name="Telefon" stroke={PHONE} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round"
            dot={{ r: 3, fill: PHONE, stroke: PHONE }} activeDot={{ r: 5, fill: PHONE, stroke: "var(--color-bg)", strokeWidth: 2 }} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Pozycje frazy w Google, tydzień po tygodniu</caption>
        <thead><tr><th scope="col">Tydzień od</th><th scope="col">Komputer</th><th scope="col">Telefon</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.weekStart}><td>{p.weekStart}</td><td>{positionOrNone(p.desktop)}</td><td>{positionOrNone(p.mobile)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
