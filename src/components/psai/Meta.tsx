import { cn } from "cn";

export function Meta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[11px] uppercase tracking-[0.08em] text-t2", className)}>{children}</span>;
}
