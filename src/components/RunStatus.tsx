import type { Tables } from "@/lib/db-types";

const LABEL: Record<string, string> = {
  running: "w toku", done: "zakończony", failed: "nieudany", budget_exceeded: "budżet wyczerpany", empty: "brak promptów/silników",
};

export function RunStatus({ run }: { run: Tables<"runs"> | null }) {
  if (!run) return <p className="text-sm text-muted-foreground">Jeszcze nie było żadnego pomiaru.</p>;
  return (
    <p className="text-sm text-muted-foreground">
      Ostatni run: <b className="text-foreground">{LABEL[run.status] ?? run.status}</b> · {new Date(run.started_at).toLocaleString("pl-PL")} · {run.queries_total} zapytań,
      {" "}{run.queries_failed} błędów · {Number(run.cost_usd).toFixed(2)} USD{run.error && <> · <span className="text-destructive">{run.error}</span></>}
    </p>
  );
}
