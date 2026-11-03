import { describe, it, expect, vi } from "vitest";
import { runKeywordResearch, pickRivals, MAX_COMPETITORS, TOPIC_REGEX } from "@/lib/seo/keyword-research";
import { estimateResearchCost } from "@/lib/seo/costs";
import type { keywordSuggestions as suggestionsFn, rankedKeywords as rankedFn, LabsKeyword, RankedKeyword } from "@/lib/dataforseo/labs";
import { fakeAdmin, filterValue, jobUpdate, type Call } from "./fake-admin";

const PROJECT = "proj-1";
const now = () => new Date("2026-11-03T05:00:00Z");
const NOW_ISO = "2026-11-03T05:00:00.000Z";
const OWN = "polskaszkola.ai";

/** Wiersz skrzynki w atrapie bazy: to, co zostaje po zapisach (`status` domyślnie `new`, jak w tabeli). */
type Stored = Record<string, unknown> & { key: string; status: string; source: string; updated_at: string };
const LONG_AGO = "2026-10-01T00:00:00.000Z";

interface World {
  domains?: string[];
  budget?: number;
  spent?: number;
  competitors?: { name: string; domains: string[] }[];
  tracked?: string[];
  /** Wiersze skrzynki sprzed badania (klucz frazy do pól wiersza). */
  existing?: Record<string, Partial<Stored>>;
  failUpsert?: boolean;
  failDelete?: boolean;
}

const RIVALS = [
  { name: "Rywal A", domains: ["https://www.rywal-a.pl/blog"] },
  { name: "Rywal B", domains: ["rywal-b.pl", "inna.pl"] },
  { name: "Bez domeny", domains: [] },
];

/**
 * Atrapa bazy ze stanem skrzynki: `upsert` scala kolumny z ładunku z istniejącym wierszem (jak PostgREST przy
 * `merge-duplicates`: kolumn spoza ładunku, np. `status`, nie rusza), a nowy wiersz dostaje domyślny status `new`.
 * `delete` usuwa wiersze pasujące do filtrów `eq` (źródło, status) i `lt` (updated_at).
 */
function world(w: World = {}) {
  const store = new Map<string, Stored>(
    Object.entries(w.existing ?? {}).map(([key, row]) => [key, { key, status: "new", source: "labs", updated_at: LONG_AGO, ...row }]),
  );
  const fake = fakeAdmin((c: Call) => {
    const inKeys = (): string[] => (filterValue(c, "in", "key") as string[] | undefined) ?? [];
    if (c.table === "projects") return { data: { domains: w.domains ?? [OWN], seo_budget_usd: w.budget ?? 10 } };
    if (c.table === "competitors") return { data: w.competitors ?? RIVALS };
    if (c.table === "keywords" && c.op === "select") return { data: (w.tracked ?? []).filter((k) => inKeys().includes(k)).map((key) => ({ key })) };
    if (c.table === "keyword_suggestions" && c.op === "upsert") {
      if (w.failUpsert) return { error: { message: "boom upsert" } };
      for (const row of c.payload as Record<string, unknown>[]) {
        const key = row.key as string;
        store.set(key, { status: "new", ...store.get(key), ...row } as Stored);
      }
      return {};
    }
    if (c.table === "keyword_suggestions" && c.op === "delete") {
      if (w.failDelete) return { error: { message: "boom delete" } };
      const source = filterValue(c, "eq", "source");
      const status = filterValue(c, "eq", "status");
      const before = filterValue(c, "lt", "updated_at") as string | undefined;
      for (const [key, row] of [...store]) {
        if ((source === undefined || row.source === source) && (status === undefined || row.status === status) && (before === undefined || row.updated_at < before)) store.delete(key);
      }
      return {};
    }
    if (c.table === "seo_jobs" && c.op === "insert") return { data: { id: "job-1" } };
    if (c.table === "seo_jobs" && c.op === "select") return { data: [{ cost_usd: w.spent ?? 0 }] };
    if (c.table === "seo_jobs" && c.op === "update") return { data: [{ id: "job-1" }] };
    return {};
  });
  return { ...fake, store };
}

const lab = (keyword: string, searchVolume: number | null = 100, keywordDifficulty: number | null = 20, cpc: number | null = 1.5): LabsKeyword =>
  ({ keyword, searchVolume, keywordDifficulty, cpc });
const rk = (keyword: string, position: number, url: string, searchVolume: number | null = 100, keywordDifficulty: number | null = 30, cpc: number | null = 2): RankedKeyword =>
  ({ ...lab(keyword, searchVolume, keywordDifficulty, cpc), position, url });

const COMPETITOR_FILTERS = [["keyword_data.keyword", "regex", TOPIC_REGEX], "and", ["ranked_serp_element.serp_item.rank_group", "<=", 20]];

const COST = 0.0144;
function clients(o: { labs?: Record<string, LabsKeyword[]>; ranked?: Record<string, RankedKeyword[]>; cost?: number } = {}) {
  const keywordSuggestions = vi.fn<typeof suggestionsFn>(async (seed) => ({ items: o.labs?.[seed] ?? [], costUsd: o.cost ?? COST }));
  const rankedKeywords = vi.fn<typeof rankedFn>(async (target) => ({ items: o.ranked?.[target] ?? [], costUsd: o.cost ?? COST }));
  return { keywordSuggestions, rankedKeywords };
}

const run = (
  w: ReturnType<typeof world>,
  c: ReturnType<typeof clients>,
  payload: { seeds: string[]; competitors: boolean } = { seeds: ["szkolenia ai"], competitors: false },
) => runKeywordResearch({ projectId: PROJECT, ...payload }, { admin: w.client, ...c, now });

const upsertRows = (calls: Call[]) =>
  calls.filter((c) => c.table === "keyword_suggestions" && c.op === "upsert").flatMap((c) => c.payload as Record<string, unknown>[]);
const rowOf = (calls: Call[], key: string) => upsertRows(calls).find((r) => r.key === key);

describe("runKeywordResearch: ziarna i podpowiedzi", () => {
  it("ziarna to znormalizowane, bez powtórzeń, rozdzielone przecinkiem, najwyżej 10; każde dostaje 50 podpowiedzi", async () => {
    const w = world();
    const c = clients();
    await run(w, c, { seeds: ["Szkolenia AI", " szkolenia ai ", "kurs ai, ai act"], competitors: false });
    expect(c.keywordSuggestions.mock.calls).toEqual([["szkolenia ai", 50], ["kurs ai", 50], ["ai act", 50]]);

    const many = clients();
    await run(world(), many, { seeds: Array.from({ length: 12 }, (_, i) => `hasło ${i}`), competitors: false });
    expect(many.keywordSuggestions).toHaveBeenCalledTimes(10);
  });

  it("zapisuje podpowiedź z Labs: źródło labs, hasło, wolumen, trudność, cpc do 2 miejsc, updated_at, bez kolumny status", async () => {
    const w = world();
    const c = clients({ labs: { "szkolenia ai": [lab("szkolenia ai dla firm", 320, 41, 2.4000000953674316), lab("kurs bez danych", null, null, null)] } });

    const res = await run(w, c);

    expect(res).toMatchObject({ status: "done", suggestions: 2 });
    const [upsert] = w.calls.filter((x) => x.op === "upsert");
    expect(upsert.table).toBe("keyword_suggestions");
    expect(upsert.opts).toEqual({ onConflict: "project_id,key" });
    expect(rowOf(w.calls, "szkolenia ai dla firm")).toEqual({
      project_id: PROJECT, key: "szkolenia ai dla firm", text: "szkolenia ai dla firm", seed: "szkolenia ai", source: "labs",
      search_volume: 320, keyword_difficulty: 41, cpc: 2.4, own_position: null, own_url: null, competitor_positions: [],
      updated_at: NOW_ISO,
    });
    expect(rowOf(w.calls, "kurs bez danych")).toMatchObject({ search_volume: null, keyword_difficulty: null, cpc: null });
  });

  it("nie podpowiada fraz już śledzonych (także nieaktywnych), a pytanie o nie idzie paczkami po 100 kluczy", async () => {
    const labs = Array.from({ length: 250 }, (_, i) => lab(`fraza ${i}`));
    const w = world({ tracked: ["fraza 3", "fraza 200"] });
    const c = clients({ labs: { "szkolenia ai": labs } });

    const res = await run(w, c);

    expect(res.suggestions).toBe(248);
    expect(rowOf(w.calls, "fraza 3")).toBeUndefined();
    expect(rowOf(w.calls, "fraza 200")).toBeUndefined();
    const reads = w.calls.filter((x) => x.table === "keywords" && x.op === "select");
    expect(reads.map((r) => (filterValue(r, "in", "key") as string[]).length)).toEqual([100, 100, 50]);
    expect(reads.every((r) => filterValue(r, "eq", "project_id") === PROJECT && r.cols === "key")).toBe(true);
    expect(jobUpdate(w.calls)).toMatchObject({ stats: { labs: 250, skippedTracked: 2, written: 248 } });
  });

  it("zapis nie niesie kolumny status: odrzucona i zaakceptowana wcześniej podpowiedź zachowuje status, nowa dostaje new", async () => {
    const w = world({ existing: { "kurs ai": { status: "dismissed" }, "ai act": { status: "accepted" }, "stary wpis": { status: "dismissed" } } });
    const c = clients({ labs: { "szkolenia ai": [lab("kurs ai"), lab("ai act"), lab("chatgpt w pracy")] } });

    await run(w, c);

    // zapis bez `status` nie ma jak nadpisać decyzji użytkownika, także tej podjętej w trakcie badania
    for (const row of upsertRows(w.calls)) expect(row).not.toHaveProperty("status");
    expect(w.store.get("kurs ai")?.status).toBe("dismissed");
    expect(w.store.get("ai act")?.status).toBe("accepted");
    expect(w.store.get("chatgpt w pracy")?.status).toBe("new");
    expect(w.store.get("stary wpis")?.status).toBe("dismissed");
    // odświeża dane, nie tylko dodaje: wolumen z badania trafia do istniejącego wiersza
    expect(w.store.get("kurs ai")).toMatchObject({ search_volume: 100, seed: "szkolenia ai", updated_at: NOW_ISO });
    // statusów nie trzeba czytać przed zapisem
    expect(w.calls.some((x) => x.table === "keyword_suggestions" && x.op === "select")).toBe(false);
  });

  it("ta sama fraza z dwóch haseł: zostaje pierwsze hasło", async () => {
    const w = world();
    const c = clients({ labs: { "szkolenia ai": [lab("kurs ai", 100)], "kurs ai online": [lab("kurs ai", 999)] } });
    await run(w, c, { seeds: ["szkolenia ai", "kurs ai online"], competitors: false });
    expect(upsertRows(w.calls).filter((r) => r.key === "kurs ai")).toEqual([expect.objectContaining({ seed: "szkolenia ai", search_volume: 100 })]);
  });

  it("1200 podpowiedzi idzie do bazy paczkami po 500 (500, 500, 200)", async () => {
    const w = world();
    const c = clients({ labs: { "szkolenia ai": Array.from({ length: 1200 }, (_, i) => lab(`fraza ${i}`)) } });
    await run(w, c);
    expect(w.calls.filter((x) => x.op === "upsert").map((x) => (x.payload as unknown[]).length)).toEqual([500, 500, 200]);
  });
});

describe("runKeywordResearch: widoczność własnej domeny i luki", () => {
  const ranked = {
    [OWN]: [rk("szkolenia ai", 52, "https://www.polskaszkola.ai/", 1900, 8, 2.4000000953674316), rk("kurs promptów", 4, "https://www.polskaszkola.ai/kurs")],
    "rywal-a.pl": [
      rk("szkolenia ai", 7, "https://rywal-a.pl/ai"),
      rk("ai w firmie", 3, "https://rywal-a.pl/firma", 500, 35, 3.1),
      rk("chatgpt kurs", 25, "https://rywal-a.pl/chatgpt"),
      rk("kurs promptów", 9, "https://rywal-a.pl/prompty"),
      rk("kurs python", 11, "https://rywal-a.pl/python"),
    ],
    "rywal-b.pl": [
      rk("ai w firmie", 5, "https://rywal-b.pl/ai-firma", null, null, null),
      rk("kurs python", 2, "https://rywal-b.pl/python"),
      rk("chatgpt kurs", 18, "https://rywal-b.pl/chatgpt"),
    ],
  };

  it("własne frazy w rankingu to źródło ranked z pozycją i adresem", async () => {
    const w = world();
    await run(w, clients({ ranked }));
    expect(rowOf(w.calls, "szkolenia ai")).toEqual({
      project_id: PROJECT, key: "szkolenia ai", text: "szkolenia ai", seed: null, source: "ranked",
      search_volume: 1900, keyword_difficulty: 8, cpc: 2.4, own_position: 52, own_url: "https://www.polskaszkola.ai/",
      competitor_positions: [], updated_at: NOW_ISO,
    });
    expect(rowOf(w.calls, "kurs promptów")).toMatchObject({ source: "ranked", own_position: 4 });
  });

  it("bez konkurentów pyta tylko o własną domenę (bez protokołu i www), nie czyta tabeli konkurentów, a szacunek liczy 1 domenę", async () => {
    const w = world({ domains: ["https://www.polskaszkola.ai/", "inna.pl"] });
    const c = clients({ ranked });
    await run(w, c, { seeds: ["a", "b"], competitors: false });

    expect(c.rankedKeywords.mock.calls).toEqual([[OWN, 100]]);
    expect(w.calls.some((x) => x.table === "competitors")).toBe(false);
    expect(jobUpdate(w.calls)).toMatchObject({ stats: { seeds: 2, domains: 1, estimateUsd: estimateResearchCost({ seeds: 2, domains: 1 }) } });
    expect(upsertRows(w.calls).some((r) => r.source === "gap")).toBe(false);
  });

  it("z konkurentami: pierwsza domena każdego, w formie bez protokołu, www i ścieżki; konkurent bez domeny pominięty", async () => {
    const w = world();
    const c = clients({ ranked });
    await run(w, c, { seeds: ["szkolenia ai"], competitors: true });

    // własna domena bez filtrów, konkurenci z filtrem tematu i pozycji po stronie serwera
    expect(c.rankedKeywords.mock.calls).toEqual([
      [OWN, 100],
      ["rywal-a.pl", 100, { filters: COMPETITOR_FILTERS }],
      ["rywal-b.pl", 100, { filters: COMPETITOR_FILTERS }],
    ]);
    expect(c.rankedKeywords.mock.calls[0]).toHaveLength(2);
    const read = w.calls.find((x) => x.table === "competitors")!;
    expect(read.cols).toBe("name, domains");
    expect(filterValue(read, "eq", "project_id")).toBe(PROJECT);
    expect(jobUpdate(w.calls)).toMatchObject({ stats: { domains: 3, estimateUsd: estimateResearchCost({ seeds: 1, domains: 3 }) } });
  });

  it("luka tylko dla fraz, na które własna domena nie rankuje, i tylko dla pozycji konkurenta do 20", async () => {
    const w = world();
    await run(w, clients({ ranked }), { seeds: ["szkolenia ai"], competitors: true });

    const gaps = upsertRows(w.calls).filter((r) => r.source === "gap").map((r) => r.key).sort();
    // "szkolenia ai" i "kurs promptów" rankują u nas; "chatgpt kurs" ma pozycję 25 u A, ale 18 u B
    expect(gaps).toEqual(["ai w firmie", "chatgpt kurs", "kurs python"]);
    // pozycja konkurenta na frazę, na którą my rankujemy, nie trafia do naszego wiersza
    expect(rowOf(w.calls, "szkolenia ai")).toMatchObject({ source: "ranked", competitor_positions: [] });
    expect(rowOf(w.calls, "kurs promptów")).toMatchObject({ source: "ranked", competitor_positions: [] });
  });

  it("pozycje konkurentów scalone po frazie, posortowane po pozycji, z nazwą, domeną i adresem; pozycje powyżej 20 odpadają", async () => {
    const w = world();
    await run(w, clients({ ranked }), { seeds: ["szkolenia ai"], competitors: true });

    expect(rowOf(w.calls, "ai w firmie")).toMatchObject({
      source: "gap", own_position: null, own_url: null, seed: null,
      competitor_positions: [
        { name: "Rywal A", domain: "rywal-a.pl", position: 3, url: "https://rywal-a.pl/firma" },
        { name: "Rywal B", domain: "rywal-b.pl", position: 5, url: "https://rywal-b.pl/ai-firma" },
      ],
    });
    expect(rowOf(w.calls, "kurs python")).toMatchObject({
      competitor_positions: [
        { name: "Rywal B", domain: "rywal-b.pl", position: 2, url: "https://rywal-b.pl/python" },
        { name: "Rywal A", domain: "rywal-a.pl", position: 11, url: "https://rywal-a.pl/python" },
      ],
    });
    // pozycja 25 u A odpada, zostaje 18 u B
    expect(rowOf(w.calls, "chatgpt kurs")).toMatchObject({
      competitor_positions: [{ name: "Rywal B", domain: "rywal-b.pl", position: 18, url: "https://rywal-b.pl/chatgpt" }],
    });
  });

  it("wolumen, trudność i cpc luki to pierwsze niepuste wartości od konkurentów", async () => {
    const w = world();
    await run(w, clients({ ranked }), { seeds: ["szkolenia ai"], competitors: true });
    // A (500, 35, 3.1) ma dane, B (null) nie
    expect(rowOf(w.calls, "ai w firmie")).toMatchObject({ search_volume: 500, keyword_difficulty: 35, cpc: 3.1 });
  });

  it("najwyżej 7 konkurentów: osiem domen w szacunku i w wywołaniach", async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `K${i}`, domains: [`k${i}.pl`] }));
    const w = world({ competitors: nine });
    const c = clients();
    await run(w, c, { seeds: ["szkolenia ai"], competitors: true });

    expect(c.rankedKeywords.mock.calls.map(([t]) => t)).toEqual([OWN, "k0.pl", "k1.pl", "k2.pl", "k3.pl", "k4.pl", "k5.pl", "k6.pl"]);
    expect(jobUpdate(w.calls)).toMatchObject({ stats: { domains: 8, estimateUsd: estimateResearchCost({ seeds: 1, domains: 8 }) } });
  });

  it("projekt bez domeny: konkurenci pomijani (bez własnej domeny nie ma jak wskazać luk), zostają podpowiedzi z haseł", async () => {
    const w = world({ domains: [] });
    const c = clients({ labs: { "szkolenia ai": [lab("kurs ai")] } });
    const res = await run(w, c, { seeds: ["szkolenia ai"], competitors: true });

    expect(c.rankedKeywords).not.toHaveBeenCalled();
    expect(w.calls.some((x) => x.table === "competitors")).toBe(false);
    expect(res).toMatchObject({ status: "done", suggestions: 1 });
  });
});

describe("runKeywordResearch: frazy rankujące, które już śledzimy", () => {
  const ranked = {
    [OWN]: [rk("szkolenia ai", 52, "https://www.polskaszkola.ai/", 1900), rk("kurs promptów", 4, "https://www.polskaszkola.ai/kurs")],
    "rywal-a.pl": [rk("ai w firmie", 3, "https://rywal-a.pl/firma"), rk("kurs promptów", 9, "https://rywal-a.pl/prompty")],
  };

  it("własna fraza w rankingu jest zapisywana jako ranked także wtedy, gdy jest śledzona, i zachowuje status; podpowiedzi z Labs i luki dla śledzonych odpadają", async () => {
    const w = world({
      tracked: ["szkolenia ai", "kurs labs", "ai w firmie"],
      existing: { "szkolenia ai": { status: "accepted", source: "ranked" } },
    });
    const c = clients({ labs: { "szkolenia ai": [lab("kurs labs"), lab("szkolenia ai")] }, ranked });

    const res = await run(w, c, { seeds: ["szkolenia ai"], competitors: true });

    expect(w.store.get("szkolenia ai")).toMatchObject({ source: "ranked", own_position: 52, search_volume: 1900, status: "accepted" });
    expect(w.store.get("kurs promptów")).toMatchObject({ source: "ranked", own_position: 4, status: "new" });
    expect(w.store.has("kurs labs")).toBe(false);
    expect(w.store.has("ai w firmie")).toBe(false);
    expect(res.suggestions).toBe(2);
    expect(jobUpdate(w.calls)).toMatchObject({ stats: { ranked: 2, skippedTracked: 2, written: 2 } });
  });

  it("śledzona fraza, na którą nie rankujemy, nadal nie wraca do skrzynki (ani z Labs, ani jako luka)", async () => {
    const w = world({ tracked: ["kurs labs", "ai w firmie"] });
    const c = clients({ labs: { "szkolenia ai": [lab("kurs labs")] }, ranked: { "rywal-a.pl": [rk("ai w firmie", 3, "https://rywal-a.pl/firma")] } });
    const res = await run(w, c, { seeds: ["szkolenia ai"], competitors: true });
    expect(res.suggestions).toBe(0);
    expect(w.calls.some((x) => x.op === "upsert")).toBe(false);
  });
});

describe("runKeywordResearch: wiersze nieodświeżone w tym badaniu", () => {
  const old = (source: string, status = "new") => ({ source, status, updated_at: LONG_AGO });
  const existing = {
    "stary ranked": old("ranked"),
    "przyjęty ranked": old("ranked", "accepted"),
    "stara luka": old("gap"),
    "odrzucona luka": old("gap", "dismissed"),
    "stara podpowiedź": old("labs"),
  };
  const mine = { ranked: { [OWN]: [rk("kurs ai", 6, "https://www.polskaszkola.ai/")] } };
  const deleteCall = (w: ReturnType<typeof world>) => w.calls.filter((x) => x.table === "keyword_suggestions" && x.op === "delete");

  it("po sprawdzeniu własnej domeny znikają stare nowe wiersze ranked; ranked z decyzją użytkownika, luki i podpowiedzi z Labs zostają", async () => {
    const w = world({ existing });
    await run(w, clients(mine), { seeds: ["szkolenia ai"], competitors: false });

    expect([...w.store.keys()].sort()).toEqual(["kurs ai", "odrzucona luka", "przyjęty ranked", "stara luka", "stara podpowiedź"]);
    const [del] = deleteCall(w);
    expect(deleteCall(w)).toHaveLength(1);
    expect(filterValue(del, "eq", "project_id")).toBe(PROJECT);
    expect(filterValue(del, "eq", "source")).toBe("ranked");
    expect(filterValue(del, "eq", "status")).toBe("new");
    expect(filterValue(del, "lt", "updated_at")).toBe(NOW_ISO);
  });

  it("po sprawdzeniu konkurencji znikają też stare nowe luki; odrzucona luka zostaje", async () => {
    const w = world({ existing });
    await run(w, clients(mine), { seeds: ["szkolenia ai"], competitors: true });

    expect([...w.store.keys()].sort()).toEqual(["kurs ai", "odrzucona luka", "przyjęty ranked", "stara podpowiedź"]);
    const sources = deleteCall(w).map((x) => filterValue(x, "eq", "source")).sort();
    expect(sources).toEqual(["gap", "ranked"]);
    for (const del of deleteCall(w)) {
      expect(filterValue(del, "eq", "project_id")).toBe(PROJECT);
      expect(filterValue(del, "eq", "status")).toBe("new");
      expect(filterValue(del, "lt", "updated_at")).toBe(NOW_ISO);
    }
  });

  it("konkurenci zaznaczeni, ale bez żadnej sprawdzonej domeny: luki zostają, ranked jest czyszczone", async () => {
    const w = world({ existing, competitors: [{ name: "Bez domeny", domains: [] }] });
    await run(w, clients(mine), { seeds: ["szkolenia ai"], competitors: true });
    expect(w.store.has("stara luka")).toBe(true);
    expect(w.store.has("stary ranked")).toBe(false);
  });

  it("bez własnej domeny nic nie jest usuwane: nie sprawdzano ani widoczności, ani luk", async () => {
    const w = world({ existing, domains: [] });
    await run(w, clients({ labs: { "szkolenia ai": [lab("kurs ai")] } }), { seeds: ["szkolenia ai"], competitors: true });
    expect(deleteCall(w)).toHaveLength(0);
    expect(w.store.has("stary ranked")).toBe(true);
    expect(w.store.has("stara luka")).toBe(true);
  });

  it("czyści po zapisie, a granicą jest początek badania: wiersze zapisane w trakcie zostają", async () => {
    const w = world({ existing });
    let t = Date.parse("2026-11-03T05:00:00Z");
    const clock = () => new Date((t += 1000));
    await runKeywordResearch(
      { projectId: PROJECT, seeds: ["szkolenia ai"], competitors: false },
      { admin: w.client, ...clients(mine), now: clock },
    );

    const order = w.calls.map((x) => `${x.table}:${x.op}`);
    expect(order.indexOf("keyword_suggestions:upsert")).toBeLessThan(order.indexOf("keyword_suggestions:delete"));
    const boundary = filterValue(deleteCall(w)[0], "lt", "updated_at") as string;
    const written = w.store.get("kurs ai")!;
    expect(boundary < written.updated_at).toBe(true);
    expect(w.store.has("stary ranked")).toBe(false);
  });

  it("błąd zapisu nic nie kasuje: stare wiersze zostają, zadanie kończy się failed", async () => {
    const w = world({ existing, failUpsert: true });
    await expect(run(w, clients(mine), { seeds: ["szkolenia ai"], competitors: true })).rejects.toThrow("boom upsert");
    expect(deleteCall(w)).toHaveLength(0);
    expect(w.store.has("stary ranked")).toBe(true);
    expect(jobUpdate(w.calls)).toMatchObject({ status: "failed", error: "boom upsert" });
  });

  it("błąd usuwania kończy zadanie jako failed z poniesionym kosztem", async () => {
    const w = world({ existing, failDelete: true });
    await expect(run(w, clients(mine), { seeds: ["szkolenia ai"], competitors: false })).rejects.toThrow("boom delete");
    const job = jobUpdate(w.calls);
    expect(job).toMatchObject({ status: "failed", error: "boom delete" });
    expect(job.cost_usd as number).toBeCloseTo(2 * COST, 6);
  });
});

describe("pickRivals", () => {
  const rival = (name: string, ...domains: string[]) => ({ name, domains });

  it("pierwsza domena każdego konkurenta, bez protokołu, www i ścieżki; pomija puste, własną i powtórzone, zachowuje kolejność", () => {
    const picked = pickRivals([
      rival("Rywal A", "https://www.rywal-a.pl/blog", "inna.pl"),
      rival("Bez domeny"),
      rival("Pusta", "  "),
      rival("My sami", "https://www.PolskaSzkola.ai/"),
      rival("Rywal A bis", "rywal-a.pl"),
      rival("Rywal D", "d.pl"),
    ], OWN);
    expect(picked).toEqual([{ name: "Rywal A", domain: "rywal-a.pl" }, { name: "Rywal D", domain: "d.pl" }]);
  });

  it("najwyżej MAX_COMPETITORS; powtórzona domena nie zajmuje miejsca", () => {
    const many = Array.from({ length: MAX_COMPETITORS + 3 }, (_, i) => rival(`K${i}`, `k${i}.pl`));
    expect(pickRivals(many, OWN)).toHaveLength(MAX_COMPETITORS);
    const withRepeat = [rival("K0", "k0.pl"), rival("K0 bis", "www.k0.pl"), ...many.slice(1)];
    expect(pickRivals(withRepeat, OWN).map((r) => r.domain)).toEqual(many.slice(0, MAX_COMPETITORS).map((r) => r.domains[0]));
  });

  it("badanie płaci za domenę raz: dwóch konkurentów z tą samą domeną to jedno wywołanie i jedna domena w szacunku", async () => {
    const w = world({ competitors: [rival("Rywal A", "rywal-a.pl"), rival("Rywal A bis", "https://www.rywal-a.pl/oferta"), rival("Rywal B", "rywal-b.pl")] });
    const c = clients();
    await run(w, c, { seeds: ["szkolenia ai"], competitors: true });
    expect(c.rankedKeywords.mock.calls.map(([t]) => t)).toEqual([OWN, "rywal-a.pl", "rywal-b.pl"]);
    expect(jobUpdate(w.calls)).toMatchObject({ stats: { domains: 3, estimateUsd: estimateResearchCost({ seeds: 1, domains: 3 }) } });
  });
});

describe("TOPIC_REGEX", () => {
  const topic = new RegExp(TOPIC_REGEX);

  it.each(["szkolenia ai", "kurs chatgpt", "sztuczna inteligencja w firmie", "ai act", "prompty dla marketingu", "copilot w excelu", "kurs sztucznej inteligencji"])(
    "pasuje do frazy o AI: %s", (phrase) => expect(topic.test(phrase)).toBe(true),
  );

  it.each([
    "choinka sztuczna 100 cm", "maile", "kraina", "minimalne wynagrodzenie 2026", "kfs", "upadłość konsumencka", "instaling",
    "drzewko bonsai", "aikido dla dzieci", "sztuczne kwiaty a inteligencja emocjonalna",
  ])(
    "nie pasuje do frazy spoza tematu: %s", (phrase) => expect(topic.test(phrase)).toBe(false),
  );

  it("używa tylko konstrukcji wspólnych dla silników regex: alternacji, grup, klas znaków i kotwic (bez \\b i klas skrótowych)", () => {
    expect(TOPIC_REGEX).not.toMatch(/\\[a-zA-Z]|\(\?|\{/);
  });
});

describe("runKeywordResearch: kolizje źródeł", () => {
  it("ranked wygrywa z labs: zostaje pozycja i adres, hasło też", async () => {
    const w = world();
    const c = clients({
      labs: { "szkolenia ai": [lab("kurs promptów", 111, 22, 1.1)] },
      ranked: { [OWN]: [rk("kurs promptów", 4, "https://www.polskaszkola.ai/kurs", 222, 33, 2.2)] },
    });
    await run(w, c);
    expect(upsertRows(w.calls).filter((r) => r.key === "kurs promptów")).toEqual([expect.objectContaining({
      source: "ranked", seed: "szkolenia ai", own_position: 4, own_url: "https://www.polskaszkola.ai/kurs",
      search_volume: 222, keyword_difficulty: 33, cpc: 2.2,
    })]);
  });

  it("gap wygrywa z labs: zostają pozycje konkurentów i hasło", async () => {
    const w = world();
    const c = clients({
      labs: { "szkolenia ai": [lab("ai w firmie", 111, 22, 1.1)] },
      ranked: { "rywal-a.pl": [rk("ai w firmie", 3, "https://rywal-a.pl/firma", 500, 35, 3.1)] },
    });
    await run(w, c, { seeds: ["szkolenia ai"], competitors: true });
    expect(upsertRows(w.calls).filter((r) => r.key === "ai w firmie")).toEqual([expect.objectContaining({
      source: "gap", seed: "szkolenia ai", own_position: null,
      competitor_positions: [{ name: "Rywal A", domain: "rywal-a.pl", position: 3, url: "https://rywal-a.pl/firma" }],
      search_volume: 500,
    })]);
  });

  it("brak danych w zwycięskim źródle uzupełnia źródło słabsze", async () => {
    const w = world();
    const c = clients({
      labs: { "szkolenia ai": [lab("kurs promptów", 111, 22, 1.1)] },
      ranked: { [OWN]: [rk("kurs promptów", 4, "https://www.polskaszkola.ai/kurs", null, null, null)] },
    });
    await run(w, c);
    expect(rowOf(w.calls, "kurs promptów")).toMatchObject({ source: "ranked", search_volume: 111, keyword_difficulty: 22, cpc: 1.1 });
  });

  it("własna fraza z dwiema pozycjami: zostaje lepsza", async () => {
    const w = world();
    const c = clients({ ranked: { [OWN]: [rk("kurs ai", 9, "https://www.polskaszkola.ai/a"), rk("kurs ai", 6, "https://www.polskaszkola.ai/b")] } });
    await run(w, c);
    expect(rowOf(w.calls, "kurs ai")).toMatchObject({ own_position: 6, own_url: "https://www.polskaszkola.ai/b" });
  });
});

describe("runKeywordResearch: budżet, koszt, błędy", () => {
  it("limit SEO: brak wywołań API i zapisu, zadanie budget_exceeded z kwotami", async () => {
    const w = world({ budget: 10, spent: 9.95 });
    const c = clients();
    const res = await run(w, c, { seeds: ["szkolenia ai", "kurs ai"], competitors: true });

    expect(res).toEqual({ status: "budget_exceeded", suggestions: 0, costUsd: 0 });
    expect(c.keywordSuggestions).not.toHaveBeenCalled();
    expect(c.rankedKeywords).not.toHaveBeenCalled();
    expect(w.calls.some((x) => x.op === "upsert")).toBe(false);
    const estimate = estimateResearchCost({ seeds: 2, domains: 3 });
    expect(jobUpdate(w.calls)).toMatchObject({
      status: "budget_exceeded",
      error: expect.stringMatching(/^Limit SEO: wydano 9,95 USD z 10,00 USD, to zadanie kosztuje ok\. \d+,\d{2} USD$/),
      stats: { estimateUsd: estimate },
    });
  });

  it("ten sam budżet przepuszcza badanie bez konkurentów, które kosztuje mniej", async () => {
    const spent = 10 - estimateResearchCost({ seeds: 1, domains: 1 }) - 0.001;
    const w = world({ budget: 10, spent });
    const c = clients();
    expect((await run(w, c, { seeds: ["szkolenia ai"], competitors: false })).status).toBe("done");
    const w2 = world({ budget: 10, spent });
    expect((await run(w2, clients(), { seeds: ["szkolenia ai"], competitors: true })).status).toBe("budget_exceeded");
  });

  it("zadanie dostaje faktyczny koszt: sumę kosztów wszystkich wywołań", async () => {
    const w = world();
    const c = clients({ cost: 0.0144 });
    const res = await run(w, c, { seeds: ["szkolenia ai", "kurs ai"], competitors: true });
    expect(res.costUsd).toBeCloseTo(5 * 0.0144, 6);
    expect(jobUpdate(w.calls).cost_usd as number).toBeCloseTo(5 * 0.0144, 6);
    expect(jobUpdate(w.calls)).toMatchObject({ status: "done", error: null });
  });

  it("założenie zadania: kind keyword_research, status running", async () => {
    const w = world();
    await run(w, clients());
    expect(w.calls.find((x) => x.table === "seo_jobs" && x.op === "insert")?.payload)
      .toEqual({ project_id: PROJECT, kind: "keyword_research", status: "running" });
  });

  it("bez haseł i bez domeny nic nie robi: skipped", async () => {
    const w = world({ domains: [] });
    const c = clients();
    const res = await run(w, c, { seeds: [" ", ","], competitors: true });
    expect(res).toEqual({ status: "skipped", suggestions: 0, costUsd: 0 });
    expect(jobUpdate(w.calls)).toMatchObject({ status: "skipped", error: "Brak haseł i domeny projektu do sprawdzenia" });
    expect(c.keywordSuggestions).not.toHaveBeenCalled();
  });

  it("bez haseł, ale z własną domeną sprawdza samą widoczność", async () => {
    const w = world();
    const c = clients({ ranked: { [OWN]: [rk("kurs ai", 6, "https://www.polskaszkola.ai/")] } });
    const res = await run(w, c, { seeds: [], competitors: false });
    expect(c.keywordSuggestions).not.toHaveBeenCalled();
    expect(res).toMatchObject({ status: "done", suggestions: 1 });
  });

  it("wyjątek w trakcie: failed z kosztem dotychczasowym, nic nie zapisano, wyjątek leci dalej", async () => {
    const w = world();
    const c = clients({ labs: { "szkolenia ai": [lab("kurs ai")] } });
    c.rankedKeywords.mockResolvedValueOnce({ items: [], costUsd: COST }).mockRejectedValueOnce(new Error("Labs 50000: błąd"));

    await expect(run(w, c, { seeds: ["szkolenia ai"], competitors: true })).rejects.toThrow("Labs 50000");

    const job = jobUpdate(w.calls);
    expect(job).toMatchObject({ status: "failed", error: "Labs 50000: błąd" });
    expect(job.cost_usd as number).toBeCloseTo(2 * COST, 6);
    expect(w.calls.some((x) => x.op === "upsert")).toBe(false);
  });

  it("błąd zapisu podpowiedzi kończy zadanie jako failed z poniesionym kosztem", async () => {
    const w = world({ failUpsert: true });
    const c = clients({ labs: { "szkolenia ai": [lab("kurs ai")] } });
    await expect(run(w, c)).rejects.toThrow("boom upsert");
    const job = jobUpdate(w.calls);
    expect(job).toMatchObject({ status: "failed", error: "boom upsert" });
    expect(job.cost_usd as number).toBeCloseTo(2 * COST, 6);
  });

  it("błąd odczytu projektu rzuca bez zakładania zadania", async () => {
    const { client, calls } = fakeAdmin((c) => (c.table === "projects" ? { error: { message: "no rows" } } : {}));
    await expect(runKeywordResearch({ projectId: PROJECT, seeds: ["a"], competitors: false }, { admin: client, ...clients(), now })).rejects.toThrow("no rows");
    expect(calls.some((c) => c.table === "seo_jobs")).toBe(false);
  });
});
