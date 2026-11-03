import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ pathname: "/app/google" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { GoogleSubNav } from "@/app/app/google/GoogleSubNav";

const one = [["/app/google", "Przegląd"]] as const;
const two = [["/app/google", "Przegląd"], ["/app/google/phrases", "Frazy"]] as const;

describe("GoogleSubNav", () => {
  beforeEach(() => { nav.pathname = "/app/google"; });

  it("jedna pozycja: podmenu się nie renderuje", () => {
    expect(renderToStaticMarkup(<GoogleSubNav items={one} />)).toBe("");
  });

  it("aktywna pozycja ma aria-current", () => {
    nav.pathname = "/app/google/phrases/abc";
    const html = renderToStaticMarkup(<GoogleSubNav items={two} />);
    expect(html).toContain('aria-label="Google"');
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*>Frazy<\/a>/);
    expect(html).not.toMatch(/<a [^>]*aria-current="page"[^>]*>Przegląd<\/a>/);
  });

  it("Przegląd jest aktywny tylko na /app/google dokładnie", () => {
    const html = renderToStaticMarkup(<GoogleSubNav items={two} />);
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*>Przegląd<\/a>/);
    expect(html).not.toMatch(/<a [^>]*aria-current="page"[^>]*>Frazy<\/a>/);
  });
});
