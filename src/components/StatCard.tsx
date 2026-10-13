import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs font-normal uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export { pct } from "@/lib/format/number";
