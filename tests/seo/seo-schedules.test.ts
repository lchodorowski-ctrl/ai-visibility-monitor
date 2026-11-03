import { describe, it, expect, vi } from "vitest";

// the module registers Trigger.dev tasks at import time; the run body is tested directly
vi.mock("@trigger.dev/sdk", () => ({ task: (def: unknown) => def, schedules: { task: (def: unknown) => def } }));

import { runGscSyncDaily, gscSyncDaily, runKeywordVolumesMonthly, keywordVolumesMonthly } from "@/trigger/seo-schedules";
import { gscSyncTask } from "@/trigger/gsc-sync";
import { keywordVolumesTask } from "@/trigger/keyword-volumes";
import { keywordResearchTask } from "@/trigger/keyword-research";
import { fakeAdmin as fakeWorld } from "./fake-admin";

function fakeAdmin(rows: { id: string }[], error: { message: string } | null = null) {
  const calls: { table: string; cols?: string; filters: unknown[][] } = { table: "", filters: [] };
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => { calls.cols = cols; return b; };
  b.not = (...a: unknown[]) => { calls.filters.push(["not", ...a]); return Promise.resolve({ data: error ? null : rows, error }); };
  return { client: { from: (t: string) => { calls.table = t; return b; } } as never, calls };
}

const timestamp = new Date("2026-11-02T05:30:00Z");

describe("runGscSyncDaily", () => {
  it("uruchamia synchronizację tylko dla projektów z ustawioną usługą, z kluczem dnia", async () => {
    const { client, calls } = fakeAdmin([{ id: "p1" }, { id: "p2" }]);
    const trigger = vi.fn().mockResolvedValue({ id: "run" });

    const res = await runGscSyncDaily({ timestamp }, { admin: client, trigger });

    expect(calls.table).toBe("projects");
    expect(calls.cols).toBe("id");
    expect(calls.filters).toEqual([["not", "gsc_property", "is", null]]);
    expect(trigger.mock.calls).toEqual([
      [{ projectId: "p1" }, { idempotencyKey: "gsc-sync:p1:2026-11-02" }],
      [{ projectId: "p2" }, { idempotencyKey: "gsc-sync:p2:2026-11-02" }],
    ]);
    expect(res).toEqual({ triggered: 2 });
  });

  it("bez takich projektów nic nie uruchamia", async () => {
    const { client } = fakeAdmin([]);
    const trigger = vi.fn();
    expect(await runGscSyncDaily({ timestamp }, { admin: client, trigger })).toEqual({ triggered: 0 });
    expect(trigger).not.toHaveBeenCalled();
  });

  it("błąd jednego projektu nie zatrzymuje pozostałych, ale kończy zadanie błędem", async () => {
    const { client } = fakeAdmin([{ id: "p1" }, { id: "p2" }]);
    const trigger = vi.fn().mockRejectedValueOnce(new Error("api down")).mockResolvedValueOnce({ id: "run" });

    await expect(runGscSyncDaily({ timestamp }, { admin: client, trigger })).rejects.toThrow("p1: api down");
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it("rzuca przy błędzie odczytu projektów", async () => {
    const { client } = fakeAdmin([], { message: "boom" });
    await expect(runGscSyncDaily({ timestamp }, { admin: client, trigger: vi.fn() })).rejects.toThrow("boom");
  });
});

describe("runKeywordVolumesMonthly", () => {
  const monthly = new Date("2026-11-02T04:00:00Z");

  it("uruchamia pomiar tylko dla projektów z aktywną frazą, z kluczem miesiąca", async () => {
    const { client, calls } = fakeWorld(() => ({ data: [{ id: "p1" }, { id: "p2" }] }));
    const trigger = vi.fn().mockResolvedValue({ id: "run" });

    const res = await runKeywordVolumesMonthly({ timestamp: monthly }, { admin: client, trigger });

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("projects");
    expect(calls[0].cols).toBe("id, keywords!inner(id)");
    expect(calls[0].filters).toEqual([["eq", "keywords.active", true]]);
    expect(trigger.mock.calls).toEqual([
      [{ projectId: "p1" }, { idempotencyKey: "keyword-volumes:p1:2026-11" }],
      [{ projectId: "p2" }, { idempotencyKey: "keyword-volumes:p2:2026-11" }],
    ]);
    expect(res).toEqual({ triggered: 2 });
  });

  it("klucz idempotencji zmienia się z miesiącem, także przy znaczniku jako tekst", async () => {
    const { client } = fakeWorld(() => ({ data: [{ id: "p1" }] }));
    const trigger = vi.fn().mockResolvedValue({ id: "run" });
    await runKeywordVolumesMonthly({ timestamp: "2026-12-02T04:00:00Z" }, { admin: client, trigger });
    expect(trigger.mock.calls[0][1]).toEqual({ idempotencyKey: "keyword-volumes:p1:2026-12" });
  });

  it("bez takich projektów nic nie uruchamia", async () => {
    const { client } = fakeWorld(() => ({ data: [] }));
    const trigger = vi.fn();
    expect(await runKeywordVolumesMonthly({ timestamp: monthly }, { admin: client, trigger })).toEqual({ triggered: 0 });
    expect(trigger).not.toHaveBeenCalled();
  });

  it("błąd jednego projektu nie zatrzymuje pozostałych, ale kończy zadanie błędem", async () => {
    const { client } = fakeWorld(() => ({ data: [{ id: "p1" }, { id: "p2" }] }));
    const trigger = vi.fn().mockRejectedValueOnce(new Error("api down")).mockResolvedValueOnce({ id: "run" });
    await expect(runKeywordVolumesMonthly({ timestamp: monthly }, { admin: client, trigger })).rejects.toThrow("p1: api down");
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it("rzuca przy błędzie odczytu projektów", async () => {
    const { client } = fakeWorld(() => ({ error: { message: "boom" } }));
    await expect(runKeywordVolumesMonthly({ timestamp: monthly }, { admin: client, trigger: vi.fn() })).rejects.toThrow("boom");
  });
});

describe("definicje zadań", () => {
  it("harmonogram działa codziennie o 6:30 czasu warszawskiego tylko na produkcji", () => {
    expect(gscSyncDaily).toMatchObject({
      id: "gsc-sync-daily",
      cron: { pattern: "30 6 * * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] },
    });
  });
  it("zadanie synchronizacji ma kolejkę po jednym, dwie próby i limit 30 minut", () => {
    expect(gscSyncTask).toMatchObject({ id: "gsc-sync", queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 2 }, maxDuration: 1800 });
  });
  it("pomiar wolumenów działa drugiego dnia miesiąca o 5:00 czasu warszawskiego tylko na produkcji", () => {
    expect(keywordVolumesMonthly).toMatchObject({
      id: "keyword-volumes-monthly",
      cron: { pattern: "0 5 2 * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] },
    });
  });
  it.each([
    { name: "wolumeny", task: keywordVolumesTask, id: "keyword-volumes" },
    { name: "badanie fraz", task: keywordResearchTask, id: "keyword-research" },
  ])("zadanie płatne ($name): kolejka po jednym, jedna próba, limit 15 minut", ({ task, id }) => {
    expect(task).toMatchObject({ id, queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 1 }, maxDuration: 900 });
  });
});
