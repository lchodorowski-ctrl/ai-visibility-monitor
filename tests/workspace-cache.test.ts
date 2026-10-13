import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
// Pamięć podręczna „jednego żądania”: funkcja -> (argumenty -> wynik). Czyszczona w beforeEach.
const memo = vi.hoisted(() => new Map<unknown, Map<string, unknown>>());

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
  return {
    ...actual,
    cache: <T extends (...a: never[]) => unknown>(fn: T) => ((...args: Parameters<T>) => {
      const perFn = memo.get(fn) ?? new Map<string, unknown>();
      memo.set(fn, perFn);
      const key = JSON.stringify(args);
      if (!perFn.has(key)) perFn.set(key, fn(...args));
      return perFn.get(key) as ReturnType<T>;
    }) as T,
  };
});

describe("requireUser / getCurrentProject z React.cache", () => {
  beforeEach(() => {
    memo.clear();
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

  it("layout (requireUser) + strona (getCurrentProject) = jedno getUser", async () => {
    const { requireUser, getCurrentProject } = await import("@/lib/workspace");
    const { user } = await requireUser();
    const project = await getCurrentProject();
    expect(user.id).toBe("u1");
    expect(project).toMatchObject({ id: "p1" });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("błąd zapytania o projekt jest rzucany", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { getCurrentProject } = await import("@/lib/workspace");
    await expect(getCurrentProject()).rejects.toThrow("boom");
  });
});
