import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null };

const ops: string[] = [];
let payloads: Record<string, unknown>;
let tables: Record<string, Row[]>;
let writeErrors: Record<string, string>; // klucz: `${table}.${op}`

function table(name: string) {
  let op = "select";
  const filters: [string, unknown][] = [];
  let window: [number, number] | null = null;
  const result = (): Result => {
    const key = `${name}.${op}`;
    if (writeErrors[key]) return { data: null, error: { message: writeErrors[key] } };
    if (op === "insert") return { data: [{ id: "new-cal-id" }], error: null };
    const rows = (tables[name] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    return { data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null };
  };
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "range", "insert", "update", "delete"]) {
    api[m] = (...a: unknown[]) => {
      if (m === "insert" || m === "update" || m === "delete") { op = m; ops.push(`${name}.${m}`); payloads[`${name}.${m}`] = a[0]; }
      if (m === "range") window = [a[0] as number, a[1] as number];
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
const project = { id: "p1", brand_name: "Polska Szkoła AI", brand_aliases: ["PSAI"] };

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
  payloads = {};
  writeErrors = {};
  tables = { prompts: [], calibrations: [], calibration_checks: [], projects: [], responses: [] };
  vi.mocked(revalidatePath).mockClear();
});

const prompt = (id: string, over: Row = {}): Row => ({ id, project_id: "p1", active: true, is_key: true, created_at: "2026-09-01T00:00:00Z", ...over });
const answer = (prompt_id: string, i = 0): Row => ({ id: `r-${prompt_id}-${i}`, project_id: "p1", run_id: "run1", prompt_id });

describe("createCalibration", () => {
  it("brak aktywnych pytań → wyjątek i brak insertu do calibrations", async () => {
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("Brak pytań z ostatniego pomiaru do kalibracji");
    expect(ops).not.toContain("calibrations.insert");
  });

  it("aktywne pytania bez odpowiedzi w pomiarze → ten sam wyjątek", async () => {
    tables.prompts = [prompt("q1")];
    tables.responses = [{ ...answer("q1"), run_id: "inny-run" }];
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("Brak pytań z ostatniego pomiaru do kalibracji");
    expect(ops).not.toContain("calibrations.insert");
  });

  it("wybiera tylko aktywne pytania z odpowiedziami w pomiarze (zawężone project_id i run_id)", async () => {
    tables.prompts = [prompt("q1"), prompt("q2"), prompt("q3", { active: false })];
    tables.responses = [answer("q1", 1), answer("q1", 2), answer("q3")]; // q2 bez odpowiedzi, q3 nieaktywne
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("REDIRECT:/app/calibration/new-cal-id");
    const rows = payloads["calibration_checks.insert"] as { prompt_id: string; engine_id: string }[];
    expect([...new Set(rows.map((r) => r.prompt_id))]).toEqual(["q1"]);
    expect(rows).toHaveLength(3);
    expect(ops).toContain("responses.select.eq(project_id,p1)");
    expect(ops).toContain("responses.select.eq(run_id,run1)");
  });

  it("czyta odpowiedzi stronami po 1000 wierszy", async () => {
    tables.prompts = [prompt("q1"), prompt("q2")];
    tables.responses = [...Array.from({ length: 1000 }, (_, i) => answer("q1", i)), answer("q2")];
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("REDIRECT:");
    const rows = payloads["calibration_checks.insert"] as { prompt_id: string }[];
    expect([...new Set(rows.map((r) => r.prompt_id))].sort()).toEqual(["q1", "q2"]);
  });

  it("otwarta kalibracja tego samego pomiaru → redirect do niej, bez insertu", async () => {
    tables.calibrations = [{ id: "existing-cal", project_id: "p1", run_id: "run1", status: "open", created_at: "2026-10-12T10:00:00Z" }];
    tables.prompts = [prompt("q1")];
    tables.responses = [answer("q1")];
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("REDIRECT:/app/calibration/existing-cal");
    expect(ops).not.toContain("calibrations.insert");
    expect(ops).toContain("calibrations.select.eq(status,open)");
  });

  it("zakończona kalibracja tego samego pomiaru nie blokuje nowej", async () => {
    tables.calibrations = [{ id: "old-cal", project_id: "p1", run_id: "run1", status: "closed", created_at: "2026-10-12T10:00:00Z" }];
    tables.prompts = [prompt("q1")];
    tables.responses = [answer("q1")];
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("REDIRECT:/app/calibration/new-cal-id");
  });

  it("błąd insertu calibration_checks → usuwa świeżą kalibrację (z project_id) i rzuca oryginalny błąd", async () => {
    tables.prompts = [prompt("q1")];
    tables.responses = [answer("q1")];
    writeErrors["calibration_checks.insert"] = "checks-insert-fail";
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("checks-insert-fail");
    expect(ops).toContain("calibrations.delete");
    expect(ops).toContain("calibrations.delete.eq(project_id,p1)");
    expect(ops).toContain("calibrations.delete.eq(id,new-cal-id)");
  });

  it("sukces → redirect do nowej kalibracji, bez kasowania", async () => {
    tables.prompts = [prompt("q1")];
    tables.responses = [answer("q1")];
    const { createCalibration } = await import("@/app/app/calibration/actions");
    await expect(createCalibration()).rejects.toThrow("REDIRECT:/app/calibration/new-cal-id");
    expect(ops).not.toContain("calibrations.delete");
  });
});

describe("closeCalibration", () => {
  const form = (id: string) => { const f = new FormData(); f.set("id", id); return f; };

  it("otwarta sesja → update zawężony project_id i id, odświeża widoki", async () => {
    tables.calibrations = [{ id: CAL, project_id: "p1", status: "open" }];
    const { closeCalibration } = await import("@/app/app/calibration/actions");
    await closeCalibration(form(CAL));
    expect(ops).toContain("calibrations.update");
    expect(ops).toContain("calibrations.update.eq(project_id,p1)");
    expect(ops).toContain(`calibrations.update.eq(id,${CAL})`);
    expect(revalidatePath).toHaveBeenCalledWith(`/app/calibration/${CAL}`);
  });

  it("już zamknięta → bez błędu i bez update, ale z odświeżeniem", async () => {
    tables.calibrations = [{ id: CAL, project_id: "p1", status: "closed" }];
    const { closeCalibration } = await import("@/app/app/calibration/actions");
    await expect(closeCalibration(form(CAL))).resolves.toBeUndefined();
    expect(ops).not.toContain("calibrations.update");
    expect(revalidatePath).toHaveBeenCalledWith("/app/calibration");
    expect(revalidatePath).toHaveBeenCalledWith(`/app/calibration/${CAL}`);
  });

  it("obca lub nieznana kalibracja → cicho nic, bez update i odświeżenia", async () => {
    tables.calibrations = [{ id: CAL, project_id: "inny-projekt", status: "open" }];
    const { closeCalibration } = await import("@/app/app/calibration/actions");
    await expect(closeCalibration(form(CAL))).resolves.toBeUndefined();
    await expect(closeCalibration(form("nie-uuid"))).resolves.toBeUndefined();
    expect(ops).not.toContain("calibrations.update");
    expect(revalidatePath).not.toHaveBeenCalled();
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

  it("nazwa marki liczy się jako znana fraza (bez zapisu), a do aliasów trafia tylko nowa", async () => {
    const { addAliasFromCalibration } = await import("@/app/app/calibration/actions");
    const brand = new FormData(); brand.set("alias", " polska szkola ai ");
    await addAliasFromCalibration(brand);
    expect(ops).not.toContain("projects.update");
    const fresh = new FormData(); fresh.set("alias", "PSAI.pl");
    await addAliasFromCalibration(fresh);
    expect(payloads["projects.update"]).toEqual({ brand_aliases: ["PSAI", "PSAI.pl"] });
  });
});
