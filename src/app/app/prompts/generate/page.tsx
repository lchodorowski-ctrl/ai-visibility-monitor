"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateProposals, acceptProposals } from "../actions";
import type { PromptProposal } from "@/lib/prompts/generate";

export default function GeneratePage() {
  const [proposals, setProposals] = useState<PromptProposal[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Generator promptów</h1>
      <form
        className="grid gap-2 text-sm"
        action={(fd) => start(async () => {
          setError(null);
          try { setProposals(await generateProposals(fd)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        })}
      >
        <Input name="seed" placeholder="Frazy seed (po przecinku): szkolenia AI, kurs ChatGPT" aria-label="Frazy seed" />
        <Input name="personas" placeholder="Persony (po przecinku): HR manager, CEO MŚP, nauczyciel" aria-label="Persony" />
        <Input name="count" type="number" defaultValue={15} min={1} max={50} aria-label="Liczba pytań" className="w-24" />
        <Button type="submit" disabled={pending} className="w-fit">{pending ? "Generuję…" : "Generuj"}</Button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {proposals.length > 0 && (
        <form action={acceptProposals} className="space-y-2 text-sm">
          {proposals.map((p, i) => (
            <Card key={i} size="sm">
              <CardContent>
                <Label className="flex items-start gap-2">
                  <Checkbox name="selected" value={JSON.stringify(p)} defaultChecked />
                  <span><b>{p.text}</b><br /><span className="text-muted-foreground">{p.topic} · {p.intent}</span></span>
                </Label>
              </CardContent>
            </Card>
          ))}
          <Button type="submit">Dodaj zaznaczone</Button>
        </form>
      )}
    </div>
  );
}
