import { describe, it, expect, vi } from "vitest";
import { ensureWorkspaceWith } from "@/lib/workspace";

type DbError = { message: string };
type Opts = {
  membership?: { org_id: string } | null;
  project?: { id: string } | null;
  /** klucz "<tabela>.select" lub "<tabela>.insert" -> błąd zwracany przez klienta */
  errors?: Record<string, DbError>;
};

function fakeAdmin({ membership = null, project = null, errors = {} }: Opts = {}) {
  const inserted: Record<string, unknown[]> = {};
  const from = vi.fn((table: string) => {
    let mode: "select" | "insert" = "select";
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = () => api;
    api.limit = () => api;
    api.order = () => api;
    api.insert = (rows: unknown) => {
      mode = "insert";
      (inserted[table] ??= []).push(rows);
      return api;
    };
    const result = (data: unknown) => {
      const error = errors[`${table}.${mode}`];
      return error ? { data: null, error } : { data, error: null };
    };
    api.maybeSingle = async () =>
      result(table === "memberships" ? membership : table === "projects" ? project : null);
    api.single = async () => result({ id: `${table}-id` });
    // `await insert(...)` bez .select().single()
    api.then = (resolve: (v: unknown) => unknown) => resolve(result(null));
    return api;
  });
  return { client: { from } as never, inserted };
}

const ENGINES = ["openai", "perplexity", "gemini", "google_ai_overview"];

function engineIds(rows: unknown[] | undefined) {
  return (rows?.[0] as { project_id: string; engine_id: string }[]).map((r) => r.engine_id);
}

describe("ensureWorkspace", () => {
  it("tworzy org, członkostwo, projekt i silniki dla nowego użytkownika", async () => {
    const { client, inserted } = fakeAdmin();
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");

    expect(inserted.organizations).toHaveLength(1);
    expect(inserted.memberships).toEqual([{ org_id: "organizations-id", user_id: "user-1", role: "owner" }]);
    expect(inserted.projects).toEqual([
      { org_id: "organizations-id", name: "Mój projekt", brand_name: "Moja marka", brand_aliases: [], domains: [] },
    ]);
    expect(inserted.project_engines).toHaveLength(1);
    expect(engineIds(inserted.project_engines).sort()).toEqual([...ENGINES].sort());
    expect((inserted.project_engines![0] as { project_id: string }[]).every((r) => r.project_id === "projects-id")).toBe(true);
    expect(res).toEqual({ orgId: "organizations-id", projectId: "projects-id" });
  });

  it("nic nie tworzy, gdy członkostwo i projekt istnieją", async () => {
    const { client, inserted } = fakeAdmin({ membership: { org_id: "org-x" }, project: { id: "proj-x" } });
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");
    expect(inserted).toEqual({});
    expect(res).toEqual({ orgId: "org-x", projectId: "proj-x" });
  });

  it("dopisuje projekt i silniki, gdy członkostwo istnieje, ale organizacja nie ma projektu", async () => {
    const { client, inserted } = fakeAdmin({ membership: { org_id: "org-x" }, project: null });
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");

    expect(inserted.organizations).toBeUndefined();
    expect(inserted.memberships).toBeUndefined();
    expect(inserted.projects).toEqual([
      { org_id: "org-x", name: "Mój projekt", brand_name: "Moja marka", brand_aliases: [], domains: [] },
    ]);
    expect(inserted.project_engines).toHaveLength(1);
    expect(engineIds(inserted.project_engines).sort()).toEqual([...ENGINES].sort());
    expect(res.orgId).toBe("org-x");
    expect(res.projectId).toBe("projects-id");
    expect(res.projectId).not.toBe("");
  });

  it("rzuca błąd i nic nie tworzy, gdy odczyt członkostwa się nie powiódł", async () => {
    const { client, inserted } = fakeAdmin({ errors: { "memberships.select": { message: "connection reset" } } });
    await expect(ensureWorkspaceWith(client, "user-1", "a@b.pl")).rejects.toThrow(/connection reset/);
    expect(inserted).toEqual({});
  });

  it("rzuca błąd, gdy zapis organizacji się nie powiódł", async () => {
    const { client, inserted } = fakeAdmin({ errors: { "organizations.insert": { message: "rls denied" } } });
    await expect(ensureWorkspaceWith(client, "user-1", "a@b.pl")).rejects.toThrow(/rls denied/);
    expect(inserted.memberships).toBeUndefined();
  });
});
