"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Przycisk wysyłający formularz akcji serwerowej: w trakcie wysyłki jest zablokowany i pokazuje „…”, co blokuje podwójne kliknięcie.
export function SubmitButton({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? "…" : children}
    </Button>
  );
}
