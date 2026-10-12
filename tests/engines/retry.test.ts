import { describe, it, expect, vi } from "vitest";
import { withRetry, TransientError, isTransientStatus } from "@/lib/engines/retry";

describe("withRetry", () => {
  it("ponawia błąd przejściowy i zwraca wynik po sukcesie", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TransientError("429"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("nie ponawia zwykłego błędu", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("zły klucz"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow("zły klucz");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("po wyczerpaniu prób rzuca ostatni błąd", async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError("500"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow("500");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("isTransientStatus", () => {
  it("429 i 5xx są przejściowe, 4xx bez 429 nie", () => {
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(401)).toBe(false);
    expect(isTransientStatus(404)).toBe(false);
  });
});
