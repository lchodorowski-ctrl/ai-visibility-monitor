export type RecType = "content_new" | "content_improve" | "offsite" | "technical" | "fact_fix";
export type RecStatus = "todo" | "doing" | "done" | "dismissed";

export const TYPE_LABEL: Record<RecType, string> = {
  content_new: "Nowa treść",
  content_improve: "Popraw stronę",
  offsite: "Poza stroną",
  technical: "Techniczne",
  fact_fix: "Korekta faktów",
};

export const STATUS_LABEL: Record<RecStatus, string> = {
  todo: "Do zrobienia",
  doing: "W toku",
  done: "Zrobione",
  dismissed: "Odrzucone",
};

export function effortLabel(e: number): string {
  return e <= 2 ? "mały" : e === 3 ? "średni" : "duży";
}

// priority = impact*2 - effort, zakres -3..9
export function priorityLabel(p: number): "wysoki" | "średni" | "niski" {
  return p >= 6 ? "wysoki" : p >= 3 ? "średni" : "niski";
}
