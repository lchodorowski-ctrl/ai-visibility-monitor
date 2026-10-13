import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RunProgress } from "@/components/RunProgress";
import { RunStatus } from "@/components/RunStatus";
import type { Tables } from "@/lib/db-types";

const initial = (over = {}) => ({ status: "running", stage: "queries", done: 3, total: 8, percent: 38, ...over });
const html = (over = {}) => renderToStaticMarkup(<RunProgress runId="r1" initial={initial(over)} />);
const text = (h: string) => h.replace(/<[^>]+>/g, "");

describe("RunProgress", () => {
  it("etap zapytań: pasek z procentem i licznik", () => {
    const h = html();
    expect(h).toContain('role="progressbar"');
    expect(h).toContain('aria-valuenow="38"');
    expect(text(h)).toBe("Zapytania: 3 z 8 (38%)");
  });
  it("agregacja: pasek nieokreślony i etykieta", () => {
    const h = html({ stage: "aggregating" });
    expect(h).toContain("animate-pulse");
    expect(h).not.toContain("aria-valuenow");
    expect(text(h)).toBe("Agregacja wyników…");
  });
  it("rekomendacje: pasek nieokreślony i etykieta", () => {
    expect(text(html({ stage: "recommending" }))).toBe("Generowanie rekomendacji…");
  });
  it.each([[{ stage: "done" }], [{ status: "done" }], [{ status: "failed" }]])("zakończony (%o) nie renderuje nic", (over) => {
    expect(html(over)).toBe("");
  });
});

describe("RunStatus + RunProgress", () => {
  const run = (over: Partial<Tables<"runs">>) => ({
    id: "r1", project_id: "p", status: "running", started_at: new Date().toISOString(), finished_at: null,
    queries_total: 8, queries_failed: 0, cost_usd: 0, error: null, ...over,
  }) as Tables<"runs">;
  it("pokazuje postęp tylko dla trwającego, nieprzerwanego runu", () => {
    expect(renderToStaticMarkup(<RunStatus run={run({})} progress={initial()} />)).toContain("Zapytania: 3 z 8");
    expect(renderToStaticMarkup(<RunStatus run={run({ status: "done" })} progress={initial()} />)).not.toContain("progressbar");
    const stale = run({ started_at: new Date(Date.now() - 2 * 3_600_000).toISOString() });
    expect(renderToStaticMarkup(<RunStatus run={stale} progress={initial()} />)).not.toContain("progressbar");
  });
});
