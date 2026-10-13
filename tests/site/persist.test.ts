import { describe, it, expect, vi } from "vitest";
import { persistSitePages, type CrawledPage } from "@/lib/site/crawl";

type DbError = { message: string };
type Opts = {
  stored?: { id: string; url: string }[];
  /** klucz "upsert" | "select" | "update" -> błąd zwracany przez klienta */
  errors?: Partial<Record<"upsert" | "select" | "update", DbError>>;
};

function fakeAdmin({ stored = [], errors = {} }: Opts = {}) {
  const calls = { upsert: [] as { rows: unknown; opts: unknown }[], update: [] as { values: unknown; ids: unknown }[], select: 0, eq: [] as unknown[][] };
  const from = vi.fn((table: string) => {
    expect(table).toBe("site_pages");
    return {
      upsert: async (rows: unknown, opts: unknown) => {
        calls.upsert.push({ rows, opts });
        return { error: errors.upsert ?? null };
      },
      select: () => ({
        eq: async (...args: unknown[]) => {
          calls.select++; calls.eq.push(args);
          return errors.select ? { data: null, error: errors.select } : { data: stored, error: null };
        },
      }),
      update: (values: unknown) => ({
        in: async (_col: string, ids: unknown) => {
          calls.update.push({ values, ids });
          return { error: errors.update ?? null };
        },
      }),
    };
  });
  return { client: { from } as never, calls, from };
}

const page = (path: string, status = 200): CrawledPage => ({ url: `https://x.pl${path}`, path, title: "T", h1: "H", description: "D", excerpt: "E", status });

describe("persistSitePages", () => {
  it("upsertuje wiersze po (project_id,url) i wygasza (410) strony nieobecne w crawlu", async () => {
    const { client, calls } = fakeAdmin({ stored: [{ id: "1", url: "https://x.pl/a" }, { id: "2", url: "https://x.pl/old" }, { id: "3", url: "https://x.pl/b" }] });
    const res = await persistSitePages(client, "proj", [page("/a"), page("/b", 404)]);
    expect(res).toEqual({ upserted: 2, retired: 1 });
    expect(calls.upsert).toHaveLength(1);
    expect(calls.upsert[0].opts).toEqual({ onConflict: "project_id,url" });
    const rows = calls.upsert[0].rows as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ project_id: "proj", url: "https://x.pl/a", path: "/a", title: "T", h1: "H", description: "D", excerpt: "E", status: 200 });
    expect(rows[1]).toMatchObject({ url: "https://x.pl/b", status: 404 });
    expect(typeof rows[0].fetched_at).toBe("string");
    expect(calls.eq[0]).toEqual(["project_id", "proj"]);
    expect(calls.update).toEqual([{ values: { status: 410 }, ids: ["2"] }]);
  });

  it("nic do wygaszenia → brak update", async () => {
    const { client, calls } = fakeAdmin({ stored: [{ id: "1", url: "https://x.pl/a" }] });
    expect(await persistSitePages(client, "proj", [page("/a")])).toEqual({ upserted: 1, retired: 0 });
    expect(calls.update).toHaveLength(0);
  });

  it("pusty wynik crawla nie dotyka bazy ani nie wygasza stron", async () => {
    const { client, calls, from } = fakeAdmin({ stored: [{ id: "1", url: "https://x.pl/a" }] });
    expect(await persistSitePages(client, "proj", [])).toEqual({ upserted: 0, retired: 0 });
    expect(from).not.toHaveBeenCalled();
    expect(calls.update).toHaveLength(0);
  });

  it("błąd upsert/select/update → wyjątek", async () => {
    const stored = [{ id: "2", url: "https://x.pl/old" }];
    await expect(persistSitePages(fakeAdmin({ errors: { upsert: { message: "boom-u" } } }).client, "p", [page("/a")])).rejects.toThrow("boom-u");
    await expect(persistSitePages(fakeAdmin({ errors: { select: { message: "boom-s" } } }).client, "p", [page("/a")])).rejects.toThrow("boom-s");
    await expect(persistSitePages(fakeAdmin({ stored, errors: { update: { message: "boom-up" } } }).client, "p", [page("/a")])).rejects.toThrow("boom-up");
  });
});
