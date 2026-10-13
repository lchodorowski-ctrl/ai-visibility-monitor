import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const getLastRun = vi.fn();
const getMentionCounts = vi.fn();
vi.mock("@/lib/metrics/queries", () => ({
  getLatestMetrics: vi.fn(), getTrend: vi.fn(), getLastRun: (...a: unknown[]) => getLastRun(...a), getMentionCounts: (...a: unknown[]) => getMentionCounts(...a),
}));
vi.mock("@/components/TrendChart", () => ({ TrendChart: () => null }));

import { MentionsSection } from "@/app/app/overview/sections";

async function render(counts: { name: string; mentions: number }[]) {
  getLastRun.mockResolvedValue({ id: "r1" });
  getMentionCounts.mockResolvedValue(counts);
  return renderToStaticMarkup(await MentionsSection({ projectId: "p", brandName: "Marka X" }));
}

describe("MentionsSection", () => {
  beforeEach(() => vi.clearAllMocks());
  it("pokazuje notkę, gdy wymieniono tylko konkurentów", async () => {
    const html = await render([{ name: "Konkurent", mentions: 3 }]);
    expect(html).toContain("Brak wzmianek o Marka X w tym pomiarze");
    expect(html).toContain("Konkurent");
  });
  it("nie pokazuje notki, gdy marka jest wymieniona", async () => {
    const html = await render([{ name: "Marka X", mentions: 2 }, { name: "Konkurent", mentions: 3 }]);
    expect(html).not.toContain("Brak wzmianek o");
  });
  it("pokazuje stan pusty bez żadnych wzmianek", async () => {
    const html = await render([]);
    expect(html).toContain("Brak wzmianek");
    expect(html).not.toContain("w tym pomiarze");
  });
});
