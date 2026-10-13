import Link from "next/link";
import { Logo } from "./Logo";
import { AppNav } from "./AppNav";
import { Button } from "@/components/ui/button";

export function AppHeader({ projectName }: { projectName: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur-[20px]">
      <div className="mx-auto flex h-nav max-w-page items-center justify-between gap-4 px-6 lg:px-12">
        <div className="flex items-center gap-5">
          <Link href="/app" aria-label="Przegląd" className="text-ink"><Logo /></Link>
          <span aria-hidden="true" className="h-[26px] w-px bg-line-2" />
          <span className="hidden text-sm font-medium text-t1 md:inline">{projectName}</span>
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <AppNav />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">Wyloguj</Button>
          </form>
        </div>
      </div>
    </header>
  );
}
