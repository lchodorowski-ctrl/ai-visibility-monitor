import { describe, it, expect, vi } from "vitest";
import { ensureWorkspaceWith } from "@/lib/workspace";

function fakeAdmin(existingMembership: { org_id: string } | null) {
  const inserted: Record<string, unknown[]> = {};
  const from = vi.fn((table: string) => {
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = () => api;
    api.limit = () => api;
    api.maybeSingle = async () => ({ data: table === "memberships" ? existingMembership : null, error: null });
    api.single = async () => ({ data: { id: `${table}-id` }, error: null });
    api.insert = (rows: unknown) => { (inserted[table] ??= []).push(rows); return api; };
    api.order = () => api;
    return api;
  });
  return { client: { from } as never, inserted };
}

describe("ensureWorkspace", () => {
  it("tworzy org, projekt i członkostwo dla nowego użytkownika", async () => {
    const { client, inserted } = fakeAdmin(null);
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");
    expect(inserted.organizations).toHaveLength(1);
    expect(inserted.memberships).toHaveLength(1);
    expect(inserted.projects).toHaveLength(1);
    expect(res.orgId).toBe("organizations-id");
  });

  it("nic nie tworzy, gdy członkostwo istnieje", async () => {
    const { client, inserted } = fakeAdmin({ org_id: "org-x" });
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");
    expect(inserted.organizations).toBeUndefined();
    expect(res.orgId).toBe("org-x");
  });
});
