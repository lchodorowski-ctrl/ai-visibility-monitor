import { withRetry, TransientError, isTransientStatus } from "@/lib/engines/retry";
import type { GoogleAuth } from "./auth";

/** Szczegół błędu z odpowiedzi Google: `error.message` z JSON-a, a gdy go brak, początek surowego ciała. */
function errorDetail(text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message) return message.slice(0, 300);
  } catch {
    // ciało nie jest JSON-em: używamy surowego tekstu
  }
  return text.slice(0, 300);
}

export async function googleJson<T>(
  auth: GoogleAuth,
  url: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
  retry?: { attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const { method = "GET", body } = init;
  return withRetry(async () => {
    const headers: Record<string, string> = { Authorization: `Bearer ${await auth.getAccessToken()}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 403) {
        throw new Error(
          `Google API 403: brak dostępu dla ${auth.email}. Dodaj ten adres jako użytkownika usługi w Search Console. ${errorDetail(text)}`,
        );
      }
      const message = `Google API ${res.status}: ${text.slice(0, 300)}`;
      throw isTransientStatus(res.status) ? new TransientError(message) : new Error(message);
    }
    return (await res.json()) as T;
  }, retry);
}
