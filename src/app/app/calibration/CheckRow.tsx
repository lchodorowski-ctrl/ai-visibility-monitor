"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Meta } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CALIBRATION_ENGINE_LABEL } from "@/lib/calibration/engines";
import type { CalibrationCheckView } from "@/lib/calibration/queries";
import { saveCheck } from "./actions";

type Mentioned = "yes" | "no" | "unknown";
const OPTIONS: { value: Mentioned; label: string }[] = [
  { value: "yes", label: "Tak" }, { value: "no", label: "Nie" }, { value: "unknown", label: "Nie sprawdzono" },
];
const initialMentioned = (v: boolean | null): Mentioned => (v === null ? "unknown" : v ? "yes" : "no");

const LABEL_MAX = 60;
const shortText = (t: string) => (t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX).trimEnd()}…` : t);

export function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }
  return (
    <span className="inline-flex items-center gap-3">
      <Button type="button" variant="quiet" onClick={copy} aria-label={`Kopiuj pytanie: ${shortText(text)}`}>Kopiuj pytanie</Button>
      <span aria-live="polite"><Meta>{copied ? "Skopiowano" : failed ? "Nie udało się skopiować" : ""}</Meta></span>
    </span>
  );
}

export function CheckRow({ check, calibrationId, readOnly }: { check: CalibrationCheckView; calibrationId: string; readOnly: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mentioned, setMentioned] = useState<Mentioned>(initialMentioned(check.manualMentioned));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  function save() {
    const form = formRef.current;
    if (!form || readOnly) return;
    const data = new FormData(form);
    setSaved(false);
    setError(false);
    startTransition(async () => {
      try {
        await saveCheck(data);
        setSaved(true);
      } catch {
        setError(true);
        // Błąd bywa skutkiem zamknięcia sesji w innej karcie: odświeżamy, żeby ekran stał się tylko do odczytu.
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="grid gap-3 border-t border-line py-4 first:border-t-0">
      <input type="hidden" name="id" value={check.id} />
      <input type="hidden" name="calibrationId" value={calibrationId} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-medium">{CALIBRATION_ENGINE_LABEL[check.engineId]}</span>
        <span aria-live="polite">
          <Meta className={error ? "text-red" : undefined}>
            {error ? "Nie udało się zapisać" : pending ? "Zapisywanie…" : saved ? "Zapisano" : ""}
          </Meta>
        </span>
      </div>
      <fieldset disabled={readOnly} className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="sr-only">{`Czy marka została wymieniona: ${CALIBRATION_ENGINE_LABEL[check.engineId]}`}</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className="inline-flex min-h-8 items-center gap-2 text-sm">
            <input
              type="radio" name="mentioned" value={o.value} checked={mentioned === o.value}
              onChange={() => { setMentioned(o.value); save(); }}
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      <Textarea
        name="urls" rows={2} maxLength={5000} defaultValue={check.manualUrls.join("\n")} disabled={readOnly}
        placeholder="Cytowane adresy, jeden w linii" aria-label={`Cytowane adresy: ${CALIBRATION_ENGINE_LABEL[check.engineId]}`}
        onBlur={save}
      />
      {mentioned === "yes" && (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Jak Was nazwał?</span>
          <Input name="alias" maxLength={200} defaultValue={check.manualAlias ?? ""} disabled={readOnly} onBlur={save} />
        </label>
      )}
    </form>
  );
}
