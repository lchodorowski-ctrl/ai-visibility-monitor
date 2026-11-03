"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Kolejne milestony dopisują tu swoje pozycje (Strony i audyt).
export const GOOGLE_NAV: readonly (readonly [string, string])[] = [
  ["/app/google", "Przegląd"],
  ["/app/google/keywords", "Frazy"],
];

export function GoogleSubNav({ items = GOOGLE_NAV }: { items?: readonly (readonly [string, string])[] }) {
  const pathname = usePathname();
  // Jedna pozycja to nie menu: podmenu pojawia się dopiero, gdy jest między czym wybierać.
  if (items.length < 2) return null;
  return (
    <nav aria-label="Google" className="-mx-2 mb-10 flex items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
      {items.map(([href, label]) => {
        const active = href === "/app/google" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition", active ? "font-medium text-t0" : "text-t1 hover:text-t0")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
