import { describe, it, expect, vi, afterEach } from "vitest";
import { syncWindows, toPath, mergeRows, runGscSync } from "@/lib/seo/gsc-sync";
import type { fetchAllRows, GscQuery, GscRow } from "@/lib/google/gsc";
import type { GoogleAuth } from "@/lib/google/auth";
import fixture from "../fixtures/gsc/query-page.json";

const today = new Date("2026-11-02T04:30:00Z");

describe("syncWindows", () => {
  it("bez ostatniej daty: miesięczne okna od 16 miesięcy wstecz do dziś − 2 dni", () => {
    const w = syncWindows({ today, lastDate: null, backfill: false });
    expect(w).toHaveLength(16);
    expect(w[0]).toEqual({ start: "2025-07-01", end: "2025-07-31" });
    expect(w[1]).toEqual({ start: "2025-08-01", end: "2025-08-31" });
    expect(w.at(-1)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("okna miesięczne przylegają do siebie bez dziur i nakładek", () => {
    const w = syncWindows({ today, lastDate: null, backfill: false });
    const dayAfter = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    for (let i = 1; i < w.length; i++) expect(w[i].start).toBe(dayAfter(w[i - 1].end));
  });

  it("backfill ignoruje ostatnią datę", () => {
    const w = syncWindows({ today, lastDate: "2026-10-31", backfill: true });
    expect(w).toHaveLength(16);
    expect(w[0].start).toBe("2025-07-01");
  });

  it("dziś − 2 przypada na ostatni dzień miesiąca: nie tworzy okna następnego miesiąca; dzień później jest okno jednodniowe", () => {
    expect(syncWindows({ today: new Date("2026-11-02T04:30:00Z"), lastDate: null, backfill: false }).at(-1)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    const w = syncWindows({ today: new Date("2026-11-03T04:30:00Z"), lastDate: null, backfill: false });
    expect(w).toHaveLength(17);
    expect(w.at(-1)).toEqual({ start: "2026-11-01", end: "2026-11-01" });
  });

  it("przyrostowo: start to dzień − 6, więc ponowne pobranie obejmuje 5 dni do dziś − 2, gdy ostatnia data jest świeża", () => {
    expect(syncWindows({ today, lastDate: "2026-10-31", backfill: false })).toEqual([{ start: "2026-10-27", end: "2026-10-31" }]);
  });

  it("przyrostowo: start to ostatnia data − 2, gdy dane są starsze", () => {
    expect(syncWindows({ today, lastDate: "2026-10-20", backfill: false })).toEqual([{ start: "2026-10-18", end: "2026-10-31" }]);
  });

  it("koniec to zawsze dziś − 2 dni (UTC), także na przełomie roku", () => {
    expect(syncWindows({ today: new Date("2027-01-02T05:00:00Z"), lastDate: "2026-12-31", backfill: false }))
      .toEqual([{ start: "2026-12-27", end: "2026-12-31" }]);
    expect(syncWindows({ today: new Date("2027-01-01T05:00:00Z"), lastDate: "2026-12-30", backfill: false }))
      .toEqual([{ start: "2026-12-26", end: "2026-12-30" }]);
  });
});

describe("toPath", () => {
  it("zostawia samą ścieżkę, bez hosta, zapytania i fragmentu", () => {
    expect(toPath("https://polskaszkola.ai/kontakt.html?utm=x#sekcja")).toBe("/kontakt.html");
    expect(toPath("https://www.polskaszkola.ai/szkolenia/")).toBe("/szkolenia/");
  });
  it("strona główna to /", () => {
    expect(toPath("https://polskaszkola.ai")).toBe("/");
  });
  it("tekst, który nie jest adresem, zostaje bez zmian", () => {
    expect(toPath("nie adres")).toBe("nie adres");
  });
});

describe("mergeRows", () => {
  it("sumuje kliknięcia i wyświetlenia, a pozycję waży wyświetleniami", () => {
    const merged = mergeRows([
      { key: "/kontakt.html", clicks: 10, impressions: 100, position: 4 },
      { key: "/kontakt.html", clicks: 2, impressions: 300, position: 8 },
    ]);
    expect(merged).toEqual([{ key: "/kontakt.html", clicks: 12, impressions: 400, position: 7 }]);
  });

  it("zaokrągla pozycję do 2 miejsc i zachowuje kolejność kluczy", () => {
    const merged = mergeRows([
      { key: "b", clicks: 1, impressions: 1, position: 1 },
      { key: "a", clicks: 0, impressions: 5, position: 2 },
      { key: "b", clicks: 0, impressions: 2, position: 2 },
    ]);
    expect(merged).toEqual([
      { key: "b", clicks: 1, impressions: 3, position: 1.67 },
      { key: "a", clicks: 0, impressions: 5, position: 2 },
    ]);
  });

  it("wiersz bez wyświetleń nie daje NaN: pozycja to zwykła średnia", () => {
    const merged = mergeRows([
      { key: "x", clicks: 0, impressions: 0, position: 4 },
      { key: "x", clicks: 0, impressions: 0, position: 6 },
    ]);
    expect(merged).toEqual([{ key: "x", clicks: 0, impressions: 0, position: 5 }]);
  });

  it("pusta lista daje pustą listę", () => {
    expect(mergeRows([])).toEqual([]);
  });
});

// ---- runGscSync ----

type Filter = unknown[];
interface Call {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  cols?: string;
  payload?: unknown;
  opts?: unknown;
  filters: Filter[];
}

/** Chainable PostgREST stand-in: every terminal call is recorded, the result comes from `handler`. */
function fakeAdmin(handler: (c: Call) => { data?: unknown; error?: { message: string } | null }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "order", "limit"]) b[m] = (...args: unknown[]) => { call.filters.push([m, ...args]); return b; };
    b.select = (cols: string) => { if (call.op === "select") call.cols = cols; return b; };
    b.insert = (payload: unknown) => { call.op = "insert"; call.payload = payload; return b; };
    b.update = (payload: unknown) => { call.op = "update"; call.payload = payload; return b; };
    b.upsert = (payload: unknown, opts: unknown) => { call.op = "upsert"; call.payload = payload; call.opts = opts; return b; };
    const run = () => { calls.push(call); const r = handler(call); return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }); };
    b.single = run; b.maybeSingle = run;
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko);
    return b;
  };
  return { client: { from } as never, calls };
}

const PROJECT = "proj-1";
const PROPERTY = "sc-domain:polskaszkola.ai";
const auth: GoogleAuth = { email: "bot@psai.iam.gserviceaccount.com", getAccessToken: async () => "tok" };
const now = () => today;

interface World { property?: string | null; lastDate?: string | null; failOn?: string }
function world(w: World = {}) {
  const property = "property" in w ? w.property : PROPERTY;
  return fakeAdmin((c) => {
    if (c.table === "projects") return { data: { gsc_property: property } };
    if (c.table === "seo_jobs" && c.op === "insert") return { data: { id: "job-1" } };
    if (c.table === "gsc_site_daily" && c.op === "select") return { data: w.lastDate ? { date: w.lastDate } : null };
    if (c.op === "upsert" && c.table === w.failOn) return { error: { message: `boom ${c.table}` } };
    return {};
  });
}

const upserts = (calls: Call[], table: string) => calls.filter((c) => c.table === table && c.op === "upsert");
const jobUpdate = (calls: Call[]) => calls.find((c) => c.table === "seo_jobs" && c.op === "update")!.payload as Record<string, unknown>;

type Fixture = { site: GscRow[]; page: GscRow[]; query: GscRow[] };
const fx = fixture as unknown as Fixture;
const fromFixture = vi.fn(async (_a: GoogleAuth, _p: string, q: Omit<GscQuery, "rowLimit" | "startRow">): Promise<GscRow[]> => {
  if (q.dimensions.length === 1) return fx.site;
  if (q.dimensions.length === 2) return fx.page;
  return fx.query;
});

describe("runGscSync", () => {
  afterEach(() => { vi.unstubAllEnvs(); fromFixture.mockClear(); });

  it("bez usługi Search Console zapisuje zadanie skipped i nie woła API", async () => {
    const { client, calls } = world({ property: null });
    const fetchRows = vi.fn();

    const res = await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows, now });

    expect(res).toEqual({ status: "skipped", days: 0, siteRows: 0, pageRows: 0, queryRows: 0 });
    expect(fetchRows).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "seo_jobs" && c.op === "insert")?.payload).toEqual({ project_id: PROJECT, kind: "gsc_sync", status: "running" });
    expect(jobUpdate(calls)).toMatchObject({ status: "skipped", error: "Brak usługi Search Console w Ustawieniach → Google" });
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("z usługą wysyła trzy zapytania na okno z dataState all", async () => {
    const { client } = world({ lastDate: "2026-10-31" });
    await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows: fromFixture, now });

    expect(fromFixture).toHaveBeenCalledTimes(3);
    const window = { startDate: "2026-10-27", endDate: "2026-10-31", dataState: "all" };
    expect(fromFixture.mock.calls.map(([a, p, q]) => [a, p, q])).toEqual([
      [auth, PROPERTY, { ...window, dimensions: ["date"] }],
      [auth, PROPERTY, { ...window, dimensions: ["date", "page"] }],
      [auth, PROPERTY, { ...window, dimensions: ["date", "query", "page", "device"] }],
    ]);
  });

  it("zapisuje trzy tabele: ścieżki zamiast adresów, urządzenia małymi literami, scalone warianty", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31" });

    const res = await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows: fromFixture, now });

    expect(res).toEqual({ status: "done", days: 5, siteRows: 2, pageRows: 3, queryRows: 3 });

    const [site] = upserts(calls, "gsc_site_daily");
    expect(site.opts).toEqual({ onConflict: "project_id,date" });
    expect(site.payload).toEqual([
      { project_id: PROJECT, date: "2026-10-30", clicks: 14, impressions: 520, position: 6.4 },
      { project_id: PROJECT, date: "2026-10-31", clicks: 9, impressions: 410, position: 7.1 },
    ]);

    const [page] = upserts(calls, "gsc_page_daily");
    expect(page.opts).toEqual({ onConflict: "project_id,date,page" });
    expect(page.payload).toEqual([
      // https://polskaszkola.ai/kontakt.html + https://www.polskaszkola.ai/kontakt.html
      { project_id: PROJECT, date: "2026-10-30", page: "/kontakt.html", clicks: 12, impressions: 400, position: 7 },
      { project_id: PROJECT, date: "2026-10-30", page: "/szkolenia/wroclaw", clicks: 2, impressions: 120, position: 5.5 },
      { project_id: PROJECT, date: "2026-10-31", page: "/", clicks: 9, impressions: 410, position: 7.1 },
    ]);

    const [query] = upserts(calls, "gsc_query_daily");
    expect(query.opts).toEqual({ onConflict: "project_id,date,query,page,device" });
    expect(query.payload).toEqual([
      // dwa warianty adresu tej samej strony (z utm i bez) po 60 wyświetleń: pozycja (5 + 6) / 2
      { project_id: PROJECT, date: "2026-10-30", query: "szkolenia ai wrocław", page: "/szkolenia/wroclaw", device: "mobile", clicks: 2, impressions: 120, position: 5.5 },
      { project_id: PROJECT, date: "2026-10-30", query: "polska szkoła ai", page: "/", device: "desktop", clicks: 5, impressions: 80, position: 1.2 },
      { project_id: PROJECT, date: "2026-10-31", query: "kurs prompt engineering", page: "/kontakt.html", device: "tablet", clicks: 0, impressions: 12, position: 11.5 },
    ]);
  });

  it("zamyka zadanie jako done ze statystykami", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31" });
    await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows: fromFixture, now });
    expect(jobUpdate(calls)).toMatchObject({
      status: "done",
      error: null,
      stats: { days: 5, windows: 1, siteRows: 2, pageRows: 3, queryRows: 3, invalidRows: 0 },
    });
  });

  it("tabelę serwisu zapisuje na końcu, żeby ostatnia data nie wyprzedziła stron i fraz", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31" });
    await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows: fromFixture, now });
    expect(calls.filter((c) => c.op === "upsert").map((c) => c.table)).toEqual(["gsc_query_daily", "gsc_page_daily", "gsc_site_daily"]);
  });

  it("2500 wierszy fraz idzie do bazy w trzech paczkach (1000, 1000, 500)", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31" });
    const many = Array.from({ length: 2500 }, (_, i): GscRow => ({
      keys: ["2026-10-31", `fraza ${i}`, "https://polskaszkola.ai/a", "DESKTOP"], clicks: 1, impressions: 10, ctr: 0.1, position: 3,
    }));
    const fetchRows = vi.fn(async (_a: GoogleAuth, _p: string, q: Omit<GscQuery, "rowLimit" | "startRow">) => (q.dimensions.length === 4 ? many : []));

    const res = await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows, now });

    const batches = upserts(calls, "gsc_query_daily");
    expect(batches.map((c) => (c.payload as unknown[]).length)).toEqual([1000, 1000, 500]);
    expect(batches.every((c) => (c.opts as { onConflict: string }).onConflict === "project_id,date,query,page,device")).toBe(true);
    expect(res.queryRows).toBe(2500);
    expect(upserts(calls, "gsc_site_daily")).toHaveLength(0);
  });

  it.each([
    { name: "backfill", payload: { projectId: PROJECT, backfill: true }, lastDate: "2026-10-31" },
    { name: "pierwsze uruchomienie bez danych", payload: { projectId: PROJECT }, lastDate: null },
  ])("$name: 16 okien miesięcznych po trzy zapytania, pierwsze od 2025-07-01", async ({ payload, lastDate }) => {
    const { client, calls } = world({ lastDate });
    const fetchRows = vi.fn<typeof fetchAllRows>().mockResolvedValue([]);

    const res = await runGscSync(payload, { admin: client, auth, fetchRows, now });

    expect(fetchRows).toHaveBeenCalledTimes(16 * 3);
    expect(fetchRows.mock.calls[0][2]).toMatchObject({ startDate: "2025-07-01", endDate: "2025-07-31" });
    expect(fetchRows.mock.calls.at(-1)![2]).toMatchObject({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(res.status).toBe("done");
    expect(res.days).toBe(calendarDays("2025-07-01", "2026-10-31"));
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("pomija wiersze bez liczbowej pozycji i liczy je w statystykach", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31" });
    const fetchRows = vi.fn(async (_a: GoogleAuth, _p: string, q: Omit<GscQuery, "rowLimit" | "startRow">): Promise<GscRow[]> => {
      if (q.dimensions.length !== 1) return [];
      return [
        { keys: ["2026-10-30"], clicks: 4, impressions: 40, ctr: 0.1, position: 3 },
        { keys: ["2026-10-31"], clicks: 1, impressions: 10, ctr: 0.1, position: null as unknown as number },
      ];
    });

    const res = await runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows, now });

    expect(res.siteRows).toBe(1);
    expect(upserts(calls, "gsc_site_daily")[0].payload).toEqual([
      { project_id: PROJECT, date: "2026-10-30", clicks: 4, impressions: 40, position: 3 },
    ]);
    expect(jobUpdate(calls)).toMatchObject({ stats: { invalidRows: 1 } });
  });

  it("gdy API rzuca, zadanie dostaje failed z komunikatem, a wyjątek leci dalej", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31" });
    const fetchRows = vi.fn().mockRejectedValue(new Error("Google API 403: brak dostępu dla bot@psai.iam.gserviceaccount.com"));

    await expect(runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows, now })).rejects.toThrow("Google API 403");

    expect(jobUpdate(calls)).toMatchObject({ status: "failed", error: "Google API 403: brak dostępu dla bot@psai.iam.gserviceaccount.com" });
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
  });

  it("błąd zapisu do bazy też kończy zadanie jako failed", async () => {
    const { client, calls } = world({ lastDate: "2026-10-31", failOn: "gsc_page_daily" });
    await expect(runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows: fromFixture, now })).rejects.toThrow("boom gsc_page_daily");
    expect(jobUpdate(calls)).toMatchObject({ status: "failed", error: "boom gsc_page_daily" });
  });

  it("brak klucza konta usługi kończy zadanie jako failed zamiast wywrócić zadanie przed zapisem", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    const { client, calls } = world({ lastDate: "2026-10-31" });
    const fetchRows = vi.fn();

    await expect(runGscSync({ projectId: PROJECT }, { admin: client, fetchRows, now })).rejects.toThrow("GOOGLE_SERVICE_ACCOUNT_JSON");

    expect(fetchRows).not.toHaveBeenCalled();
    expect(calls.find((c) => c.table === "seo_jobs" && c.op === "insert")).toBeDefined();
    expect(jobUpdate(calls)).toMatchObject({ status: "failed", error: expect.stringContaining("GOOGLE_SERVICE_ACCOUNT_JSON") });
  });

  it("błąd odczytu projektu rzuca bez zakładania zadania", async () => {
    const { client, calls } = fakeAdmin((c) => (c.table === "projects" ? { error: { message: "no rows" } } : {}));
    await expect(runGscSync({ projectId: PROJECT }, { admin: client, auth, fetchRows: fromFixture, now })).rejects.toThrow("no rows");
    expect(calls.some((c) => c.table === "seo_jobs")).toBe(false);
  });
});

/** Liczba dni kalendarzowych od `from` do `to` włącznie. */
function calendarDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}
