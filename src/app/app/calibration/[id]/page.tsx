import Link from "next/link";
import { notFound } from "next/navigation";
import { Meta, PageHero, SectionHead, Tile } from "@/components/psai";
import { getCalibration, type CalibrationCheckView } from "@/lib/calibration/queries";
import { fmtDate } from "@/lib/format/number";
import { isUuid } from "@/lib/validation/uuid";
import { getCurrentProject } from "@/lib/workspace";
import { closeCalibration } from "../actions";
import { CheckRow, CopyPromptButton } from "../CheckRow";
import { ResultsSection } from "../ResultsSection";
import { SubmitButton } from "../SubmitButton";

function groupByPrompt(checks: CalibrationCheckView[]): { promptId: string; promptText: string; checks: CalibrationCheckView[] }[] {
  const groups = new Map<string, { promptId: string; promptText: string; checks: CalibrationCheckView[] }>();
  for (const c of checks) {
    const g = groups.get(c.promptId) ?? { promptId: c.promptId, promptText: c.promptText, checks: [] };
    g.checks.push(c);
    groups.set(c.promptId, g);
  }
  return [...groups.values()];
}

export default async function CalibrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getCurrentProject();
  const view = await getCalibration(project.id, id);
  if (!view) notFound();

  const readOnly = view.status === "closed";
  const groups = groupByPrompt(view.checks);

  return (
    <div className="space-y-20">
      <div>
        <section className="pt-6">
          <Link href="/app/calibration" className="text-sm text-t1 underline-offset-4 hover:text-t0 hover:underline">← Kalibracja</Link>
        </section>
        <PageHero
          eyebrow="Kalibracja"
          title={`Kalibracja z ${fmtDate(view.created_at)}`}
          actions={readOnly ? undefined : (
            <form action={closeCalibration}>
              <input type="hidden" name="id" value={view.id} />
              <SubmitButton>Zakończ kalibrację</SubmitButton>
            </form>
          )}
        />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
          <Meta>{view.run ? `pomiar z ${fmtDate(view.run.started_at)}` : "pomiar usunięty"}</Meta>
          {readOnly && view.closed_at && <Meta>{`Zakończona ${fmtDate(view.closed_at)}`}</Meta>}
        </div>
      </div>

      <ResultsSection view={view} brandAliases={project.brand_aliases} brandName={project.brand_name} />

      <section>
        <SectionHead title="Wyniki ręczne" />
        <Meta className="mb-6 block">Zadaj pytanie w nowej sesji, bez logowania, z włączonym wyszukiwaniem</Meta>
        <div className="space-y-4">
          {groups.map((g) => (
            <Tile key={g.promptId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h3 className="min-w-0 basis-64 flex-1 text-[18px] font-semibold leading-snug">{g.promptText}</h3>
                <CopyPromptButton text={g.promptText} />
              </div>
              <div className="mt-4">
                {g.checks.map((c) => <CheckRow key={c.id} check={c} calibrationId={view.id} readOnly={readOnly} />)}
              </div>
            </Tile>
          ))}
        </div>
      </section>
    </div>
  );
}
