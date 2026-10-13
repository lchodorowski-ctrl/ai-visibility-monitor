import { cn } from "cn";

const shimmer =
  "animate-[shimmer_1.4s_infinite] bg-[linear-gradient(90deg,var(--color-s2)_25%,var(--color-s1)_37%,var(--color-s2)_63%)] bg-[length:400%_100%]";

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-lg", shimmer, className)} />;
}

export function TileSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" className="rounded-[28px] bg-s1 p-8 md:p-12">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("mt-4 h-4", i % 2 ? "w-2/3" : "w-5/6")} />
      ))}
    </div>
  );
}
