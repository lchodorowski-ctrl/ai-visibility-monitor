import { describe, it, expect, vi, afterEach } from "vitest";
import { querySearchAnalytics, fetchAllRows, type GscRow } from "@/lib/google/gsc";
import type { GoogleAuth } from "@/lib/google/auth";

const auth: GoogleAuth = {
  email: "bot@psai.iam.gserviceaccount.com",
  getAccessToken: vi.fn().mockResolvedValue("tok123"),
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (n: number): GscRow => ({ keys: [`2026-10-${String(n).padStart(2, "0")}`], clicks: n, impressions: n * 10, ctr: 0.1, position: 3 });
const PROPERTY = "sc-domain:polskaszkola.ai";
const WINDOW = { startDate: "2026-10-01", endDate: "2026-10-31", dimensions: ["date" as const] };

describe("querySearchAnalytics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adres zawiera zakodowaną usługę sc-domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ rows: [row(1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await querySearchAnalytics(auth, PROPERTY, { ...WINDOW, dataState: "all", rowLimit: 500, startRow: 0 });

    expect(rows).toEqual([row(1)]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/sites\/sc-domain%3Apolskaszkola\.ai\/searchAnalytics\/query$/);
    expect(url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Apolskaszkola.ai/searchAnalytics/query");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ ...WINDOW, dataState: "all", rowLimit: 500, startRow: 0, type: "web" });
  });

  it("usługa z prefiksem adresu też jest kodowana w całości", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await querySearchAnalytics(auth, "https://polskaszkola.ai/", WINDOW);
    expect(fetchMock.mock.calls[0][0]).toContain("/sites/https%3A%2F%2Fpolskaszkola.ai%2F/searchAnalytics/query");
  });

  it("brak rows to pusta lista", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ responseAggregationType: "byProperty" })));
    expect(await querySearchAnalytics(auth, PROPERTY, WINDOW)).toEqual([]);
  });
});

describe("fetchAllRows", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stronicuje po startRow aż strona będzie krótsza niż pageSize", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ rows: [row(1), row(2), row(3)] }))
      .mockResolvedValueOnce(json({ rows: [row(4)] }));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchAllRows(auth, PROPERTY, { ...WINDOW, dataState: "all" }, 3);

    expect(rows.map((r) => r.clicks)).toEqual([1, 2, 3, 4]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies.map((b) => b.startRow)).toEqual([0, 3]);
    expect(bodies.every((b) => b.rowLimit === 3 && b.dataState === "all" && b.type === "web")).toBe(true);
  });

  it("pełna ostatnia strona wymaga jeszcze jednego zapytania, które kończy listę", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ rows: [row(1), row(2)] }))
      .mockResolvedValueOnce(json({}));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchAllRows(auth, PROPERTY, WINDOW, 2);

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("domyślny rozmiar strony to 25000, czyli maksimum API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ rows: [row(1)] }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchAllRows(auth, PROPERTY, WINDOW);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ rowLimit: 25000, startRow: 0 });
  });
});
