import { describe, it, expect } from "vitest";
import { shapeOverview } from "@/lib/metrics/overview";
import type { Tables } from "@/lib/db-types";

const row = (p: Partial<Tables<"daily_metrics">>): Tables<"daily_metrics"> => ({
  id: "x", project_id: "proj", date: "2026-10-01", engine_id: null, prompt_id: null,
  responses_count: 10, visibility_rate: 0.5, avg_position: 2, citation_rate: 0.25, share_of_voice: 0.4,
  score: 50, computed_at: "2026-10-01T00:00:00Z", ...p,
});

describe("shapeOverview", () => {
  it("pusty stan: brak wierszy i wzmianek", () => {
    expect(shapeOverview([], [])).toEqual({ latest: null, byEngine: [], trend: [], competitors: [] });
  });

  it("latest = wiersz ogólny z najnowszej daty, byEngine = wiersze silników z tej daty", () => {
    const rows = [
      row({ date: "2026-10-02", score: 70 }),
      row({ date: "2026-10-02", engine_id: "openai", score: 80 }),
      row({ date: "2026-10-02", engine_id: "gemini", score: 60 }),
      row({ date: "2026-10-01", score: 40 }),
      row({ date: "2026-10-01", engine_id: "openai", score: 30 }),
    ];
    const o = shapeOverview(rows, []);
    expect(o.latest?.score).toBe(70);
    expect(o.latest?.engineId).toBeNull();
    expect(o.byEngine.map((e) => e.engineId).sort()).toEqual(["gemini", "openai"]);
    expect(o.byEngine.every((e) => e.score === 80 || e.score === 60)).toBe(true);
  });

  it("trend: wiersze ogólne posortowane rosnąco po dacie, liczby po koercji", () => {
    const rows = [
      row({ date: "2026-10-03", score: 30, visibility_rate: "0.3" as unknown as number }),
      row({ date: "2026-10-01", score: 10, visibility_rate: 0.1 }),
      row({ date: "2026-10-02", engine_id: "openai", score: 99 }),
      row({ date: "2026-10-02", score: 20, visibility_rate: 0.2 }),
    ];
    expect(shapeOverview(rows, []).trend).toEqual([
      { date: "2026-10-01", score: 10, visibilityRate: 0.1 },
      { date: "2026-10-02", score: 20, visibilityRate: 0.2 },
      { date: "2026-10-03", score: 30, visibilityRate: 0.3 },
    ]);
  });

  it("latest to max daty także przy nieposortowanym wejściu; koercja stringów numeric", () => {
    const rows = [
      row({ date: "2026-10-05", score: 55, visibility_rate: "0.75" as unknown as number, avg_position: "1.5" as unknown as number,
        citation_rate: "0.1" as unknown as number, share_of_voice: "0.2" as unknown as number }),
      row({ date: "2026-10-01", score: 10 }),
    ];
    const { latest } = shapeOverview(rows, []);
    expect(latest).toMatchObject({ score: 55, visibilityRate: 0.75, avgPosition: 1.5, citationRate: 0.1, shareOfVoice: 0.2 });
  });

  it("avg_position null pozostaje null", () => {
    expect(shapeOverview([row({ avg_position: null })], []).latest?.avgPosition).toBeNull();
  });

  it("competitors: zliczone i posortowane malejąco", () => {
    const m = ["A", "B", "B", "C", "C", "C"].map((brand_name) => ({ brand_name }));
    expect(shapeOverview([], m).competitors).toEqual([
      { name: "C", mentions: 3 }, { name: "B", mentions: 2 }, { name: "A", mentions: 1 },
    ]);
  });
});
