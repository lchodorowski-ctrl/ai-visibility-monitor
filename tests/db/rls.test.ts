import { describe, it, expect } from "vitest";
import { Client } from "pg";

const url = process.env.SUPABASE_DB_URL;

const ORG = "11111111-1111-1111-1111-111111111111";
const MEMBER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OUTSIDER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe.skipIf(!url)("RLS", () => {
  it("anon i nie-członek nie widzą promptów, członek org widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();

    // Konfiguracja sesyjna (is_local = false): klient pg działa w autocommit,
    // więc konfiguracja lokalna dla transakcji znikałaby przed kolejnym zapytaniem.
    const countPromptsAs = async (role: "anon" | "authenticated", claims: object) => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        const res = await c.query(`select count(*)::int as n from prompts`);
        return res.rows[0].n as number;
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    try {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);

      const anon = await countPromptsAs("anon", {});
      const outsider = await countPromptsAs("authenticated", { sub: OUTSIDER, role: "authenticated" });
      const member = await countPromptsAs("authenticated", { sub: MEMBER, role: "authenticated" });

      expect(anon).toBe(0);
      expect(outsider).toBe(0);
      expect(member).toBeGreaterThan(0);
    } finally {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    }
  });
});
