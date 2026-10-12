"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Point = { date: string; score: number; visibilityRate: number };

// Dataviz: jedna seria = slot 1 palety (niebieski), kroki dobrane osobno dla jasnego i ciemnego tła
// (zwalidowane validate_palette.js: light #2a78d6, dark #3987e5). Siatka/osie to tokeny shadcn (cichy hairline).
const SERIES_VARS = "[--series-1:#2a78d6] dark:[--series-1:#3987e5]";

const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${day}.${m}` : d;
};

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: Point }[]; label?: string | number }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
      <div className="mb-1 text-muted-foreground">{String(label)}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: "var(--series-1)" }} />
        <span className="font-semibold tabular-nums">{p.score}</span>
        <span className="text-muted-foreground">Score</span>
      </div>
      <div className="mt-0.5 pl-5 text-muted-foreground">
        <span className="tabular-nums text-popover-foreground">{Math.round(p.visibilityRate * 100)}%</span> Visibility
      </div>
    </div>
  );
}

export function TrendChart({ data }: { data: Point[] }) {
  if (data.length < 2) return <p className="text-sm text-muted-foreground">Trend pojawi się po drugim pomiarze.</p>;
  return (
    <div className={SERIES_VARS}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={TrendTooltip} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} />
          <Line
            type="monotone" dataKey="score" name="Score" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            dot={false} activeDot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false}
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
