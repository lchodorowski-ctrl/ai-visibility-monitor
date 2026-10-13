import Link from "next/link";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { GOOD_VISIBILITY, TONE_LABEL, visibilityTone, type VisibilityTone } from "@/lib/metrics/tone";

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

/** Ogólna widoczność pytania: łączny wiersz z daily_metrics (ważony liczbą odpowiedzi, jak w Przeglądzie); gdy go brak, średnia z silników. */
export function promptVisibility(cells: { prompt_id: string; visibility_rate: number }[], overall?: Map<string, number>): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const c of cells) {
    const a = acc.get(c.prompt_id) ?? { sum: 0, n: 0 };
    a.sum += c.visibility_rate; a.n += 1;
    acc.set(c.prompt_id, a);
  }
  const mean = new Map([...acc].map(([id, a]) => [id, a.sum / a.n]));
  return new Map([...mean, ...(overall ?? [])]);
}

const mixOf = (token: "teal" | "red", pctValue: number) => `color-mix(in srgb, var(--color-${token}) ${pctValue}%, transparent)`;

// Kolor tekstu w komórce zależy od motywu: t0 jest ciemny w jasnym i jasny w ciemnym, bg odwrotnie. Krycie tła rośnie z procentem,
// więc kontrast tekstu t0 maleje w jasnym motywie, a rośnie w ciemnym (tło bliższe jasnemu). Progi to miejsca przecięcia:
// poniżej `from` t0 wygrywa w obu motywach, od `from` do `to` wygrywa t0 w jasnym i bg w ciemnym, od `to` bg wygrywa w obu.
const cellText = (p: number, from: number, to: number) => (p >= to ? "text-bg" : p >= from ? "text-t0 dark:text-bg" : "text-t0");

// Trzy stany (patrz visibilityTone): dobrze = teal, bardzo źle = red (kolor w tym stylu znaczy tylko sukces lub błąd),
// słabo = monochromatyczna skala, gdzie widoczność = krycie tuszu (ink). Krycie koloru rośnie z wartością w obrębie stanu.
export function heatmapCellStyle(v: number | null, threshold: number): { className: string; style?: React.CSSProperties; label: string; tone?: VisibilityTone } {
  const base = "grid h-12 place-items-center rounded-lg font-mono text-xs tabular-nums";
  if (v === null) return { className: `${base} bg-s2 text-t2`, label: "—" };
  // Stan i kubełek liczymy z zaokrąglonego procentu, żeby kolor zawsze zgadzał się z etykietą (2/3 = "67%" = dobrze).
  const p = Math.round(v * 100);
  const label = `${p}%`;
  const tone = visibilityTone(v, threshold);
  if (tone === "good") {
    const mix = Math.round(35 + ((p - 67) / 33) * 65); // 35% przy 67%, 100% przy 100%
    return { className: `${base} ${cellText(p, 80, 91)}`, style: { backgroundColor: mixOf("teal", mix) }, label, tone };
  }
  if (tone === "bad") {
    const top = Math.round(threshold * 100) - 1; // ostatni procent poniżej progu
    const mix = Math.round(18 + (top > 0 ? (p / top) * 27 : 0)); // 18% przy 0%, 45% tuż pod progiem
    // Zero zostaje obrysowane, żeby pusta komórka odróżniała się od tła kafla.
    return { className: `${base} ${p === 0 ? "border border-line-2 " : ""}text-t0`, style: { backgroundColor: mixOf("red", mix) }, label, tone };
  }
  if (p === 0) return { className: `${base} border border-line-2 bg-bg text-t1`, label, tone };
  // color-mix na tokenie ink, żeby skala podążała za motywem (jasny/ciemny).
  const mix = Math.round((0.12 + v * 0.7) * 100);
  return { className: `${base} ${cellText(p, 45, 65)}`, style: { backgroundColor: `color-mix(in srgb, var(--color-ink) ${mix}%, transparent)` }, label, tone };
}

function Legend({ threshold }: { threshold: number }) {
  const item = "flex items-center gap-2";
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-t2" aria-label="Legenda kolorów">
      <li className={item}><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-teal" />dobrze ≥ {Math.round(GOOD_VISIBILITY * 100)}%</li>
      <li className={item}><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-ink/40" />słabo</li>
      {Math.round(threshold * 100) > 0 && <li className={item}><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-red" />bardzo źle &lt; {Math.round(threshold * 100)}%</li>}
    </ul>
  );
}

export function Heatmap({ rows, engines, counts, threshold }: { rows: HeatmapRow[]; engines: string[]; counts?: Record<string, number>; threshold: number }) {
  return (
    <>
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
            <tr key={r.promptId} id={r.promptId}>
              <td className="pr-6 text-sm leading-snug">{r.promptText}</td>
              {engines.map((e) => {
                const v = r.cells.find((c) => c.engineId === e)?.visibilityRate ?? null;
                const s = heatmapCellStyle(v, threshold);
                return <td key={e} className="px-1"><div className={s.className} style={s.style} aria-label={`${ENGINE_LABELS[e as EngineId] ?? e}: ${s.label}${s.tone ? `, ${TONE_LABEL[s.tone]}` : ""}`}>{s.label}</div></td>;
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
    <Legend threshold={threshold} />
    </>
  );
}
