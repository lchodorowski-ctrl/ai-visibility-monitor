import { Logo } from "@/components/psai/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-page flex-col px-6 lg:px-12">
      <div className="flex h-nav items-center text-ink"><Logo /></div>
      <section className="mx-auto mt-16 w-full max-w-md rounded-[28px] bg-s1 p-8 md:p-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-t2">Polska Szkoła AI</p>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.15]">Monitor widoczności w AI</h1>
        {error && <p role="alert" className="mt-4 text-sm text-red">{error}</p>}
        <form action={signIn} className="mt-8 grid gap-5">
          <div><Label htmlFor="email" className="text-xs font-medium uppercase tracking-[0.07em] text-t1">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" className="mt-2 bg-bg" /></div>
          <div><Label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.07em] text-t1">Hasło</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" className="mt-2 bg-bg" /></div>
          <Button type="submit" className="w-full py-3">Zaloguj</Button>
        </form>
      </section>
    </main>
  );
}
