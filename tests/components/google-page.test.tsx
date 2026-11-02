import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const w = vi.hoisted(() => ({ getCurrentProject: vi.fn() }));
const q = vi.hoisted(() => ({ getGscLastDate: vi.fn(), getGscFirstDate: vi.fn(), getSeoStatus: vi.fn() }));
// the data sections are async server components with their own tests; here they are stand-ins that show their props
const S = vi.hoisted(() => {
  const stub = (name: string) => {
    const Stub = (props: Record<string, unknown>) => <div data-section={name} data-props={JSON.stringify(props)} />;
    Stub.displayName = `Stub(${name})`;
    return Stub;
  };
  return {
    StatusSection: stub("status"), GscStatsSection: stub("stats"), GscTrendSection: stub("trend"),
    OpportunitiesSection: stub("opportunities"), TopQueriesSection: stub("queries"), TopPagesSection: stub("pages"),
  };
});
vi.mock("@/lib/workspace", () => w);
vi.mock("@/lib/seo/queries", () => q);
vi.mock("@/app/app/google/sections", () => S);

import GooglePage from "@/app/app/google/page";

const NOW = new Date("2026-11-02T12:00:00Z");
const PROPERTY = "sc-domain:polskaszkola.ai";

const job = (status: string, started_at: string, error: string | null = null) => ({ status, error, started_at, finished_at: null });

async function page(o: { gscProperty?: string | null; lastDate?: string | null; firstDate?: string | null; lastSync?: ReturnType<typeof job> | null }) {
  w.getCurrentProject.mockResolvedValue({ id: "p", gsc_property: "gscProperty" in o ? o.gscProperty : PROPERTY, seo_budget_usd: "10", monthly_budget_usd: "20" });
  q.getGscLastDate.mockResolvedValue(o.lastDate ?? null);
  q.getGscFirstDate.mockResolvedValue(o.firstDate ?? null);
  q.getSeoStatus.mockResolvedValue({ lastSync: o.lastSync ?? null, seoSpent: 0, aiSpent: 0 });
  return renderToStaticMarkup(await GooglePage());
}

/** Props of a stand-in section, read back from the static markup. */
function propsOf(html: string, name: string): Record<string, unknown> {
  const m = new RegExp(`data-section="${name}" data-props="([^"]*)"`).exec(html);
  if (!m) throw new Error(`brak sekcji ${name}`);
  return JSON.parse(m[1].replace(/&quot;/g, '"'));
}

describe("GooglePage: stan strony", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("bez usługi: zachęta do podłączenia Search Console", async () => {
    expect(await page({ gscProperty: null })).toContain("Search Console nie jest podłączony");
  });

  it("usługa jest, nic jeszcze nie pobrano: „Kliknij Synchronizuj”", async () => {
    const html = await page({});
    expect(html).toContain("Brak danych z Search Console");
    expect(html).toContain("Kliknij Synchronizuj");
  });

  it("synchronizacja w toku od niedawna: „Synchronizacja w toku…” zamiast „Kliknij Synchronizuj”", async () => {
    const html = await page({ lastSync: job("running", "2026-11-02T11:40:00Z") });
    expect(html).toContain("Synchronizacja w toku…");
    expect(html).not.toContain("Kliknij Synchronizuj");
  });

  it("synchronizacja w toku od ponad 45 minut jest przerwana: znowu „Kliknij Synchronizuj”", async () => {
    const html = await page({ lastSync: job("running", "2026-11-02T11:00:00Z") });
    expect(html).toContain("Kliknij Synchronizuj");
    expect(html).not.toContain("Synchronizacja w toku…");
  });

  it("synchronizacja zakończona, a danych brak: „Search Console nie zwróciło jeszcze danych dla tej usługi.”", async () => {
    const html = await page({ lastSync: job("done", "2026-11-02T11:40:00Z") });
    expect(html).toContain("Search Console nie zwróciło jeszcze danych dla tej usługi.");
    expect(html).not.toContain("Kliknij Synchronizuj");
  });

  it("nieudana pierwsza synchronizacja pokazuje błąd", async () => {
    const html = await page({ lastSync: job("failed", "2026-11-02T11:40:00Z", "Google API 403") });
    expect(html).toContain("Synchronizacja nie powiodła się");
    expect(html).toContain("Google API 403");
  });

  it("są dane: sekcje dostają ostatnią i pierwszą datę (do oceny, czy jest z czym porównywać)", async () => {
    const html = await page({ lastDate: "2026-10-31", firstDate: "2026-09-21", lastSync: job("running", "2026-11-02T11:40:00Z") });
    expect(propsOf(html, "stats")).toMatchObject({ projectId: "p", lastDate: "2026-10-31", firstDate: "2026-09-21" });
    expect(propsOf(html, "opportunities")).toMatchObject({ projectId: "p", lastDate: "2026-10-31", firstDate: "2026-09-21" });
    expect(html).not.toContain("Brak danych z Search Console");
  });
});
