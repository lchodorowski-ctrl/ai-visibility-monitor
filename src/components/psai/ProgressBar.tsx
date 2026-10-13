export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pctValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pctValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="mt-8 h-1.5 overflow-hidden rounded-full bg-line-2"
    >
      <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pctValue}%` }} />
    </div>
  );
}
