import { describe, it, expect } from "vitest";
import { Client } from "pg";

const url = process.env.SUPABASE_DB_URL;

describe.skipIf(!url)("RLS", () => {
  it("anon nie widzi promptów, członek org widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    const uid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await c.query(`insert into auth.users (id, email) values ($1, 'rls@test.local') on conflict do nothing`, [uid]);
    await c.query(`insert into memberships (org_id, user_id) values ('11111111-1111-1111-1111-111111111111', $1) on conflict do nothing`, [uid]);

    await c.query(`set role anon; select set_config('request.jwt.claims', '{}', true);`);
    const anon = await c.query(`select count(*)::int as n from prompts`);
    await c.query(`reset role`);

    await c.query(`set role authenticated;`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const member = await c.query(`select count(*)::int as n from prompts`);
    await c.query(`reset role`);
    await c.end();

    expect(anon.rows[0].n).toBe(0);
    expect(member.rows[0].n).toBeGreaterThan(0);
  });
});
