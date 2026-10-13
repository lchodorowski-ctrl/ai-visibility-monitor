import { foldText } from "@/lib/extract/normalize";
import { CALIBRATION_MESSAGES } from "./messages";

export function assertOpenSession(s: { status: string } | null): asserts s is { status: "open" } {
  if (!s || s.status !== "open") throw new Error(CALIBRATION_MESSAGES.closedOrMissing);
}

export function mergeAlias(aliases: string[], alias: string): string[] | null {
  const a = alias.trim().replace(/\s+/g, " ");
  if (!a) return null;
  const key = foldText(a);
  if (aliases.some((x) => foldText(x.trim()) === key)) return null;
  return [...aliases, a];
}

export const MAX_URLS = 50;

export function parseUrls(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_URLS);
}
