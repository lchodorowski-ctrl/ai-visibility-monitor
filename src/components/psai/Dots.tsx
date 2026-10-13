export function Dots({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="font-mono text-[11px] tracking-[0.2em] text-t2" aria-label={`${label} ${v} z 5`}>
      {"●".repeat(v)}
      {"○".repeat(5 - v)}
    </span>
  );
}
