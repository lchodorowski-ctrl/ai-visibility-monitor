"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Point = { date: string; score: number; visibilityRate: number };

const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${day}.${m}` : d;
};

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: Point }[]; label?: string | number }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-line-2 bg-bg px-3 py-2 text-xs text-t0">
      <div className="mb-1 font-mono text-t2">{String(label)}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: "var(--color-ink)" }} />
        <span className="font-semibold tabular-nums">{p.score}</span>
        <span className="text-t1">Score</span>
      </div>
      <div className="mt-0.5 pl-5 text-t1">
        <span className="tabular-nums text-t0">{Math.round(p.visibilityRate * 100)}%</span> Visibility
      </div>
    </div>
  );
}

export function TrendChart({ data }: { data: Point[] }) {
  if (data.length < 2) return <p className="text-t1">Trend pojawi się po drugim pomiarze.</p>;
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeWidth={1} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-t2)" }} tickLine={false} axisLine={{ stroke: "var(--color-line-2)" }} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-t2)" }} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={TrendTooltip} cursor={{ stroke: "var(--color-line-3)", strokeWidth: 1 }} />
          <Line
            type="monotone" dataKey="score" name="Score" stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            dot={false} activeDot={{ r: 4, fill: "var(--color-ink)", stroke: "var(--color-bg)", strokeWidth: 2 }} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Trend score</caption>
        <thead><tr><th scope="col">Data</th><th scope="col">Score</th><th scope="col">Visibility</th></tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}><td>{p.date}</td><td>{p.score}</td><td>{Math.round(p.visibilityRate * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
