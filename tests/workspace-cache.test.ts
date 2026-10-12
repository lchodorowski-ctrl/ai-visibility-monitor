import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }),
  }),
}));
// React.cache poza renderem React nie deduplikuje — testujemy przez wstrzyknięty cache zgodny z React:
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  const store = new Map<unknown, unknown>();
  return { ...actual, cache: <T extends (...a: never[]) => unknown>(fn: T) => ((...args: Parameters<T>) => {
    const key = fn.toString() + JSON.stringify(args);
    if (!store.has(key)) store.set(key, fn(...args));
    return store.get(key) as ReturnType<T>;
  }) as T };
});

describe("getCurrentProject z React.cache", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1", email: "a@b.pl" } } });
    maybeSingle.mockReset().mockResolvedValue({ data: { id: "p1", name: "PSAI" }, error: null });
  });

  it("trzy wywołania w jednym żądaniu = jedno getUser i jedno zapytanie o projekt", async () => {
    const { getCurrentProject } = await import("@/lib/workspace");
    const [a, b, c] = await Promise.all([getCurrentProject(), getCurrentProject(), getCurrentProject()]);
    expect(a).toBe(b); expect(b).toBe(c);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
