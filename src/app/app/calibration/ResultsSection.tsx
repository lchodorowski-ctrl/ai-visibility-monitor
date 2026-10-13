import Link from "next/link";
import { cn } from "cn";
import { EmptyState, Meta, Row, Rows, SectionHead, Tile } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { agreementByEngine, calibrationToneClass, citationCoverage } from "@/lib/calibration/compare";
import { CALIBRATION_ENGINE_LABEL } from "@/lib/calibration/engines";
import { mergeAlias } from "@/lib/calibration/session";
import type { CalibrationCheckView, CalibrationView } from "@/lib/calibration/queries";
import { pct } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
import { addAliasFromCalibration } from "./actions";

function DiscrepancyRow({ check, children }: { check: CalibrationCheckView; children?: React.ReactNode }) {
  return (
    <Row className="gap-y-2">
      <span className="min-w-0 basis-64 flex-1 text-[15px]">{check.promptText}</span>
      <Meta>{CALIBRATION_ENGINE_LABEL[check.engineId]}</Meta>
      {check.apiResponseId && (
        <Link href={`/app/responses/${check.apiResponseId}`} className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">
          Zobacz odpowiedź API
        </Link>
      )}
      {children}
    </Row>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <Meta className="block">{title}</Meta>
      <Rows>{children}</Rows>
    </div>
  );
}

export function ResultsSection({ view, brandAliases, brandName }: { view: CalibrationView; brandAliases: string[]; brandName?: string }) {
  // Nazwa marki też liczy się jako znana fraza, tak samo jak w akcji dodawania aliasu.
  const knownNames = brandName ? [brandName, ...brandAliases] : brandAliases;
  const agreement = agreementByEngine(view.checks.map((c) => ({ promptId: c.promptId, engineId: c.engineId, result: c.result })));
  const apiOnly = view.checks.filter((c) => c.result === "api_only");
  const manualOnly = view.checks.filter((c) => c.result === "manual_only");
  const discrepancies = apiOnly.length + manualOnly.length;
  const noData = view.checks.filter((c) => c.api === "no_data" && c.manualMentioned !== null);
  const coverage = view.checks
    .filter((c) => c.api !== "no_data" && c.manualUrls.length > 0)
    .reduce((acc, c) => {
      const r = citationCoverage(c.manualUrls, c.apiDomains);
      return { matched: acc.matched + r.matched, total: acc.total + r.total };
    }, { matched: 0, total: 0 });

  return (
    <div className="space-y-16">
      <section>
        <SectionHead title="Zgodność" />
        <div className="grid gap-4 md:grid-cols-3">
          {agreement.map((a) => (
            <Tile key={a.engineId}>
              <Meta>{CALIBRATION_ENGINE_LABEL[a.engineId]}</Meta>
              {a.rate === null ? (
                <>
                  <p className="mt-3 text-[44px] font-semibold leading-none text-t2">—</p>
                  <Meta className="mt-3">nic nie sprawdzono</Meta>
                </>
              ) : (
                <>
                  <p className={cn("mt-3 text-[44px] font-semibold leading-none", calibrationToneClass(a.rate))}>{`${a.agreed} z ${a.checked}`}</p>
                  <Meta className="mt-3">{pct(a.rate)}</Meta>
                </>
              )}
            </Tile>
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Rozbieżności" meta={<Meta>{pluralPl(discrepancies, ["rozbieżność", "rozbieżności", "rozbieżności"])}</Meta>} />
        {discrepancies === 0 ? (
          <EmptyState title="Brak rozbieżności" description="Wyniki ręczne i wyniki API zgadzają się we wszystkich sprawdzonych wierszach." />
        ) : (
          <div className="space-y-8">
            {apiOnly.length > 0 && (
              <Group title="API: wzmianka, czat: brak">
                {apiOnly.map((c) => <DiscrepancyRow key={c.id} check={c} />)}
              </Group>
            )}
            {manualOnly.length > 0 && (
              <Group title="czat: wzmianka, API: brak">
                {manualOnly.map((c) => {
                  const alias = c.manualAlias?.trim() ?? "";
                  return (
                    <DiscrepancyRow key={c.id} check={c}>
                      {alias && (mergeAlias(knownNames, alias) === null
                        ? <Meta>już w aliasach</Meta>
                        : (
                          <form action={addAliasFromCalibration}>
                            <input type="hidden" name="calibrationId" value={view.id} />
                            <input type="hidden" name="alias" value={alias} />
                            <Button type="submit" variant="quiet" className="whitespace-normal text-left">{`Dodaj „${alias}” do aliasów`}</Button>
                          </form>
                        ))}
                    </DiscrepancyRow>
                  );
                })}
              </Group>
            )}
          </div>
        )}
        {noData.length > 0 && (
          <div className="mt-8">
            <Group title="Brak danych z API">
              {noData.map((c) => (
                <DiscrepancyRow key={c.id} check={c}>
                  <Meta>silnik nie dał poprawnej odpowiedzi w tym pomiarze — wiersz nie liczy się do zgodności</Meta>
                </DiscrepancyRow>
              ))}
            </Group>
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Cytowania" />
        <Tile>
          <Meta>
            {coverage.total === 0
              ? "Nie wpisano cytowanych adresów"
              : `Aplikacja widziała ${coverage.matched} z ${coverage.total} domen wskazanych ręcznie`}
          </Meta>
        </Tile>
      </section>
    </div>
  );
}
