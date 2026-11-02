# Moduł Google (M0 + M1): odłożone uwagi i decyzje

Data: 2026-11-02. Plan: `docs/superpowers/plans/2026-11-02-google-seo-m0-m1.md`, spec: `docs/superpowers/specs/2026-11-02-google-seo-design.md`.
Gałąź `feat/google-seo`: 9 zadań, przegląd per zadanie, końcowy przegląd całej gałęzi (opus) i jedna fala poprawek. Testy: 812 przechodzi.

## Do sprawdzenia po podłączeniu Search Console

- `scripts/check-google.ts`, potem `scripts/gsc-sync-now.ts --local --backfill`: potwierdzić kształt odpowiedzi, `type: "web"`, start backfillu sprzed 16-miesięcznego horyzontu.
- Porównać sumę kliknięć z 28 dni z panelem Search Console (różnice: frazy anonimowe, sumowanie wyświetleń frazy po stronach w `gsc_query_windows`).
- Dostroić progi szans (`THRESHOLDS` w `src/lib/seo/opportunities.ts`) na prawdziwych danych.

## Decyzje podjęte w trakcie (ruling: co, dlaczego, koszt pomyłki)

- R1: Ruling: seo_budget_usd in ProjectSettingsSchema falls back to 10 when the field is missing (existing tests/forms parse without it); z.coerce turns undefined into NaN and would break every settings save without the new field; if wrong, a missing field silently sets 10 instead of erroring.
- R2: Ruling: accept /app/google without a page between Task 4 and Task 8; the branch is not deployed until M1 is complete; if wrong, only a local 404 in between.
- R3: Ruling: queries.ts (Task 8) maps flat SQL rows to Task 7 nested types; position becomes null when impressions are 0; keeps opportunities.ts independent of SQL shape; if wrong, a mapping helper moves.
- R4: Ruling: the browser preview check in Task 8 Step 5 is done by the controller after the task, not by the implementer; subagents have no browser pane; if wrong, nothing is lost.
- R5: Ruling: switch the 4 GSC SQL functions to `security definer set search_path = public` with a single membership gate `is_org_member(project_org(p_project))` (evaluated once), revoke execute from public/anon, grant to authenticated; tables keep RLS; done as a Task 5 fix round in a NEW migration after Task 6 finishes (no concurrent commits); measured ~30x RLS overhead on the overview's main query; deviates from the spec's "security invoker" wording but keeps its intent (members only); if wrong, a bug in the gate would leak GSC data across orgs; the RLS test (non-member sees nothing) guards it.
- R6: Ruling: getGscTotals (Task 8) returns `{ clicks: number | null; impressions: number | null; position: number | null }` and is exported as type `GscTotals` from src/lib/seo/queries.ts; Task 9 reuses that type; one shape for both consumers; if wrong, a small type move.
- R7: Ruling: the overview UI (Task 8) hides opportunities with potentialClicks <= 0 and labels cannibal `impressions` as "wyświetlenia frazy" (pages list only the competing ones); zero-potential rows are noise for a marketer; if wrong, rows reappear by removing one filter.
- R8: Ruling: run one Task 8 fix round for the position wording (absolute "lepiej/gorzej o X" + tone), cannibal row wrapping, "(poprzednio)" on lost rows, chart NBSP formatting, whitespace gsc_property button, and move number-format helpers to src/lib/format/number.ts for Task 9 reuse; the user asked for a clearly useful up/down tool, so a misleading position delta is load-bearing for Task 9; if wrong, a small extra diff.
- R9: Ruling: accept overallHeadline wording that says "we wszystkich kanałach" only when no channel is unknown and adds a "Brak danych: …" group; the likely first prod state is GSC not connected, and claiming "all channels" then would mislead; if wrong, one-line change.
- R10: Ruling: accept the extra optional `period` field on ChannelSummary (Google card shows "ostatnie 28 dni wobec poprzednich 28"); Google compares windows, it has no baseline date; if wrong, remove one field.
- R11: Ruling: Google card tie-breaker keeps the spec's position rule but returns "flat" when impressions rose >10% while the position got worse; on a young site long-tail impressions worsen the average while visibility grows; if wrong, the card shows → instead of ↓ in that case.
- R12: Ruling: sync end date becomes today−2 (UTC) instead of today−1 (keep dataState "all", 5-day refetch); the 06:30 Warsaw run is 21:30 PT, so "yesterday UTC" is an incomplete PT day; if wrong, data is one day staler.
- R13: Ruling: defer M3 (query impressions summed over pages, compare with GSC UI after backfill) and M7 (gsc_property change mixing sources; rare, needs a destructive clear) to the M2 plan; neither affects the first production weeks with one property; if wrong, cannibalized phrases show slightly off CTR.
- R14: Ruling: accept M1 variant that rounds the position CHANGE (one number drives text and verdict) instead of rounding both positions; rounding each side can still contradict the text (9,06->9,54); if wrong, edge cases near 0,5 flip.

## Odłożone drobne uwagi (z przeglądów)

Przed M2 (pierwsze płatne zadanie DataForSEO) warto zamknąć: `decideSeoSpend` przepuszcza NaN, `finishJob` nadpisuje `cost_usd` zerem bez `costUsd`, wyczyszczony limit SEO zapisuje 0, test podmenu zależy od domyślnego `GOOGLE_NAV`.

- T1: DfsTask.status_code typed required but guard treats it optional (client.ts:31/62)
- T1: status_code 0 now throws (old code accepted) - DataForSEO never sends 0
- T1: truncation test second assertion redundant (client.test.ts:302-306)
- T2: decideSeoSpend fails open on NaN (budget.ts:18) - use `spent + estimate <= budget ? go : exceeded`
- T2: finishJob silent on unknown id and overwrites cost_usd with 0 when costUsd omitted (jobs.ts:32-41) - paid tasks must pass costUsd
- T2: index (project_id, kind, started_at) used only by prefix for seoMonthSpend
- T2: rls.test.ts scaffold now copied 3x
- T3: token endpoint 429/5xx not TransientError, so not retried (auth.ts:231)
- T3: 401 does not invalidate cached token (http.ts:294-303)
- T3: 403 text says "add user" also for quota 403s; trailing space with empty detail
- T3: check-google.ts error cut to 400 chars may drop detail (:154)
- T3: .env.prod.example lacks GOOGLE_* vars
- T3: no tests for token response without access_token / without expires_in
- T4: google-subnav "jedna pozycja" test relies on default GOOGLE_NAV; breaks when M2 adds Frazy - pass items explicitly
- T4: cleared SEO budget input becomes 0 (same as monthly_budget_usd); consider required
- T4: step="1" on budget inputs rejects fractions the schema accepts
- T5: gsc_query_pages has no p_limit; PostgREST 1000 cut could split a phrase (consumer drops trailing single-row phrase)
- T5: generated rpc types non-null; consumer maps to number|null (carried to Task 8)
- T5: null position with impressions deflates average (carried to Task 6: never write null position)
- T5: with check on write policies untested
- T5: comment about quoting "position" detached from code
- T6: idempotency key in schedule is run-scoped by the SDK, not global (benign: one schedule run/day)
- T6: test should assert gsc_site_daily not upserted after page failure (gsc-sync.test.ts:297-300)
- T6: no test asserts lastDate read order desc + limit 1 (gsc-sync.ts:143)
- T6: incremental window is a single range whatever the gap; split long gaps monthly
- T6: `const window` shadows global
- T5: definer migration header comment says anon gets same as before; anon now gets 42501
- T7: cannibalization uses DEFAULT_CTR (signature has no curve); own-curve bias on brand-heavy sites; lowCtr custom-curve test gap
- T8: gsc_query_pages unbounded (1000-row cap, low-impression tail only)
- T8: shortDate duplicated from TrendChart
- T8: GSC window includes provisional last day (dataState all) - compare with GSC UI after backfill
Controller preview after fix: position tile shows 'lepiej o 0,3 poz.', cannibal pages on separate lines - OK. minor (deferred): homepage path shown as bare '/' (label 'strona główna')
- T8: lost/new potential clamped to >=1 shows "−1 kliknięcie" for zero-click lost phrase (sections.tsx ~118)
- T8: vacuous not.toContain assertion in GscStatsSection test
- T8: fmtDecimal/fmtNumber print hyphen-minus for negatives (unused today)
- T9: position verdict uses raw diff while text shows rounded diff (0.48 -> "lepiej o 0,5" + flat arrow) (direction.ts:425)
- T9: failed GSC read shows the "no sync yet" detail; use "Nie udało się odczytać danych"
- T9: tests miss getGscTotals rejection and aioSummary string/zero-count paths
Final fix wave: re-review all addressed, 0 open (cf4e855..44507fd). minor (deferred): zero-click new/lost rows show impressions twice; overallHeadline says "Brak danych: Google" for short history; plural.ts comment has U+2013 (pre-existing)
