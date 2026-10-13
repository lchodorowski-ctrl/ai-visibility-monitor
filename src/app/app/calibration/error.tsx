"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { isCalibrationMessage } from "@/lib/calibration/messages";

export default function CalibrationError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Produkcja ukrywa treść błędów serwera; własne polskie komunikaty pokazujemy, resztę zastępujemy ogólnym zdaniem.
  const description = isCalibrationMessage(error.message) ? error.message : "Spróbuj ponownie za chwilę";

  return (
    <EmptyState
      tone="error"
      title="Coś poszło nie tak"
      description={description}
      action={<Button type="button" onClick={() => retry()}>Spróbuj ponownie</Button>}
    />
  );
}
