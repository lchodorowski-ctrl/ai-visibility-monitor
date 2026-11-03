"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/psai";
import { Button } from "@/components/ui/button";

/** Błąd odczytu danych Google (Search Console i pozycje fraz). Produkcja ukrywa treść błędów serwera, więc zdanie jest zawsze to samo. */
export default function GoogleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      tone="error"
      title="Nie udało się wczytać danych Google."
      description="Spróbuj ponownie za chwilę. Jeśli błąd się powtarza, sprawdź ustawienia Google i status synchronizacji."
      action={<Button type="button" onClick={() => retry()}>Spróbuj ponownie</Button>}
    />
  );
}
