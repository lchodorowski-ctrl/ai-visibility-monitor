import { Fragment } from "react";
import { cn } from "cn";
import { EmptyState, Meta, PageHero, Row, Rows } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { calibrationTone } from "@/lib/calibration/compare";
import { CALIBRATION_ENGINE_LABEL } from "@/lib/calibration/engines";
import { getLatestDoneRun, listCalibrations } from "@/lib/calibration/queries";
import { fmtDate } from "@/lib/format/number";
import { getCurrentProject } from "@/lib/workspace";
import { createCalibration } from "./actions";
import { TONE_CLASS } from "./ResultsSection";

const SHORT_LABEL = { openai: "ChatGPT", perplexity: "Perplexity", google_ai_overview: "Google" } as const;

export default async function CalibrationListPage() {
  const project = await getCurrentProject();
  const [items, run] = await Promise.all([listCalibrations(project.id), getLatestDoneRun(project.id)]);

  const newButton = (
    <form action={createCalibration} className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!run}>Nowa kalibracja</Button>
      {!run && <Meta>Najpierw uruchom pomiar</Meta>}
    </form>
  );

  return (
    <div className="space-y-12">
      <PageHero eyebrow="Ustawienia · Kalibracja" title="Kalibracja" actions={newButton} />
      <p className="max-w-2xl text-t1">
        Raz w miesiącu sprawdź, czy wyniki, które aplikacja mierzy przez API, zgadzają się z tym, co człowiek widzi w publicznych czatach.
      </p>

      {items.length === 0 ? (
        <EmptyState title="Jeszcze nie było kalibracji" description="Utwórz pierwszą kalibrację na podstawie ostatniego pomiaru." />
      ) : (
        <Rows>
          {items.map((c) => (
            <Row key={c.id} href={`/app/calibration/${c.id}`} className="justify-between gap-y-2">
              <span className="text-[15px] font-medium">{fmtDate(c.created_at)}</span>
              <Meta>{c.status === "open" ? "otwarta" : "zakończona"}</Meta>
              <span className="text-sm text-t1">
                {c.agreement.map((a, i) => (
                  <Fragment key={a.engineId}>
                    {i > 0 && " · "}
                    <span title={CALIBRATION_ENGINE_LABEL[a.engineId]}>{`${SHORT_LABEL[a.engineId]} `}</span>
                    <span className={cn(a.rate !== null && TONE_CLASS[calibrationTone(a.rate)])}>
                      {a.rate === null ? "—" : `${a.agreed}/${a.checked}`}
                    </span>
                  </Fragment>
                ))}
              </span>
            </Row>
          ))}
        </Rows>
      )}
    </div>
  );
}
