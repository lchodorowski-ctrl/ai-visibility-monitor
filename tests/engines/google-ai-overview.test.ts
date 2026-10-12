import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import withAio from "../fixtures/responses/dataforseo-aio.json";
import noAio from "../fixtures/responses/dataforseo-no-aio.json";

describe("google ai overview adapter", () => {
  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = "l"; process.env.DATAFORSEO_PASSWORD = "p"; process.env.DATAFORSEO_LOCATION_CODE = "2616";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("parse: markdown + unikalne referencje (references i links)", async () => {
    const { parseDataForSeoResponse } = await import("@/lib/engines/google-ai-overview");
    const r = parseDataForSeoResponse(withAio);
    expect(r.noAnswer).toBe(false);
    expect(r.text).toContain("Polska Szkoła AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "akademia-ai.pl"]);
  });

  it("parse: brak AIO → noAnswer", async () => {
    const { parseDataForSeoResponse } = await import("@/lib/engines/google-ai-overview");
    const r = parseDataForSeoResponse(noAio);
    expect(r.noAnswer).toBe(true);
    expect(r.text).toBe("");
  });

  it("query wysyła poprawne body i Basic auth, koszt z odpowiedzi", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(withAio), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { googleAiOverviewAdapter } = await import("@/lib/engines/google-ai-overview");
    const res = await googleAiOverviewAdapter.query("najlepsze szkolenia AI dla firm", { locale: "pl-PL", country: "PL" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/advanced");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("l:p").toString("base64")}`);
    expect(JSON.parse(init.body)[0]).toEqual({
      keyword: "najlepsze szkolenia AI dla firm", location_code: 2616, language_code: "pl", device: "desktop", load_async_ai_overview: true,
    });
    expect(res.costUsd).toBe(0.004);
    expect(res.model).toBe("google_ai_overview");
  });

  it("rzuca błąd z kodem HTTP przy !res.ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    const { googleAiOverviewAdapter } = await import("@/lib/engines/google-ai-overview");
    await expect(googleAiOverviewAdapter.query("x", { locale: "pl-PL", country: "PL" })).rejects.toThrow(/HTTP 500: boom/);
  });

  it("rzuca błąd przy statusie zadania DataForSEO != 20000", async () => {
    const failed = { status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field", result: null }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(failed), { status: 200 })));
    const { googleAiOverviewAdapter } = await import("@/lib/engines/google-ai-overview");
    await expect(googleAiOverviewAdapter.query("x", { locale: "pl-PL", country: "PL" })).rejects.toThrow(/task 40501: Invalid Field/);
  });
});
