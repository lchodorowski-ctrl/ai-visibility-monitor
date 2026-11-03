import Link from "next/link";
import { notFound } from "next/navigation";
import { Meta, PageHero, Row, Rows, SectionHead, Tile } from "@/components/psai";
import { RankHistoryChart } from "@/components/RankHistoryChart";
import type { Device } from "@/lib/dataforseo/serp";
import { domainMatches } from "@/lib/engines/domain";
import { fmtDay, fmtDecimal, fmtNumber } from "@/lib/format/number";
import type { KeywordRow } from "@/lib/seo/keyword-queries";
import { getKeywordDetail, type GscPageRow, type KeywordRankDetail } from "@/lib/seo/rank-queries";
import { featureBadges, nearTop3, positionText, rankChange, rankChangeText, rankedElsewhere, type RankChange } from "@/lib/seo/rank-view";
import { isUuid } from "@/lib/validation/uuid";
import { getCurrentProject } from "@/lib/workspace";

const DEVICES: readonly Device[] = ["desktop", "mobile"];
const DEVICE_LABEL: Record<Device, string> = { desktop: "Komputer", mobile: "Telefon" };
const CHANGE_TONE: Record<RankChange["kind"], string> = {
  up: "text-teal", new: "text-teal", down: "text-red", lost: "text-red", same: "text-t2", none: "",
};
const PILL = "rounded-full border px-2 py-0.5 normal-case tracking-normal";
const figure = "font-mono text-sm tabular-nums";

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[28px] bg-s1 px-6 py-6 text-t1 md:px-8">{children}</p>;
}

/** One device: the newest position, the change against the previous check, the ranking address and the badges. */
function DeviceTile({ device, reading, keyword }: { device: Device; reading: KeywordRankDetail | undefined; keyword: KeywordRow }) {
  if (!reading) {
    return (
      <Tile>
        <Meta>{DEVICE_LABEL[device]}</Meta>
        <p className="mt-4 text-t1">Jeszcze nie sprawdzano.</p>
      </Tile>
    );
  }
  const change = rankChange(reading);
  const badges = featureBadges(reading.features);
  const near = nearTop3(reading.position, keyword.searchVolume);
  const elsewhere = rankedElsewhere(reading.url, keyword.targetPath);
  const address = reading.url ?? reading.breadcrumb;
  return (
    <Tile>
      <Meta>{DEVICE_LABEL[device]}</Meta>
      <p className="mt-4 text-[40px] font-semibold leading-none">{positionText(reading.position)}</p>
      {change.kind !== "none" && (
        <p className="mt-3 text-sm">
          <span className={CHANGE_TONE[change.kind]}>{rankChangeText(change)}</span>
          {reading.prevWeekStart && <Meta className="ml-2 normal-case tracking-normal">{`wobec tygodnia od ${fmtDay(reading.prevWeekStart)}`}</Meta>}
        </p>
      )}
      <Meta className="mt-3 block normal-case tracking-normal">{`tydzień od ${fmtDay(reading.weekStart)}`}</Meta>
      {address && <Meta className="mt-1 block break-words normal-case tracking-normal">{address}</Meta>}
      {(near || elsewhere || badges.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {near && <Meta className={`${PILL} border-teal text-teal`}>blisko top 3</Meta>}
          {elsewhere && <Meta className={`${PILL} border-line-3 text-t0`}>rankuje inna strona niż docelowa</Meta>}
          {badges.map((badge) => <Meta key={badge} className={`${PILL} border-line-2`}>{badge}</Meta>)}
        </div>
      )}
    </Tile>
  );
}

/**
 * The ten best results of the newest check on the computer. Our own domain is bold (and says so in words, for screen
 * readers); a result of a rival carries its name. A result Google hid behind a redirect has no address, so it shows the
 * breadcrumb instead.
 */
function Top10Section({ reading, ownDomains }: { reading: KeywordRankDetail | undefined; ownDomains: string[] }) {
  const entries = reading?.top10 ?? [];
  const rivals = reading?.competitors ?? [];
  return (
    <section>
      <SectionHead title="Top 10 w Google" meta={reading && <Meta>{`komputer, tydzień od ${fmtDay(reading.weekStart)}`}</Meta>} />
      {entries.length === 0
        ? <EmptyList>Brak zapisanych wyników z komputera.</EmptyList>
        : (
          <Rows>
            {entries.map((e, i) => {
              const ours = domainMatches(e.domain, ownDomains);
              const rival = rivals.find((c) => c.position === e.position && c.domain === e.domain);
              const address = e.url ?? e.breadcrumb;
              return (
                <Row key={`${e.position}:${e.domain}:${i}`} className="items-start">
                  <span className={`${figure} w-8 shrink-0 text-t2`}>{`${e.position}.`}</span>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className={`break-words ${ours ? "font-bold" : "font-medium"}`}>{e.title || e.domain || "bez tytułu"}</p>
                    {address && <Meta className="mt-1 block break-words normal-case tracking-normal">{address}</Meta>}
                  </div>
                  {ours && <Meta>Wasza domena</Meta>}
                  {rival && <Meta>{rival.name}</Meta>}
                </Row>
              );
            })}
          </Rows>
        )}
    </section>
  );
}

const gscFigures = (g: GscPageRow) =>
  `kliknięcia ${fmtNumber(g.clicks)} · wyświetlenia ${fmtNumber(g.impressions)} · pozycja ${g.position === null ? "brak" : fmtDecimal(g.position)}`;

function GscSection({ pages }: { pages: GscPageRow[] }) {
  return (
    <section>
      <SectionHead title="Search Console, ostatnie 28 dni" />
      {pages.length === 0
        ? <EmptyList>Brak wyświetleń tej frazy w Search Console.</EmptyList>
        : (
          <Rows>
            {pages.map((g) => (
              <Row key={g.page}>
                <span className="min-w-0 flex-1 break-words">{g.page}</span>
                <Meta>{gscFigures(g)}</Meta>
              </Row>
            ))}
          </Rows>
        )}
    </section>
  );
}

export default async function KeywordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getCurrentProject();
  const detail = await getKeywordDetail(project.id, id);
  if (!detail) notFound();
  const { keyword, history, latest, gsc } = detail;

  return (
    <div className="space-y-20">
      <div>
        <section className="pt-6">
          <Link href="/app/google/keywords" className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">← Wszystkie frazy</Link>
        </section>
        <PageHero eyebrow="Polska Szkoła AI · Google" title={keyword.text} />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
          <Meta>{`wolumen: ${keyword.searchVolume === null ? "brak danych" : `${fmtNumber(keyword.searchVolume)} / mies.`}`}</Meta>
          {keyword.targetPath && <Meta className="normal-case tracking-normal">{`docelowa strona: ${keyword.targetPath}`}</Meta>}
          {!keyword.active && <Meta>wstrzymana</Meta>}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {DEVICES.map((device) => <DeviceTile key={device} device={device} reading={latest[device]} keyword={keyword} />)}
        </div>
      </div>

      <Tile>
        <SectionHead title="Historia pozycji" meta={<Meta>tydzień po tygodniu</Meta>} />
        <RankHistoryChart points={history} />
      </Tile>

      <Top10Section reading={latest.desktop} ownDomains={project.domains} />
      <GscSection pages={gsc} />
    </div>
  );
}
