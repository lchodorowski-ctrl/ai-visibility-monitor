"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { SiteDay } from "@/lib/seo/overview";

const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${day}.${m}` : d;
};

const full = new Intl.NumberFormat("pl-PL");
const compact = new Intl.NumberFormat("pl-PL", { notation: "compact" });
const tick = { fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-t2)" } as const;

// Clicks: solid ink line; impressions: dashed grey line, so the two stay apart without relying on colour.
const CLICKS = "var(--color-ink)";
const IMPRESSIONS = "var(--color-t2)";

function GscTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: SiteDay }[]; label?: string | number }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-line-2 bg-bg px-3 py-2 text-xs text-t0">
      <div className="mb-1 font-mono text-t2">{String(label)}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: CLICKS }} />
        <span className="font-semibold tabular-nums">{full.format(p.clicks)}</span>
        <span className="text-t1">kliknięć</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span aria-hidden className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: IMPRESSIONS }} />
        <span className="font-semibold tabular-nums">{full.format(p.impressions)}</span>
        <span className="text-t1">wyświetleń</span>
      </div>
    </div>
  );
}

export function GscTrendChart({ data }: { data: SiteDay[] }) {
  if (data.length < 2) return <p className="text-t1">Trend pojawi się po kilku dniach danych.</p>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-t1">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-5 rounded-full" style={{ background: CLICKS }} />Kliknięcia (lewa oś)
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: IMPRESSIONS }} />Wyświetlenia (prawa oś)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeWidth={1} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={tick} tickLine={false} axisLine={{ stroke: "var(--color-line-2)" }} minTickGap={24} />
          <YAxis yAxisId="clicks" allowDecimals={false} tickFormatter={(v: number) => compact.format(v)} tick={tick} tickLine={false} axisLine={false} width={40} />
          <YAxis yAxisId="impressions" orientation="right" allowDecimals={false} tickFormatter={(v: number) => compact.format(v)} tick={tick} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={GscTooltip} cursor={{ stroke: "var(--color-line-3)", strokeWidth: 1 }} />
          <Line
            yAxisId="clicks" type="monotone" dataKey="clicks" name="Kliknięcia" stroke={CLICKS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            dot={false} activeDot={{ r: 4, fill: CLICKS, stroke: "var(--color-bg)", strokeWidth: 2 }} isAnimationActive={false}
          />
          <Line
            yAxisId="impressions" type="monotone" dataKey="impressions" name="Wyświetlenia" stroke={IMPRESSIONS} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round"
            dot={false} activeDot={{ r: 4, fill: IMPRESSIONS, stroke: "var(--color-bg)", strokeWidth: 2 }} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Kliknięcia i wyświetlenia w Google, dzień po dniu</caption>
        <thead><tr><th scope="col">Data</th><th scope="col">Kliknięcia</th><th scope="col">Wyświetlenia</th></tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}><td>{p.date}</td><td>{p.clicks}</td><td>{p.impressions}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
