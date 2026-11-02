import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const trigger = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const getCurrentProject = vi.hoisted(() => vi.fn());
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger } }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/workspace", () => ({ getCurrentProject }));

import { syncGscNow } from "@/app/app/google/actions";

describe("syncGscNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T10:07:00Z"));
    trigger.mockReset().mockResolvedValue({ id: "run_1" });
    revalidatePath.mockReset();
    getCurrentProject.mockReset().mockResolvedValue({ id: "p1" });
  });
  afterEach(() => vi.useRealTimers());

  it("uruchamia zadanie gsc-sync dla bieżącego projektu z kluczem idempotencji na 10 minut i odświeża stronę", async () => {
    await syncGscNow();
    const bucket = Math.floor(Date.parse("2026-11-02T10:07:00Z") / 600_000);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(
      "gsc-sync",
      { projectId: "p1" },
      { idempotencyKey: `gsc-sync:p1:${bucket}`, idempotencyKeyTTL: "10m" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/app/google");
  });

  it("dwa kliknięcia w tym samym 10-minutowym oknie dają ten sam klucz, w następnym oknie inny", async () => {
    await syncGscNow();
    vi.setSystemTime(new Date("2026-11-02T10:09:30Z"));
    await syncGscNow();
    vi.setSystemTime(new Date("2026-11-02T10:10:01Z"));
    await syncGscNow();
    const keys = trigger.mock.calls.map((c) => (c[2] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("gdy Trigger jest nieosiągalny, nie rzuca do strony: loguje błąd i odświeża", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    trigger.mockRejectedValue(new Error("Trigger niedostępny"));
    await expect(syncGscNow()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("gsc-sync"), "Trigger niedostępny");
    expect(revalidatePath).toHaveBeenCalledWith("/app/google");
    log.mockRestore();
  });

  it("bez zalogowanego użytkownika (przekierowanie) nic nie uruchamia", async () => {
    getCurrentProject.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(syncGscNow()).rejects.toThrow("NEXT_REDIRECT");
    expect(trigger).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
