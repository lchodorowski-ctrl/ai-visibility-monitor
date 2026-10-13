import { describe, it, expect } from "vitest";
import { Client } from "pg";

const url = process.env.SUPABASE_DB_URL;

const ORG = "11111111-1111-1111-1111-111111111111";
const MEMBER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OUTSIDER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROJECT = "22222222-2222-2222-2222-222222222222";

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

  it("anon i nie-członek nie widzą rekomendacji, członek org widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();

    const countRecommendationsAs = async (role: "anon" | "authenticated", claims: object) => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        const res = await c.query(`select count(*)::int as n from recommendations`);
        return res.rows[0].n as number;
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    const fingerprint = "rls-test-recommendation";
    try {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);
      await c.query(
        `insert into recommendations (project_id, type, title, summary, impact, effort, fingerprint)
         values ($1, 'technical', 'RLS test', 'RLS test', 3, 2, $2)`,
        [PROJECT, fingerprint],
      );

      const anon = await countRecommendationsAs("anon", {});
      const outsider = await countRecommendationsAs("authenticated", { sub: OUTSIDER, role: "authenticated" });
      const member = await countRecommendationsAs("authenticated", { sub: MEMBER, role: "authenticated" });

      expect(anon).toBe(0);
      expect(outsider).toBe(0);
      expect(member).toBeGreaterThan(0);
    } finally {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      await c.query(`delete from recommendations where project_id = $1 and fingerprint = $2`, [PROJECT, fingerprint]);
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    }
  });

  it("anon i nie-członek nie widzą kalibracji ani ich punktów, członek org widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();

    const countCalibrationRowsAs = async (role: "anon" | "authenticated", claims: object, calibrationId: string) => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        const res = await c.query(
          `select (select count(*) from calibrations where id = $1)::int as calibrations,
                  (select count(*) from calibration_checks where calibration_id = $1)::int as checks`,
          [calibrationId],
        );
        return { calibrations: res.rows[0].calibrations as number, checks: res.rows[0].checks as number };
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    let calibrationId: string | undefined;
    try {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);

      const prompt = await c.query(`select id from prompts where project_id = $1 limit 1`, [PROJECT]);
      const promptId = prompt.rows[0].id as string;
      const cal = await c.query(`insert into calibrations (project_id) values ($1) returning id`, [PROJECT]);
      calibrationId = cal.rows[0].id as string;
      await c.query(
        `insert into calibration_checks (calibration_id, project_id, prompt_id, engine_id)
         values ($1, $2, $3, 'openai')`,
        [calibrationId, PROJECT, promptId],
      );

      const anon = await countCalibrationRowsAs("anon", {}, calibrationId);
      const outsider = await countCalibrationRowsAs("authenticated", { sub: OUTSIDER, role: "authenticated" }, calibrationId);
      const member = await countCalibrationRowsAs("authenticated", { sub: MEMBER, role: "authenticated" }, calibrationId);

      expect(anon).toEqual({ calibrations: 0, checks: 0 });
      expect(outsider).toEqual({ calibrations: 0, checks: 0 });
      expect(member).toEqual({ calibrations: 1, checks: 1 });
    } finally {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      if (calibrationId) {
        await c.query(`delete from calibrations where id = $1`, [calibrationId]);
      }
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    }
  });
});
