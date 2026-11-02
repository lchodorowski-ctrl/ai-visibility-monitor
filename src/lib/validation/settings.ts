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

// Usługa Search Console: właściwość domenowa (sc-domain:) albo prefiks URL zakończony ukośnikiem.
const GSC_PROPERTY_RE = /^sc-domain:[a-z0-9.-]+$|^https?:\/\/\S+\/$/;
const GSC_PROPERTY_MESSAGE = "Usługa: sc-domain:twojadomena.pl albo adres z ukośnikiem na końcu";

export const ProjectSettingsSchema = z.object({
  brand_name: z.string().min(1, "Nazwa marki jest wymagana"),
  brand_aliases: listField,
  domains: domainsField,
  monthly_budget_usd: z.coerce.number().min(0, "Budżet nie może być ujemny"),
  site_url: z.string().trim().pipe(z.url("Podaj pełny adres z https://"))
    .refine((u) => /^https?:\/\//.test(u), "Tylko http(s)")
    .transform((u) => u.replace(/\/+$/, "")),
  low_visibility_threshold: z.coerce.number().min(0, "Próg 0–1").max(1, "Próg 0–1"),
  gsc_property: z.string().trim().default("").transform((s, ctx) => {
    if (s === "") return null;
    if (GSC_PROPERTY_RE.test(s)) return s;
    ctx.addIssue({ code: "custom", message: GSC_PROPERTY_MESSAGE });
    return z.NEVER;
  }),
  // Brak pola w danych (starsi wywołujący) daje domyślne 10, tak jak default kolumny.
  seo_budget_usd: z.coerce.number().min(0, "Budżet SEO nie może być ujemny").default(10),
  trends_anchor: z.string().trim().default("").transform((s) => (s === "" ? null : s)),
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
