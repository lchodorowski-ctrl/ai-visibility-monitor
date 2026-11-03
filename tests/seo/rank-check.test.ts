import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runRankCheck, rankWeekStart, MAX_RANK_KEYWORDS, POLL_INTERVAL_MS, MAX_POLLS, DEVICES, NOTHING_TO_CHECK_MESSAGE,
} from "@/lib/seo/rank-check";
import { estimateRankCost } from "@/lib/seo/costs";
import { PAYMENT_REQUIRED_MESSAGE } from "@/lib/dataforseo/client";
import type { postSerpTasks as postFn, getSerpTask as getFn, SerpTaskState } from "@/lib/dataforseo/serp";
import { fakeAdmin, filterValue, jobUpdate, type Call } from "./fake-admin";

const PROJECT = "proj-1";
const WEEK = "2026-11-02";
/** Środa 2026-11-04, 10:00 w Warszawie: tydzień zaczyna się w poniedziałek 2026-11-02. */
const now = () => new Date("2026-11-04T09:00:00Z");
const NOW_ISO = "2026-11-04T09:00:00.000Z";
const POST_COST = 0.0066;

type Row = Record<string, unknown> & { id: string; keyword_id: string; device: string; week_start: string; status: string; dfs_task_id: string | null };

interface World {
  budget?: number;
  spent?: number;
  domains?: string[];
  competitors?: { name: string; domains: string[] }[];
  keywords?: { id: string; key: string }[];
  rows?: Partial<Row>[];
  /** Komunikat błędu, gdy zapis do `rank_checks` ma się nie udać. */
  failWrite?: (c: Call) => string | undefined;
}

/** Atrapa bazy z prawdziwą tabelą `rank_checks`: upsert, odczyt i aktualizacje działają na wierszach w pamięci. */
function world(w: World = {}) {
  const rows: Row[] = (w.rows ?? []).map((r, i) => ({
    id: `old-${i}`, project_id: PROJECT, week_start: WEEK, status: "pending", dfs_task_id: null, cost_usd: 0, error: null,
    created_at: "2026-11-02T03:00:00.000Z", ...r,
  } as Row));

  const rankChecks = (c: Call) => {
    const failure = w.failWrite?.(c);
    if (failure) return { error: { message: failure } };
    if (c.op === "select") {
      const week = filterValue(c, "eq", "week_start");
      const before = filterValue(c, "lt", "week_start") as string | undefined;
      const status = filterValue(c, "eq", "status");
      const needsTask = c.filters.some((f) => f[0] === "not" && f[1] === "dfs_task_id");
      return {
        data: rows
          .filter((r) => (week === undefined || r.week_start === week) && (before === undefined || r.week_start < before))
          .filter((r) => (status === undefined || r.status === status) && (!needsTask || r.dfs_task_id !== null))
          .map((r) => ({ ...r })),
      };
    }
    if (c.op === "upsert") {
      const saved = (c.payload as Record<string, unknown>[]).map((p) => {
        let row = rows.find((r) => r.keyword_id === p.keyword_id && r.device === p.device && r.week_start === p.week_start);
        if (row) Object.assign(row, p);
        else {
          const created: Record<string, unknown> = { id: `r-${p.keyword_id}-${p.device}`, cost_usd: 0, dfs_task_id: null, error: null, created_at: NOW_ISO, ...p };
          row = created as Row;
          rows.push(row);
        }
        return { id: row.id, keyword_id: row.keyword_id, device: row.device };
      });
      return { data: saved };
    }
    if (c.op === "update") {
      const one = filterValue(c, "eq", "id") as string | undefined;
      const ids = one !== undefined ? [one] : (filterValue(c, "in", "id") as string[]);
      for (const row of rows.filter((r) => ids.includes(r.id))) Object.assign(row, c.payload);
      return {};
    }
    return {};
  };

  const admin = fakeAdmin((c) => {
    if (c.table === "projects") return { data: { seo_budget_usd: w.budget ?? 10, domains: w.domains ?? ["polskaszkola.ai"] } };
    if (c.table === "competitors") return { data: w.competitors ?? [] };
    if (c.table === "keywords" && c.op === "select") {
      const all = w.keywords ?? [];
      const only = filterValue(c, "in", "id") as string[] | undefined;
      if (only) return { data: all.filter((k) => only.includes(k.id)) };
      const limit = c.filters.find((f) => f[0] === "limit")?.[1] as number | undefined;
      return { data: limit === undefined ? all : all.slice(0, limit) };
    }
    if (c.table === "rank_checks") return rankChecks(c);
    if (c.table === "seo_jobs" && c.op === "insert") return { data: { id: "job-1" } };
    if (c.table === "seo_jobs" && c.op === "select") return { data: [{ cost_usd: w.spent ?? 0 }] };
    if (c.table === "seo_jobs" && c.op === "update") return { data: [{ id: "job-1" }] };
    return {};
  });
  return { ...admin, rows };
}

const kws = (...keys: string[]) => keys.map((key, i) => ({ id: `k${i + 1}`, key }));
const rowId = (keywordId: string, device: string) => `r-${keywordId}-${device}`;
const taskId = (keywordId: string, device: string) => `dfs-${rowId(keywordId, device)}`;

const postFake = (rejects: Record<string, string> = {}) =>
  vi.fn<typeof postFn>(async (tasks) => ({
    posted: tasks.filter((t) => !(t.tag in rejects)).map((t) => ({ tag: t.tag, id: `dfs-${t.tag}`, costUsd: POST_COST })),
    failed: tasks.filter((t) => t.tag in rejects).map((t) => ({ tag: t.tag, error: rejects[t.tag] })),
  }));

/** Atrapa odbioru: stan zadania po jego id, a bez wpisu zadanie jest w toku. */
const getFake = (states: Record<string, SerpTaskState> = {}) =>
  vi.fn<typeof getFn>(async (id) => states[id] ?? { state: "pending" });

const organic = (rank: number, domain: string, absolute = rank + 1) => ({
  type: "organic", rank_group: rank, rank_absolute: absolute, domain, title: `Wynik ${rank}`, url: `https://${domain}/strona`, breadcrumb: `https://${domain}`,
});
const serp = (...items: unknown[]) => ({ items });
const done = (result: unknown, costUsd = 0.005, checkedAt: string | null = "2026-11-04T09:03:00.000Z"): SerpTaskState =>
  ({ state: "done", result, costUsd, checkedAt });
const NEVER_RANKED = serp(organic(1, "inna.example"), organic(2, "druga.example"));

const instantSleep = () => vi.fn(async (ms: number) => { void ms; });

function setup(w: World, deps: { post?: ReturnType<typeof postFake>; get?: ReturnType<typeof getFake>; sleep?: ReturnType<typeof instantSleep>; now?: () => Date } = {}) {
  const wd = world(w);
  const post = deps.post ?? postFake();
  const get = deps.get ?? getFake();
  const sleep = deps.sleep ?? instantSleep();
  return {
    ...wd, post, get, sleep,
    run: () => runRankCheck({ projectId: PROJECT }, { admin: wd.client, postSerpTasks: post, getSerpTask: get, sleep, now: deps.now ?? now }),
  };
}

const rankUpdates = (calls: Call[]) => calls.filter((c) => c.table === "rank_checks" && c.op === "update");
const jobWrites = (calls: Call[]) => calls.filter((c) => c.table === "seo_jobs" && c.op === "update").map((c) => c.payload as Record<string, unknown>);
const rowOf = (rows: Row[], keywordId: string, device: string) => rows.find((r) => r.id === rowId(keywordId, device))!;

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("stałe", () => {
  it("do 100 fraz, odbiór co minutę przez godzinę, dwa urządzenia", () => {
    expect(MAX_RANK_KEYWORDS).toBe(100);
    expect(POLL_INTERVAL_MS).toBe(60_000);
    expect(MAX_POLLS).toBe(60);
    expect(DEVICES).toEqual(["desktop", "mobile"]);
    expect(NOTHING_TO_CHECK_MESSAGE).toBe("Pozycje z tego tygodnia są już sprawdzone");
  });
});

describe("rankWeekStart", () => {
  it.each([
    ["niedziela 23:30 w Warszawie to jeszcze poprzedni poniedziałek", "2026-11-08T22:30:00Z", "2026-11-02"],
    ["poniedziałek 00:30 w Warszawie (8.11 23:30 UTC) otwiera nowy tydzień", "2026-11-08T23:30:00Z", "2026-11-09"],
    ["harmonogram: poniedziałek 4:00 w Warszawie", "2026-11-09T03:00:00Z", "2026-11-09"],
    ["środa w środku tygodnia", "2026-11-04T09:00:00Z", "2026-11-02"],
    ["czas letni: poniedziałek 00:30 w Warszawie (niedziela 22:30 UTC)", "2026-05-31T22:30:00Z", "2026-06-01"],
    ["czas letni: niedziela 23:30 w Warszawie (21:30 UTC)", "2026-05-31T21:30:00Z", "2026-05-25"],
    ["przełom roku: czwartek 31.12", "2026-12-31T12:00:00Z", "2026-12-28"],
    ["przełom roku: niedziela 3.01", "2027-01-03T12:00:00Z", "2026-12-28"],
  ])("%s", (_name, iso, expected) => {
    expect(rankWeekStart(new Date(iso))).toBe(expected);
  });
});

describe("runRankCheck: bez płatnych wywołań", () => {
  it("bez aktywnych fraz zapisuje zadanie skipped i nie woła API ani budżetu", async () => {
    const t = setup({ keywords: [] });

    const res = await t.run();

    expect(res).toEqual({ status: "skipped", posted: 0, done: 0, failed: 0, pending: 0, costUsd: 0 });
    expect(t.post).not.toHaveBeenCalled();
    expect(t.get).not.toHaveBeenCalled();
    expect(t.sleep).not.toHaveBeenCalled();
    expect(t.calls.find((c) => c.table === "seo_jobs" && c.op === "insert")?.payload)
      .toEqual({ project_id: PROJECT, kind: "rank_check", status: "running" });
    expect(jobUpdate(t.calls)).toMatchObject({ status: "skipped", error: "Brak aktywnych fraz" });
    expect(t.calls.some((c) => c.table === "seo_jobs" && c.op === "select")).toBe(false);
    expect(t.calls.some((c) => c.table === "rank_checks")).toBe(false);
  });

  it.each([
    ["pusta lista domen", []],
    ["same puste wpisy", ["", "  ", "https:///"]],
  ])("bez domeny projektu (%s) zapisuje zadanie skipped i nie woła API", async (_name, domains) => {
    const t = setup({ keywords: kws("szkolenia ai"), domains });

    const res = await t.run();

    expect(res.status).toBe("skipped");
    expect(t.post).not.toHaveBeenCalled();
    expect(jobUpdate(t.calls)).toMatchObject({ status: "skipped", error: "Projekt nie ma ustawionej domeny" });
    expect(t.calls.some((c) => c.table === "rank_checks")).toBe(false);
  });

  it("czyta projekt, konkurentów projektu i aktywne frazy: wolumen malejąco, bez wolumenu na końcu, najwyżej 100", async () => {
    const t = setup({ keywords: [] });
    await t.run();

    const project = t.calls.find((c) => c.table === "projects")!;
    expect(project.cols).toBe("seo_budget_usd, domains");
    expect(project.filters).toEqual([["eq", "id", PROJECT]]);

    const competitors = t.calls.find((c) => c.table === "competitors")!;
    expect(competitors.cols).toBe("name, domains");
    expect(competitors.filters).toEqual([["eq", "project_id", PROJECT]]);

    const keywords = t.calls.find((c) => c.table === "keywords" && c.op === "select")!;
    expect(keywords.cols).toBe("id, key");
    expect(keywords.filters).toEqual([
      ["eq", "project_id", PROJECT],
      ["eq", "active", true],
      ["order", "search_volume", { ascending: false, nullsFirst: false }],
      ["order", "created_at", { ascending: true }],
      ["order", "id", { ascending: true }],
      ["limit", 100],
    ]);
  });

  it("limit SEO: wydane 9,99 z 10 daje budget_exceeded, bez zapisu wierszy i bez wywołań API", async () => {
    const t = setup({ keywords: kws("szkolenia ai"), budget: 10, spent: 9.99 });

    const res = await t.run();

    expect(res).toEqual({ status: "budget_exceeded", posted: 0, done: 0, failed: 0, pending: 0, costUsd: 0 });
    expect(t.post).not.toHaveBeenCalled();
    expect(t.get).not.toHaveBeenCalled();
    expect(t.sleep).not.toHaveBeenCalled();
    expect(t.calls.some((c) => c.table === "rank_checks" && c.op !== "select")).toBe(false);
    expect(jobUpdate(t.calls)).toMatchObject({
      status: "budget_exceeded",
      error: "Limit SEO: wydano 9,99 USD z 10,00 USD, to zadanie kosztuje ok. 0,01 USD",
    });
    expect(jobWrites(t.calls)).toHaveLength(1);
    expect(jobWrites(t.calls)[0]).not.toHaveProperty("cost_usd");
  });

  it("szacunek to estimateRankCost(liczba par do wysłania): budżet równy wydanym plus szacunek przepuszcza, o grosz mniej już nie", async () => {
    const estimate = estimateRankCost(4);
    const open = setup({ keywords: kws("a", "b"), budget: 1 + estimate, spent: 1 });
    expect((await open.run()).status).toBe("done");

    const tight = setup({ keywords: kws("a", "b"), budget: 1 + estimate - 0.01, spent: 1 });
    expect((await tight.run()).status).toBe("budget_exceeded");
    expect(tight.post).not.toHaveBeenCalled();
    expect(jobUpdate(tight.calls)).toMatchObject({ stats: { estimateUsd: estimate, spentUsd: 1 } });
  });

  it("brak liczbowego budżetu zamyka bramę (NaN)", async () => {
    const t = setup({ keywords: kws("a"), budget: NaN });
    expect((await t.run()).status).toBe("budget_exceeded");
    expect(t.post).not.toHaveBeenCalled();
  });

  it("błąd odczytu projektu rzuca bez zakładania zadania", async () => {
    const { client, calls } = fakeAdmin((c) => (c.table === "projects" ? { error: { message: "no rows" } } : {}));
    await expect(runRankCheck({ projectId: PROJECT }, { admin: client, postSerpTasks: postFake(), getSerpTask: getFake(), sleep: instantSleep(), now })).rejects.toThrow("no rows");
    expect(calls.some((c) => c.table === "seo_jobs")).toBe(false);
  });
});

describe("runRankCheck: szczęśliwa ścieżka", () => {
  const competitors = [{ name: "Kodołamacz", domains: ["kodolamacz.pl"] }];
  const keywords = kws("szkolenia ai", "kurs ai z certyfikatem");
  const states = (): Record<string, SerpTaskState> => ({
    [taskId("k1", "desktop")]: done(serp(organic(1, "kodolamacz.pl"), organic(2, "inna.example"), organic(3, "polskaszkola.ai", 5)), 0.005),
    [taskId("k1", "mobile")]: done(NEVER_RANKED, 0.006),
    [taskId("k2", "desktop")]: done(serp(organic(4, "www.polskaszkola.ai", 6)), 0.0055),
    [taskId("k2", "mobile")]: done(NEVER_RANKED, 0.0045),
  });

  it("rezerwuje szacunek, zapisuje cztery wiersze pending (fraza × urządzenie) i wysyła cztery zadania z tagami równymi id wierszy", async () => {
    const t = setup({ keywords, competitors }, { get: getFake(states()) });
    let seenByPost: Call[] = [];
    t.post.mockImplementationOnce(async (tasks) => {
      seenByPost = [...t.calls];
      return { posted: tasks.map((x) => ({ tag: x.tag, id: `dfs-${x.tag}`, costUsd: POST_COST })), failed: [] };
    });

    await t.run();

    // w chwili wysyłania w rejestrze jest już tylko rezerwacja, a wiersze są zapisane jako pending
    expect(jobWrites(seenByPost)).toEqual([{ cost_usd: estimateRankCost(4) }]);
    const upsert = seenByPost.find((c) => c.table === "rank_checks" && c.op === "upsert")!;
    expect(upsert.opts).toEqual({ onConflict: "keyword_id,device,week_start" });
    expect(upsert.payload).toEqual([
      { project_id: PROJECT, keyword_id: "k1", device: "desktop", week_start: WEEK, status: "pending", dfs_task_id: null, error: null },
      { project_id: PROJECT, keyword_id: "k1", device: "mobile", week_start: WEEK, status: "pending", dfs_task_id: null, error: null },
      { project_id: PROJECT, keyword_id: "k2", device: "desktop", week_start: WEEK, status: "pending", dfs_task_id: null, error: null },
      { project_id: PROJECT, keyword_id: "k2", device: "mobile", week_start: WEEK, status: "pending", dfs_task_id: null, error: null },
    ]);

    expect(t.post).toHaveBeenCalledTimes(1);
    expect(t.post.mock.calls[0][0]).toEqual([
      { tag: rowId("k1", "desktop"), keyword: "szkolenia ai", device: "desktop" },
      { tag: rowId("k1", "mobile"), keyword: "szkolenia ai", device: "mobile" },
      { tag: rowId("k2", "desktop"), keyword: "kurs ai z certyfikatem", device: "desktop" },
      { tag: rowId("k2", "mobile"), keyword: "kurs ai z certyfikatem", device: "mobile" },
    ]);
  });

  it("po wysłaniu zapisuje id zadania i koszt z task_post w wierszu, po id i projekcie", async () => {
    const t = setup({ keywords: kws("szkolenia ai") });
    await t.run();

    const first = rankUpdates(t.calls)[0];
    expect(first.payload).toEqual({ dfs_task_id: taskId("k1", "desktop"), cost_usd: POST_COST });
    expect(first.filters).toEqual([["eq", "id", rowId("k1", "desktop")], ["eq", "project_id", PROJECT]]);
  });

  it("czeka minutę przed odbiorem, odbiera wszystkie cztery wyniki i zapisuje odczyt z parsera oraz koszt faktyczny", async () => {
    const t = setup({ keywords, competitors }, { get: getFake(states()) });

    const res = await t.run();

    expect(t.sleep.mock.calls).toEqual([[60_000]]);
    expect(t.get.mock.calls.map((c) => c[0]).sort()).toEqual(
      ["k1", "k2"].flatMap((k) => DEVICES.map((d) => taskId(k, d))).sort(),
    );

    // nasza domena na 3. miejscu, konkurent na 1.
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({
      status: "done", position: 3, rank_absolute: 5, url: "https://polskaszkola.ai/strona", breadcrumb: "https://polskaszkola.ai",
      cost_usd: 0.005, checked_at: "2026-11-04T09:03:00.000Z", error: null,
      competitors: [{ name: "Kodołamacz", domain: "kodolamacz.pl", position: 1, url: "https://kodolamacz.pl/strona" }],
    });
    expect(rowOf(t.rows, "k1", "desktop").top10).toHaveLength(3);
    expect(rowOf(t.rows, "k1", "desktop").features).toMatchObject({ aiOverview: false, localPack: false });
    // domena z www. też jest nasza
    expect(rowOf(t.rows, "k2", "desktop")).toMatchObject({ status: "done", position: 4, rank_absolute: 6, cost_usd: 0.0055 });
    // brak nas w wynikach to pomiar `done` z pozycją null (poza top 100)
    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "done", position: null, rank_absolute: null, url: null, cost_usd: 0.006, competitors: [] });
    expect(rowOf(t.rows, "k2", "mobile")).toMatchObject({ status: "done", position: null, cost_usd: 0.0045 });

    expect(res.status).toBe("done");
    expect(res).toMatchObject({ posted: 4, done: 4, failed: 0, pending: 0 });
    expect(res.costUsd).toBeCloseTo(0.005 + 0.006 + 0.0055 + 0.0045, 6);
  });

  it("zamyka zadanie z kosztem faktycznym zamiast szacunku i ze statystykami", async () => {
    const t = setup({ keywords, competitors }, { get: getFake(states()) });
    await t.run();

    const writes = jobWrites(t.calls);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({ cost_usd: estimateRankCost(4) });
    expect(writes[1]).toMatchObject({
      status: "done", error: null, stats: { posted: 4, resumed: 0, done: 4, failed: 0, pending: 0, estimateUsd: estimateRankCost(4) },
    });
    expect(writes[1].cost_usd as number).toBeCloseTo(0.021, 6);
    expect(writes[1].cost_usd).not.toBe(estimateRankCost(4));
  });

  it("własne domeny parsera to wszystkie domeny projektu po normalizacji (schemat, www, ścieżka, wielkość liter)", async () => {
    const t = setup({
      keywords: kws("szkolenia ai"), domains: ["https://www.Inna-Marka.PL/blog", "", "polskaszkola.ai"],
    }, {
      get: getFake({
        [taskId("k1", "desktop")]: done(serp(organic(2, "inna-marka.pl"))),
        [taskId("k1", "mobile")]: done(serp(organic(7, "polskaszkola.ai"))),
      }),
    });
    await t.run();
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done", position: 2 });
    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "done", position: 7 });
  });

  it("brak daty w odpowiedzi (zapytanie bez wyników) zapisuje czas odbioru, a pusty wynik to pozycja null", async () => {
    const t = setup({ keywords: kws("szkolenia ai") }, {
      get: getFake({ [taskId("k1", "desktop")]: { state: "done", result: null, costUsd: 0.002, checkedAt: null } }),
    });
    await t.run();
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done", position: null, checked_at: NOW_ISO, cost_usd: 0.002 });
  });

  it("odbiera najwyżej 5 wyników naraz", async () => {
    const keys = Array.from({ length: 6 }, (_, i) => `fraza ${i}`);
    let inflight = 0;
    let peak = 0;
    const get = vi.fn<typeof getFn>(async () => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inflight -= 1;
      return done(NEVER_RANKED);
    });
    const t = setup({ keywords: kws(...keys) }, { get });

    const res = await t.run();

    expect(get).toHaveBeenCalledTimes(12);
    expect(peak).toBe(5);
    expect(res).toMatchObject({ posted: 12, done: 12 });
  });

  it("odbiór kończy się, gdy nic nie czeka: wynik gotowy w trzecim podejściu to trzy oczekiwania, nie sześćdziesiąt", async () => {
    const asked = new Map<string, number>();
    const get = vi.fn<typeof getFn>(async (id) => {
      const n = (asked.get(id) ?? 0) + 1;
      asked.set(id, n);
      return n >= 3 ? done(NEVER_RANKED) : { state: "pending" };
    });
    const t = setup({ keywords: kws("szkolenia ai") }, { get });

    const res = await t.run();

    expect(t.sleep).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenCalledTimes(6);
    expect(res).toMatchObject({ status: "done", done: 2, pending: 0 });
  });

  it("wynik niegotowy przez MAX_POLLS: wiersz zostaje pending z id zadania, zadanie done z pending 1, koszt z task_post", async () => {
    const t = setup({ keywords: kws("szkolenia ai") }, {
      get: getFake({ [taskId("k1", "desktop")]: done(NEVER_RANKED, 0.005) }),
    });

    const res = await t.run();

    expect(t.sleep).toHaveBeenCalledTimes(MAX_POLLS);
    expect(t.sleep.mock.calls.every((c) => c[0] === POLL_INTERVAL_MS)).toBe(true);
    // gotowe zadanie odebrano w pierwszym podejściu, drugiego pytamy w każdym z 60
    expect(t.get.mock.calls.filter((c) => c[0] === taskId("k1", "mobile"))).toHaveLength(MAX_POLLS);
    expect(t.get.mock.calls.filter((c) => c[0] === taskId("k1", "desktop"))).toHaveLength(1);

    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "pending", dfs_task_id: taskId("k1", "mobile"), cost_usd: POST_COST });
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done" });
    expect(res).toMatchObject({ status: "done", posted: 2, done: 1, failed: 0, pending: 1 });
    // faktyczny koszt odebranego plus koszt z task_post dla nieodebranego
    expect(res.costUsd).toBeCloseTo(0.005 + POST_COST, 6);
    expect(jobUpdate(t.calls)).toMatchObject({ status: "done", stats: { posted: 2, done: 1, pending: 1 } });
  });

  it("zadanie odrzucone przez DataForSEO (failed) kończy wiersz błędem, a koszt zostaje z task_post", async () => {
    const t = setup({ keywords: kws("szkolenia ai") }, {
      get: getFake({
        [taskId("k1", "desktop")]: { state: "failed", error: "DataForSEO task 40501: Invalid Field: 'keyword'." },
        [taskId("k1", "mobile")]: done(NEVER_RANKED, 0.004),
      }),
    });

    const res = await t.run();

    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "failed", error: "DataForSEO task 40501: Invalid Field: 'keyword'.", cost_usd: POST_COST });
    expect(res).toMatchObject({ status: "done", posted: 2, done: 1, failed: 1, pending: 0 });
    expect(res.costUsd).toBeCloseTo(POST_COST + 0.004, 6);
    // nie czekamy na nic więcej
    expect(t.sleep).toHaveBeenCalledTimes(1);
  });

  it("zadanie odrzucone przy wysyłce kończy wiersz błędem, reszta jest odbierana", async () => {
    const post = postFake({ [rowId("k1", "mobile")]: "DataForSEO task 40501: Invalid Field: 'device'." });
    const t = setup({ keywords: kws("szkolenia ai") }, { post, get: getFake({ [taskId("k1", "desktop")]: done(NEVER_RANKED, 0.005) }) });

    const res = await t.run();

    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "failed", error: "DataForSEO task 40501: Invalid Field: 'device'.", dfs_task_id: null });
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done" });
    expect(t.get).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ status: "done", posted: 1, done: 1, failed: 1, pending: 0 });
    expect(res.costUsd).toBeCloseTo(0.005, 6);
    expect(jobUpdate(t.calls)).toMatchObject({ stats: { posted: 1, done: 1, failed: 1, estimateUsd: estimateRankCost(2) } });
  });

  it("domyślne oczekiwanie to prawdziwy setTimeout na POLL_INTERVAL_MS", async () => {
    vi.useFakeTimers();
    const wd = world({ keywords: kws("szkolenia ai") });
    const get = getFake({ [taskId("k1", "desktop")]: done(NEVER_RANKED), [taskId("k1", "mobile")]: done(NEVER_RANKED) });

    const pending = runRankCheck({ projectId: PROJECT }, { admin: wd.client, postSerpTasks: postFake(), getSerpTask: get, now });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toMatchObject({ status: "done", done: 2 });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("runRankCheck: wznawianie i drugie uruchomienie w tym samym tygodniu", () => {
  it("wiersz pending z id zadania jest tylko odbierany: bez task_post, bez bramki budżetu, koszt tego zadania to 0", async () => {
    const t = setup({
      keywords: kws("szkolenia ai"),
      rows: [
        { id: rowId("k1", "desktop"), keyword_id: "k1", device: "desktop", status: "pending", dfs_task_id: "old-task-d", cost_usd: POST_COST },
        { id: rowId("k1", "mobile"), keyword_id: "k1", device: "mobile", status: "pending", dfs_task_id: "old-task-m", cost_usd: POST_COST },
      ],
    }, {
      get: getFake({ "old-task-d": done(serp(organic(5, "polskaszkola.ai")), 0.0049), "old-task-m": done(NEVER_RANKED, 0.0051) }),
    });

    const res = await t.run();

    expect(t.post).not.toHaveBeenCalled();
    expect(t.calls.some((c) => c.table === "rank_checks" && c.op === "upsert")).toBe(false);
    expect(t.calls.some((c) => c.table === "seo_jobs" && c.op === "select")).toBe(false);
    expect(t.get.mock.calls.map((c) => c[0]).sort()).toEqual(["old-task-d", "old-task-m"]);
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done", position: 5, cost_usd: 0.0049, dfs_task_id: "old-task-d" });
    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "done", position: null, cost_usd: 0.0051 });
    expect(res).toEqual({ status: "done", posted: 0, done: 2, failed: 0, pending: 0, costUsd: 0 });
    expect(jobUpdate(t.calls)).toMatchObject({ status: "done", cost_usd: 0, stats: { posted: 0, resumed: 2, done: 2, estimateUsd: 0 } });
  });

  it("wysyła tylko brakujące pary, a gotowe pomija i opłaca tylko je", async () => {
    const t = setup({
      keywords: kws("szkolenia ai", "kurs ai"),
      rows: [
        { id: "old-k1d", keyword_id: "k1", device: "desktop", status: "done", dfs_task_id: "t-1", cost_usd: 0.005 },
        { id: "old-k1m", keyword_id: "k1", device: "mobile", status: "pending", dfs_task_id: "t-2", cost_usd: POST_COST },
      ],
    }, {
      get: getFake({ "t-2": done(NEVER_RANKED, 0.005), [taskId("k2", "desktop")]: done(NEVER_RANKED, 0.004), [taskId("k2", "mobile")]: done(NEVER_RANKED, 0.003) }),
    });

    const res = await t.run();

    expect(t.post.mock.calls[0][0].map((x) => x.tag)).toEqual([rowId("k2", "desktop"), rowId("k2", "mobile")]);
    expect(jobWrites(t.calls)[0]).toEqual({ cost_usd: estimateRankCost(2) });
    expect(t.rows.find((r) => r.id === "old-k1d")).toMatchObject({ status: "done", dfs_task_id: "t-1", cost_usd: 0.005 });
    expect(t.get.mock.calls.map((c) => c[0])).not.toContain("t-1");
    expect(res).toMatchObject({ status: "done", posted: 2, done: 3, pending: 0 });
    // wznowione zadanie z poprzedniego uruchomienia nie wchodzi do kosztu tego
    expect(res.costUsd).toBeCloseTo(0.004 + 0.003, 6);
    expect(jobUpdate(t.calls)).toMatchObject({ stats: { posted: 2, resumed: 1, done: 3 } });
  });

  it("wiersz failed i wiersz pending bez id zadania są wysyłane ponownie, a upsert czyści błąd i stare id zadania", async () => {
    const t = setup({
      keywords: kws("szkolenia ai"),
      rows: [
        { id: rowId("k1", "desktop"), keyword_id: "k1", device: "desktop", status: "failed", dfs_task_id: "stare-zadanie", error: "DataForSEO task 40501: Invalid Field", cost_usd: POST_COST },
        { id: rowId("k1", "mobile"), keyword_id: "k1", device: "mobile", status: "pending", dfs_task_id: null },
      ],
    }, {
      get: getFake({ [taskId("k1", "desktop")]: done(NEVER_RANKED), [taskId("k1", "mobile")]: done(NEVER_RANKED) }),
    });

    const res = await t.run();

    expect(t.post.mock.calls[0][0]).toEqual([
      { tag: rowId("k1", "desktop"), keyword: "szkolenia ai", device: "desktop" },
      { tag: rowId("k1", "mobile"), keyword: "szkolenia ai", device: "mobile" },
    ]);
    const upsert = t.calls.find((c) => c.table === "rank_checks" && c.op === "upsert")!;
    expect(upsert.payload).toEqual([
      expect.objectContaining({ keyword_id: "k1", device: "desktop", status: "pending", error: null, dfs_task_id: null }),
      expect.objectContaining({ keyword_id: "k1", device: "mobile", status: "pending", error: null, dfs_task_id: null }),
    ]);
    expect(t.get.mock.calls.map((c) => c[0])).not.toContain("stare-zadanie");
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done", error: null, dfs_task_id: taskId("k1", "desktop") });
    expect(res).toMatchObject({ status: "done", posted: 2, done: 2 });
  });

  it("wszystkie pary już sprawdzone: zadanie skipped z komunikatem, bez wywołań API, bez budżetu i bez czekania", async () => {
    const t = setup({
      keywords: kws("szkolenia ai"),
      rows: [
        { id: "a", keyword_id: "k1", device: "desktop", status: "done", dfs_task_id: "t-1" },
        { id: "b", keyword_id: "k1", device: "mobile", status: "done", dfs_task_id: "t-2" },
        // wiersz z tego tygodnia dla frazy spoza listy nic nie zmienia
        { id: "c", keyword_id: "inna-fraza", device: "desktop", status: "pending", dfs_task_id: null },
      ],
    });

    const res = await t.run();

    expect(res).toEqual({ status: "skipped", posted: 0, done: 0, failed: 0, pending: 0, costUsd: 0 });
    expect(t.post).not.toHaveBeenCalled();
    expect(t.get).not.toHaveBeenCalled();
    expect(t.sleep).not.toHaveBeenCalled();
    expect(t.calls.some((c) => c.table === "seo_jobs" && c.op === "select")).toBe(false);
    expect(t.calls.some((c) => c.table === "rank_checks" && c.op !== "select")).toBe(false);
    expect(jobUpdate(t.calls)).toMatchObject({ status: "skipped", error: "Pozycje z tego tygodnia są już sprawdzone" });
  });

  it("czyta wiersze tylko tego projektu i tego tygodnia (według daty warszawskiej)", async () => {
    const t = setup({ keywords: kws("szkolenia ai") });
    await t.run();

    const read = t.calls.find((c) => c.table === "rank_checks" && c.op === "select" && filterValue(c, "eq", "week_start") !== undefined)!;
    expect(read.cols).toBe("id, keyword_id, device, status, dfs_task_id");
    expect(read.filters).toEqual([["eq", "project_id", PROJECT], ["eq", "week_start", WEEK]]);
  });

  it("w nowym tygodniu pary z poprzedniego tygodnia nie liczą się jako sprawdzone", async () => {
    const t = setup({
      keywords: kws("szkolenia ai"),
      rows: [
        { id: "a", keyword_id: "k1", device: "desktop", week_start: "2026-10-26", status: "done", dfs_task_id: "t-1" },
        { id: "b", keyword_id: "k1", device: "mobile", week_start: "2026-10-26", status: "done", dfs_task_id: "t-2" },
      ],
    });
    const res = await t.run();
    expect(t.post.mock.calls[0][0]).toHaveLength(2);
    expect(res.posted).toBe(2);
  });

  describe("pending z wcześniejszych tygodni: odbieramy poprzedni tydzień (z id), starsze i bez id zamykamy", () => {
    const earlier = (over: Partial<Row>): Partial<Row> => ({ week_start: "2026-10-26", status: "pending", cost_usd: POST_COST, ...over });
    const checkedThisWeek: Partial<Row>[] = [
      { id: "w1", keyword_id: "k1", device: "desktop", status: "done", dfs_task_id: "x" },
      { id: "w2", keyword_id: "k1", device: "mobile", status: "done", dfs_task_id: "y" },
    ];

    it("z id zadania i z poprzedniego tygodnia są odbierane bez względu na godzinę utworzenia (nawet dla frazy spoza listy)", async () => {
      const t = setup({
        keywords: kws("szkolenia ai"),
        rows: [
          ...checkedThisWeek,
          // poniedziałek poprzedniego tygodnia, 9 dni przed `now`: tydzień, a nie liczba dni, decyduje
          earlier({ id: "e1", keyword_id: "dawna-fraza", device: "desktop", dfs_task_id: "task-e1", created_at: "2026-10-26T03:00:00.000Z" }),
          earlier({ id: "e2", keyword_id: "dawna-fraza", device: "mobile", dfs_task_id: "task-e2", created_at: "2026-11-01T22:00:00.000Z" }),
        ],
      }, {
        get: getFake({ "task-e1": done(serp(organic(9, "polskaszkola.ai")), 0.0048), "task-e2": done(NEVER_RANKED, 0.0049) }),
      });

      const res = await t.run();

      const read = t.calls.find((c) => c.table === "rank_checks" && c.op === "select" && filterValue(c, "lt", "week_start") !== undefined)!;
      expect(read.cols).toBe("id, dfs_task_id, week_start");
      expect(read.filters).toEqual([["eq", "project_id", PROJECT], ["eq", "status", "pending"], ["lt", "week_start", WEEK]]);
      expect(t.post).not.toHaveBeenCalled();
      expect(t.get.mock.calls.map((c) => c[0]).sort()).toEqual(["task-e1", "task-e2"]);
      expect(t.rows.find((r) => r.id === "e1")).toMatchObject({ status: "done", position: 9, cost_usd: 0.0048 });
      expect(res).toMatchObject({ status: "done", posted: 0, done: 2, pending: 0 });
      expect(jobUpdate(t.calls)).toMatchObject({ stats: { resumed: 2, stale: 0 } });
    });

    it("pending sprzed dwóch tygodni i starsze (z id i bez) oraz z poprzedniego tygodnia bez id są oznaczane failed i nie są odbierane", async () => {
      const t = setup({
        keywords: kws("szkolenia ai"),
        rows: [
          ...checkedThisWeek,
          earlier({ id: "kept", keyword_id: "k1", device: "desktop", dfs_task_id: "task-kept" }),
          // 2026-10-19 to dwa tygodnie wstecz: już poza oknem, nawet z id zadania
          earlier({ id: "stale-1", keyword_id: "k1", device: "mobile", week_start: "2026-10-19", dfs_task_id: "task-s1", created_at: "2026-10-27T03:00:00.000Z" }),
          earlier({ id: "stale-2", keyword_id: "k2", device: "desktop", week_start: "2026-10-12", dfs_task_id: "task-s2" }),
          earlier({ id: "stale-3", keyword_id: "k2", device: "mobile", week_start: "2026-10-19", dfs_task_id: null }),
          // poprzedni tydzień bez id zadania: nie ma czego odbierać, a tydzień minął
          earlier({ id: "stale-4", keyword_id: "k3", device: "desktop", dfs_task_id: null }),
        ],
      }, {
        get: getFake({ "task-kept": done(NEVER_RANKED) }),
      });

      const res = await t.run();

      const marking = rankUpdates(t.calls).find((c) => (c.payload as Record<string, unknown>).error === "Wynik nie został odebrany")!;
      expect(marking.payload).toEqual({ status: "failed", error: "Wynik nie został odebrany" });
      expect(marking.filters).toEqual([["in", "id", ["stale-1", "stale-2", "stale-3", "stale-4"]], ["eq", "project_id", PROJECT]]);
      for (const id of ["stale-1", "stale-2", "stale-3", "stale-4"]) {
        expect(t.rows.find((r) => r.id === id)).toMatchObject({ status: "failed", error: "Wynik nie został odebrany" });
      }
      expect(t.get.mock.calls.map((c) => c[0])).toEqual(["task-kept"]);
      expect(t.rows.find((r) => r.id === "kept")).toMatchObject({ status: "done" });
      expect(res).toMatchObject({ status: "done", done: 1, failed: 0 });
      expect(jobUpdate(t.calls)).toMatchObject({ stats: { resumed: 1, stale: 4 } });
    });

    it("tylko przeterminowane wiersze: są oznaczane failed, a zadanie kończy się jako skipped (nic do odbioru)", async () => {
      const t = setup({
        keywords: kws("szkolenia ai"),
        rows: [
          ...checkedThisWeek,
          earlier({ id: "stale-1", keyword_id: "k1", device: "mobile", week_start: "2026-10-19", dfs_task_id: "task-s1", created_at: "2026-10-26T03:00:00.000Z" }),
        ],
      });

      const res = await t.run();

      expect(t.rows.find((r) => r.id === "stale-1")).toMatchObject({ status: "failed", error: "Wynik nie został odebrany" });
      expect(res.status).toBe("skipped");
      expect(t.get).not.toHaveBeenCalled();
      expect(jobUpdate(t.calls)).toMatchObject({ status: "skipped", error: NOTHING_TO_CHECK_MESSAGE, stats: { stale: 1 } });
    });
  });
});

describe("runRankCheck: odmowa budżetu nie wstrzymuje odbioru opłaconych zadań", () => {
  const paidRow = { id: rowId("k1", "desktop"), keyword_id: "k1", device: "desktop", status: "pending", dfs_task_id: "old-task-d", cost_usd: POST_COST };

  it("odbiera czekające zadania, niczego nie wysyła, wynik to budget_exceeded, a zadanie zostaje zamknięte przez bramkę", async () => {
    const t = setup({ keywords: kws("szkolenia ai"), budget: 10, spent: 9.999, rows: [paidRow] }, {
      get: getFake({ "old-task-d": done(serp(organic(4, "polskaszkola.ai")), 0.0049) }),
    });

    const res = await t.run();

    expect(t.post).not.toHaveBeenCalled();
    expect(t.calls.some((c) => c.table === "rank_checks" && c.op === "upsert")).toBe(false);
    expect(t.sleep).toHaveBeenCalledTimes(1);
    expect(t.get.mock.calls.map((c) => c[0])).toEqual(["old-task-d"]);
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done", position: 4, cost_usd: 0.0049 });
    // para bez wiersza nie została wysłana
    expect(t.rows.find((r) => r.id === rowId("k1", "mobile"))).toBeUndefined();
    expect(res).toEqual({ status: "budget_exceeded", posted: 0, done: 1, failed: 0, pending: 0, costUsd: 0 });
    // rejestr: tylko zamknięcie przez bramkę, bez ponownego zapisu po odbiorze
    expect(jobWrites(t.calls)).toHaveLength(1);
    expect(jobWrites(t.calls)[0]).toMatchObject({ status: "budget_exceeded" });
  });

  it("wynik niegotowy do końca odbioru zostaje pending (pending w wyniku), zadanie nadal budget_exceeded", async () => {
    const t = setup({ keywords: kws("szkolenia ai"), budget: 10, spent: 9.999, rows: [paidRow] });

    const res = await t.run();

    expect(t.sleep).toHaveBeenCalledTimes(MAX_POLLS);
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "pending", dfs_task_id: "old-task-d" });
    expect(res).toEqual({ status: "budget_exceeded", posted: 0, done: 0, failed: 0, pending: 1, costUsd: 0 });
    expect(jobWrites(t.calls)).toHaveLength(1);
  });

  it("błąd odbioru po odmowie leci dalej, ale nie otwiera zamkniętego zadania ponownie jako failed", async () => {
    const get = vi.fn<typeof getFn>(async () => { throw new Error(PAYMENT_REQUIRED_MESSAGE); });
    const t = setup({ keywords: kws("szkolenia ai"), budget: 10, spent: 9.999, rows: [paidRow] }, { get });

    await expect(t.run()).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);

    expect(jobWrites(t.calls)).toHaveLength(1);
    expect(jobWrites(t.calls)[0]).toMatchObject({ status: "budget_exceeded" });
  });
});

describe("runRankCheck: tygodniowy limit fraz", () => {
  const many = (n: number) => kws(...Array.from({ length: n }, (_, i) => `fraza ${i + 1}`));
  const allDone = () => vi.fn<typeof getFn>(async () => done(NEVER_RANKED));
  const rowsFor = (ids: string[], status = "done"): Partial<Row>[] =>
    ids.flatMap((id) => DEVICES.map((device) => ({ id: rowId(id, device), keyword_id: id, device, status, dfs_task_id: `t-${id}-${device}` })));
  const idsUpTo = (n: number) => Array.from({ length: n }, (_, i) => `k${i + 1}`);
  const tagsOf = (post: ReturnType<typeof postFake>, call = 0) => post.mock.calls[call][0].map((x) => x.tag);

  it("fraza, która wskoczyła na górę po pierwszym uruchomieniu tygodnia, nie wypycha żadnej z 100 sprawdzonych", async () => {
    const keywords = many(100);
    const t = setup({ keywords }, { get: allDone() });

    const first = await t.run();
    expect(first).toMatchObject({ status: "done", posted: 200, done: 200 });
    expect(t.post).toHaveBeenCalledTimes(1);

    // nowa fraza o największym wolumenie: pierwsza w kolejności, 100. z poprzedniego uruchomienia wypada poza pierwszą setkę
    keywords.unshift({ id: "nowa", key: "nowa fraza" });
    const second = await t.run();

    expect(second.status).toBe("skipped");
    expect(t.post).toHaveBeenCalledTimes(1);
    expect(t.rows.some((r) => r.keyword_id === "nowa")).toBe(false);
    // k100 wypadła z pierwszych 100 wyników zapytania, ale zachowała miejsce: została dobrana po id
    const lookup = t.calls.filter((c) => c.table === "keywords" && filterValue(c, "in", "id") !== undefined);
    expect(lookup).toHaveLength(1);
    expect(lookup[0].filters).toEqual([["eq", "project_id", PROJECT], ["eq", "active", true], ["in", "id", ["k100"]]]);
  });

  it("pozostałe miejsce w limicie dostają nowe frazy według wolumenu, reszta czeka do następnego tygodnia", async () => {
    const keywords = many(98);
    const t = setup({ keywords }, { get: allDone() });
    await t.run();

    keywords.unshift({ id: "n1", key: "nowa 1" }, { id: "n2", key: "nowa 2" }, { id: "n3", key: "nowa 3" });
    const second = await t.run();

    // 98 fraz z wierszami + 2 nowe = 100: n1 i n2 dochodzą, n3 nie
    expect(second).toMatchObject({ status: "done", posted: 4, done: 4 });
    expect(tagsOf(t.post, 1)).toEqual([rowId("n1", "desktop"), rowId("n1", "mobile"), rowId("n2", "desktop"), rowId("n2", "mobile")]);

    const third = await t.run();
    expect(third.status).toBe("skipped");
    expect(t.post).toHaveBeenCalledTimes(2);
    expect(t.rows.some((r) => r.keyword_id === "n3")).toBe(false);
  });

  it("do limitu liczą się frazy z wierszem w dowolnym statusie, a fraza z wierszem zachowuje miejsce i jest ponawiana", async () => {
    const existing = idsUpTo(98);
    const t = setup({
      keywords: [{ id: "n1", key: "nowa 1" }, { id: "n2", key: "nowa 2" }, { id: "n3", key: "nowa 3" }, ...many(98)],
      rows: [
        ...rowsFor(existing.slice(0, 97)),
        // k98: wiersz failed (mobile gotowy) liczy się do limitu i jest wysyłany ponownie
        { id: rowId("k98", "desktop"), keyword_id: "k98", device: "desktop", status: "failed", dfs_task_id: "stare" },
        ...rowsFor(["k98"]).filter((r) => r.device === "mobile"),
      ],
    }, { get: allDone() });

    const res = await t.run();

    expect(res).toMatchObject({ status: "done", posted: 5, done: 5 });
    expect(tagsOf(t.post).sort()).toEqual(
      [rowId("k98", "desktop"), rowId("n1", "desktop"), rowId("n1", "mobile"), rowId("n2", "desktop"), rowId("n2", "mobile")].sort(),
    );
    expect(jobUpdate(t.calls)).toMatchObject({ stats: { posted: 5, estimateUsd: estimateRankCost(5) } });
  });

  it("wiersze nieaktywnej frazy też zajmują miejsce w limicie, a sama fraza nie wraca do wysyłki", async () => {
    const t = setup({
      // 99 aktywnych z wierszami + 1 nieaktywna z wierszami = 100: nowa fraza już się nie mieści
      keywords: [{ id: "n1", key: "nowa 1" }, ...many(99)],
      rows: rowsFor([...idsUpTo(99), "nieaktywna"]),
    });

    const res = await t.run();

    expect(res.status).toBe("skipped");
    expect(t.post).not.toHaveBeenCalled();
  });
});

describe("runRankCheck: błędy", () => {
  it("nic nie wysłano i dostawca odrzucił wszystko (np. brak danych logowania): zadanie failed z komunikatem pierwszego błędu, wiersze zostają pending bez id", async () => {
    const message = "Brak DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD";
    const post = vi.fn<typeof postFn>(async (tasks) => ({ posted: [], failed: tasks.map((x) => ({ tag: x.tag, error: message })) }));
    const t = setup({ keywords: kws("szkolenia ai") }, { post });

    await expect(t.run()).rejects.toThrow(message);

    expect(jobUpdate(t.calls)).toMatchObject({ status: "failed", error: message, cost_usd: 0 });
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "pending", dfs_task_id: null, error: null });
    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "pending", dfs_task_id: null, error: null });
    expect(rankUpdates(t.calls)).toHaveLength(0);
    expect(t.get).not.toHaveBeenCalled();
    expect(t.sleep).not.toHaveBeenCalled();
  });

  it("brak środków przy wysyłce: zadanie failed z komunikatem i kosztem szacunku (wydatek nieznany), wiersze pending bez id, nic nie jest odbierane", async () => {
    const post = vi.fn<typeof postFn>(async () => { throw new Error(PAYMENT_REQUIRED_MESSAGE); });
    const t = setup({ keywords: kws("szkolenia ai") }, { post });

    await expect(t.run()).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);

    // wysyłka przerwana wyjątkiem: nie wiemy, ile pobrano, więc w rejestrze zostaje rezerwacja, a nie 0
    expect(jobUpdate(t.calls)).toMatchObject({ status: "failed", error: PAYMENT_REQUIRED_MESSAGE, cost_usd: estimateRankCost(2) });
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "pending", dfs_task_id: null });
    expect(t.get).not.toHaveBeenCalled();
  });

  it("brak środków przy odbiorze: zadanie failed z kosztem wysłanych zadań, odebrane wcześniej wiersze zostają done", async () => {
    let calls = 0;
    const get = vi.fn<typeof getFn>(async (id) => {
      calls += 1;
      if (calls === 1) return done(NEVER_RANKED, 0.004);
      throw new Error(`${PAYMENT_REQUIRED_MESSAGE} (${id})`);
    });
    const t = setup({ keywords: kws("szkolenia ai") }, { get });

    await expect(t.run()).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);

    const job = jobUpdate(t.calls);
    expect(job).toMatchObject({ status: "failed" });
    // faktyczny koszt odebranego plus koszt z task_post drugiego
    expect(job.cost_usd as number).toBeCloseTo(0.004 + POST_COST, 6);
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "done" });
    expect(rowOf(t.rows, "k1", "mobile")).toMatchObject({ status: "pending", dfs_task_id: taskId("k1", "mobile") });
  });

  it("inny wyjątek wysyłki też zostawia w rejestrze szacunek jako koszt nieznany", async () => {
    const post = vi.fn<typeof postFn>(async () => { throw new Error("socket hang up"); });
    const t = setup({ keywords: kws("szkolenia ai", "kurs ai") }, { post });

    await expect(t.run()).rejects.toThrow("socket hang up");

    expect(jobUpdate(t.calls)).toMatchObject({ status: "failed", error: "socket hang up", cost_usd: estimateRankCost(4) });
  });

  it("błąd zapisu id jednego opłaconego zadania nie gubi id pozostałych: wszystkie zapisy są próbowane, wiersze z id odebrane, błąd dopiero na końcu", async () => {
    let failedOnce = false;
    const t = setup({
      keywords: kws("a", "b", "c"),
      failWrite: (c) => {
        const isIdWrite = c.op === "update" && "dfs_task_id" in (c.payload as Record<string, unknown>);
        if (!isIdWrite || failedOnce) return undefined;
        failedOnce = true;
        return "zapis id nie powiódł się";
      },
    }, {
      get: vi.fn<typeof getFn>(async () => done(NEVER_RANKED, 0.005)),
    });

    await expect(t.run()).rejects.toThrow("zapis id nie powiódł się");

    // sześć zadań to dwie paczki zapisów (5 + 1): pierwszy zapis padł, ale pozostałe pięć, także z drugiej paczki, się udało
    const ids = t.rows.filter((r) => r.dfs_task_id !== null).map((r) => r.id).sort();
    expect(ids).toEqual([rowId("k1", "mobile"), rowId("k2", "desktop"), rowId("k2", "mobile"), rowId("k3", "desktop"), rowId("k3", "mobile")].sort());
    expect(rowOf(t.rows, "k1", "desktop")).toMatchObject({ status: "pending", dfs_task_id: null });
    // wiersze z zapisanym id zostały odebrane i zapisane jako done; wiersz bez id nie był odbierany
    expect(t.get.mock.calls.map((c) => c[0]).sort()).toEqual(ids.map((id) => `dfs-${id}`).sort());
    for (const id of ids) expect(t.rows.find((r) => r.id === id)).toMatchObject({ status: "done" });
    expect(t.sleep).toHaveBeenCalledTimes(1);
    // zadanie failed z kosztem wszystkiego, co wysłano: 5 odebranych po faktycznym koszcie i 1 z task_post
    const job = jobUpdate(t.calls);
    expect(job).toMatchObject({ status: "failed", error: "zapis id nie powiódł się" });
    expect(job.cost_usd as number).toBeCloseTo(5 * 0.005 + POST_COST, 6);
  });

  it("błąd zapisu wyniku zamyka zadanie jako failed i leci dalej", async () => {
    const t = setup({
      keywords: kws("szkolenia ai"),
      failWrite: (c) => (c.op === "update" && (c.payload as Record<string, unknown>).status === "done" ? "zapis nie powiódł się" : undefined),
    }, { get: getFake({ [taskId("k1", "desktop")]: done(NEVER_RANKED) }) });

    await expect(t.run()).rejects.toThrow("zapis nie powiódł się");

    expect(jobUpdate(t.calls)).toMatchObject({ status: "failed", error: "zapis nie powiódł się" });
    // koszt wysłanych zadań zostaje w rejestrze
    expect(jobUpdate(t.calls).cost_usd as number).toBeCloseTo(2 * POST_COST, 6);
  });
});
