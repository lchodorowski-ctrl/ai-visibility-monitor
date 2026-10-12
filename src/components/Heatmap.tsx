import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface HeatmapRow { promptId: string; promptText: string; cells: { engineId: string; visibilityRate: number | null }[] }

export function buildHeatmapRows(
  cells: { engine_id: string; prompt_id: string; visibility_rate: number }[],
  prompts: { id: string; text: string }[],
): { rows: HeatmapRow[]; engines: string[] } {
  const engines = [...new Set(cells.map((c) => c.engine_id))].sort();
  const byKey = new Map(cells.map((c) => [`${c.prompt_id}:${c.engine_id}`, c.visibility_rate]));
  const measured = new Set(cells.map((c) => c.prompt_id));
  const rows = prompts
    .filter((p) => measured.has(p.id))
    .map((p) => ({
      promptId: p.id,
      promptText: p.text,
      cells: engines.map((engineId) => ({ engineId, visibilityRate: byKey.get(`${p.id}:${engineId}`) ?? null })),
    }));
  return { rows, engines };
}

function color(v: number | null) {
  if (v === null) return "bg-muted text-muted-foreground";
  if (v >= 0.67) return "bg-green-200 text-green-950 dark:bg-green-900/40 dark:text-green-100";
  if (v > 0) return "bg-amber-200 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100";
  return "bg-red-200 text-red-950 dark:bg-red-900/40 dark:text-red-100";
}

export function Heatmap({ rows, engines }: { rows: HeatmapRow[]; engines: string[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Prompt</TableHead>
          {engines.map((e) => <TableHead key={e} className="text-center">{ENGINE_LABELS[e as EngineId] ?? e}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.promptId}>
            <TableCell className="whitespace-normal">{r.promptText}</TableCell>
            {engines.map((e) => {
              const v = r.cells.find((c) => c.engineId === e)?.visibilityRate ?? null;
              return <TableCell key={e} className={`text-center tabular-nums ${color(v)}`}>{v === null ? "—" : `${Math.round(v * 100)}%`}</TableCell>;
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
