import { describe, it, expect, vi, afterEach } from "vitest";
import { googleJson } from "@/lib/google/http";
import type { GoogleAuth } from "@/lib/google/auth";

const auth: GoogleAuth = {
  email: "bot@psai.iam.gserviceaccount.com",
  getAccessToken: vi.fn().mockResolvedValue("tok123"),
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("googleJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GET z bearerem zwraca sparsowany JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ siteEntry: [{ siteUrl: "sc-domain:polskaszkola.ai" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await googleJson<{ siteEntry: unknown[] }>(auth, "https://www.googleapis.com/webmasters/v3/sites");
    expect(res.siteEntry).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(init.body).toBeUndefined();
  });

  it("POST wysyła JSON z bearer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ rows: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const body = { startDate: "2026-10-01", endDate: "2026-10-31", dimensions: ["query"] };
    await googleJson(auth, "https://x.test/query", { method: "POST", body });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("403 podaje e-mail konta usługi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "User does not have sufficient permission" } }, 403)));
    const err = await googleJson(auth, "https://x.test/q").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain("Google API 403: brak dostępu dla bot@psai.iam.gserviceaccount.com");
    expect(msg).toContain("Dodaj ten adres jako użytkownika usługi w Search Console.");
    expect(msg).toContain("User does not have sufficient permission");
  });

  it("503 jest ponawiane", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await googleJson<{ ok: boolean }>(auth, "https://x.test/q", undefined, { baseDelayMs: 1 });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429 jest ponawiane, a po wyczerpaniu prób zwraca błąd", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(googleJson(auth, "https://x.test/q", undefined, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow("Google API 429: quota");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("inny błąd (400) nie jest ponawiany i ma ucięty komunikat do 300 znaków", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("x".repeat(1000), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await googleJson(auth, "https://x.test/q", undefined, { baseDelayMs: 1 }).catch((e: Error) => e);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((err as Error).message).toBe(`Google API 400: ${"x".repeat(300)}`);
  });

  it("403 z ciałem nie-JSON też mieści się w komunikacie (do 300 znaków)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("y".repeat(1000), { status: 403 })));
    const err = await googleJson(auth, "https://x.test/q").catch((e: Error) => e);
    expect((err as Error).message).toContain("y".repeat(300));
    expect((err as Error).message).not.toContain("y".repeat(301));
  });
});
