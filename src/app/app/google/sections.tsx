import {
  getGscTotals, getGscSeries, getQueryWindows, getTopPages, getQueryPages, getSeoStatus,
} from "@/lib/seo/queries";
import { cannibalization, ctrCurve, lowCtr, newAndLost, strikingDistance, type Opportunity } from "@/lib/seo/opportunities";
import { ctr, delta, fillMissingDays, gscWindows, topOpportunities, topQueries } from "@/lib/seo/overview";
import { fmtDate, fmtDecimal, fmtNumber, fmtSignedPercent } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
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

/** "+12% wobec poprzednich 28"; text when there is nothing to compare with. */
function changeText(d: number | null): string {
  return d === null ? "brak danych do porównania" : `${fmtSignedPercent(d)} wobec poprzednich 28`;
}

/** Position change in places, in words: a lower position is better, so a relative percentage would read the wrong way. */
function positionChangeText(cur: number | null, prev: number | null): string | null {
  if (cur === null || prev === null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.05) return "bez zmian";
  return `${d < 0 ? "lepiej" : "gorzej"} o ${fmtDecimal(Math.abs(d))} poz.`;
}

const SYNC_STATUS: Record<string, string> = {
  running: "w toku", done: "zakończona", failed: "nieudana", skipped: "pominięta", budget_exceeded: "budżet wyczerpany",
};

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[28px] bg-s1 px-6 py-6 text-t1 md:px-8">{children}</p>;
}

export async function StatusSection({ projectId, gscProperty, lastDate, seoBudget, aiBudget }: {
  projectId: string; gscProperty: string | null; lastDate: string | null; seoBudget: number; aiBudget: number;
}) {
  const { lastSync, seoSpent, aiSpent } = await getSeoStatus(projectId);
  const failed = lastSync?.status === "failed";
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        {lastSync ? (
          <Meta className="block">
            Ostatnia synchronizacja: <span className={failed ? "text-red" : "text-t0"}>{SYNC_STATUS[lastSync.status] ?? lastSync.status}</span>
            {` · ${fmtDate(lastSync.finished_at ?? lastSync.started_at)}`}
          </Meta>
        ) : (
          <Meta className="block">Jeszcze nie było żadnej synchronizacji.</Meta>
        )}
        {/* without data the page-level empty state already shows the error */}
        {lastSync?.error && lastDate && <Meta className="block normal-case tracking-normal text-red">{lastSync.error}</Meta>}
        {lastDate && <Meta className="block">{`Dane do ${dmy(lastDate)}`}</Meta>}
        <Meta className="block">{`Wydatki w tym miesiącu: SEO ${usd(seoSpent)} / ${usd(seoBudget)} USD, AI ${usd(aiSpent)} / ${usd(aiBudget)} USD`}</Meta>
      </div>
      <form action={syncGscNow}><Button type="submit" disabled={!gscProperty?.trim()}>Synchronizuj</Button></form>
    </div>
  );
}

export async function GscStatsSection({ projectId, lastDate }: { projectId: string; lastDate: string }) {
  const w = gscWindows(lastDate);
  const [cur, prev] = await Promise.all([
    getGscTotals(projectId, w.cur.from, w.cur.to),
    getGscTotals(projectId, w.prev.from, w.prev.to),
  ]);
  const curCtr = ctr(cur.clicks, cur.impressions);
  const detail = (d: number | null) => `28 dni · ${changeText(d)}`;
  const positionChange = positionChangeText(cur.position, prev.position);
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Kliknięcia" value={cur.clicks === null ? NO_VALUE : fmtNumber(cur.clicks)} detail={detail(delta(cur.clicks, prev.clicks))} />
      <StatTile label="Wyświetlenia" value={cur.impressions === null ? NO_VALUE : fmtNumber(cur.impressions)} detail={detail(delta(cur.impressions, prev.impressions))} />
      <StatTile label="CTR" value={curCtr === null ? NO_VALUE : dec(curCtr * 100)} unit={curCtr === null ? undefined : "%"}
        detail={detail(delta(curCtr, ctr(prev.clicks, prev.impressions)))} />
      <StatTile label="Średnia pozycja" value={dec(cur.position)} detail={positionChange ? `28 dni · ${positionChange}` : "28 dni"} />
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

export function OpportunityList({ items }: { items: Opportunity[] }) {
  if (items.length === 0) return <EmptyList>Brak szans w tej grupie</EmptyList>;
  return (
    <Rows>
      {items.map((o) => {
        const tag = o.kind === "new" ? "nowa" : o.kind === "lost" ? "utracona" : null;
        const gain = Math.max(1, Math.round(o.potentialClicks));
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
            <span className="font-mono text-sm font-semibold tabular-nums">{`${lost ? "\u2212" : "+"}${pluralPl(gain, ["kliknięcie", "kliknięcia", "kliknięć"])}/28 dni`}</span>
          </Row>
        );
      })}
    </Rows>
  );
}

export async function OpportunitiesSection({ projectId, lastDate }: { projectId: string; lastDate: string }) {
  const w = gscWindows(lastDate);
  const [rows, pages, queryPages] = await Promise.all([
    getQueryWindows(projectId, w, QUERY_LIMIT),
    getTopPages(projectId, w.cur.from, w.cur.to, PAGE_LIMIT),
    getQueryPages(projectId, w.cur.from, w.cur.to),
  ]);
  const curve = ctrCurve(rows.map((r) => r.cur));
  const groups: { title: string; hint: string; items: Opportunity[] }[] = [
    { title: "Blisko top 3", hint: "Frazy na pozycjach 4-20: wyższa pozycja da więcej kliknięć.", items: topOpportunities(strikingDistance(rows, curve)) },
    { title: "Niski CTR", hint: "W top 10, ale klikalność poniżej połowy oczekiwanej: popraw tytuł i opis.", items: topOpportunities(lowCtr([...rows, ...pages], curve)) },
    { title: "Kanibalizacja", hint: "Kilka Waszych stron konkuruje o tę samą frazę.", items: topOpportunities(cannibalization(queryPages)) },
    { title: "Nowe i utracone frazy", hint: "Frazy, które pojawiły się albo zniknęły wobec poprzednich 28 dni.", items: topOpportunities(newAndLost(rows)) },
  ];
  return (
    <section>
      <SectionHead title="Szanse" meta={<Meta>ostatnie 28 dni</Meta>} />
      <div className="grid gap-10 xl:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="text-xl font-semibold">{g.title}</h3>
            <Meta className="mb-4 mt-1 block normal-case tracking-normal">{g.hint}</Meta>
            <OpportunityList items={g.items} />
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
