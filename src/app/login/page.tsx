import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">AI Visibility Monitor</h1>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}
      <form action={signIn} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="sr-only">E-mail</Label>
          <Input id="email" name="email" type="email" required placeholder="E-mail" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="sr-only">Hasło</Label>
          <Input id="password" name="password" type="password" required placeholder="Hasło" autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">Zaloguj</Button>
      </form>
    </main>
  );
}
