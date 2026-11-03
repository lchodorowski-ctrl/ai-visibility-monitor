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

  it("anon i nie-członek nie widzą zadań SEO, członek org widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();

    const countSeoJobsAs = async (role: "anon" | "authenticated", claims: object, jobId: string) => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        const res = await c.query(`select count(*)::int as n from seo_jobs where id = $1`, [jobId]);
        return res.rows[0].n as number;
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    let jobId: string | undefined;
    try {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);

      const job = await c.query(`insert into seo_jobs (project_id, kind) values ($1, 'gsc_sync') returning id`, [PROJECT]);
      jobId = job.rows[0].id as string;

      const anon = await countSeoJobsAs("anon", {}, jobId);
      const outsider = await countSeoJobsAs("authenticated", { sub: OUTSIDER, role: "authenticated" }, jobId);
      const member = await countSeoJobsAs("authenticated", { sub: MEMBER, role: "authenticated" }, jobId);

      expect(anon).toBe(0);
      expect(outsider).toBe(0);
      expect(member).toBe(1);
    } finally {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      if (jobId) {
        await c.query(`delete from seo_jobs where id = $1`, [jobId]);
      }
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    }
  });

  it("anon i nie-członek nie widzą fraz ani podpowiedzi, członek widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();

    const countKeywordRowsAs = async (role: "anon" | "authenticated", claims: object, keywordId: string, suggestionId: string) => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        const keywords = await c.query(`select count(*)::int as n from keywords where id = $1`, [keywordId]);
        const suggestions = await c.query(`select count(*)::int as n from keyword_suggestions where id = $1`, [suggestionId]);
        return { keywords: keywords.rows[0].n as number, suggestions: suggestions.rows[0].n as number };
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    let keywordId: string | undefined;
    let suggestionId: string | undefined;
    try {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);

      const keyword = await c.query(
        `insert into keywords (project_id, text, key, source) values ($1, 'Szkolenia AI Łódź', 'szkolenia ai łódź', 'manual') returning id`,
        [PROJECT],
      );
      keywordId = keyword.rows[0].id as string;
      const suggestion = await c.query(
        `insert into keyword_suggestions (project_id, key, text, source) values ($1, 'kursy ai łódź', 'Kursy AI Łódź', 'labs') returning id`,
        [PROJECT],
      );
      suggestionId = suggestion.rows[0].id as string;

      const anon = await countKeywordRowsAs("anon", {}, keywordId, suggestionId);
      const outsider = await countKeywordRowsAs("authenticated", { sub: OUTSIDER, role: "authenticated" }, keywordId, suggestionId);
      const member = await countKeywordRowsAs("authenticated", { sub: MEMBER, role: "authenticated" }, keywordId, suggestionId);

      expect(anon).toEqual({ keywords: 0, suggestions: 0 });
      expect(outsider).toEqual({ keywords: 0, suggestions: 0 });
      expect(member).toEqual({ keywords: 1, suggestions: 1 });
    } finally {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      if (keywordId) {
        await c.query(`delete from keywords where id = $1`, [keywordId]);
      }
      if (suggestionId) {
        await c.query(`delete from keyword_suggestions where id = $1`, [suggestionId]);
      }
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    }
  });

  describe("Search Console", () => {
    const PHRASE = "szkolenia ai wrocław łódź";
    const PREV_DAY = "2020-01-01";
    const CUR_DAY = "2020-01-02";
    const DAYS = [PREV_DAY, CUR_DAY];

    const connect = async () => {
      const c = new Client({ connectionString: url });
      await c.connect();
      return c;
    };

    const asRole = async <T>(
      c: Client,
      role: "anon" | "authenticated",
      claims: object,
      run: () => Promise<T>,
    ): Promise<T> => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        return await run();
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    const prepareUsers = async (c: Client) => {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);
    };

    const cleanup = async (c: Client) => {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      for (const table of ["gsc_site_daily", "gsc_page_daily", "gsc_query_daily"]) {
        await c.query(`delete from ${table} where project_id = $1 and date = any($2::date[])`, [PROJECT, DAYS]);
      }
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    };

    // Superuser (bez RLS) wstawia dane dwóch dni: poprzednie okno = PREV_DAY, bieżące = CUR_DAY.
    const seed = async (c: Client) => {
      await c.query(
        `insert into gsc_site_daily (project_id, date, clicks, impressions, position) values
           ($1, $2, 10, 100, 5.00),
           ($1, $3, 20, 300, 9.00)`,
        [PROJECT, PREV_DAY, CUR_DAY],
      );
      await c.query(
        `insert into gsc_page_daily (project_id, date, page, clicks, impressions, position) values
           ($1, $2, '/a', 6, 60, 4.00),
           ($1, $3, '/a', 14, 140, 6.00),
           ($1, $2, '/b', 4, 40, 10.00),
           ($1, $3, '/b', 6, 160, 10.00),
           ($1, $3, '/c', 20, 100, 3.00)`,
        [PROJECT, PREV_DAY, CUR_DAY],
      );
      await c.query(
        `insert into gsc_query_daily (project_id, date, query, page, device, clicks, impressions, position) values
           ($1, $2, $4, '/a', 'desktop', 2, 50, 4.00),
           ($1, $3, $4, '/a', 'desktop', 5, 100, 3.00),
           ($1, $3, $4, '/b', 'mobile', 1, 100, 7.00),
           ($1, $3, 'tylko w nowym oknie', '/a', 'desktop', 1, 30, 12.00),
           ($1, $2, 'tylko w starym oknie', '/b', 'tablet', 0, 500, 20.00)`,
        [PROJECT, PREV_DAY, CUR_DAY, PHRASE],
      );
    };

    const MEMBER_CLAIMS = { sub: MEMBER, role: "authenticated" };
    const OUTSIDER_CLAIMS = { sub: OUTSIDER, role: "authenticated" };

    it("GSC: anon i nie-członek nie widzą danych ani agregatów, członek widzi", async () => {
      const c = await connect();

      const calls = {
        totals: { sql: `select * from gsc_totals($1, $2, $3)`, params: [PROJECT, PREV_DAY, CUR_DAY] },
        topPages: { sql: `select * from gsc_top_pages($1, $2, $3, 10)`, params: [PROJECT, PREV_DAY, CUR_DAY] },
        windows: {
          sql: `select * from gsc_query_windows($1, $2, $3, $4, $5, 10)`,
          params: [PROJECT, CUR_DAY, CUR_DAY, PREV_DAY, PREV_DAY],
        },
        queryPages: { sql: `select * from gsc_query_pages($1, $2, $3, 0)`, params: [PROJECT, PREV_DAY, CUR_DAY] },
      };

      const countTables = (role: "anon" | "authenticated", claims: object) =>
        asRole(c, role, claims, async () => {
          const res = await c.query(
            `select (select count(*) from gsc_site_daily where project_id = $1 and date = any($2::date[]))::int as site,
                    (select count(*) from gsc_page_daily where project_id = $1 and date = any($2::date[]))::int as pages,
                    (select count(*) from gsc_query_daily where project_id = $1 and date = any($2::date[]))::int as queries`,
            [PROJECT, DAYS],
          );
          return res.rows[0] as { site: number; pages: number; queries: number };
        });

      const callAs = (role: "anon" | "authenticated", claims: object, name: keyof typeof calls) =>
        asRole(c, role, claims, async () => (await c.query(calls[name].sql, calls[name].params)).rows);

      const read = async (role: "anon" | "authenticated", claims: object) => ({
        counts: await countTables(role, claims),
        totals: await callAs(role, claims, "totals"),
        topPages: await callAs(role, claims, "topPages"),
        windows: await callAs(role, claims, "windows"),
        queryPages: await callAs(role, claims, "queryPages"),
      });

      try {
        await prepareUsers(c);
        await seed(c);

        // Funkcje działają jako security definer, więc anon nie ma do nich EXECUTE (revoke), tabele dalej chroni RLS.
        expect(await countTables("anon", {})).toEqual({ site: 0, pages: 0, queries: 0 });
        for (const name of Object.keys(calls) as (keyof typeof calls)[]) {
          await expect(callAs("anon", {}, name)).rejects.toMatchObject({ code: "42501" });
        }

        const outsider = await read("authenticated", OUTSIDER_CLAIMS);
        const member = await read("authenticated", MEMBER_CLAIMS);

        expect(outsider.counts).toEqual({ site: 0, pages: 0, queries: 0 });
        expect(outsider.totals).toHaveLength(1);
        expect(outsider.totals[0].clicks).toBeNull();
        expect(outsider.totals[0].impressions).toBeNull();
        expect(outsider.totals[0].position).toBeNull();
        expect(outsider.topPages).toEqual([]);
        expect(outsider.windows).toEqual([]);
        expect(outsider.queryPages).toEqual([]);

        expect(member.counts).toEqual({ site: 2, pages: 5, queries: 5 });
        expect(Number(member.totals[0].clicks)).toBe(30);
        expect(member.windows.map((r) => r.query)).toContain(PHRASE);
        expect(member.queryPages.filter((r) => r.query === PHRASE)).toHaveLength(2);
      } finally {
        await cleanup(c);
      }
    });

    it("GSC: funkcje wpuszczają tylko członka organizacji projektu, także członka innej organizacji nie", async () => {
      const c = await connect();
      const OTHER_ORG = "33333333-3333-3333-3333-333333333333";
      const OTHER_PROJECT = "44444444-4444-4444-4444-444444444444";
      const totalsOf = (uid: string, project: string) =>
        asRole(c, "authenticated", { sub: uid, role: "authenticated" }, async () => {
          const res = await c.query(`select * from gsc_totals($1, $2, $3)`, [project, PREV_DAY, CUR_DAY]);
          const pages = await c.query(`select * from gsc_top_pages($1, $2, $3, 10)`, [project, PREV_DAY, CUR_DAY]);
          return { clicks: res.rows[0].clicks === null ? null : Number(res.rows[0].clicks), pages: pages.rows.length };
        });

      try {
        await prepareUsers(c);
        await c.query(`insert into organizations (id, name) values ($1, 'RLS test org') on conflict do nothing`, [OTHER_ORG]);
        await c.query(
          `insert into projects (id, org_id, name, brand_name) values ($1, $2, 'RLS test project', 'RLS test') on conflict do nothing`,
          [OTHER_PROJECT, OTHER_ORG],
        );
        await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [OTHER_ORG, OUTSIDER]);
        await seed(c);
        await c.query(`insert into gsc_site_daily (project_id, date, clicks, impressions, position) values ($1, $2, 7, 70, 3.00)`, [
          OTHER_PROJECT, CUR_DAY,
        ]);
        await c.query(`insert into gsc_page_daily (project_id, date, page, clicks, impressions, position) values ($1, $2, '/x', 7, 70, 3.00)`, [
          OTHER_PROJECT, CUR_DAY,
        ]);

        // każdy widzi swój projekt i nic z cudzego, mimo że obaj są zalogowanymi członkami jakiejś organizacji
        expect(await totalsOf(MEMBER, PROJECT)).toEqual({ clicks: 30, pages: 3 });
        expect(await totalsOf(MEMBER, OTHER_PROJECT)).toEqual({ clicks: null, pages: 0 });
        expect(await totalsOf(OUTSIDER, OTHER_PROJECT)).toEqual({ clicks: 7, pages: 1 });
        expect(await totalsOf(OUTSIDER, PROJECT)).toEqual({ clicks: null, pages: 0 });
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
        await c.query(`delete from projects where id = $1`, [OTHER_PROJECT]);
        await c.query(`delete from organizations where id = $1`, [OTHER_ORG]);
        await cleanup(c);
      }
    });

    it("GSC: agregaty ważą pozycję wyświetleniami, łączą okna i stosują limit w SQL", async () => {
      const c = await connect();
      const asMember = <T>(run: () => Promise<T>) => asRole(c, "authenticated", MEMBER_CLAIMS, run);

      try {
        await prepareUsers(c);
        await seed(c);

        await asMember(async () => {
          const totals = await c.query(`select * from gsc_totals($1, $2, $3)`, [PROJECT, PREV_DAY, CUR_DAY]);
          expect(totals.rows).toHaveLength(1);
          expect(Number(totals.rows[0].clicks)).toBe(30);
          expect(Number(totals.rows[0].impressions)).toBe(400);
          // (5*100 + 9*300) / 400, a nie zwykła średnia 7
          expect(Number(totals.rows[0].position)).toBeCloseTo(8, 5);

          const empty = await c.query(`select * from gsc_totals($1, $2, $3)`, [PROJECT, "2019-01-01", "2019-01-02"]);
          expect(empty.rows).toEqual([{ clicks: null, impressions: null, position: null }]);

          // /a i /c mają po 20 kliknięć, o kolejności decydują wyświetlenia
          const pages = await c.query(`select * from gsc_top_pages($1, $2, $3, 10)`, [PROJECT, PREV_DAY, CUR_DAY]);
          expect(pages.rows.map((r) => r.page)).toEqual(["/a", "/c", "/b"]);
          expect(Number(pages.rows[0].clicks)).toBe(20);
          expect(Number(pages.rows[0].impressions)).toBe(200);
          expect(Number(pages.rows[0].position)).toBeCloseTo(5.4, 5);
          const limited = await c.query(`select * from gsc_top_pages($1, $2, $3, 2)`, [PROJECT, PREV_DAY, CUR_DAY]);
          expect(limited.rows.map((r) => r.page)).toEqual(["/a", "/c"]);

          const windows = await c.query(`select * from gsc_query_windows($1, $2, $3, $4, $5, 10)`, [
            PROJECT, CUR_DAY, CUR_DAY, PREV_DAY, PREV_DAY,
          ]);
          // sortowanie po greatest(cur_impressions, prev_impressions): 500, 200, 30
          expect(windows.rows.map((r) => r.query)).toEqual(["tylko w starym oknie", PHRASE, "tylko w nowym oknie"]);
          const [old, both, fresh] = windows.rows;
          expect(Number(old.cur_clicks)).toBe(0);
          expect(Number(old.cur_impressions)).toBe(0);
          expect(old.cur_position).toBeNull();
          expect(Number(old.prev_impressions)).toBe(500);
          expect(Number(old.prev_position)).toBeCloseTo(20, 5);
          // aktualne okno: obie strony i oba urządzenia zsumowane, pozycja (3*100 + 7*100) / 200
          expect(Number(both.cur_clicks)).toBe(6);
          expect(Number(both.cur_impressions)).toBe(200);
          expect(Number(both.cur_position)).toBeCloseTo(5, 5);
          expect(Number(both.prev_clicks)).toBe(2);
          expect(Number(both.prev_impressions)).toBe(50);
          expect(Number(both.prev_position)).toBeCloseTo(4, 5);
          expect(Number(fresh.cur_impressions)).toBe(30);
          expect(Number(fresh.prev_clicks)).toBe(0);
          expect(Number(fresh.prev_impressions)).toBe(0);
          expect(fresh.prev_position).toBeNull();
          const windowsLimited = await c.query(`select * from gsc_query_windows($1, $2, $3, $4, $5, 2)`, [
            PROJECT, CUR_DAY, CUR_DAY, PREV_DAY, PREV_DAY,
          ]);
          expect(windowsLimited.rows.map((r) => r.query)).toEqual(["tylko w starym oknie", PHRASE]);

          // tylko fraza na co najmniej dwóch stronach; próg dotyczy łącznych wyświetleń frazy (250)
          const shared = await c.query(`select * from gsc_query_pages($1, $2, $3, 250)`, [PROJECT, PREV_DAY, CUR_DAY]);
          expect(shared.rows.map((r) => [r.query, r.page])).toEqual([[PHRASE, "/a"], [PHRASE, "/b"]]);
          expect(Number(shared.rows[0].clicks)).toBe(7);
          expect(Number(shared.rows[0].impressions)).toBe(150);
          expect(Number(shared.rows[0].position)).toBeCloseTo(10 / 3, 4);
          expect(Number(shared.rows[1].impressions)).toBe(100);
          const tooHigh = await c.query(`select * from gsc_query_pages($1, $2, $3, 251)`, [PROJECT, PREV_DAY, CUR_DAY]);
          expect(tooHigh.rows).toEqual([]);
          // w poprzednim dniu fraza stoi tylko na jednej stronie
          const prevOnly = await c.query(`select * from gsc_query_pages($1, $2, $3, 0)`, [PROJECT, PREV_DAY, PREV_DAY]);
          expect(prevOnly.rows).toEqual([]);
        });
      } finally {
        await cleanup(c);
      }
    });
  });

  describe("Pozycje w Google", () => {
    const WEEK_1 = "2020-01-06";
    const WEEK_2 = "2020-01-13";
    const WEEK_3 = "2020-01-20";
    const KEYS = ["rls rank test a", "rls rank test b", "rls rank test c"];
    const DETAIL_PHRASE = "rls rank detail fraza";
    const DETAIL_DAYS = ["2020-02-01", "2020-02-02", "2020-02-03"];
    const MEMBER_CLAIMS = { sub: MEMBER, role: "authenticated" };
    const OUTSIDER_CLAIMS = { sub: OUTSIDER, role: "authenticated" };

    const connect = async () => {
      const c = new Client({ connectionString: url });
      await c.connect();
      return c;
    };

    const asRole = async <T>(
      c: Client,
      role: "anon" | "authenticated",
      claims: object,
      run: () => Promise<T>,
    ): Promise<T> => {
      try {
        await c.query(`set role ${role}`);
        await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
        return await run();
      } finally {
        await c.query(`reset role`);
        await c.query(`select set_config('request.jwt.claims', '', false)`);
      }
    };

    const prepareUsers = async (c: Client) => {
      for (const uid of [MEMBER, OUTSIDER]) {
        await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, `${uid}@rls.test.local`]);
      }
      await c.query(`insert into memberships (org_id, user_id) values ($1, $2) on conflict do nothing`, [ORG, MEMBER]);
    };

    // Usunięcie fraz kasuje kaskadowo ich pomiary (rank_checks).
    const cleanup = async (c: Client) => {
      await c.query(`reset role`);
      await c.query(`select set_config('request.jwt.claims', '', false)`);
      await c.query(`delete from keywords where project_id = $1 and key = any($2::text[])`, [PROJECT, KEYS]);
      await c.query(`delete from gsc_query_daily where project_id = $1 and date = any($2::date[])`, [PROJECT, DETAIL_DAYS]);
      await c.query(`delete from memberships where user_id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.query(`delete from auth.users where id = any($1::uuid[])`, [[MEMBER, OUTSIDER]]);
      await c.end();
    };

    const insertKeyword = async (c: Client, key: string) => {
      const res = await c.query(
        `insert into keywords (project_id, text, key, source) values ($1, $2, $2, 'manual') returning id`,
        [PROJECT, key],
      );
      return res.rows[0].id as string;
    };

    const insertCheck = (
      c: Client,
      keywordId: string,
      device: "desktop" | "mobile",
      weekStart: string,
      status: "pending" | "done" | "failed",
      position: number | null,
    ) =>
      c.query(
        `insert into rank_checks (project_id, keyword_id, device, week_start, status, position, checked_at)
         values ($1, $2, $3, $4, $5, $6, case when $5 = 'done' then now() end)`,
        [PROJECT, keywordId, device, weekStart, status, position],
      );

    // fraza A: desktop done 52 -> done poza top 100 -> pending, mobile jeden pomiar done 7;
    // fraza B: done poza top 100 -> done 12 -> failed; fraza C: tylko pending.
    const seedChecks = async (c: Client) => {
      const a = await insertKeyword(c, KEYS[0]);
      const b = await insertKeyword(c, KEYS[1]);
      const cc = await insertKeyword(c, KEYS[2]);
      await insertCheck(c, a, "desktop", WEEK_1, "done", 52);
      await insertCheck(c, a, "desktop", WEEK_2, "done", null);
      await insertCheck(c, a, "desktop", WEEK_3, "pending", null);
      await insertCheck(c, a, "mobile", WEEK_2, "done", 7);
      await insertCheck(c, b, "desktop", WEEK_1, "done", null);
      await insertCheck(c, b, "desktop", WEEK_2, "done", 12);
      await insertCheck(c, b, "desktop", WEEK_3, "failed", null);
      await insertCheck(c, cc, "desktop", WEEK_3, "pending", null);
      return { a, b, c: cc };
    };

    const seedDetail = async (c: Client) => {
      await c.query(
        `insert into gsc_query_daily (project_id, date, query, page, device, clicks, impressions, position) values
           ($1, '2020-02-01', $2, '/a', 'desktop', 2, 50, 4.00),
           ($1, '2020-02-02', $2, '/a', 'desktop', 5, 100, 3.00),
           ($1, '2020-02-02', $2, '/b', 'mobile', 1, 300, 8.00),
           ($1, '2020-02-02', 'inna fraza rls', '/c', 'desktop', 9, 900, 1.00),
           ($1, '2020-02-03', $2, '/a', 'desktop', 100, 1000, 1.00)`,
        [PROJECT, DETAIL_PHRASE],
      );
    };

    it("rank_checks: anon i nie-członek nie widzą, członek widzi", async () => {
      const c = await connect();
      const countAs = (role: "anon" | "authenticated", claims: object, keywordId: string) =>
        asRole(c, role, claims, async () => {
          const res = await c.query(`select count(*)::int as n from rank_checks where keyword_id = $1`, [keywordId]);
          return res.rows[0].n as number;
        });

      try {
        await prepareUsers(c);
        const ids = await seedChecks(c);

        expect(await countAs("anon", {}, ids.a)).toBe(0);
        expect(await countAs("authenticated", OUTSIDER_CLAIMS, ids.a)).toBe(0);
        expect(await countAs("authenticated", MEMBER_CLAIMS, ids.a)).toBe(4);
      } finally {
        await cleanup(c);
      }
    });

    it("rank_latest zwraca najnowszy done i poprzednią pozycję, pomija pending", async () => {
      const c = await connect();

      try {
        await prepareUsers(c);
        const ids = await seedChecks(c);

        const rows = await asRole(c, "authenticated", MEMBER_CLAIMS, async () => {
          const res = await c.query(`select * from rank_latest($1) where keyword_id = any($2::uuid[]) order by keyword_id, device`, [
            PROJECT, [ids.a, ids.b, ids.c],
          ]);
          return res.rows;
        });
        const pick = (keywordId: string, device: string) => rows.find((r) => r.keyword_id === keywordId && r.device === device);
        // pg zwraca kolumnę date jako Date o północy czasu lokalnego, więc składamy datę z lokalnych części (nie z UTC)
        const day = (d: Date | null) =>
          d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;

        // tylko pary z co najmniej jednym pomiarem done: A desktop, A mobile, B desktop
        expect(rows).toHaveLength(3);
        expect(pick(ids.c, "desktop")).toBeUndefined();

        // A desktop: pending z tygodnia 3 pominięty; najnowszy done to tydzień 2 (poza top 100), poprzedni tydzień 1 na 52
        const aDesktop = pick(ids.a, "desktop");
        expect(day(aDesktop.week_start)).toBe(WEEK_2);
        expect(aDesktop.position).toBeNull();
        expect(day(aDesktop.prev_week_start)).toBe(WEEK_1);
        expect(aDesktop.prev_position).toBe(52);
        expect(aDesktop.checked_at).not.toBeNull();

        // A mobile: pierwszy pomiar, brak poprzedniego
        const aMobile = pick(ids.a, "mobile");
        expect(day(aMobile.week_start)).toBe(WEEK_2);
        expect(aMobile.position).toBe(7);
        expect(aMobile.prev_week_start).toBeNull();
        expect(aMobile.prev_position).toBeNull();

        // B desktop: failed z tygodnia 3 pominięty; poprzedni pomiar był poza top 100 (prev_position null przy prev_week_start)
        const bDesktop = pick(ids.b, "desktop");
        expect(day(bDesktop.week_start)).toBe(WEEK_2);
        expect(bDesktop.position).toBe(12);
        expect(day(bDesktop.prev_week_start)).toBe(WEEK_1);
        expect(bDesktop.prev_position).toBeNull();
      } finally {
        await cleanup(c);
      }
    });

    it("rank_latest i gsc_query_detail: nie-członek dostaje 0 wierszy, anon błąd 42501", async () => {
      const c = await connect();
      const calls = {
        latest: { sql: `select * from rank_latest($1)`, params: [PROJECT] },
        detail: { sql: `select * from gsc_query_detail($1, $2, $3, $4)`, params: [PROJECT, DETAIL_PHRASE, "2020-02-01", "2020-02-03"] },
      };
      const callAs = (role: "anon" | "authenticated", claims: object, name: keyof typeof calls) =>
        asRole(c, role, claims, async () => (await c.query(calls[name].sql, calls[name].params)).rows);

      try {
        await prepareUsers(c);
        const ids = await seedChecks(c);
        await seedDetail(c);

        for (const name of Object.keys(calls) as (keyof typeof calls)[]) {
          await expect(callAs("anon", {}, name)).rejects.toMatchObject({ code: "42501" });
          expect(await callAs("authenticated", OUTSIDER_CLAIMS, name)).toEqual([]);
        }

        // kontrola pozytywna: członek dostaje dane z obu funkcji
        const latest = await callAs("authenticated", MEMBER_CLAIMS, "latest");
        expect(latest.filter((r) => [ids.a, ids.b].includes(r.keyword_id))).toHaveLength(3);
        expect((await callAs("authenticated", MEMBER_CLAIMS, "detail")).length).toBeGreaterThan(0);
      } finally {
        await cleanup(c);
      }
    });

    it("gsc_query_detail sumuje frazę po stronach, waży pozycję wyświetleniami i sortuje po wyświetleniach", async () => {
      const c = await connect();

      try {
        await prepareUsers(c);
        await seedDetail(c);

        const rows = await asRole(c, "authenticated", MEMBER_CLAIMS, async () => {
          const res = await c.query(`select * from gsc_query_detail($1, $2, $3, $4)`, [
            PROJECT, DETAIL_PHRASE, "2020-02-01", "2020-02-02",
          ]);
          return res.rows;
        });

        // tylko szukana fraza, tylko okno dat (bez 2020-02-03); /b ma więcej wyświetleń niż /a
        expect(rows.map((r) => r.page)).toEqual(["/b", "/a"]);
        expect(Number(rows[0].clicks)).toBe(1);
        expect(Number(rows[0].impressions)).toBe(300);
        expect(Number(rows[0].position)).toBeCloseTo(8, 5);
        expect(Number(rows[1].clicks)).toBe(7);
        expect(Number(rows[1].impressions)).toBe(150);
        // (4*50 + 3*100) / 150, a nie zwykła średnia 3.5
        expect(Number(rows[1].position)).toBeCloseTo(10 / 3, 4);
      } finally {
        await cleanup(c);
      }
    });
  });
});
