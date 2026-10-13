import { cn } from "cn";
import { toneTextClass, type VisibilityTone } from "@/lib/metrics/tone";
import { ProgressBar } from "./ProgressBar";

export function StatTile({
  label,
  value,
  unit,
  detail,
  progress,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: React.ReactNode;
  progress?: number;
  /** Koloruje dużą liczbę stanem widoczności; bez tonu kolor się nie zmienia. */
  tone?: VisibilityTone;
}) {
  return (
    <div className="rounded-[28px] bg-s1 p-8 md:p-12">
      <h2 className="text-base font-medium text-t1">{label}</h2>
      <p className={cn("mt-3 text-[72px] font-semibold leading-none tracking-[-0.05em] md:text-[96px]", tone && toneTextClass(tone))}>
        {value}
        {unit && <span className="ml-1 text-[36px] tracking-[-0.02em] text-t2">{unit}</span>}
      </p>
      {detail && <p className="mt-3 max-w-xs text-t1">{detail}</p>}
      {progress !== undefined && <ProgressBar value={progress} label={label} />}
    </div>
  );
}
