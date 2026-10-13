import Link from "next/link";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";

export interface HeatmapRow { promptId: string; promptText: string; cells: { engineId: string; visibilityRate: number | null }[] }

export function buildHeatmapRows(
  cells: { engine_id: string; prompt_id: string; visibility_rate: number }[],
  prompts: { id: string; text: string }[],
): { rows: HeatmapRow[]; engines: string[] } {
  const engines = [...new Set(cells.map((c) => c.engine_id))].sort();
  const byKey = new Map(cells.map((c) => [`${c.prompt_id}:${c.engine_id}`, c.visibility_rate]));
  const rows = prompts.map((p) => ({
    promptId: p.id, promptText: p.text,
    cells: engines.map((engineId) => ({ engineId, visibilityRate: byKey.get(`${p.id}:${engineId}`) ?? null })),
  }));
  return { rows, engines };
}

// Monochromatyczna skala: kolor w tym stylu znaczy tylko błąd (red) lub sukces (teal), więc widoczność = krycie czerni.
export function heatmapCellStyle(v: number | null): { className: string; style?: React.CSSProperties; label: string } {
  const base = "grid h-12 place-items-center rounded-lg font-mono text-xs tabular-nums";
  if (v === null) return { className: `${base} bg-s2 text-t2`, label: "—" };
  const label = `${Math.round(v * 100)}%`;
  if (v === 0) return { className: `${base} border border-line-2 bg-bg text-t1`, label };
  if (v >= 0.67) return { className: `${base} bg-ink text-bg`, label };
  const alpha = Number((0.12 + v * 0.7).toFixed(2));
  return { className: `${base} ${v >= 0.45 ? "text-bg" : "text-t0"}`, style: { backgroundColor: `rgb(29 29 31 / ${alpha})` }, label };
}

export function Heatmap({ rows, engines, counts }: { rows: HeatmapRow[]; engines: string[]; counts?: Record<string, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-y-2">
        <thead>
          <tr>
            <th scope="col" className="pb-2 text-left font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-t2">Pytanie</th>
            {engines.map((e) => <th key={e} scope="col" className="w-28 pb-2 text-center font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-t2">{ENGINE_LABELS[e as EngineId] ?? e}</th>)}
            {counts && <th scope="col" className="w-36 pb-2 text-right font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-t2">Rekomendacje</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.promptId}>
              <td className="pr-6 text-sm leading-snug">{r.promptText}</td>
              {engines.map((e) => {
                const v = r.cells.find((c) => c.engineId === e)?.visibilityRate ?? null;
                const s = heatmapCellStyle(v);
                return <td key={e} className="px-1"><div className={s.className} style={s.style} aria-label={`${ENGINE_LABELS[e as EngineId] ?? e}: ${s.label}`}>{s.label}</div></td>;
              })}
              {counts && (
                <td className="pl-4 text-right text-sm">
                  {counts[r.promptId] ? <Link className="text-t1 underline-offset-4 hover:text-t0 hover:underline" href={`/app/recommendations?prompt=${r.promptId}`}>rekomendacje ({counts[r.promptId]})</Link> : <span className="text-t2">—</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
