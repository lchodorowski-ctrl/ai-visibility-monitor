import { describe, it, expect, vi, beforeEach } from "vitest";

const { trigger, state } = vi.hoisted(() => ({
  trigger: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: "run_x" })),
  state: { updates: [] as unknown[], updateError: null as { message: string } | null },
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getCurrentProject: async () => ({ id: "proj-1", site_url: "https://staging.example.app" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({ update: (v: unknown) => { state.updates.push(v); return { eq: async () => ({ error: state.updateError }) }; } }),
  }),
}));

import { siteUrlChanged } from "@/lib/site/url-changed";
import { updateProjectSettings } from "@/app/app/settings/actions";

describe("siteUrlChanged", () => {
  it("ten sam adres (ukośnik na końcu, wielkość liter hosta, fragment) nie jest zmianą", () => {
    expect(siteUrlChanged("https://www.polskaszkola.ai", "https://www.polskaszkola.ai/")).toBe(false);
    expect(siteUrlChanged("https://WWW.polskaszkola.ai/", "https://www.polskaszkola.ai")).toBe(false);
    expect(siteUrlChanged("https://x.pl/", "https://x.pl/#top")).toBe(false);
  });
  it("inny host, schemat lub ścieżka to zmiana", () => {
    expect(siteUrlChanged("https://staging.example.app", "https://www.polskaszkola.ai")).toBe(true);
    expect(siteUrlChanged("http://x.pl", "https://x.pl")).toBe(true);
    expect(siteUrlChanged("https://x.pl/a", "https://x.pl/b")).toBe(true);
  });
  it("brak poprzedniej wartości to zmiana", () => {
    expect(siteUrlChanged(null, "https://x.pl")).toBe(true);
    expect(siteUrlChanged(undefined, "https://x.pl")).toBe(true);
  });
});

describe("updateProjectSettings: crawl po zmianie site_url", () => {
  const form = (site_url: string) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      brand_name: "Polska Szkoła AI", brand_aliases: "PSAI", domains: "polskaszkola.ai", monthly_budget_usd: "30",
      facts: "{}", site_url, low_visibility_threshold: "0.34",
    })) f.set(k, v);
    return f;
  };
  beforeEach(() => { trigger.mockClear(); trigger.mockImplementation(async () => ({ id: "run_x" })); state.updates = []; state.updateError = null; });

  it("zmiana adresu uruchamia crawl-site dla projektu", async () => {
    await updateProjectSettings(form("https://www.polskaszkola.ai"));
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger.mock.calls[0].slice(0, 2)).toEqual(["crawl-site", { projectId: "proj-1" }]);
  });
  it("ten sam adres nie uruchamia crawla", async () => {
    await updateProjectSettings(form("https://staging.example.app/"));
    expect(trigger).not.toHaveBeenCalled();
  });
  it("błąd triggera nie psuje zapisu ustawień", async () => {
    trigger.mockImplementation(async () => { throw new Error("trigger down"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(updateProjectSettings(form("https://www.polskaszkola.ai"))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it("błąd zapisu w bazie rzuca i nie uruchamia crawla", async () => {
    state.updateError = { message: "boom" };
    await expect(updateProjectSettings(form("https://www.polskaszkola.ai"))).rejects.toThrow("boom");
    expect(trigger).not.toHaveBeenCalled();
  });
});
