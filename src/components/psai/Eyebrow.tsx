import { cn } from "cn";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[11px] uppercase tracking-[0.14em] text-t2", className)}>{children}</p>;
}
