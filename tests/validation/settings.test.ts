import { describe, it, expect } from "vitest";
import { ProjectSettingsSchema, parseList } from "@/lib/validation/settings";

describe("parseList", () => {
  it("dzieli po przecinkach i nowych liniach, usuwa duplikaty", () => {
    expect(parseList("PSAI, Polska Szkoła AI\npsai ,")).toEqual(["PSAI", "Polska Szkoła AI", "psai"]);
  });
});

describe("ProjectSettingsSchema", () => {
  it("normalizuje domeny (bez https:// i www.)", () => {
    const r = ProjectSettingsSchema.parse({
      brand_name: "Polska Szkoła AI",
      brand_aliases: "PSAI",
      domains: "https://www.polskaszkola.ai/, polskaszkola.ai",
      monthly_budget_usd: "30",
      facts: "{}",
      site_url: "https://x.pl",
      low_visibility_threshold: "0.34",
    });
    expect(r.domains).toEqual(["polskaszkola.ai"]);
    expect(r.monthly_budget_usd).toBe(30);
  });

  it("odrzuca ujemny budżet i niepoprawny JSON faktów", () => {
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "-1", facts: "{}", site_url: "https://x.pl", low_visibility_threshold: "0.34" })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{", site_url: "https://x.pl", low_visibility_threshold: "0.34" })).toThrow();
  });

  it("normalizuje site_url i waliduje próg", () => {
    const r = ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "https://polskaszkolaai.netlify.app/", low_visibility_threshold: "0.34" });
    expect(r.site_url).toBe("https://polskaszkolaai.netlify.app");
    expect(r.low_visibility_threshold).toBe(0.34);
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "ftp://x", low_visibility_threshold: "0.3" })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "https://x.pl", low_visibility_threshold: "1.5" })).toThrow();
  });

  describe("pola Google", () => {
    const base = { brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "https://x.pl", low_visibility_threshold: "0.34" };

    it("gsc_property: sc-domain i prefiks URL", () => {
      expect(ProjectSettingsSchema.parse({ ...base, gsc_property: "sc-domain:polskaszkola.ai" }).gsc_property).toBe("sc-domain:polskaszkola.ai");
      expect(ProjectSettingsSchema.parse({ ...base, gsc_property: "https://polskaszkola.ai/" }).gsc_property).toBe("https://polskaszkola.ai/");
    });

    it("gsc_property: pusty to null", () => {
      expect(ProjectSettingsSchema.parse({ ...base, gsc_property: "" }).gsc_property).toBeNull();
      expect(ProjectSettingsSchema.parse({ ...base, gsc_property: "   " }).gsc_property).toBeNull();
      expect(ProjectSettingsSchema.parse(base).gsc_property).toBeNull();
    });

    it("gsc_property: zły format daje komunikat", () => {
      for (const bad of ["polskaszkola.ai", "https://polskaszkola.ai", "sc-domain:", "sc-domain:Polska Szkola"]) {
        const r = ProjectSettingsSchema.safeParse({ ...base, gsc_property: bad });
        expect(r.success, bad).toBe(false);
        expect(r.error?.issues[0]?.message, bad).toBe("Usługa: sc-domain:twojadomena.pl albo adres z ukośnikiem na końcu");
      }
    });

    it("seo_budget_usd nie może być ujemny", () => {
      const r = ProjectSettingsSchema.safeParse({ ...base, seo_budget_usd: "-1" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe("Budżet SEO nie może być ujemny");
    });

    it("seo_budget_usd: wartość z formularza trafia jako liczba", () => {
      expect(ProjectSettingsSchema.parse({ ...base, seo_budget_usd: "12.5" }).seo_budget_usd).toBe(12.5);
      expect(ProjectSettingsSchema.parse({ ...base, seo_budget_usd: "0" }).seo_budget_usd).toBe(0);
    });

    it("seo_budget_usd: brak pola w danych daje domyślne 10", () => {
      expect(ProjectSettingsSchema.parse(base).seo_budget_usd).toBe(10);
    });

    it("trends_anchor: pusty to null, inaczej przycięty tekst", () => {
      expect(ProjectSettingsSchema.parse({ ...base, trends_anchor: "" }).trends_anchor).toBeNull();
      expect(ProjectSettingsSchema.parse({ ...base, trends_anchor: "   " }).trends_anchor).toBeNull();
      expect(ProjectSettingsSchema.parse(base).trends_anchor).toBeNull();
      expect(ProjectSettingsSchema.parse({ ...base, trends_anchor: "  kurs ai  " }).trends_anchor).toBe("kurs ai");
    });
  });
});
