import {
  getGscTotals, getGscSeries, getQueryWindows, getTopPages, getQueryPages, getSeoStatus, type GscTotals,
} from "@/lib/seo/queries";
import { cannibalization, ctrCurve, lowCtr, newAndLost, strikingDistance, type Opportunity } from "@/lib/seo/opportunities";
import { ctr, delta, fillMissingDays, gscWindows, hasPreviousWindow, isInterruptedJob, topOpportunities, topQueries } from "@/lib/seo/overview";
import { fmtDate, fmtDecimal, fmtNumber, fmtSignedNumber, fmtSignedPercent, positionChangeText } from "@/lib/format/number";
import { pluralFmt } from "@/lib/format/plural";
import { Button } from "@/components/ui/button";
import { Meta, Row, Rows, SectionHead, StatTile, Tile } from "@/components/psai";
import { GscTrendChart } from "@/components/GscTrendChart";
import { syncGscNow } from "./actions";

/** Queries read for the page (the SQL function sorts by impressions); shared by the sections so one rpc serves them all. */
const QUERY_LIMIT = 500;
/** Pages read for low CTR and the top list; the list shows the first ten. */
const PAGE_LIMIT = 100;

const NO_VALUE = "brak";

/** Decimal with a comma, or the placeholder when there is no value. */
const dec = (n: number | null) => (n === null ? NO_VALUE : fmtDecimal(n));
const usd = (n: number) => n.toFixed(2);
const dmy = (iso: string) => iso.split("-").reverse().join(".");

const NO_COMPARISON = "brak danych do porównania";

/** "+12% wobec poprzednich 28"; text when there is nothing to compare with. */
function changeText(d: number | null): string {
  return d === null ? NO_COMPARISON : `${fmtSignedPercent(d)} wobec poprzednich 28`;
}

/** "+0,4 pp wobec poprzednich 28": a change of a rate (CTR) in percentage points, not a relative percentage. */
function pointsText(pp: number | null): string {
  return pp === null ? NO_COMPARISON : `${fmtSignedNumber(pp, 1)} pp wobec poprzednich 28`;
}

const SYNC_STATUS: Record<string, string> = {
  running: "w toku", done: "zakończona", failed: "nieudana", skipped: "pominięta", budget_exceeded: "budżet wyczerpany",
};
/** A sync `running` for more than 45 minutes will never finish: the task died without closing its entry. */
const INTERRUPTED = "przerwana";

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[28px] bg-s1 px-6 py-6 text-t1 md:px-8">{children}</p>;
}

export async function StatusSection({ projectId, gscProperty, lastDate, seoBudget, aiBudget, now = new Date() }: {
  projectId: string; gscProperty: string | null; lastDate: string | null; seoBudget: number; aiBudget: number; now?: Date;
}) {
  const { lastSync, seoSpent, aiSpent } = await getSeoStatus(projectId);
  const interrupted = lastSync !== null && isInterruptedJob(lastSync, now);
  const failed = lastSync?.status === "failed" || interrupted;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        {lastSync ? (
          <Meta className="block">
            Ostatnia synchronizacja: <span className={failed ? "text-red" : "text-t0"}>{interrupted ? INTERRUPTED : (SYNC_STATUS[lastSync.status] ?? lastSync.status)}</span>
            {` · ${fmtDate(lastSync.finished_at ?? lastSync.started_at)}`}
          </Meta>
        ) : (
          <Meta className="block">Jeszcze nie było żadnej synchronizacji.</Meta>
        )}
        {/* without data the page-level empty state already shows the error */}
        {lastSync?.error && lastDate && <Meta className="block normal-case tracking-normal text-red">{lastSync.error}</Meta>}
        {lastDate && <Meta className="block">{`Dane do ${dmy(lastDate)}`}</Meta>}
        <Meta className="block">{`Wydatki w tym miesiącu: SEO ${usd(seoSpent)} / ${usd(seoBudget)} USD, AI ${usd(aiSpent)} / ${usd(aiBudget)} USD, razem ${usd(seoSpent + aiSpent)} USD`}</Meta>
      </div>
      <form action={syncGscNow}><Button type="submit" disabled={!gscProperty?.trim()}>Synchronizuj</Button></form>
    </div>
  );
}

export async function GscStatsSection({ projectId, lastDate, firstDate }: { projectId: string; lastDate: string; firstDate: string | null }) {
  const w = gscWindows(lastDate);
  // a history shorter than two windows leaves the previous one half empty: every change would be inflated, so there is none
  const [cur, prev] = await Promise.all([
    getGscTotals(projectId, w.cur.from, w.cur.to),
    hasPreviousWindow(firstDate, w) ? getGscTotals(projectId, w.prev.from, w.prev.to) : null,
  ]);
  const curCtr = ctr(cur.clicks, cur.impressions);
  const prevCtr = prev && ctr(prev.clicks, prev.impressions);
  const detail = (text: string) => `28 dni · ${text}`;
  const change = (pick: (t: GscTotals) => number | null) => detail(changeText(prev && delta(pick(cur), pick(prev))));
  const positionText = prev ? positionChangeText(cur.position, prev.position) : NO_COMPARISON;
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Kliknięcia" value={cur.clicks === null ? NO_VALUE : fmtNumber(cur.clicks)} detail={change((t) => t.clicks)} />
      <StatTile label="Wyświetlenia" value={cur.impressions === null ? NO_VALUE : fmtNumber(cur.impressions)} detail={change((t) => t.impressions)} />
      <StatTile label="CTR" value={curCtr === null ? NO_VALUE : dec(curCtr * 100)} unit={curCtr === null ? undefined : "%"}
        detail={detail(pointsText(curCtr === null || prevCtr === null ? null : (curCtr - prevCtr) * 100))} />
      <StatTile label="Średnia pozycja" value={dec(cur.position)} detail={positionText ? detail(positionText) : "28 dni"} />
    </div>
  );
}

export async function GscTrendSection({ projectId }: { projectId: string }) {
  const series = fillMissingDays(await getGscSeries(projectId, 90));
  return (
    <Tile>
      <SectionHead title="Trend: kliknięcia i wyświetlenia" meta={<Meta>ostatnie 90 dni</Meta>} />
      <GscTrendChart data={series} />
    </Tile>
  );
}

/** Subject of an opportunity: the query, or the page for page-level low CTR. */
const subject = (o: Opportunity) => (o.kind === "cannibal" ? o.query : (o.query ?? o.page ?? ""));

const CLICK_FORMS: [string, string, string] = ["kliknięcie", "kliknięcia", "kliknięć"];
const IMPRESSION_FORMS: [string, string, string] = ["wyświetlenie", "wyświetlenia", "wyświetleń"];
const MINUS = "\u2212";

/**
 * The figure on the right of a row. Striking distance, low CTR and cannibalization: clicks to gain. New and lost
 * phrases: their clicks in the window where they exist ("+N" for new, "−N" for lost), and only when there are any;
 * a phrase without a single click shows its impressions (a lost phrase's are from the previous window).
 */
function figureText(o: Opportunity): string {
  if (o.kind !== "new" && o.kind !== "lost") return `+${pluralFmt(Math.max(1, Math.round(o.potentialClicks)), CLICK_FORMS)}/28 dni`;
  if (o.clicks > 0) return `${o.kind === "lost" ? MINUS : "+"}${pluralFmt(o.clicks, CLICK_FORMS)}/28 dni`;
  return `${pluralFmt(o.impressions, IMPRESSION_FORMS)}${o.kind === "lost" ? " (poprzednio)" : ""}`;
}

export function OpportunityList({ items, empty = "Brak szans w tej grupie" }: { items: Opportunity[]; empty?: string }) {
  if (items.length === 0) return <EmptyList>{empty}</EmptyList>;
  return (
    <Rows>
      {items.map((o) => {
        const tag = o.kind === "new" ? "nowa" : o.kind === "lost" ? "utracona" : null;
        // lost: the numbers are from the previous window and the clicks are gone, not to be won
        const lost = o.kind === "lost";
        return (
          <Row key={`${o.kind}:${subject(o)}`}>
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">
                {tag && <Meta className="mr-2">{tag}</Meta>}
                {subject(o)}
              </p>
              <Meta className="mt-1 block">
                {o.kind === "cannibal"
                  ? `wyświetlenia frazy ${fmtNumber(o.impressions)}`
                  : `pozycja ${dec(o.position)} · wyświetlenia ${fmtNumber(o.impressions)}${lost ? " (poprzednio)" : ""}`}
              </Meta>
              {o.kind === "cannibal" && (
                <ul className="mt-2 space-y-1">
                  {o.pages.map((p) => (
                    <li key={p.page} className="text-sm">
                      <span className="block break-words text-t1">{p.page}</span>
                      <Meta className="block">{`wyświetlenia ${fmtNumber(p.impressions)} · pozycja ${dec(p.position)}`}</Meta>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums">{figureText(o)}</span>
          </Row>
        );
      })}
    </Rows>
  );
}

export async function OpportunitiesSection({ projectId, lastDate, firstDate }: { projectId: string; lastDate: string; firstDate: string | null }) {
  const w = gscWindows(lastDate);
  // without a full previous window every phrase would look new, and none could be lost
  const comparable = hasPreviousWindow(firstDate, w);
  const [rows, pages, queryPages] = await Promise.all([
    getQueryWindows(projectId, w, QUERY_LIMIT),
    getTopPages(projectId, w.cur.from, w.cur.to, PAGE_LIMIT),
    getQueryPages(projectId, w.cur.from, w.cur.to),
  ]);
  const curve = ctrCurve(rows.map((r) => r.cur));
  const groups: { title: string; hint: string; items: Opportunity[]; empty?: string }[] = [
    { title: "Blisko top 3", hint: "Frazy na pozycjach 4-20: wyższa pozycja da więcej kliknięć.", items: topOpportunities(strikingDistance(rows, curve)) },
    { title: "Niski CTR", hint: "W top 10, ale klikalność poniżej połowy oczekiwanej: popraw tytuł i opis.", items: topOpportunities(lowCtr([...rows, ...pages], curve)) },
    { title: "Kanibalizacja", hint: "Kilka Waszych stron konkuruje o tę samą frazę.", items: topOpportunities(cannibalization(queryPages)) },
    {
      title: "Nowe i utracone frazy", hint: "Frazy, które pojawiły się albo zniknęły wobec poprzednich 28 dni.",
      items: comparable ? topOpportunities(newAndLost(rows)) : [],
      empty: comparable ? undefined : "Za krótka historia do porównania z poprzednimi 28 dniami.",
    },
  ];
  return (
    <section>
      <SectionHead title="Szanse" meta={<Meta>ostatnie 28 dni</Meta>} />
      <div className="grid gap-10 xl:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="text-xl font-semibold">{g.title}</h3>
            <Meta className="mb-4 mt-1 block normal-case tracking-normal">{g.hint}</Meta>
            <OpportunityList items={g.items} empty={g.empty} />
          </div>
        ))}
      </div>
    </section>
  );
}

const figures = (clicks: number, impressions: number, position: number | null) =>
  `kliknięcia ${fmtNumber(clicks)} · wyświetlenia ${fmtNumber(impressions)} · pozycja ${dec(position)}`;

export async function TopQueriesSection({ projectId, lastDate }: { projectId: string; lastDate: string }) {
  const top = topQueries(await getQueryWindows(projectId, gscWindows(lastDate), QUERY_LIMIT));
  return (
    <section>
      <SectionHead title="Najlepsze frazy" meta={<Meta>ostatnie 28 dni</Meta>} />
      {top.length === 0
        ? <EmptyList>Brak fraz w tym okresie</EmptyList>
        : (
          <>
            <Rows>
              {top.map((r) => (
                <Row key={r.query}>
                  <span className="min-w-0 flex-1 break-words">{r.query}</span>
                  <Meta>{figures(r.cur.clicks, r.cur.impressions, r.cur.position)}</Meta>
                </Row>
              ))}
            </Rows>
            <Meta className="mt-3 block normal-case tracking-normal">Suma kliknięć fraz jest niższa niż stron: Google ukrywa rzadkie frazy.</Meta>
          </>
        )}
    </section>
  );
}

export async function TopPagesSection({ projectId, lastDate }: { projectId: string; lastDate: string }) {
  const w = gscWindows(lastDate);
  const top = (await getTopPages(projectId, w.cur.from, w.cur.to, PAGE_LIMIT)).slice(0, 10);
  return (
    <section>
      <SectionHead title="Najlepsze strony" meta={<Meta>ostatnie 28 dni</Meta>} />
      {top.length === 0
        ? <EmptyList>Brak stron w tym okresie</EmptyList>
        : (
          <Rows>
            {top.map((p) => (
              <Row key={p.page}>
                <span className="min-w-0 flex-1 break-words">{p.page}</span>
                <Meta>{figures(p.clicks, p.impressions, p.position)}</Meta>
              </Row>
            ))}
          </Rows>
        )}
    </section>
  );
}
