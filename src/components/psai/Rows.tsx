import Link from "next/link";
import { cn } from "cn";

export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("rounded-[28px] bg-s1 px-6 py-2 md:px-8", className)}>{children}</ul>;
}

export function Row({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const inner = cn("flex min-h-13 flex-wrap items-center gap-x-6 gap-y-1 py-4", className);
  return (
    <li className="border-t border-line first:border-t-0">
      {href ? (
        <Link href={href} className={cn(inner, "-mx-2 rounded-lg px-2 transition hover:bg-bg/60")}>
          {children}
        </Link>
      ) : (
        <div className={inner}>{children}</div>
      )}
    </li>
  );
}
