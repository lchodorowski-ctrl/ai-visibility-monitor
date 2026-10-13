import { setRecommendationStatus } from "./actions";
import { Button } from "@/components/ui/button";
import type { RecStatus } from "@/lib/recommend/labels";

type Next = { label: string; status: RecStatus; variant?: "quiet" | "danger-quiet" };

const NEXT: Record<RecStatus, Next[]> = {
  todo: [{ label: "Zaczynam", status: "doing" }, { label: "Zrobione", status: "done", variant: "quiet" }, { label: "Odrzuć", status: "dismissed", variant: "danger-quiet" }],
  doing: [{ label: "Zrobione", status: "done" }, { label: "Wróć do listy", status: "todo", variant: "quiet" }],
  done: [{ label: "Otwórz ponownie", status: "todo", variant: "quiet" }],
  dismissed: [{ label: "Przywróć", status: "todo", variant: "quiet" }],
};

// Na odwróconym kaflu (bg-ink) przyciski dostają tokeny bg: wypełniony jasny i kontur.
const INVERSE_PRIMARY = "bg-bg text-ink hover:bg-bg/90";
const INVERSE_SECONDARY = "border-bg/30 px-2.5 text-bg hover:bg-bg/10 hover:text-bg";

export function StatusForm({ id, status, inverse }: { id: string; status: RecStatus; inverse?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(NEXT[status] ?? []).map((n, i) => (
        <form key={n.status} action={setRecommendationStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={n.status} />
          <Button type="submit" variant={n.variant ?? "default"} size="sm"
            className={inverse ? (i === 0 ? INVERSE_PRIMARY : INVERSE_SECONDARY) : undefined}>
            {n.label}
          </Button>
        </form>
      ))}
    </div>
  );
}
