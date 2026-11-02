import { getDirectionRows } from "@/lib/metrics/queries";
import { getGscFirstDate, getGscLastDate, getGscTotals, type GscTotals } from "@/lib/seo/queries";
import { gscWindows, hasPreviousWindow } from "@/lib/seo/overview";
import { aiSummary, aioSummary, googleSummary, overallHeadline, type ChannelSummary, type Direction } from "@/lib/trends/direction";
import { fmtDayMonth } from "@/lib/format/number";
import { Eyebrow, Meta, SectionHead, Tile } from "@/components/psai";

/** Colour never carries the verdict alone: every arrow has a text for screen readers, and the shapes differ. */
const ARROW: Record<Direction, { glyph: string; text: string; color: string }> = {
  up: { glyph: "↑", text: "w górę", color: "text-teal" },
  down: { glyph: "↓", text: "w dół", color: "text-red" },
  flat: { glyph: "→", text: "bez zmian", color: "text-t2" },
  unknown: { glyph: "○", text: "brak danych", color: "text-t2" },
};

function DirectionCard({ s }: { s: ChannelSummary }) {
  const arrow = ARROW[s.direction];
  const footer = s.since ? `od ${fmtDayMonth(s.since)}` : s.period;
  return (
    <Tile href={s.href}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-medium text-t1">{s.label}</h3>
        <span aria-hidden="true" className={`text-[44px] font-semibold leading-none ${arrow.color}`}>{arrow.glyph}</span>
        <span className="sr-only">{arrow.text}</span>
      </div>
      <p className="mt-6 text-2xl font-semibold leading-tight tracking-[-0.02em]">{s.headline}</p>
      <p className="mt-3 text-t1">{s.detail}</p>
      {footer && <Meta className="mt-auto block pt-6">{footer}</Meta>}
    </Tile>
  );
}

/** The sentence about the whole picture and one card per channel, each linking to its details. */
export function DirectionCards({ summaries, headline }: { summaries: ChannelSummary[]; headline: string }) {
  return (
    <section aria-label="Kierunek">
      <Eyebrow className="mb-3">Kierunek</Eyebrow>
      <SectionHead title={headline} />
      <div className="grid gap-6 md:grid-cols-3">
        {summaries.map((s) => <DirectionCard key={s.key} s={s} />)}
      </div>
    </section>
  );
}

interface GscWindowData { cur: GscTotals | null; prev: GscTotals | null; lastDate: string | null; firstDate: string | null }

const NO_GSC: GscWindowData = { cur: null, prev: null, lastDate: null, firstDate: null };

/**
 * Site totals of the latest 28 days and of the 28 before, with the first and the last day of data. When the history
 * does not reach back to the start of the previous window, `prev` is null (a half-empty window would inflate every
 * change). A failed read must not take the whole overview down: it is logged and the Google card says there is no data
 * (the Google page shows the real error).
 */
async function loadGscWindows(projectId: string): Promise<GscWindowData> {
  try {
    const [lastDate, firstDate] = await Promise.all([getGscLastDate(projectId), getGscFirstDate(projectId)]);
    if (!lastDate) return NO_GSC;
    const w = gscWindows(lastDate);
    const [cur, prev] = await Promise.all([
      getGscTotals(projectId, w.cur.from, w.cur.to),
      hasPreviousWindow(firstDate, w) ? getGscTotals(projectId, w.prev.from, w.prev.to) : null,
    ]);
    return { cur, prev, lastDate, firstDate };
  } catch (e) {
    console.error(`DirectionSection: nie udało się pobrać danych z Search Console: ${e instanceof Error ? e.message : String(e)}`);
    return NO_GSC;
  }
}

export async function DirectionSection({ projectId, gscProperty, now }: { projectId: string; gscProperty: string | null; now?: Date }) {
  const configured = Boolean(gscProperty?.trim());
  const [rows, gsc] = await Promise.all([getDirectionRows(projectId), configured ? loadGscWindows(projectId) : NO_GSC]);
  const summaries = [
    aiSummary(rows),
    aioSummary(rows),
    googleSummary(gsc.cur, gsc.prev, configured, { lastDate: gsc.lastDate, firstDate: gsc.firstDate, now }),
  ];
  return <DirectionCards summaries={summaries} headline={overallHeadline(summaries)} />;
}
