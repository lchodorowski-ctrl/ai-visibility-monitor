import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dfsRequest, dfsLocationCode, DFS_BASE, PAYMENT_REQUIRED_MESSAGE } from "@/lib/dataforseo/client";

const ok = (tasks: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ status_code: 20000, status_message: "Ok.", tasks, ...extra }), { status: 200 });

describe("dfsRequest", () => {
  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = "l";
    process.env.DATAFORSEO_PASSWORD = "p";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("402 daje komunikat o braku środków", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 402 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(dfsRequest("POST", "/x", [{}])).rejects.toThrow("brak środków");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("zadanie 40200 daje komunikat o braku środków", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ok([{ id: "1", status_code: 40200, status_message: "Payment Required." }])));
    await expect(dfsRequest("POST", "/x", [{}])).rejects.toThrow("brak środków");
  });

  it("40101 jest ponawiane", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([{ id: "1", status_code: 40101, status_message: "Internal Error." }]))
      .mockResolvedValueOnce(ok([{ id: "1", status_code: 20000, status_message: "Ok." }]));
    vi.stubGlobal("fetch", fetchMock);
    const res = await dfsRequest("POST", "/x", [{}], { retry: { baseDelayMs: 1 } });
    expect(res.status_code).toBe(20000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("okTaskCodes przepuszcza 20100", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([{ id: "1", status_code: 20100, status_message: "Task Created." }])));
    await expect(dfsRequest("POST", "/x", [{}], { okTaskCodes: [20100] })).resolves.toMatchObject({ status_code: 20000 });
  });

  it("zadanie spoza okTaskCodes rzuca błąd z kodem i komunikatem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([{ id: "1", status_code: 40501, status_message: "Invalid Field" }])));
    await expect(dfsRequest("POST", "/x", [{}])).rejects.toThrow("DataForSEO task 40501: Invalid Field");
  });

  it("checkTasks false nie sprawdza zadań", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([{ id: "1", status_code: 40501, status_message: "Invalid Field" }])));
    await expect(dfsRequest("POST", "/x", [{}], { checkTasks: false })).resolves.toMatchObject({ status_code: 20000 });
  });

  it("sprawdza każde zadanie, nie tylko pierwsze", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([
      { id: "1", status_code: 20000, status_message: "Ok." },
      { id: "2", status_code: 40501, status_message: "Invalid Field" },
    ])));
    await expect(dfsRequest("POST", "/x", [{}, {}])).rejects.toThrow("task 40501");
  });

  it("brak loginu", async () => {
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(dfsRequest("POST", "/x", [{}])).rejects.toThrow("Brak DATAFORSEO_LOGIN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET bez body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    vi.stubGlobal("fetch", fetchMock);
    await dfsRequest("GET", "/serp/google/organic/tasks_ready");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(DFS_BASE + "/serp/google/organic/tasks_ready");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("POST wysyła Basic auth, JSON i body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    vi.stubGlobal("fetch", fetchMock);
    await dfsRequest("POST", "/serp/google/organic/task_post", [{ keyword: "a" }]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Basic ${Buffer.from("l:p").toString("base64")}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual([{ keyword: "a" }]);
  });

  it("status_code odpowiedzi różny od 20000 rzuca błąd", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status_code: 40000, status_message: "Bad" }), { status: 200 }),
    ));
    await expect(dfsRequest("POST", "/x", [{}])).rejects.toThrow("DataForSEO status 40000: Bad");
  });

  it("HTTP 5xx jest ponawiane, a po wyczerpaniu prób rzuca błąd z kodem HTTP", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(dfsRequest("POST", "/x", [{}], { retry: { attempts: 2, baseDelayMs: 1 } })).rejects.toThrow("DataForSEO HTTP 503: boom");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP 4xx (poza 402 i 429) nie jest ponawiane", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(dfsRequest("POST", "/x", [{}], { retry: { baseDelayMs: 1 } })).rejects.toThrow("DataForSEO HTTP 404: nope");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treść błędu HTTP jest przycięta do 300 znaków", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("x".repeat(500), { status: 400 })));
    await expect(dfsRequest("POST", "/x", [{}])).rejects.toThrow(`DataForSEO HTTP 400: ${"x".repeat(300)}`);
    await expect(dfsRequest("POST", "/x", [{}])).rejects.not.toThrow("x".repeat(301));
  });

  it("zadanie bez status_code nie jest błędem (zachowanie adaptera AIO)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([{ result: [] }])));
    await expect(dfsRequest("POST", "/x", [{}])).resolves.toMatchObject({ status_code: 20000 });
  });

  it("zwraca odpowiedź z kosztem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([{ id: "1", status_code: 20000, status_message: "Ok." }], { cost: 0.0006 })));
    const res = await dfsRequest("POST", "/x", [{}]);
    expect(res.cost).toBe(0.0006);
    expect(res.tasks?.[0].id).toBe("1");
  });
});

describe("dfsLocationCode", () => {
  afterEach(() => { delete process.env.DATAFORSEO_LOCATION_CODE; });

  it("czyta DATAFORSEO_LOCATION_CODE", () => {
    process.env.DATAFORSEO_LOCATION_CODE = "2840";
    expect(dfsLocationCode()).toBe(2840);
  });

  it("domyślnie 2616, także dla niepoprawnej wartości", () => {
    delete process.env.DATAFORSEO_LOCATION_CODE;
    expect(dfsLocationCode()).toBe(2616);
    process.env.DATAFORSEO_LOCATION_CODE = "abc";
    expect(dfsLocationCode()).toBe(2616);
    process.env.DATAFORSEO_LOCATION_CODE = "-5";
    expect(dfsLocationCode()).toBe(2616);
  });
});

describe("PAYMENT_REQUIRED_MESSAGE", () => {
  it("zachowuje dotychczasową treść", () => {
    expect(PAYMENT_REQUIRED_MESSAGE).toBe(
      "DataForSEO: brak środków na koncie (Payment Required). Doładuj saldo na app.dataforseo.com i uruchom pomiar ponownie.",
    );
  });
});
