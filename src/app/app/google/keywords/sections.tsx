import type { Tables } from "@/lib/db-types";
import { getKeywordJobs, getKeywords, getResearchTargets, getSuggestions, type KeywordRow, type SuggestionRow } from "@/lib/seo/keyword-queries";
import { COMPETITION_LABEL, DEFAULT_SEEDS } from "@/lib/seo/keywords";
import { MAX_SEEDS } from "@/lib/seo/keyword-research";
import { estimateResearchCost, estimateVolumesCost } from "@/lib/seo/costs";
import { isInterruptedJob } from "@/lib/seo/overview";
import { fmtDate, fmtDay, fmtDayShort, fmtDecimal, fmtNumber } from "@/lib/format/number";
import { pluralFmt, pluralPl } from "@/lib/format/plural";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Meta, Row, Rows, SectionHead, Tile } from "@/components/psai";
import { Sparkline } from "@/components/Sparkline";
import {
  acceptSuggestion, addKeywords, deleteKeyword, dismissSuggestion, importFromGsc, refreshVolumes, runResearch, setTargetPath, toggleKeyword,
} from "./actions";

/** Rows read for each suggestion list. */
const SUGGESTION_LIMIT = 100;
/** Months shown in the volume sparkline. */
const SPARKLINE_MONTHS = 12;
const NO_DATA = "brak danych";

const usd = (n: number) => `${fmtDecimal(n, 2)} USD`;
/** Costs of one more seed or domain are a few cents: three decimals keep 0,018 from rounding to 0,02. */
const usdPrecise = (n: number) => `${fmtDecimal(n, 3)} USD`;
const volumeText = (v: number | null) => (v === null ? NO_DATA : `${fmtNumber(v)} / mies.`);

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[28px] bg-s1 px-6 py-6 text-t1 md:px-8">{children}</p>;
}

const figure = "font-mono text-sm tabular-nums";

// --- Stan ---------------------------------------------------------------------------------------------------------

const JOB_STATUS: Record<string, string> = {
  running: "w toku", done: "zakończone", failed: "nieudane", skipped: "pominięte", budget_exceeded: "limit SEO wyczerpany",
};
/** A job `running` for more than 45 minutes will never finish: the task died without closing its entry. */
const INTERRUPTED = "przerwane";
/** Statuses whose `error` explains what happened (a finished job has none). */
const EXPLAINED = new Set(["failed", "budget_exceeded", "skipped"]);

function JobLine({ label, none, job, now }: { label: string; none: string; job: Tables<"seo_jobs"> | null; now: Date }) {
  if (!job) return <Meta className="block">{none}</Meta>;
  const interrupted = isInterruptedJob(job, now);
  const bad = interrupted || job.status === "failed" || job.status === "budget_exceeded";
  const cost = job.status === "running" ? "" : ` · koszt ${usd(Number(job.cost_usd))}`;
  return (
    <>
      <Meta className="block">
        {`${label}: `}<span className={bad ? "text-red" : "text-t0"}>{interrupted ? INTERRUPTED : (JOB_STATUS[job.status] ?? job.status)}</span>
        {` · ${fmtDate(job.finished_at ?? job.started_at)}${cost}`}
      </Meta>
      {job.error && EXPLAINED.has(job.status) && !interrupted && (
        <Meta className={`block normal-case tracking-normal ${job.status === "skipped" ? "" : "text-red"}`}>{job.error}</Meta>
      )}
    </>
  );
}

export async function KeywordStatusSection({ projectId, now = new Date() }: { projectId: string; now?: Date }) {
  const [{ volumes, research }, keywords] = await Promise.all([getKeywordJobs(projectId), getKeywords(projectId)]);
  const active = keywords.filter((k) => k.active).length;
  // an upper bound (every active phrase has a volume and a trend), so the label says "najwyżej", never "ok."
  const estimate = estimateVolumesCost(active, active);
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <JobLine label="Wolumeny i trendy" none="Jeszcze nie odświeżano wolumenów." job={volumes} now={now} />
        <JobLine label="Wyszukiwanie fraz" none="Jeszcze nie szukano fraz." job={research} now={now} />
      </div>
      <div className="space-y-1 sm:text-right">
        <form action={refreshVolumes}>
          <Button type="submit" disabled={active === 0}>{`Odśwież wolumeny i trendy (najwyżej ${usd(estimate)})`}</Button>
        </form>
        {active === 0 && <Meta className="block normal-case tracking-normal">Dodaj albo włącz frazy, żeby je mierzyć.</Meta>}
      </div>
    </div>
  );
}

// --- Przyciski przy podpowiedziach --------------------------------------------------------------------------------

function SuggestionActions({ id, text, dismissible }: { id: string; text: string; dismissible: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <form action={acceptSuggestion}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" size="sm" aria-label={`Śledź frazę „${text}”`}>Śledź</Button>
      </form>
      {dismissible && (
        <form action={dismissSuggestion}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="quiet" aria-label={`Odrzuć frazę „${text}”`}>Odrzuć</Button>
        </form>
      )}
    </div>
  );
}

// --- Gdzie już jesteście w Google ---------------------------------------------------------------------------------

/** The newest of the timestamps (ISO, Postgres may write the offset differently, so compare as instants), or null. */
function latestStamp(stamps: string[]): string | null {
  let best: number | null = null;
  for (const stamp of stamps) {
    const t = Date.parse(stamp);
    if (Number.isFinite(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

/**
 * Every phrase our own domain ranks for (tracked ones too: they carry a muted label instead of the "Śledź" button).
 * The rows are refreshed together by a research run, so the newest refresh is the date of the last research.
 */
export async function RankedSection({ projectId }: { projectId: string }) {
  const rows = await getSuggestions(projectId, "ranked", SUGGESTION_LIMIT);
  const researchedAt = latestStamp(rows.map((s) => s.updatedAt));
  return (
    <section>
      <SectionHead title="Gdzie już jesteście w Google" />
      {rows.length === 0
        ? <EmptyList>Uruchom wyszukiwanie fraz poniżej.</EmptyList>
        : (
          <>
            <Rows>
              {rows.map((s) => (
                <Row key={s.id}>
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="break-words font-medium">{s.text}</p>
                    {s.ownUrl && <Meta className="mt-1 block break-words normal-case tracking-normal">{s.ownUrl}</Meta>}
                  </div>
                  <span className={figure}>{s.ownPosition === null ? NO_DATA : `pozycja ${fmtNumber(s.ownPosition)}`}</span>
                  <span className={figure}>{volumeText(s.searchVolume)}</span>
                  {s.tracked ? <Meta>śledzona</Meta> : <SuggestionActions id={s.id} text={s.text} dismissible={false} />}
                </Row>
              ))}
            </Rows>
            <Meta className="mt-3 block normal-case tracking-normal">
              {researchedAt ? `według indeksu DataForSEO, stan na ${fmtDay(researchedAt)}` : "według indeksu DataForSEO"}
            </Meta>
          </>
        )}
    </section>
  );
}

// --- Śledzone frazy -----------------------------------------------------------------------------------------------

const SOURCE_LABEL: Record<string, string> = {
  manual: "dodana ręcznie", gsc: "z Search Console", suggestion: "z podpowiedzi", ranked: "już rankujecie", gap: "luka wobec konkurencji",
};

/** "od 1200 do 1900": the first and the last reading, so the sentence says which way the line goes. */
function rangeText(values: (number | null)[]): string {
  const numbers = values.filter((v): v is number => v !== null);
  return `od ${fmtNumber(numbers[0])} do ${fmtNumber(numbers[numbers.length - 1])}`;
}

function TrendCell({ caption, label, values }: { caption: string; label: string; values: (number | null)[] }) {
  if (values.filter((v) => v !== null).length < 2) return null;
  return (
    <div className="grid gap-1">
      <Sparkline values={values} label={`${label}: ${rangeText(values)}`} />
      <Meta>{caption}</Meta>
    </div>
  );
}

function KeywordItem({ k }: { k: KeywordRow }) {
  const months = k.monthlySearches.slice(-SPARKLINE_MONTHS).map((m) => m.searchVolume);
  const competition = k.competition === null ? NO_DATA : (COMPETITION_LABEL[k.competition] ?? k.competition);
  return (
    <Row className="items-start gap-y-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className="break-words font-medium">
          {k.text}
          {!k.active && <Meta className="ml-2">wstrzymana</Meta>}
        </p>
        <Meta className="mt-1 block">{SOURCE_LABEL[k.source] ?? k.source}</Meta>
      </div>
      <div className="basis-44">
        <span className={`${figure} font-semibold`}>{volumeText(k.searchVolume)}</span>
        {k.volumeUpdatedAt && <Meta className="ml-2 normal-case tracking-normal">{`stan na ${fmtDayShort(k.volumeUpdatedAt)}`}</Meta>}
        <Meta className="mt-1 block normal-case tracking-normal">{`konkurencja: ${competition}`}</Meta>
        <Meta className="block normal-case tracking-normal">{`CPC: ${k.cpc === null ? NO_DATA : usd(k.cpc)}`}</Meta>
      </div>
      <div className="flex items-start gap-4">
        <TrendCell caption="12 mies." label={`Wolumen frazy „${k.text}” w ostatnich miesiącach`} values={months} />
        <TrendCell caption="Trends" label={`Google Trends dla frazy „${k.text}”`} values={k.trend.map((p) => p.value)} />
      </div>
      <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2">
        <form action={setTargetPath} className="flex items-center gap-2">
          <input type="hidden" name="id" value={k.id} />
          <Input name="target_path" defaultValue={k.targetPath ?? ""} placeholder="/docelowa-strona" maxLength={200} pattern="/\S*"
            aria-label={`Docelowa strona dla frazy ${k.text}`} className="w-56" />
          <Button type="submit" variant="outline" size="sm">Zapisz</Button>
        </form>
        <form action={toggleKeyword}>
          <input type="hidden" name="id" value={k.id} />
          <input type="hidden" name="active" value={String(!k.active)} />
          <Button type="submit" variant="quiet" className={k.active ? "text-teal" : "text-t2"}>{k.active ? "Wstrzymaj" : "Wznów"}</Button>
        </form>
        <form action={deleteKeyword}>
          <input type="hidden" name="id" value={k.id} />
          <Button type="submit" variant="danger-quiet" aria-label={`Usuń frazę „${k.text}”`}>Usuń</Button>
        </form>
      </div>
    </Row>
  );
}

export async function TrackedSection({ projectId, hasGscData }: { projectId: string; hasGscData: boolean }) {
  const keywords = await getKeywords(projectId);
  const importHint = "Najpierw zsynchronizuj Search Console na stronie Przegląd.";
  return (
    <section>
      <SectionHead title="Śledzone frazy" meta={<Meta>{pluralFmt(keywords.length, ["fraza", "frazy", "fraz"])}</Meta>} />
      {keywords.length === 0
        ? <EmptyList>Brak śledzonych fraz. Dodaj je poniżej, zaimportuj z Search Console albo uruchom wyszukiwanie fraz.</EmptyList>
        : <Rows>{keywords.map((k) => <KeywordItem key={k.id} k={k} />)}</Rows>}
      <Tile className="mt-6">
        <form action={addKeywords} className="grid gap-3">
          <Label htmlFor="new-keywords">Dodaj frazy (każda w osobnej linii)</Label>
          <Textarea id="new-keywords" name="keywords" rows={4} placeholder={"szkolenia ai dla firm\nkurs chatgpt"} />
          <div><Button type="submit">Dodaj frazy</Button></div>
        </form>
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <form action={importFromGsc}>
            <Button type="submit" variant="outline" disabled={!hasGscData} title={hasGscData ? undefined : importHint}>Importuj z Search Console</Button>
          </form>
          <Meta className="normal-case tracking-normal">
            {hasGscData ? "Dodaje do 50 fraz z największą liczbą wyświetleń z ostatnich 28 dni." : importHint}
          </Meta>
        </div>
      </Tile>
    </section>
  );
}

// --- Luki, podpowiedzi --------------------------------------------------------------------------------------------

export async function GapSection({ projectId }: { projectId: string }) {
  const rows = await getSuggestions(projectId, "gap", SUGGESTION_LIMIT);
  return (
    <section>
      <SectionHead title="Luki: konkurencja jest wyżej" />
      {rows.length === 0
        ? <EmptyList>Brak luk. Zaznacz „Sprawdź też konkurencję” w wyszukiwaniu fraz poniżej.</EmptyList>
        : (
          <Rows>
            {rows.map((s) => {
              const best = s.competitors[0];
              return (
                <Row key={s.id}>
                  <span className="min-w-0 flex-1 basis-60 break-words font-medium">{s.text}</span>
                  <span className={figure}>{volumeText(s.searchVolume)}</span>
                  <span className="text-sm text-t1">{best ? `${best.name}: ${best.position}. miejsce` : NO_DATA}</span>
                  <SuggestionActions id={s.id} text={s.text} dismissible />
                </Row>
              );
            })}
          </Rows>
        )}
    </section>
  );
}

function SuggestionItem({ s }: { s: SuggestionRow }) {
  return (
    <Row>
      <div className="min-w-0 flex-1 basis-60">
        <p className="break-words font-medium">{s.text}</p>
        {s.seed && <Meta className="mt-1 block normal-case tracking-normal">{`z hasła „${s.seed}”`}</Meta>}
      </div>
      <span className={figure}>{volumeText(s.searchVolume)}</span>
      <span className="text-sm text-t1">{s.keywordDifficulty === null ? NO_DATA : `trudność ${fmtNumber(s.keywordDifficulty)}/100`}</span>
      <SuggestionActions id={s.id} text={s.text} dismissible />
    </Row>
  );
}

export async function SuggestionSection({ projectId }: { projectId: string }) {
  const rows = await getSuggestions(projectId, "labs", SUGGESTION_LIMIT);
  return (
    <section>
      <SectionHead title="Podpowiedzi fraz" />
      {rows.length === 0
        ? <EmptyList>Brak nowych podpowiedzi. Uruchom wyszukiwanie fraz poniżej.</EmptyList>
        : <Rows>{rows.map((s) => <SuggestionItem key={s.id} s={s} />)}</Rows>}
    </section>
  );
}

// --- Szukaj nowych fraz -------------------------------------------------------------------------------------------

export async function ResearchSection({ projectId, ownDomain }: { projectId: string; ownDomain: string }) {
  const { own, rivals } = await getResearchTargets(projectId, ownDomain);
  const domainForms: [string, string, string] = ["domena", "domeny", "domen"];
  // the defaults of the form: all default seeds, our own domain and every rival
  const domains = (own ? 1 : 0) + rivals;
  const total = estimateResearchCost({ seeds: DEFAULT_SEEDS.length, domains });
  const perSeed = estimateResearchCost({ seeds: 1, domains: 0 });
  const perDomain = estimateResearchCost({ seeds: 0, domains: 1 });
  const missing = !own
    ? "Dodaj domenę projektu w Ustawieniach, żeby sprawdzić widoczność i luki."
    : rivals === 0 ? "Dodaj konkurentów w Ustawieniach, żeby szukać luk." : null;
  return (
    <section>
      <SectionHead title="Szukaj nowych fraz" />
      <Tile>
        <form action={runResearch} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="seeds">{`Hasła wyjściowe (każde w osobnej linii, do ${MAX_SEEDS})`}</Label>
            <Textarea id="seeds" name="seeds" rows={8} defaultValue={DEFAULT_SEEDS.join("\n")} />
            <Meta className="normal-case tracking-normal">
              Dla każdego hasła Google podpowiada pokrewne frazy z wolumenem. Sprawdzamy też, na jakie frazy Wasza domena już rankuje.
            </Meta>
          </div>
          <div className="grid gap-2">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="competitors" defaultChecked={rivals > 0} disabled={rivals === 0} className="size-4 accent-ink" />
              <span>{`Sprawdź też konkurencję (${pluralPl(rivals, domainForms)})`}</span>
            </label>
            {missing && <Meta className="normal-case tracking-normal">{missing}</Meta>}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit">Szukaj fraz</Button>
            <Meta className="normal-case tracking-normal">
              {`Koszt dla ustawień domyślnych: najwyżej ${usd(total)} (każde dodatkowe hasło najwyżej ${usdPrecise(perSeed)}, każda domena najwyżej ${usdPrecise(perDomain)}).`}
            </Meta>
          </div>
        </form>
      </Tile>
    </section>
  );
}
