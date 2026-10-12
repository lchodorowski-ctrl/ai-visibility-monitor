import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentProject } from "@/lib/workspace";

const nav = [
  ["/app", "Przegląd"],
  ["/app/prompts", "Prompty"],
  ["/app/responses", "Odpowiedzi"],
  ["/app/settings", "Ustawienia"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const project = await getCurrentProject();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4">
        <div className="mb-6 text-sm font-semibold">{project.name}</div>
        <nav className="space-y-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-md px-2 py-1 text-sm hover:bg-muted">{label}</Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="mt-8">
          <Button type="submit" variant="ghost" size="sm" className="text-xs text-muted-foreground">Wyloguj</Button>
        </form>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
