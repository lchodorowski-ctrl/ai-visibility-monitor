import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null };

let tables: Record<string, Row[]>;
let errors: Record<string, string>;
const calls: string[] = [];

// Fałszywy klient: stosuje filtry eq na kolumnach płaskich, osadzone relacje (runs, prompts, mentions, citations) są wpisane w wiersze.
function table(name: string) {
  const filters: [string, unknown][] = [];
  const result = (): Result => {
    if (errors[name]) return { data: null, error: { message: errors[name] } };
    return { data: (tables[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)), error: null };
  };
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    api[m] = (...a: unknown[]) => {
      calls.push(`${name}.${m}(${a.map(String).join(",")})`);
      if (m === "eq") filters.push([a[0] as string, a[1]]);
      return api;
    };
  }
  api.maybeSingle = async () => { const r = result(); return { data: r.data?.[0] ?? null, error: r.error }; };
  api.then = (res: (v: unknown) => void) => res(result());
  return api;
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (n: string) => table(n) }) }));
// Bez kontekstu renderu React.cache nie deduplikuje; testy sprawdzają zapytania, nie pamięć podręczną.

const RUN = { id: "run1", started_at: "2026-10-10T08:00:00Z" };
const cal = (over: Row = {}): Row => ({ id: "cal1", project_id: "p1", status: "open", created_at: "2026-10-12T10:00:00Z", closed_at: null, run_id: "run1", runs: RUN, ...over });
const check = (id: string, prompt_id: string, engine_id: string, over: Row = {}): Row => ({
  id, project_id: "p1", calibration_id: "cal1", prompt_id, engine_id,
  manual_mentioned: true, manual_urls: [], manual_alias: null,
  prompts: { text: `Pytanie ${prompt_id}`, created_at: prompt_id === "q1" ? "2026-09-01T00:00:00Z" : "2026-09-02T00:00:00Z" },
  ...over,
});
const resp = (id: string, prompt_id: string, engine_id: string, over: Row = {}): Row => ({
  id, project_id: "p1", run_id: "run1", prompt_id, engine_id, error: null, no_answer: false, mentions: [], citations: [], ...over,
});

beforeEach(() => {
  calls.length = 0;
  errors = {};
  tables = { calibrations: [cal()], calibration_checks: [], responses: [], runs: [] };
});

describe("getCalibration", () => {
  it("próbka z błędem + próbka ze wzmianką → mentioned, apiResponseId ze wzmianką", async () => {
    tables.calibration_checks = [check("c1", "q1", "openai")];
    tables.responses = [
      resp("r-err", "q1", "openai", { error: "timeout" }),
      resp("r-ok", "q1", "openai", { mentions: [{ brand_kind: "competitor" }, { brand_kind: "own" }], citations: [{ domain: "psai.pl" }] }),
    ];
    const { getCalibration } = await import("@/lib/calibration/queries");
    const v = await getCalibration("p1", "cal1");
    expect(v?.checks).toHaveLength(1);
    expect(v?.checks[0]).toMatchObject({ api: "mentioned", apiResponseId: "r-ok", apiDomains: ["psai.pl"], result: "match", promptText: "Pytanie q1", engineId: "openai" });
    expect(v?.run).toEqual(RUN);
    expect(calls).toContain("calibrations.eq(project_id,p1)");
    expect(calls).toContain("calibration_checks.eq(project_id,p1)");
    expect(calls).toContain("calibration_checks.eq(calibration_id,cal1)");
    expect(calls).toContain("responses.eq(project_id,p1)");
  });

  it("brak odpowiedzi dla pary → no_data i skipped", async () => {
    tables.calibration_checks = [check("c1", "q1", "perplexity")];
    const { getCalibration } = await import("@/lib/calibration/queries");
    const v = await getCalibration("p1", "cal1");
    expect(v?.checks[0]).toMatchObject({ api: "no_data", result: "skipped", apiResponseId: null, apiDomains: [] });
  });

  it("kalibracja innego projektu → null", async () => {
    const { getCalibration } = await import("@/lib/calibration/queries");
    expect(await getCalibration("other-project", "cal1")).toBeNull();
  });

  it("kalibracja bez przebiegu → run null, bez zapytania o odpowiedzi", async () => {
    tables.calibrations = [cal({ run_id: null, runs: null })];
    tables.calibration_checks = [check("c1", "q1", "openai")];
    const { getCalibration } = await import("@/lib/calibration/queries");
    const v = await getCalibration("p1", "cal1");
    expect(v?.run).toBeNull();
    expect(v?.checks[0].api).toBe("no_data");
    expect(calls.some((c) => c.startsWith("responses."))).toBe(false);
  });

  it("grupuje wiersze pytań i porządkuje silniki: dwa pytania × trzy silniki", async () => {
    tables.calibration_checks = [
      check("a", "q2", "google_ai_overview"), check("b", "q1", "perplexity"), check("c", "q2", "openai"),
      check("d", "q1", "google_ai_overview"), check("e", "q2", "perplexity"), check("f", "q1", "openai"),
      check("g", "q1", "gemini"), // silnik spoza kalibracji jest pomijany
    ];
    const { getCalibration } = await import("@/lib/calibration/queries");
    const v = await getCalibration("p1", "cal1");
    expect(v?.checks.map((c) => `${c.promptId}:${c.engineId}`)).toEqual([
      "q1:openai", "q1:perplexity", "q1:google_ai_overview",
      "q2:openai", "q2:perplexity", "q2:google_ai_overview",
    ]);
  });

  it.each(["calibrations", "calibration_checks", "responses"])("rzuca przy błędzie zapytania do %s", async (t) => {
    tables.calibration_checks = [check("c1", "q1", "openai")];
    errors[t] = `fail-${t}`;
    const { getCalibration } = await import("@/lib/calibration/queries");
    await expect(getCalibration("p1", "cal1")).rejects.toThrow(`fail-${t}`);
  });
});

describe("getLatestDoneRun", () => {
  it("filtruje po projekcie i statusie done, sortuje malejąco", async () => {
    tables.runs = [{ ...RUN, project_id: "p1", status: "done" }];
    const { getLatestDoneRun } = await import("@/lib/calibration/queries");
    expect(await getLatestDoneRun("p1")).toMatchObject({ id: "run1" });
    expect(calls).toContain("runs.eq(project_id,p1)");
    expect(calls).toContain("runs.eq(status,done)");
    expect(calls).toContain("runs.order(started_at,[object Object])");
  });

  it("rzuca przy błędzie", async () => {
    errors.runs = "boom";
    const { getLatestDoneRun } = await import("@/lib/calibration/queries");
    await expect(getLatestDoneRun("p1")).rejects.toThrow("boom");
  });
});

describe("listCalibrations", () => {
  it("zwraca pozycje ze zgodnością per silnik i datą przebiegu", async () => {
    tables.calibration_checks = [check("c1", "q1", "openai"), check("c2", "q1", "perplexity", { manual_mentioned: false })];
    tables.responses = [
      resp("r1", "q1", "openai", { mentions: [{ brand_kind: "own" }] }),
      resp("r2", "q1", "perplexity", { mentions: [{ brand_kind: "own" }] }),
    ];
    const { listCalibrations } = await import("@/lib/calibration/queries");
    const list = await listCalibrations("p1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "cal1", status: "open", run_started_at: RUN.started_at });
    expect(list[0].agreement.find((a) => a.engineId === "openai")).toMatchObject({ agreed: 1, checked: 1, rate: 1 });
    expect(list[0].agreement.find((a) => a.engineId === "perplexity")).toMatchObject({ agreed: 0, checked: 1, rate: 0 });
    expect(list[0].agreement.find((a) => a.engineId === "google_ai_overview")).toMatchObject({ checked: 0, rate: null });
  });

  it("rzuca przy błędzie zapytania listy", async () => {
    errors.calibrations = "list-fail";
    const { listCalibrations } = await import("@/lib/calibration/queries");
    await expect(listCalibrations("p1")).rejects.toThrow("list-fail");
  });
});
