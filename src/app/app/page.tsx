import { Button } from "@/components/ui/button";
import { runNow } from "./actions";

export default function OverviewPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Przegląd</h1>
      <form action={runNow}>
        <Button type="submit">Uruchom teraz</Button>
      </form>
    </div>
  );
}
