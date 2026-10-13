import { describe, it, expect } from "vitest";
import { isConcreteUrl, normalizeTargetUrl, resolveTargetUrl } from "@/lib/recommend/target-url";

const SITE = "https://www.polskaszkola.ai";

describe("normalizeTargetUrl", () => {
  it.each(["sitemap.xml", "llms.txt", "szkolenia-ai.html", "robots.txt", "oferta.pdf", "data.json", "logo.PNG", "app.js"])(
    "gołej nazwy pliku %s nie zamienia w domenę", (name) => {
      expect(normalizeTargetUrl(name)).toBe(name);
    });
  it("domena z lub bez ścieżki dostaje https://", () => {
    expect(normalizeTargetUrl("parp.gov.pl")).toBe("https://parp.gov.pl");
    expect(normalizeTargetUrl("parp.gov.pl/kurs")).toBe("https://parp.gov.pl/kurs");
    expect(normalizeTargetUrl("  Example.com/oferta.html ")).toBe("https://Example.com/oferta.html");
  });
  it("nie dotyka pełnych adresów, ścieżek i pustych wartości", () => {
    expect(normalizeTargetUrl("https://x.pl/a")).toBe("https://x.pl/a");
    expect(normalizeTargetUrl("/llms.txt")).toBe("/llms.txt");
    expect(normalizeTargetUrl(null)).toBeNull();
    expect(normalizeTargetUrl("TBD")).toBe("TBD");
  });
});

describe("isConcreteUrl", () => {
  it("akceptuje ścieżkę i adres http(s)", () => {
    expect(isConcreteUrl("/szkolenia")).toBe(true);
    expect(isConcreteUrl("https://parp.gov.pl/kurs")).toBe(true);
  });
  it.each(["//evil.example/x", "/\\evil.example/x", "/\\\\evil.example", "TBD", "sitemap.xml", "", null])("odrzuca %j", (v) => {
    expect(isConcreteUrl(v)).toBe(false);
  });
});

describe("resolveTargetUrl", () => {
  it("nie rozwiązuje /\\host ani nazw plików do zewnętrznego hosta", () => {
    expect(resolveTargetUrl("/\\evil.example/x", SITE)).toBeNull();
    expect(resolveTargetUrl("sitemap.xml", SITE)).toBeNull();
    expect(resolveTargetUrl("parp.gov.pl", SITE)).toBe("https://parp.gov.pl");
  });
});
