import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { getOverview } from "@/lib/metrics/queries";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { StatCard, pct } from "@/components/StatCard";
import { TrendChart } from "@/components/TrendChart";
import { RunStatus } from "@/components/RunStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isRunStale } from "@/lib/runs/stale";
import { runNow } from "./actions";

export default async function OverviewPage() {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const o = await getOverview(supabase, project.id);
  const own = o.competitors.find((c) => c.name === project.brand_name);
  const engineRows = (Object.keys(ENGINE_LABELS) as EngineId[]).map((id) => ({
    id, label: ENGINE_LABELS[id], row: o.byEngine.find((e) => e.engineId === id) ?? null,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Przegląd</h1>
        <form action={runNow}><Button type="submit" disabled={o.lastRun?.status === "running" && !isRunStale(o.lastRun)}>Uruchom teraz</Button></form>
      </div>
      <RunStatus run={o.lastRun} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="AI Visibility Score" value={o.latest ? String(o.latest.score) : "—"} hint="0–100" />
        <StatCard label="Visibility rate" value={o.latest ? pct(o.latest.visibilityRate) : "—"} hint="odpowiedzi z wzmianką" />
        <StatCard label="Śr. pozycja" value={o.latest?.avgPosition ? o.latest.avgPosition.toFixed(1) : "—"} />
        <StatCard label="Citation rate" value={o.latest ? pct(o.latest.citationRate) : "—"} hint="linki do naszej domeny" />
        <StatCard label="Share of voice" value={o.latest ? pct(o.latest.shareOfVoice) : "—"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Trend score</CardTitle></CardHeader>
        <CardContent><TrendChart data={o.trend} /></CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Silniki</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Silnik</TableHead><TableHead>Visibility</TableHead><TableHead>Pozycja</TableHead><TableHead>Cytowania</TableHead><TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineRows.map(({ id, label, row }) => (
                  <TableRow key={id}>
                    <TableCell>{label}</TableCell>
                    <TableCell className="tabular-nums">{row ? pct(row.visibilityRate) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{row?.avgPosition?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{row ? pct(row.citationRate) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{row ? row.score : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Wzmianki w ostatnim runie</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm">
              {o.competitors.map((c) => (
                <li key={c.name} className={`flex justify-between border-t py-1 ${c.name === project.brand_name ? "font-semibold" : ""}`}>
                  <span>{c.name}</span><span className="tabular-nums">{c.mentions}</span>
                </li>
              ))}
              {!own && <li className="border-t py-1 text-muted-foreground">Brak wzmianek o {project.brand_name}.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
