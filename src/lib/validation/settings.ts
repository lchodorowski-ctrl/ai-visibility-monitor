import { z } from "zod";
import type { Json } from "@/lib/db-types";

export function parseList(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !seen.has(s) && (seen.add(s), true));
}

export function normalizeDomainInput(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

const listField = z.string().default("").transform(parseList);
const domainsField = z.string().default("").transform((s) => [...new Set(parseList(s).map(normalizeDomainInput))]);

export const ProjectSettingsSchema = z.object({
  brand_name: z.string().min(1, "Nazwa marki jest wymagana"),
  brand_aliases: listField,
  domains: domainsField,
  monthly_budget_usd: z.coerce.number().min(0, "Budżet nie może być ujemny"),
  facts: z.string().default("{}").transform((s, ctx) => {
    try {
      const parsed: unknown = JSON.parse(s);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as NonNullable<Json>;
    } catch { /* niżej: błąd walidacji */ }
    ctx.addIssue({ code: "custom", message: "Karta faktów musi być poprawnym JSON (obiekt)" });
    return z.NEVER;
  }),
});

export const CompetitorSchema = z.object({
  name: z.string().min(1),
  aliases: listField,
  domains: domainsField,
});
