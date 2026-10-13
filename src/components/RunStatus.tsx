import type { Tables } from "@/lib/db-types";
import { isRunStale } from "@/lib/runs/stale";
import { fmtDate } from "@/lib/format/number";
import { Meta } from "@/components/psai";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = {
  running: "w toku", done: "zakończony", failed: "nieudany", budget_exceeded: "budżet wyczerpany", empty: "brak promptów/silników",
};

export function RunStatus({ run }: { run: Tables<"runs"> | null }) {
  if (!run) return <Meta>Jeszcze nie było żadnego pomiaru.</Meta>;
  const stale = isRunStale(run);
  const failed = run.status === "failed";
  const status = stale ? "w toku (prawdopodobnie przerwany)" : (LABEL[run.status] ?? run.status);
  return (
    <div className="space-y-1">
      <Meta className="block">
        Ostatni run: <span className={cn(failed ? "text-red" : "text-t0")}>{status}</span>
        {" · "}{fmtDate(run.started_at)}
        {" · "}{run.queries_total} zapytań
        {" · "}{run.queries_failed} błędów
        {" · "}{Number(run.cost_usd).toFixed(2)} USD
      </Meta>
      {run.error && <Meta className="block normal-case tracking-normal text-red">{run.error}</Meta>}
    </div>
  );
}
