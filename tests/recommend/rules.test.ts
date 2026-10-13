import { describe, it, expect } from "vitest";
import { technicalRules } from "@/lib/recommend/rules";
const f = (status: Record<string, number>) => (async (u: RequestInfo | URL) => new Response("", { status: status[String(u)] ?? 404 })) as unknown as typeof fetch;
describe("technicalRules", () => {
  it("brak llms.txt → rekomendacja techniczna; sitemapa jest → brak drugiej", async () => {
    const r = await technicalRules("https://x.pl", f({ "https://x.pl/llms.txt": 404, "https://x.pl/sitemap.xml": 200 }));
    expect(r).toHaveLength(1); expect(r[0].type).toBe("technical"); expect(r[0].title).toMatch(/llms\.txt/);
  });
  it("wszystko jest → []", async () => {
    expect(await technicalRules("https://x.pl", f({ "https://x.pl/llms.txt": 200, "https://x.pl/sitemap.xml": 200 }))).toEqual([]);
  });
  it("błąd sieci → traktowany jak brak (nie rzuca), z UA bota", async () => {
    const seen: unknown[] = [];
    const boom = (async (_u: unknown, init?: RequestInit) => { seen.push((init?.headers as Record<string, string>)["User-Agent"]); throw new Error("net"); }) as unknown as typeof fetch;
    const r = await technicalRules("https://x.pl/", boom);
    expect(r).toHaveLength(2); expect(seen).toEqual(["PSAI-VisibilityBot/1.0", "PSAI-VisibilityBot/1.0"]);
  });
});
