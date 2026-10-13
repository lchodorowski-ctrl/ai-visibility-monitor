import { cn } from "cn";

export function Dots({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span role="img" className={cn("font-mono text-[11px] tracking-[0.2em] text-t2", className)} aria-label={`${label} ${v} z 5`}>
      {"●".repeat(v)}
      {"○".repeat(5 - v)}
    </span>
  );
}
