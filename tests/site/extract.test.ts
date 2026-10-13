import { describe, it, expect } from "vitest";
import { extractPage } from "@/lib/site/extract";
const html = `<html><head><title> Szkolenia AI | PSAI </title><meta name="description" content="Opis &amp; test"><style>.x{}</style></head>
<body><nav>Menu</nav><script>var a=1;</script><main><h1>Szkolenia <em>AI</em> dla firm</h1><p>Pierwszy akapit.</p><p>Drugi   akapit.</p></main></body></html>`;
describe("extractPage", () => {
  it("wyciąga title, h1 (bez tagów), description i excerpt z main", () => {
    const p = extractPage(html);
    expect(p.title).toBe("Szkolenia AI | PSAI");
    expect(p.h1).toBe("Szkolenia AI dla firm");
    expect(p.description).toBe("Opis & test");
    expect(p.excerpt).toBe("Szkolenia AI dla firm Pierwszy akapit. Drugi akapit.");
  });
  it("bez main bierze body, przycina do 600 znaków, pomija script/style", () => {
    const p = extractPage(`<body><script>x()</script><p>${"a".repeat(700)}</p></body>`);
    expect(p.excerpt.length).toBe(600);
    expect(p.excerpt).not.toContain("x()");
  });
  it("puste wejście → null/\"\"", () => {
    expect(extractPage("")).toEqual({ title: null, h1: null, description: null, excerpt: "" });
  });
});
