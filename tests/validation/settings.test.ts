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
});
