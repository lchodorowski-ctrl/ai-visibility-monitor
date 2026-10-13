import { foldText } from "@/lib/extract/normalize";

export function assertOpenSession(s: { status: string } | null): asserts s is { status: "open" } {
  if (!s || s.status !== "open") throw new Error("Kalibracja zamknięta lub nie istnieje");
}

export function mergeAlias(aliases: string[], alias: string): string[] | null {
  const a = alias.trim().replace(/\s+/g, " ");
  if (!a) return null;
  const key = foldText(a);
  if (aliases.some((x) => foldText(x.trim()) === key)) return null;
  return [...aliases, a];
}

export function parseUrls(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
