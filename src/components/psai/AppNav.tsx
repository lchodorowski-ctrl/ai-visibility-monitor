"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV = [
  ["/app", "Przegląd"], ["/app/prompts", "Prompty"], ["/app/recommendations", "Rekomendacje"],
  ["/app/responses", "Odpowiedzi"], ["/app/settings", "Ustawienia"],
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Główna" className="-mx-2 flex items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
      {NAV.map(([href, label]) => {
        const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
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
