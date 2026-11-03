import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const w = vi.hoisted(() => ({ getCurrentProject: vi.fn() }));
const q = vi.hoisted(() => ({ getGscLastDate: vi.fn() }));
// the data sections are async server components with their own tests; here they are stand-ins that show their props
const S = vi.hoisted(() => {
  const stub = (name: string) => {
    const Stub = (props: Record<string, unknown>) => <div data-section={name} data-props={JSON.stringify(props)} />;
    Stub.displayName = `Stub(${name})`;
    return Stub;
  };
  return {
    KeywordStatusSection: stub("status"), RankedSection: stub("ranked"), TrackedSection: stub("tracked"),
    GapSection: stub("gap"), SuggestionSection: stub("suggestions"), ResearchSection: stub("research"),
  };
});
vi.mock("@/lib/workspace", () => w);
vi.mock("@/lib/seo/queries", () => q);
vi.mock("@/app/app/google/keywords/sections", () => S);

import KeywordsPage from "@/app/app/google/keywords/page";

async function page(o: { lastDate?: string | null; domains?: string[] } = {}) {
  w.getCurrentProject.mockResolvedValue({ id: "p", domains: o.domains ?? ["polskaszkola.ai"] });
  q.getGscLastDate.mockResolvedValue("lastDate" in o ? o.lastDate : "2026-10-31");
  return renderToStaticMarkup(await KeywordsPage());
}

function propsOf(html: string, name: string): Record<string, unknown> {
  const m = new RegExp(`data-section="${name}" data-props="([^"]*)"`).exec(html);
  if (!m) throw new Error(`brak sekcji ${name}`);
  return JSON.parse(m[1].replace(/&quot;/g, '"'));
}

describe("KeywordsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nagłówek i wszystkie sześć sekcji w kolejności: stan, pozycje, śledzone, luki, podpowiedzi, wyszukiwanie", async () => {
    const html = await page();
    expect(html).toContain("Polska Szkoła AI · Google");
    expect(html).toContain("Frazy w Google");
    const order = [...html.matchAll(/data-section="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["status", "ranked", "tracked", "gap", "suggestions", "research"]);
    for (const name of ["status", "ranked", "gap", "suggestions"]) expect(propsOf(html, name)).toEqual({ projectId: "p" });
  });

  it("import z Search Console jest dostępny tylko z danymi z Search Console", async () => {
    expect(propsOf(await page(), "tracked")).toEqual({ projectId: "p", hasGscData: true });
    expect(propsOf(await page({ lastDate: null }), "tracked")).toEqual({ projectId: "p", hasGscData: false });
  });

  it("wyszukiwanie dostaje własną domenę projektu (pierwszą), a bez domeny pusty tekst", async () => {
    expect(propsOf(await page({ domains: ["polskaszkola.ai", "inna.pl"] }), "research")).toEqual({ projectId: "p", ownDomain: "polskaszkola.ai" });
    expect(propsOf(await page({ domains: [] }), "research")).toEqual({ projectId: "p", ownDomain: "" });
  });
});
