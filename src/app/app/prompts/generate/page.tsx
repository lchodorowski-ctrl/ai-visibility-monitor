"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero, SectionHead, Tile, Rows, Row, Meta } from "@/components/psai";
import { pluralPl } from "@/lib/format/plural";
import { INTENTS } from "@/lib/prompts/intents";
import { generateProposals, acceptProposals } from "../actions";
import type { PromptProposal } from "@/lib/prompts/generate";

export default function GeneratePage() {
  const [proposals, setProposals] = useState<PromptProposal[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-20">
      <PageHero eyebrow="Polska Szkoła AI · Prompty" title="Generator pytań" />
      <Tile>
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              setError(null);
              try {
                const res = await generateProposals(fd);
                if (res.ok) setProposals(res.proposals); else setError(res.error);
              } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
            });
          }}
        >
          <Input name="seed" placeholder="Frazy seed (po przecinku): szkolenia AI, kurs ChatGPT" aria-label="Frazy seed" />
          <Input name="personas" placeholder="Persony (po przecinku): HR manager, CEO MŚP, nauczyciel" aria-label="Persony" />
          <Input name="count" type="number" defaultValue={15} min={1} max={50} aria-label="Liczba pytań" className="md:w-24" />
          <Button type="submit" disabled={pending}>{pending ? "Generuję…" : "Generuj"}</Button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-red">{error}</p>}
      </Tile>
      {proposals.length > 0 && (
        <section>
          <SectionHead title="Propozycje" meta={<Meta>{pluralPl(proposals.length, ["pytanie", "pytania", "pytań"])}</Meta>} />
          <form action={acceptProposals} className="space-y-6">
            <Rows>
              {proposals.map((p, i) => (
                <Row key={i} className="py-0">
                  <Label className="flex w-full cursor-pointer items-start gap-3 py-4">
                    <Checkbox name="selected" value={JSON.stringify(p)} defaultChecked className="mt-0.5" />
                    <span className="min-w-0 flex-1 text-[15px] leading-snug">
                      {p.text}
                      <Meta className="mt-1 block">{p.topic || "bez tematu"} · {INTENTS[p.intent]}</Meta>
                    </span>
                  </Label>
                </Row>
              ))}
            </Rows>
            <Button type="submit">Dodaj zaznaczone</Button>
          </form>
        </section>
      )}
    </div>
  );
}
