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
    });
    expect(r.domains).toEqual(["polskaszkola.ai"]);
    expect(r.monthly_budget_usd).toBe(30);
  });

  it("odrzuca ujemny budżet i niepoprawny JSON faktów", () => {
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "-1", facts: "{}" })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{" })).toThrow();
  });
});
