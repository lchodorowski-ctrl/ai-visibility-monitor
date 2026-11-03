import { describe, it, expect, vi, beforeEach } from "vitest";

type Result = { data: unknown; error: { message: string } | null };

let result: Result;
const rpc = vi.fn(async (name: string, args: unknown) => { void name; void args; return result; });
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc }) }));

import { getLatestRanks } from "@/lib/seo/rank-queries";

beforeEach(() => {
  rpc.mockClear();
  result = { data: [], error: null };
});

// PostgREST oddaje int jako liczbę, ale numeric i bigint mogą przyjść jako tekst; jsonb jako obiekt.
const row = (over: Record<string, unknown> = {}) => ({
  keyword_id: "k1", device: "desktop", week_start: "2026-11-02",
  position: 52, rank_absolute: 58, url: "https://polskaszkola.ai/szkolenia-ai", breadcrumb: "https://polskaszkola.ai › szkolenia-ai",
  features: { aiOverview: true, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: true, knowledgePanelOurs: false },
  competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/ai" }],
  checked_at: "2026-11-03T04:12:00Z", prev_week_start: "2026-10-26", prev_position: 55,
  ...over,
});

describe("getLatestRanks", () => {
  it("wywołuje rank_latest dla projektu i mapuje wiersz po id frazy i urządzeniu", async () => {
    result = { data: [row(), row({ device: "mobile", position: null, rank_absolute: null, url: null, breadcrumb: null, prev_week_start: null, prev_position: null })], error: null };
    const ranks = await getLatestRanks("rq-map");
    expect(rpc).toHaveBeenCalledWith("rank_latest", { p_project: "rq-map" });
    expect([...ranks.keys()]).toEqual(["k1"]);
    const k1 = ranks.get("k1")!;
    expect(k1.desktop).toEqual({
      weekStart: "2026-11-02", position: 52, rankAbsolute: 58, url: "https://polskaszkola.ai/szkolenia-ai",
      breadcrumb: "https://polskaszkola.ai › szkolenia-ai",
      features: { aiOverview: true, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: true, knowledgePanelOurs: false },
      competitors: [{ name: "Altkom Akademia", domain: "altkomakademia.pl", position: 7, url: "https://altkomakademia.pl/ai" }],
      checkedAt: "2026-11-03T04:12:00Z", prevWeekStart: "2026-10-26", prevPosition: 55,
    });
    // brak pozycji to null, nie 0; brak poprzedniego pomiaru to null
    expect(k1.mobile).toMatchObject({ position: null, rankAbsolute: null, url: null, breadcrumb: null, prevWeekStart: null, prevPosition: null });
  });

  it("liczby z tekstu stają się liczbami, a pusty tekst i nie-liczba to null", async () => {
    result = { data: [row({ position: "37", rank_absolute: "41", prev_position: "40" }), row({ keyword_id: "k2", position: "", rank_absolute: "abc", prev_position: "" })], error: null };
    const ranks = await getLatestRanks("rq-num");
    expect(ranks.get("k1")!.desktop).toMatchObject({ position: 37, rankAbsolute: 41, prevPosition: 40 });
    expect(ranks.get("k2")!.desktop).toMatchObject({ position: null, rankAbsolute: null, prevPosition: null });
  });

  it("konkurenci od najlepszej pozycji; wpis bez nazwy albo pozycji jest pomijany, brak adresu to null", async () => {
    result = {
      data: [row({
        competitors: [
          { name: "Coders Lab", domain: "coderslab.pl", position: "12", url: null },
          null, "x", { name: "Bez pozycji", domain: "a.pl" }, { position: 3 },
          { name: "Altkom Akademia", position: 7, url: "https://altkomakademia.pl/ai" },
        ],
      })],
      error: null,
    };
    const { competitors } = (await getLatestRanks("rq-rivals")).get("k1")!.desktop!;
    expect(competitors).toEqual([
      { name: "Altkom Akademia", domain: "", position: 7, url: "https://altkomakademia.pl/ai" },
      { name: "Coders Lab", domain: "coderslab.pl", position: 12, url: null },
    ]);
  });

  it("uszkodzony jsonb daje puste cechy i pustą listę konkurentów, a nie wyjątek", async () => {
    result = {
      data: [
        row({ features: "nie obiekt", competitors: { name: "x" } }),
        row({ keyword_id: "k2", features: null, competitors: null }),
        row({ keyword_id: "k3", features: { aiOverview: "true", localPack: 1, peopleAlsoAsk: true }, competitors: "[]" }),
      ],
      error: null,
    };
    const ranks = await getLatestRanks("rq-broken");
    const none = { aiOverview: false, aiOverviewCitesUs: false, featuredSnippet: false, featuredSnippetOurs: false, localPack: false, peopleAlsoAsk: false, knowledgePanelOurs: false };
    expect(ranks.get("k1")!.desktop).toMatchObject({ features: none, competitors: [] });
    expect(ranks.get("k2")!.desktop).toMatchObject({ features: none, competitors: [] });
    // tylko dokładne `true` liczy się jako cecha
    expect(ranks.get("k3")!.desktop!.features).toEqual({ ...none, peopleAlsoAsk: true });
  });

  it("wiersz z nieznanym urządzeniem albo bez tygodnia jest pomijany", async () => {
    result = { data: [row({ device: "tablet" }), row({ keyword_id: "k2", week_start: null }), row({ keyword_id: "k3" })], error: null };
    expect([...(await getLatestRanks("rq-skip")).keys()]).toEqual(["k3"]);
  });

  it("dwa urządzenia tej samej frazy trafiają do jednego wpisu", async () => {
    result = { data: [row(), row({ device: "mobile", position: 61 })], error: null };
    const k1 = (await getLatestRanks("rq-two")).get("k1")!;
    expect(k1.desktop?.position).toBe(52);
    expect(k1.mobile?.position).toBe(61);
  });

  it("brak wierszy (albo null z bazy) daje pustą mapę", async () => {
    expect((await getLatestRanks("rq-empty")).size).toBe(0);
    result = { data: null, error: null };
    expect((await getLatestRanks("rq-null")).size).toBe(0);
  });

  it("błąd bazy rzuca po polsku", async () => {
    result = { data: null, error: { message: "boom" } };
    await expect(getLatestRanks("rq-err")).rejects.toThrow("Nie udało się pobrać pozycji: boom");
  });
});
