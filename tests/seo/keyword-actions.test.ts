import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeAdmin, filterValue, type Call, type Handled } from "./fake-admin";
import { MAX_TRACKED } from "@/lib/seo/keyword-volumes";

const h = vi.hoisted(() => ({
  trigger: vi.fn(),
  revalidatePath: vi.fn(),
  getCurrentProject: vi.fn(),
  getGscLastDate: vi.fn(),
  getQueryWindows: vi.fn(),
  client: null as unknown,
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: h.trigger } }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/workspace", () => ({ getCurrentProject: h.getCurrentProject }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => h.client }));
vi.mock("@/lib/seo/queries", () => ({ getGscLastDate: h.getGscLastDate, getQueryWindows: h.getQueryWindows }));

import {
  addKeywords, toggleKeyword, deleteKeyword, setTargetPath, acceptSuggestion, dismissSuggestion,
  importFromGsc, refreshVolumes, runResearch,
} from "@/app/app/google/keywords/actions";

const PATH = "/app/google/keywords";
const KEYWORD_ID = "0b1e8f10-6c52-4d0e-9a31-2f4c1c1d7a01";
const SUGGESTION_ID = "5d3c2b1a-9e8f-4a7b-8c6d-1e2f3a4b5c6d";

let calls: Call[];
function setDb(handler: (c: Call) => Handled = () => ({ data: null })) {
  const fake = fakeAdmin(handler);
  h.client = fake.client;
  calls = fake.calls;
}
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const writes = (table: string) => calls.filter((c) => c.table === table && c.op !== "select");
/** Atrapa listy fraz projektu (`keywords.key`); reszta zapytań zwraca `rest`. */
const withTracked = (keys: string[], rest: (c: Call) => Handled = () => ({ data: null })) =>
  setDb((c) => (c.table === "keywords" && c.op === "select" ? { data: keys.map((key) => ({ key })) } : rest(c)));
const manyKeys = (n: number, prefix = "fraza") => Array.from({ length: n }, (_, i) => `${prefix} ${i}`);

beforeEach(() => {
  h.trigger.mockReset().mockResolvedValue({ id: "run_1" });
  h.revalidatePath.mockReset();
  h.getCurrentProject.mockReset().mockResolvedValue({ id: "p1" });
  h.getGscLastDate.mockReset().mockResolvedValue("2026-10-31");
  h.getQueryWindows.mockReset().mockResolvedValue([]);
  setDb();
});

describe("addKeywords", () => {
  it("trzy frazy z duplikatem: jedno zapytanie z dwoma frazami (znormalizowanymi), źródło manual, duplikaty z bazy pomijane", async () => {
    await addKeywords(form({ keywords: "Szkolenia  AI\nkurs ai dla firm\n  szkolenia ai " }));
    const [call] = writes("keywords");
    expect(writes("keywords")).toHaveLength(1);
    expect(call.op).toBe("upsert");
    expect(call.payload).toEqual([
      { project_id: "p1", text: "szkolenia ai", key: "szkolenia ai", source: "manual" },
      { project_id: "p1", text: "kurs ai dla firm", key: "kurs ai dla firm", source: "manual" },
    ]);
    expect(call.opts).toEqual({ onConflict: "project_id,key", ignoreDuplicates: true });
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("projekt bierze z sesji, nigdy z formularza", async () => {
    await addKeywords(form({ keywords: "kurs ai", project_id: "cudzy" }));
    expect((writes("keywords")[0].payload as { project_id: string }[])[0].project_id).toBe("p1");
  });

  it("pusta albo niepoprawna lista niczego nie zapisuje; plik zamiast tekstu też", async () => {
    await addKeywords(form({ keywords: "  \n , " }));
    await addKeywords(new FormData());
    const f = new FormData();
    f.set("keywords", new File(["x"], "x.txt"));
    await addKeywords(f);
    expect(calls).toHaveLength(0);
  });

  it("błąd bazy rzuca", async () => {
    setDb((c) => (c.op === "select" ? { data: [] } : { error: { message: "boom" } }));
    await expect(addKeywords(form({ keywords: "kurs ai" }))).rejects.toThrow("Nie udało się dodać fraz: boom");
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("limit śledzonych fraz: dopisuje tylko tyle, ile zostało miejsca (frazy już śledzone, także wstrzymane, liczą się do limitu)", async () => {
    withTracked(manyKeys(MAX_TRACKED - 2));
    await addKeywords(form({ keywords: "nowa 1\nnowa 2\nnowa 3\nnowa 4" }));
    const [call] = writes("keywords");
    expect((call.payload as { key: string }[]).map((r) => r.key)).toEqual(["nowa 1", "nowa 2"]);
    const read = calls.find((c) => c.table === "keywords" && c.op === "select")!;
    expect(read.cols).toBe("key");
    expect(filterValue(read, "eq", "project_id")).toBe("p1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("przy pełnym limicie niczego nie dopisuje", async () => {
    withTracked(manyKeys(MAX_TRACKED));
    await addKeywords(form({ keywords: "nowa 1" }));
    expect(writes("keywords")).toHaveLength(0);
  });

  it("fraza już śledzona nie zajmuje miejsca: z jednym wolnym miejscem wchodzi pierwsza nowa, a powtórzona jest pomijana", async () => {
    withTracked([...manyKeys(MAX_TRACKED - 2), "kurs ai"]); // 499 fraz, jedno wolne miejsce
    await addKeywords(form({ keywords: "kurs ai\nnowa 1\nnowa 2" }));
    expect((writes("keywords")[0].payload as { key: string }[]).map((r) => r.key)).toEqual(["nowa 1"]);
  });
});

describe("toggleKeyword, deleteKeyword", () => {
  it("włącza i wyłącza frazę tylko w bieżącym projekcie", async () => {
    await toggleKeyword(form({ id: KEYWORD_ID, active: "false" }));
    await toggleKeyword(form({ id: KEYWORD_ID, active: "true" }));
    const [off, on] = writes("keywords");
    expect(off.op).toBe("update");
    expect(off.payload).toEqual({ active: false });
    expect(on.payload).toEqual({ active: true });
    expect(filterValue(off, "eq", "id")).toBe(KEYWORD_ID);
    expect(filterValue(off, "eq", "project_id")).toBe("p1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("usuwa frazę tylko w bieżącym projekcie", async () => {
    await deleteKeyword(form({ id: KEYWORD_ID }));
    const [call] = writes("keywords");
    expect(call.op).toBe("delete");
    expect(filterValue(call, "eq", "id")).toBe(KEYWORD_ID);
    expect(filterValue(call, "eq", "project_id")).toBe("p1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("identyfikator, który nie jest uuid, jest ignorowany bez zapytania do bazy", async () => {
    await toggleKeyword(form({ id: "1 or 1=1", active: "true" }));
    await deleteKeyword(form({ id: "" }));
    await deleteKeyword(new FormData());
    expect(calls).toHaveLength(0);
  });
});

describe("setTargetPath", () => {
  it("zapisuje ścieżkę zaczynającą się od ukośnika (bez spacji na brzegach)", async () => {
    await setTargetPath(form({ id: KEYWORD_ID, target_path: "  /szkolenia/ai-act " }));
    const [call] = writes("keywords");
    expect(call.op).toBe("update");
    expect(call.payload).toEqual({ target_path: "/szkolenia/ai-act" });
    expect(filterValue(call, "eq", "id")).toBe(KEYWORD_ID);
    expect(filterValue(call, "eq", "project_id")).toBe("p1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("pusta ścieżka czyści docelową stronę (null)", async () => {
    await setTargetPath(form({ id: KEYWORD_ID, target_path: "   " }));
    expect(writes("keywords")[0].payload).toEqual({ target_path: null });
  });

  it("wartość bez ukośnika na początku, ze spacją w środku albo za długa nie zmienia niczego", async () => {
    await setTargetPath(form({ id: KEYWORD_ID, target_path: "szkolenia" }));
    await setTargetPath(form({ id: KEYWORD_ID, target_path: "https://polskaszkola.ai/szkolenia" }));
    await setTargetPath(form({ id: KEYWORD_ID, target_path: "/dwa słowa" }));
    await setTargetPath(form({ id: KEYWORD_ID, target_path: `/${"a".repeat(200)}` }));
    await setTargetPath(form({ id: "nie-uuid", target_path: "/ok" }));
    expect(calls).toHaveLength(0);
  });
});

describe("acceptSuggestion", () => {
  const suggestion = (source: string, over: Record<string, unknown> = {}) => ({
    id: SUGGESTION_ID, key: "szkolenia ai", text: "szkolenia ai", source, search_volume: 1900, cpc: 2.4, status: "new", ...over,
  });
  const withSuggestion = (row: unknown) => setDb((c) => (c.table === "keyword_suggestions" && c.op === "select" ? { data: row } : { data: null }));

  it("podpowiedź ranked: fraza ze źródłem ranked (z wolumenem i CPC z podpowiedzi), podpowiedź dostaje status accepted", async () => {
    withSuggestion(suggestion("ranked"));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    const read = calls.find((c) => c.table === "keyword_suggestions" && c.op === "select")!;
    expect(filterValue(read, "eq", "id")).toBe(SUGGESTION_ID);
    expect(filterValue(read, "eq", "project_id")).toBe("p1");
    const [keyword] = writes("keywords");
    expect(keyword.op).toBe("upsert");
    expect(keyword.payload).toEqual({
      project_id: "p1", key: "szkolenia ai", text: "szkolenia ai", source: "ranked", search_volume: 1900, cpc: 2.4,
    });
    expect(keyword.opts).toEqual({ onConflict: "project_id,key", ignoreDuplicates: true });
    const [status] = writes("keyword_suggestions");
    expect(status.op).toBe("update");
    expect(status.payload).toMatchObject({ status: "accepted" });
    expect(filterValue(status, "eq", "id")).toBe(SUGGESTION_ID);
    expect(filterValue(status, "eq", "project_id")).toBe("p1");
    // fraza trafia na listę przed zmianą statusu: gdyby druga operacja padła, podpowiedź nie zniknie bez frazy
    expect(calls.indexOf(keyword)).toBeLessThan(calls.indexOf(status));
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("źródła podpowiedzi przechodzą na źródła frazy: labs na suggestion, gap na gap", async () => {
    withSuggestion(suggestion("labs"));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect((writes("keywords")[0].payload as { source: string }).source).toBe("suggestion");
    withSuggestion(suggestion("gap"));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect((writes("keywords")[0].payload as { source: string }).source).toBe("gap");
  });

  it("brak wolumenu w podpowiedzi zostaje brakiem (null), nie zerem", async () => {
    withSuggestion(suggestion("labs", { search_volume: null, cpc: null }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect(writes("keywords")[0].payload).toMatchObject({ search_volume: null, cpc: null });
  });

  it("nieistniejąca podpowiedź (albo z innego projektu) niczego nie zapisuje", async () => {
    withSuggestion(null);
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    await acceptSuggestion(form({ id: "nie-uuid" }));
    expect(writes("keywords")).toHaveLength(0);
    expect(writes("keyword_suggestions")).toHaveLength(0);
  });

  it("błąd zapisu frazy przerywa przed zmianą statusu podpowiedzi", async () => {
    setDb((c) => {
      if (c.table === "keyword_suggestions" && c.op === "select") return { data: suggestion("labs") };
      if (c.op === "select") return { data: [] };
      return { error: { message: "boom" } };
    });
    await expect(acceptSuggestion(form({ id: SUGGESTION_ID }))).rejects.toThrow("boom");
    expect(writes("keyword_suggestions")).toHaveLength(0);
  });

  it("podpowiedź odrzucona albo już przyjęta (nieaktualny formularz) nie dodaje frazy: tylko status new przechodzi", async () => {
    for (const status of ["dismissed", "accepted"]) {
      for (const source of ["labs", "gap"]) {
        withSuggestion(suggestion(source, { status }));
        await acceptSuggestion(form({ id: SUGGESTION_ID }));
        expect(writes("keywords")).toHaveLength(0);
        expect(writes("keyword_suggestions")).toHaveLength(0);
      }
    }
  });

  it("własna pozycja (widok „Gdzie już jesteście”) pokazuje wiersze każdego statusu, więc „Śledź” działa dla niej też po wcześniejszym przyjęciu i usunięciu frazy", async () => {
    withSuggestion(suggestion("ranked", { status: "accepted" }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect((writes("keywords")[0].payload as { source: string }).source).toBe("ranked");
    expect(writes("keyword_suggestions")[0].payload).toMatchObject({ status: "accepted" });
  });

  it("fraza dłuższa niż 80 znaków nie jest śledzona (jak przy dodawaniu i imporcie), podpowiedź zostaje bez zmian", async () => {
    withSuggestion(suggestion("labs", { key: "x".repeat(81), text: "x".repeat(81) }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect(writes("keywords")).toHaveLength(0);
    expect(writes("keyword_suggestions")).toHaveLength(0);
    withSuggestion(suggestion("labs", { key: "x".repeat(80), text: "x".repeat(80) }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect(writes("keywords")).toHaveLength(1);
  });

  it("przy pełnym limicie nowa fraza nie jest dodawana, a podpowiedź zostaje na liście; już śledzona dostaje tylko status", async () => {
    const row = (key: string) => suggestion("labs", { key, text: key });
    const full = manyKeys(MAX_TRACKED);
    withTracked(full, (c) => (c.table === "keyword_suggestions" && c.op === "select" ? { data: row("nowa fraza") } : { data: null }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect(writes("keywords")).toHaveLength(0);
    expect(writes("keyword_suggestions")).toHaveLength(0);

    withTracked(full, (c) => (c.table === "keyword_suggestions" && c.op === "select" ? { data: row("fraza 7") } : { data: null }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect(writes("keyword_suggestions")[0].payload).toMatchObject({ status: "accepted" });
  });

  it("z ostatnim wolnym miejscem fraza jeszcze wchodzi", async () => {
    withTracked(manyKeys(MAX_TRACKED - 1), (c) => (c.table === "keyword_suggestions" && c.op === "select" ? { data: suggestion("labs") } : { data: null }));
    await acceptSuggestion(form({ id: SUGGESTION_ID }));
    expect(writes("keywords")).toHaveLength(1);
  });
});

describe("dismissSuggestion", () => {
  it("ustawia status dismissed tylko w bieżącym projekcie", async () => {
    await dismissSuggestion(form({ id: SUGGESTION_ID }));
    const [call] = writes("keyword_suggestions");
    expect(call.op).toBe("update");
    expect(call.payload).toMatchObject({ status: "dismissed" });
    expect(filterValue(call, "eq", "id")).toBe(SUGGESTION_ID);
    expect(filterValue(call, "eq", "project_id")).toBe("p1");
    expect(writes("keywords")).toHaveLength(0);
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("identyfikator, który nie jest uuid, jest ignorowany", async () => {
    await dismissSuggestion(form({ id: "x" }));
    expect(calls).toHaveLength(0);
  });
});

describe("importFromGsc", () => {
  const q = (query: string, impressions: number) => ({
    query, cur: { clicks: 0, impressions, position: 8 }, prev: { clicks: 0, impressions: 0, position: null },
  });
  const tracked = (...keys: string[]) => setDb((c) => (c.table === "keywords" && c.op === "select" ? { data: keys.map((key) => ({ key })) } : { data: null }));

  it("bez danych z Search Console nic nie robi", async () => {
    h.getGscLastDate.mockResolvedValue(null);
    await importFromGsc();
    expect(h.getQueryWindows).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("dodaje frazy z największą liczbą wyświetleń z ostatnich 28 dni, pomijając już śledzone, ze źródłem gsc", async () => {
    tracked("szkolenia ai");
    h.getQueryWindows.mockResolvedValue([
      q("kurs ai", 300), q("szkolenia ai", 900), q("Szkolenie  ChatGPT", 700), q("chatgpt w pracy", 500),
    ]);
    await importFromGsc();
    expect(h.getQueryWindows).toHaveBeenCalledWith(
      "p1", { cur: { from: "2026-10-04", to: "2026-10-31" }, prev: { from: "2026-09-06", to: "2026-10-03" } }, expect.any(Number),
    );
    const [call] = writes("keywords");
    expect(call.op).toBe("upsert");
    expect(call.payload).toEqual([
      { project_id: "p1", text: "szkolenie chatgpt", key: "szkolenie chatgpt", source: "gsc" },
      { project_id: "p1", text: "chatgpt w pracy", key: "chatgpt w pracy", source: "gsc" },
      { project_id: "p1", text: "kurs ai", key: "kurs ai", source: "gsc" },
    ]);
    expect(call.opts).toEqual({ onConflict: "project_id,key", ignoreDuplicates: true });
    const read = calls.find((c) => c.table === "keywords" && c.op === "select")!;
    expect(filterValue(read, "eq", "project_id")).toBe("p1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("bierze 50 fraz, kolejność wg wyświetleń niezależnie od kolejności z bazy, a frazy bez wyświetleń, zbyt długie i powtórzone pomija", async () => {
    tracked();
    const many = Array.from({ length: 60 }, (_, i) => q(`fraza ${i}`, 100 + i));
    h.getQueryWindows.mockResolvedValue([
      ...many.reverse(),
      q("utracona fraza", 0), q("x".repeat(81), 5000), q("   ", 5000), q("FRAZA 59", 9999),
    ]);
    await importFromGsc();
    const rows = writes("keywords")[0].payload as { key: string }[];
    expect(rows).toHaveLength(50);
    expect(rows[0].key).toBe("fraza 59");
    expect(rows[49].key).toBe("fraza 10");
    expect(rows.map((r) => r.key)).not.toContain("utracona fraza");
    expect(new Set(rows.map((r) => r.key)).size).toBe(50);
  });

  it("fraza z przecinkiem zostaje jedną frazą", async () => {
    tracked();
    h.getQueryWindows.mockResolvedValue([q("ai, chatgpt i prompty", 400)]);
    await importFromGsc();
    expect(writes("keywords")[0].payload).toEqual([
      { project_id: "p1", text: "ai, chatgpt i prompty", key: "ai, chatgpt i prompty", source: "gsc" },
    ]);
  });

  it("limit śledzonych fraz: importuje tylko tyle, ile zostało miejsca, a przy pełnym limicie nic", async () => {
    const many = Array.from({ length: 60 }, (_, i) => q(`nowa ${i}`, 1000 - i));
    h.getQueryWindows.mockResolvedValue(many);
    tracked(...manyKeys(MAX_TRACKED - 20));
    await importFromGsc();
    const rows = writes("keywords")[0].payload as { key: string }[];
    expect(rows).toHaveLength(20);
    expect(rows[0].key).toBe("nowa 0");

    calls.length = 0;
    tracked(...manyKeys(MAX_TRACKED));
    await importFromGsc();
    expect(writes("keywords")).toHaveLength(0);
  });

  it("gdy wszystkie frazy są już śledzone, nic nie zapisuje", async () => {
    tracked("kurs ai");
    h.getQueryWindows.mockResolvedValue([q("kurs ai", 300)]);
    await importFromGsc();
    expect(writes("keywords")).toHaveLength(0);
  });
});

describe("refreshVolumes", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-03T10:07:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("uruchamia zadanie keyword-volumes z kluczem idempotencji na 10 minut i odświeża stronę", async () => {
    await refreshVolumes();
    const bucket = Math.floor(Date.parse("2026-11-03T10:07:00Z") / 600_000);
    expect(h.trigger).toHaveBeenCalledTimes(1);
    expect(h.trigger).toHaveBeenCalledWith(
      "keyword-volumes", { projectId: "p1" }, { idempotencyKey: `keyword-volumes:p1:${bucket}`, idempotencyKeyTTL: "10m" },
    );
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("dwa kliknięcia w jednym 10-minutowym oknie mają ten sam klucz, w następnym oknie inny", async () => {
    await refreshVolumes();
    vi.setSystemTime(new Date("2026-11-03T10:09:30Z"));
    await refreshVolumes();
    vi.setSystemTime(new Date("2026-11-03T10:10:01Z"));
    await refreshVolumes();
    const keys = h.trigger.mock.calls.map((c) => (c[2] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("gdy Trigger jest nieosiągalny, nie rzuca: loguje błąd i odświeża stronę", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.trigger.mockRejectedValue(new Error("Trigger niedostępny"));
    await expect(refreshVolumes()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("keyword-volumes"), "Trigger niedostępny");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
    log.mockRestore();
  });

  it("bez zalogowanego użytkownika (przekierowanie) nic nie uruchamia", async () => {
    h.getCurrentProject.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(refreshVolumes()).rejects.toThrow("NEXT_REDIRECT");
    expect(h.trigger).not.toHaveBeenCalled();
  });
});

describe("runResearch", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-03T10:07:00Z")); });
  afterEach(() => vi.useRealTimers());

  const KEY = /^keyword-research:p1:[0-9a-f]{16}:\d+$/;

  it("uruchamia badanie ze znormalizowanymi hasłami i flagą konkurencji, z kluczem idempotencji na 10 minut", async () => {
    await runResearch(form({ seeds: "Szkolenia AI\n kurs  ai dla firm\nszkolenia ai", competitors: "on" }));
    expect(h.trigger).toHaveBeenCalledTimes(1);
    expect(h.trigger).toHaveBeenCalledWith(
      "keyword-research",
      { projectId: "p1", seeds: ["szkolenia ai", "kurs ai dla firm"], competitors: true },
      { idempotencyKey: expect.stringMatching(KEY), idempotencyKeyTTL: "10m" },
    );
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
  });

  it("niezaznaczone pole wyboru to competitors: false; haseł najwyżej 10", async () => {
    const seeds = Array.from({ length: 12 }, (_, i) => `hasło ${i}`).join("\n");
    await runResearch(form({ seeds }));
    const payload = h.trigger.mock.calls[0][1] as { seeds: string[]; competitors: boolean };
    expect(payload.competitors).toBe(false);
    expect(payload.seeds).toHaveLength(10);
  });

  it("identyczne badanie w tym samym oknie ma ten sam klucz, inne hasła albo inne okno dają inny", async () => {
    const key = () => (h.trigger.mock.calls.at(-1)![2] as { idempotencyKey: string }).idempotencyKey;
    await runResearch(form({ seeds: "kurs ai", competitors: "on" }));
    const first = key();
    await runResearch(form({ seeds: "Kurs AI", competitors: "on" }));
    expect(key()).toBe(first);
    await runResearch(form({ seeds: "szkolenie chatgpt", competitors: "on" }));
    expect(key()).not.toBe(first);
    await runResearch(form({ seeds: "kurs ai" }));
    expect(key()).not.toBe(first);
    vi.setSystemTime(new Date("2026-11-03T10:10:01Z"));
    await runResearch(form({ seeds: "kurs ai", competitors: "on" }));
    expect(key()).not.toBe(first);
  });

  it("gdy Trigger jest nieosiągalny, nie rzuca: loguje błąd i odświeża stronę", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.trigger.mockRejectedValue(new Error("Trigger niedostępny"));
    await expect(runResearch(form({ seeds: "kurs ai" }))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("keyword-research"), "Trigger niedostępny");
    expect(h.revalidatePath).toHaveBeenCalledWith(PATH);
    log.mockRestore();
  });

  it("bez zalogowanego użytkownika (przekierowanie) nic nie uruchamia", async () => {
    h.getCurrentProject.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(runResearch(form({ seeds: "kurs ai" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(h.trigger).not.toHaveBeenCalled();
  });
});
