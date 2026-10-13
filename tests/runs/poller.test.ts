import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgressPoller, type PollResult } from "@/lib/runs/poller";
import type { RunProgress } from "@/lib/runs/progress";

const p = (over: Partial<RunProgress> = {}): RunProgress => ({ status: "running", stage: "queries", done: 1, total: 4, percent: 25, ...over });

function setup(results: (PollResult | Error)[] | (() => Promise<PollResult>)) {
  const queue = Array.isArray(results) ? [...results] : null;
  const fetchProgress = vi.fn(typeof results === "function" ? results : async () => {
    const next = queue!.shift() ?? p();
    if (next instanceof Error) throw next;
    return next;
  });
  const onUpdate = vi.fn(); const onFinish = vi.fn();
  const poller = createProgressPoller({ fetchProgress, intervalMs: 5000, onUpdate, onFinish });
  return { fetchProgress, onUpdate, onFinish, poller };
}

describe("createProgressPoller", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("odpytuje co interwał, a nie od razu", async () => {
    const { fetchProgress, onUpdate, poller } = setup([p({ done: 1 }), p({ done: 2 })]);
    poller.start();
    expect(fetchProgress).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchProgress).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls.map((c) => c[0].done)).toEqual([1, 2]);
    poller.stop();
  });

  it("kończy po zakończeniu runu: ostatnia aktualizacja, onFinish raz, brak dalszych zapytań", async () => {
    const final = p({ status: "done", stage: "done", done: 4, percent: 100 });
    const { fetchProgress, onUpdate, onFinish, poller } = setup([p(), final]);
    poller.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onUpdate).toHaveBeenLastCalledWith(final);
    expect(onFinish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("nie nakłada zapytań: wolna odpowiedź wstrzymuje kolejne", async () => {
    let resolve!: (v: PollResult) => void;
    const { fetchProgress, poller } = setup(() => new Promise<PollResult>((r) => { resolve = r; }));
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    resolve(p());
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("running ze stage done nie kończy odpytywania (czeka na flip statusu)", async () => {
    const { fetchProgress, onFinish, poller } = setup([p({ stage: "done" }), p({ stage: "done" }), p({ status: "done", stage: "recommending" }), p({ status: "done", stage: "done" })]);
    poller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(onFinish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchProgress).toHaveBeenCalledTimes(4);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("zatrzymuje się na 404/przekierowaniu (gone) bez aktualizacji", async () => {
    const { fetchProgress, onUpdate, onFinish, poller } = setup(["gone"]);
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("błąd sieci nie przerywa odpytywania", async () => {
    const { fetchProgress, onUpdate, poller } = setup([new Error("network"), p({ done: 3 })]);
    poller.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchProgress).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("stop() w trakcie zapytania wycisza jego wynik i kolejne ticki", async () => {
    let resolve!: (v: PollResult) => void;
    const { fetchProgress, onUpdate, poller } = setup(() => new Promise<PollResult>((r) => { resolve = r; }));
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    poller.stop();
    resolve(p());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(fetchProgress).toHaveBeenCalledTimes(1);
  });
});
