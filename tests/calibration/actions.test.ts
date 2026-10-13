import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null };

const ops: string[] = [];
let tables: Record<string, Row[]>;
let writeErrors: Record<string, string>; // klucz: `${table}.${op}`

function table(name: string) {
  let op = "select";
  const filters: [string, unknown][] = [];
  const result = (): Result => {
    const key = `${name}.${op}`;
    if (writeErrors[key]) return { data: null, error: { message: writeErrors[key] } };
    if (op === "insert") return { data: [{ id: "new-cal-id" }], error: null };
    return { data: (tables[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)), error: null };
  };
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "insert", "update", "delete"]) {
    api[m] = (...a: unknown[]) => {
      if (m === "insert" || m === "update" || m === "delete") { op = m; ops.push(`${name}.${m}`); }
      if (m === "eq") { filters.push([a[0] as string, a[1]]); ops.push(`${name}.${op}.eq(${a.map(String).join(",")})`); }
      return api;
    };
  }
  api.maybeSingle = async () => { const r = result(); return { data: r.data?.[0] ?? null, error: r.error }; };
  api.single = async () => { const r = result(); return { data: r.data?.[0] ?? null, error: r.error }; };
  api.then = (res: (v: unknown) => void) => res(result());
  return api;
}

const CAL = "11111111-1111-4111-8111-111111111111";
const CHK = "22222222-2222-4222-8222-222222222222";
const project = { id: "p1", brand_aliases: ["PSAI"] };

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (n: string) => table(n) }) }));
vi.mock("@/lib/workspace", () => ({
  getCurrentProject: async () => project,
  requireUser: async () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/calibration/queries", () => ({ getLatestDoneRun: async () => ({ id: "run1", started_at: "2026-10-10T08:00:00Z" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

beforeEach(() => {
  ops.length = 0;
  writeErrors = {};
  tables = { prompts: [], calibrations: [], calibration_checks: [], projects: [] };
});

describe("createCalibration", () => {
  it("0 aktywnych pytań → wyjątek i brak insertu do calibrations", async () => {
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("Brak aktywnych pytań do kalibracji");
    expect(ops).not.toContain("calibrations.insert");
  });

  it("błąd insertu calibration_checks → usuwa świeżą kalibrację (z project_id) i rzuca oryginalny błąd", async () => {
    tables.prompts = [{ id: "q1", project_id: "p1", active: true, is_key: true, created_at: "2026-09-01T00:00:00Z" }];
    writeErrors["calibration_checks.insert"] = "checks-insert-fail";
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("checks-insert-fail");
    expect(ops).toContain("calibrations.delete");
    expect(ops).toContain("calibrations.delete.eq(project_id,p1)");
    expect(ops).toContain("calibrations.delete.eq(id,new-cal-id)");
  });

  it("sukces → redirect do nowej kalibracji, bez kasowania", async () => {
    tables.prompts = [{ id: "q1", project_id: "p1", active: true, is_key: true, created_at: "2026-09-01T00:00:00Z" }];
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("REDIRECT:/app/calibration/new-cal-id");
    expect(ops).not.toContain("calibrations.delete");
  });
});

describe("saveCheck", () => {
  const form = () => { const f = new FormData(); f.set("id", CHK); f.set("calibrationId", CAL); f.set("mentioned", "yes"); return f; };

  it("zamknięta sesja → wyjątek i brak update", async () => {
    tables.calibrations = [{ id: CAL, project_id: "p1", status: "closed" }];
    const { saveCheck } = await import("@/app/app/calibration/actions");
    await expect(saveCheck(form())).rejects.toThrow(/zamknięta lub nie istnieje/);
    expect(ops).not.toContain("calibration_checks.update");
  });

  it("otwarta sesja → update zawężony project_id i calibration_id", async () => {
    tables.calibrations = [{ id: CAL, project_id: "p1", status: "open" }];
    const { saveCheck } = await import("@/app/app/calibration/actions");
    await saveCheck(form());
    expect(ops).toContain("calibration_checks.update.eq(project_id,p1)");
    expect(ops).toContain(`calibration_checks.update.eq(calibration_id,${CAL})`);
  });
});

describe("addAliasFromCalibration", () => {
  it("poprawny alias → update projects", async () => {
    const f = new FormData(); f.set("calibrationId", CAL); f.set("alias", "  Nowy alias ");
    const { addAliasFromCalibration } = await import("@/app/app/calibration/actions");
    await addAliasFromCalibration(f);
    expect(ops).toContain("projects.update");
  });

  it("za długi alias lub duplikat → bez zapisu", async () => {
    const { addAliasFromCalibration } = await import("@/app/app/calibration/actions");
    const long = new FormData(); long.set("alias", "x".repeat(201));
    await addAliasFromCalibration(long);
    const dup = new FormData(); dup.set("alias", " psai ");
    await addAliasFromCalibration(dup);
    expect(ops).not.toContain("projects.update");
  });
});
