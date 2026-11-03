import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DFS_BASE, PAYMENT_REQUIRED_MESSAGE } from "@/lib/dataforseo/client";
import { postSerpTasks, getSerpTask, type SerpTaskInput } from "@/lib/dataforseo/serp";
import postFixture from "../fixtures/dataforseo/serp-task-post.json";
import pendingFixture from "../fixtures/dataforseo/serp-task-get-pending.json";
import kursFixture from "../fixtures/dataforseo/serp-kurs-ai-z-certyfikatem-desktop.json";
import mobileFixture from "../fixtures/dataforseo/serp-szkolenia-ai-mobile.json";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const respondWith = (body: unknown) => vi.fn().mockImplementation(async () => json(body));

const envelope = (tasks: unknown[], cost = 0) => ({ status_code: 20000, status_message: "Ok.", cost, tasks });
const createdTask = (tag: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${tag}`, status_code: 20100, status_message: "Task Created.", cost: 0.0066, result: null, data: { tag }, ...extra,
});
/** Odpowiedź task_post zbudowana z ciała zapytania: każde zadanie powstaje z tym samym tagiem. */
const echoPost = () =>
  vi.fn().mockImplementation(async (_url: string, init: { body: string }) =>
    json(envelope((JSON.parse(init.body) as { tag: string }[]).map((t) => createdTask(t.tag)))),
  );

const inputs = (n: number, device: SerpTaskInput["device"] = "desktop"): SerpTaskInput[] =>
  Array.from({ length: n }, (_, i) => ({ tag: `row-${i}`, keyword: `fraza ${i}`, device }));
/** Wejście zgodne z prawdziwą odpowiedzią task_post: te same tagi, które DataForSEO zwróciło w `data.tag`. */
const fixtureInputs = (): SerpTaskInput[] =>
  postFixture.tasks.map((t) => ({ tag: t.data.tag, keyword: t.data.keyword, device: t.data.device as SerpTaskInput["device"] }));

const taskGet = (code: number, message: string, extra: Record<string, unknown> = {}) =>
  envelope([{ id: "t1", status_code: code, status_message: message, cost: 0, result: null, ...extra }]);

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = "l";
  process.env.DATAFORSEO_PASSWORD = "p";
  delete process.env.DATAFORSEO_LOCATION_CODE;
});
afterEach(() => vi.unstubAllGlobals());

describe("postSerpTasks", () => {
  it("wysyła zadania do kolejki standard: głębokość 100, AI Overview, tag, bez stop_crawl_on_match", async () => {
    const fetchMock = echoPost();
    vi.stubGlobal("fetch", fetchMock);
    await postSerpTasks([
      { tag: "row-1", keyword: "szkolenia ai", device: "desktop" },
      { tag: "row-2", keyword: "szkolenia ai", device: "mobile" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DFS_BASE}/serp/google/organic/task_post`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      keyword: "szkolenia ai", location_code: 2616, language_code: "pl", depth: 100,
      load_async_ai_overview: true, device: "desktop", tag: "row-1",
    });
    expect(body[1]).toMatchObject({ device: "mobile", tag: "row-2" });
    for (const task of body) {
      expect(task).not.toHaveProperty("stop_crawl_on_match");
      expect(task).not.toHaveProperty("priority");
    }
  });

  it("kod lokalizacji bierze ze zmiennej środowiskowej", async () => {
    process.env.DATAFORSEO_LOCATION_CODE = "2840";
    const fetchMock = echoPost();
    vi.stubGlobal("fetch", fetchMock);
    await postSerpTasks(inputs(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0].location_code).toBe(2840);
  });

  it("150 zadań idzie w dwóch paczkach: 100 i 50", async () => {
    const fetchMock = echoPost();
    vi.stubGlobal("fetch", fetchMock);
    const { posted, failed } = await postSerpTasks(inputs(150));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toHaveLength(50);
    expect(failed).toEqual([]);
    expect(posted).toHaveLength(150);
    expect(posted[0]).toEqual({ tag: "row-0", id: "id-row-0", costUsd: 0.0066 });
    expect(posted[149].tag).toBe("row-149");
  });

  it("dokładnie 100 zadań to jedna paczka", async () => {
    const fetchMock = echoPost();
    vi.stubGlobal("fetch", fetchMock);
    await postSerpTasks(inputs(100));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bez zadań nie wywołuje API", async () => {
    const fetchMock = echoPost();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postSerpTasks([])).resolves.toEqual({ posted: [], failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prawdziwa odpowiedź task_post: 4 zadania z kosztem 0,0066 i tagami z odpowiedzi", async () => {
    vi.stubGlobal("fetch", respondWith(postFixture));
    const { posted, failed } = await postSerpTasks(fixtureInputs());
    expect(failed).toEqual([]);
    expect(posted).toEqual([
      { tag: "brand-desktop", id: "11031320-2787-0066-0000-77a0b26226a0", costUsd: 0.0066 },
      { tag: "szkolenia-desktop", id: "11031320-2787-0066-0000-859615c49f91", costUsd: 0.0066 },
      { tag: "szkolenia-mobile", id: "11031320-2787-0066-0000-69b3669a60bd", costUsd: 0.0066 },
      { tag: "absent-desktop", id: "11031320-2787-0066-0000-97aec1c82415", costUsd: 0.0066 },
    ]);
  });

  it("zadanie z kodem 40501 trafia do failed, reszta jest posted", async () => {
    const body = structuredClone(postFixture);
    Object.assign(body.tasks[1], { id: "bad", status_code: 40501, status_message: "Invalid Field: 'keyword'.", cost: 0 });
    vi.stubGlobal("fetch", respondWith(body));
    const { posted, failed } = await postSerpTasks(fixtureInputs());
    expect(failed).toEqual([{ tag: "szkolenia-desktop", error: "DataForSEO task 40501: Invalid Field: 'keyword'." }]);
    expect(posted.map((p) => p.tag)).toEqual(["brand-desktop", "szkolenia-mobile", "absent-desktop"]);
  });

  it("zadanie 40200 rzuca komunikat o braku środków", async () => {
    const body = envelope([createdTask("a"), { id: "x", status_code: 40200, status_message: "Payment Required.", data: { tag: "b" } }]);
    vi.stubGlobal("fetch", respondWith(body));
    await expect(postSerpTasks(inputs(2))).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);
  });

  it("HTTP 402 rzuca komunikat o braku środków", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("{}", { status: 402 })));
    await expect(postSerpTasks(inputs(1))).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);
  });

  it("nie ponawia POST-a: ponowienie mogłoby zapłacić dwa razy", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { posted, failed } = await postSerpTasks(inputs(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([]);
    expect(failed.map((f) => f.tag)).toEqual(["row-0", "row-1"]);
    expect(failed[0].error).toContain("HTTP 500");
  });

  it("awaria drugiej paczki nie gubi zadań z pierwszej (już opłaconych)", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string, init: { body: string }) =>
        json(envelope((JSON.parse(init.body) as { tag: string }[]).map((t) => createdTask(t.tag)))))
      .mockImplementationOnce(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { posted, failed } = await postSerpTasks(inputs(130));
    expect(posted).toHaveLength(100);
    expect(failed).toHaveLength(30);
    expect(failed[0].tag).toBe("row-100");
    expect(failed[29].tag).toBe("row-129");
  });

  it("zadanie pominięte w odpowiedzi trafia do failed", async () => {
    vi.stubGlobal("fetch", respondWith(envelope([createdTask("row-0")])));
    const { posted, failed } = await postSerpTasks(inputs(2));
    expect(posted.map((p) => p.tag)).toEqual(["row-0"]);
    expect(failed).toEqual([{ tag: "row-1", error: "DataForSEO nie zwróciło zadania" }]);
  });

  it("zadanie bez data.tag dostaje tag z wejścia o tej samej pozycji", async () => {
    vi.stubGlobal("fetch", respondWith(envelope([createdTask("ignored", { data: undefined })])));
    const { posted } = await postSerpTasks([{ tag: "row-7", keyword: "x", device: "desktop" }]);
    expect(posted).toEqual([{ tag: "row-7", id: "id-ignored", costUsd: 0.0066 }]);
  });
});

describe("getSerpTask", () => {
  it("pyta o zadanie GET-em pod adresem z identyfikatorem", async () => {
    const fetchMock = respondWith(pendingFixture);
    vi.stubGlobal("fetch", fetchMock);
    await getSerpTask("11031320-2787-0066-0000-859615c49f91");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DFS_BASE}/serp/google/organic/task_get/advanced/11031320-2787-0066-0000-859615c49f91`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("prawdziwa odpowiedź 40601 (Task Handed) to pending", async () => {
    vi.stubGlobal("fetch", respondWith(pendingFixture));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "pending" });
  });

  it("40602 (Task In Queue) to pending", async () => {
    vi.stubGlobal("fetch", respondWith(taskGet(40602, "Task In Queue.")));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "pending" });
  });

  it("prawdziwy wynik „kurs ai z certyfikatem”: done z wynikiem, kosztem faktycznym i czasem pomiaru w ISO", async () => {
    vi.stubGlobal("fetch", respondWith(kursFixture));
    const state = await getSerpTask("x");
    expect(state).toMatchObject({ state: "done", costUsd: 0.0012, checkedAt: "2026-11-03T13:22:16.000Z" });
    if (state.state !== "done") throw new Error("oczekiwano done");
    expect(state.result).toEqual(kursFixture.tasks[0].result[0]);
    expect((state.result as { keyword: string }).keyword).toBe("kurs ai z certyfikatem");
  });

  it("prawdziwy wynik mobilny „szkolenia ai” ma koszt faktyczny 0,006", async () => {
    vi.stubGlobal("fetch", respondWith(mobileFixture));
    await expect(getSerpTask("x")).resolves.toMatchObject({ state: "done", costUsd: 0.006, checkedAt: "2026-11-03T13:35:48.000Z" });
  });

  it("40102 (brak wyników) to done z pustym wynikiem", async () => {
    vi.stubGlobal("fetch", respondWith(taskGet(40102, "No Search Results.", { cost: 0.0006 })));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "done", result: null, costUsd: 0.0006, checkedAt: null });
  });

  it("20000 bez listy wyników to done z pustym wynikiem", async () => {
    vi.stubGlobal("fetch", respondWith(taskGet(20000, "Ok.", { result: [] })));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "done", result: null, costUsd: 0, checkedAt: null });
  });

  it("brak kosztu w zadaniu i w odpowiedzi to costUsd null (nie 0): nieznany koszt nie nadpisuje ceny z task_post", async () => {
    const body = taskGet(20000, "Ok.", { result: [{ keyword: "x", items: [] }] });
    delete (body.tasks[0] as { cost?: number }).cost;
    delete (body as { cost?: number }).cost;
    vi.stubGlobal("fetch", respondWith(body));
    await expect(getSerpTask("x")).resolves.toMatchObject({ state: "done", costUsd: null });
    // także przy braku wyników (40102)
    const none = taskGet(40102, "No Search Results.");
    delete (none.tasks[0] as { cost?: number }).cost;
    delete (none as { cost?: number }).cost;
    vi.stubGlobal("fetch", respondWith(none));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "done", result: null, costUsd: null, checkedAt: null });
  });

  it("koszt zadania 0 to prawdziwe 0, a brak kosztu zadania bierze koszt odpowiedzi", async () => {
    const free = taskGet(20000, "Ok.", { cost: 0, result: [{ keyword: "x", items: [] }] });
    vi.stubGlobal("fetch", respondWith(free));
    await expect(getSerpTask("x")).resolves.toMatchObject({ costUsd: 0 });
    const body = envelope([{ id: "t1", status_code: 20000, status_message: "Ok.", result: [{ keyword: "x", items: [] }] }], 0.0072);
    vi.stubGlobal("fetch", respondWith(body));
    await expect(getSerpTask("x")).resolves.toMatchObject({ costUsd: 0.0072 });
  });

  it("nieczytelna data pomiaru daje checkedAt null, a wynik zostaje", async () => {
    const result = { keyword: "x", datetime: "wczoraj", items: [] };
    vi.stubGlobal("fetch", respondWith(taskGet(20000, "Ok.", { result: [result] })));
    await expect(getSerpTask("x")).resolves.toMatchObject({ state: "done", result, checkedAt: null });
  });

  it("inny kod zadania to failed z kodem i komunikatem", async () => {
    vi.stubGlobal("fetch", respondWith(taskGet(40501, "Invalid Field.")));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "failed", error: "DataForSEO task 40501: Invalid Field." });
  });

  it("odpowiedź bez zadania to failed", async () => {
    vi.stubGlobal("fetch", respondWith(envelope([])));
    await expect(getSerpTask("x")).resolves.toEqual({ state: "failed", error: "DataForSEO nie zwróciło zadania" });
  });

  describe("awaria po drodze nie kończy opłaconego zadania błędem (pending), błąd kodu zadania tak", () => {
    afterEach(() => vi.useRealTimers());

    /** Czeka na ponowienia `withRetry` (1 s + 2 s) bez prawdziwego czasu. */
    const settled = async (call: () => Promise<unknown>) => {
      vi.useFakeTimers();
      const result = call().then((v) => v, (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(3_000);
      return result;
    };

    it("błąd HTTP 400 to pending", async () => {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("bad", { status: 400 })));
      await expect(getSerpTask("x")).resolves.toEqual({ state: "pending" });
    });

    it("błąd HTTP 500 po wyczerpaniu ponowień to pending", async () => {
      const fetchMock = vi.fn().mockImplementation(async () => new Response("boom", { status: 500 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(settled(() => getSerpTask("x"))).resolves.toEqual({ state: "pending" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("zadanie 40101 (awaria po stronie dostawcy) po wyczerpaniu ponowień to pending, nie failed", async () => {
      const fetchMock = respondWith(taskGet(40101, "Internal Error."));
      vi.stubGlobal("fetch", fetchMock);
      await expect(settled(() => getSerpTask("x"))).resolves.toEqual({ state: "pending" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("błąd sieci (fetch failed) to pending", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
      await expect(getSerpTask("x")).resolves.toEqual({ state: "pending" });
    });

    it("błąd statusu całej odpowiedzi (nie zadania) to pending", async () => {
      vi.stubGlobal("fetch", respondWith({ status_code: 50000, status_message: "Internal Error.", tasks: [] }));
      await expect(getSerpTask("x")).resolves.toEqual({ state: "pending" });
    });

    it("brak danych logowania to pending", async () => {
      delete process.env.DATAFORSEO_LOGIN;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(getSerpTask("x")).resolves.toEqual({ state: "pending" });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("zadanie 40200 rzuca komunikat o braku środków", async () => {
    vi.stubGlobal("fetch", respondWith(taskGet(40200, "Payment Required.")));
    await expect(getSerpTask("x")).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);
  });

  it("HTTP 402 rzuca komunikat o braku środków", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("{}", { status: 402 })));
    await expect(getSerpTask("x")).rejects.toThrow(PAYMENT_REQUIRED_MESSAGE);
  });
});
