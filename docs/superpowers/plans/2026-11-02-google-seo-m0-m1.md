# Moduł Google: M0 (fundamenty) i M1 (Search Console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zakładka „Google” z codzienną synchronizacją Search Console, widokiem Przegląd (kafle, trend, szanse, top frazy i strony) oraz fundamentami pod kolejne kamienie (klient DataForSEO, rejestr zadań SEO z limitem, auth Google, ustawienia).

**Architecture:** Dane GSC trafiają do trzech tabel dziennych przez task Trigger `gsc-sync` (ciało `runGscSync()` wołane też ze skryptu `--local`), uruchamiany codziennie harmonogramem `schedules.task`. UI czyta przez funkcje SQL (`rpc`) i `React.cache`, a szanse liczą czyste funkcje w `src/lib/seo/opportunities.ts`. Auth Google to własny JWT RS256 przez `node:crypto`.

**Tech Stack:** Next.js (niestandardowa wersja: przed kodem stron i akcji przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/`), Supabase Postgres + RLS, Trigger.dev 4.7.3, Vitest 5, recharts 3, zod 4.

**Spec:** `docs/superpowers/specs/2026-11-02-google-seo-design.md`

## Global Constraints

- Teksty UI i komunikaty błędów po polsku; bez półpauz i pauz (U+2013, U+2014) w nowych tekstach, zakresy z łącznikiem (4-20).
- Każda nowa tabela: `alter table … enable row level security` + polityka `for all using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)))`.
- Funkcje SQL dla UI: `language sql stable security invoker`, `grant execute on function … to authenticated`.
- PostgREST zwraca najwyżej 1000 wierszy: UI czyta agregaty przez `rpc()` z limitem, zapis wsadowy w paczkach po 1000.
- Budżet SEO osobny: `projects.seo_budget_usd` (domyślnie 10), wydatki w `seo_jobs.cost_usd`; `src/lib/budget.ts` (`monthSpend`) zostaje bez zmian.
- Adapter `src/lib/engines/google-ai-overview.ts` zachowuje zachowanie; `tests/engines/google-ai-overview.test.ts` przechodzi bez edycji.
- Ścieżka rekomendacji AI (`src/trigger/recommend-project.ts`, `src/lib/recommend/*`) nietknięta.
- Taski: ciało jako eksportowana funkcja `runX(payload, deps)`; `deps` wstrzykuje `admin`, klienta API i `now` dla testów.
- Harmonogramy: `schedules.task` z `cron: { pattern, timezone: "Europe/Warsaw", environments: ["PRODUCTION"] }`.
- Nowe zmienne: `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 albo surowy JSON klucza konta usługi), `GOOGLE_PAGESPEED_API_KEY`; zakres OAuth `https://www.googleapis.com/auth/webmasters.readonly`.
- Lokalna baza: `npx supabase migration up --local`, typy: `npx supabase gen types typescript --local > src/lib/db-types.ts`; nigdy `supabase db reset`. Testy RLS: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- --run tests/db`.
- Commity kończą się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Brak `gsc_property`, brak klucza albo 403 z Google: zadanie kończy się statusem `skipped`/`failed` z polskim komunikatem (403 podaje e-mail konta usługi), Przegląd pokazuje pusty stan z instrukcją zamiast błędu strony. Testy: Task 3 (403), Task 6 (brak usługi), Task 8 (pusty stan w modelu widoku).
2. Usługa typu domena zwraca te same ścieżki z `www.` i bez, z http i https: wiersze o tym samym kluczu po zamianie URL na ścieżkę muszą się zsumować (kliknięcia, wyświetlenia; pozycja ważona wyświetleniami), inaczej upsert złamie klucz główny. Test: Task 6 `mergeRows`.
3. Duże wolumeny przy backfillu (setki tysięcy wierszy): stronicowanie `startRow` po 25000 i upsert paczkami po 1000. Testy: Task 6 (stronicowanie, paczki).
4. Dni bez danych i świeże dni niepełne: sync nie pada na pustej odpowiedzi, a codzienne okno nadpisuje ostatnie 5 dni (dane `dataState: "all"` się korygują). Okna 28-dniowe w UI liczone od najnowszej daty w bazie, nie od dziś. Testy: Task 6 `syncWindows`, Task 8 `gscWindows`.
5. Polskie znaki i wielkość liter we frazach: frazy przechowywane dokładnie jak zwraca GSC; grupowanie w SQL po dokładnym tekście. Test: Task 5 (fraza z „ł” i „ó” przechodzi przez upsert i `gsc_query_windows`).

---

## Struktura plików

```
src/lib/dataforseo/client.ts          # wspólny klient DataForSEO (Task 1)
src/lib/engines/google-ai-overview.ts # korzysta z klienta (Task 1)
supabase/migrations/20261102000000_seo_core.sql   # Task 2
supabase/migrations/20261102010000_gsc.sql        # Task 5
src/lib/seo/jobs.ts, src/lib/seo/budget.ts        # Task 2
src/lib/google/auth.ts, src/lib/google/http.ts    # Task 3
scripts/check-google.ts                           # Task 3
src/components/psai/AppNav.tsx                    # Task 4
src/app/app/google/layout.tsx, GoogleSubNav.tsx   # Task 4
src/lib/validation/settings.ts, src/app/app/settings/page.tsx  # Task 4
src/lib/google/gsc.ts, src/lib/seo/gsc-sync.ts    # Task 6
src/trigger/gsc-sync.ts, src/trigger/seo-schedules.ts, scripts/gsc-sync-now.ts  # Task 6
src/lib/seo/opportunities.ts                      # Task 7
src/lib/seo/queries.ts, src/lib/seo/overview.ts   # Task 8
src/app/app/google/page.tsx, sections.tsx, actions.ts, src/components/GscTrendChart.tsx  # Task 8
```

---

### Task 1: Wspólny klient DataForSEO

**Files:**
- Create: `src/lib/dataforseo/client.ts`
- Modify: `src/lib/engines/google-ai-overview.ts:1-90`
- Test: `tests/dataforseo/client.test.ts`

**Interfaces:**
- Produces:
  - `export const DFS_BASE = "https://api.dataforseo.com/v3"`
  - `export const PAYMENT_REQUIRED_MESSAGE` (przeniesiony bez zmiany treści)
  - `export function dfsLocationCode(): number` (z `DATAFORSEO_LOCATION_CODE`, domyślnie 2616)
  - `export interface DfsTask { id: string; status_code: number; status_message: string; cost?: number; result?: unknown[] | null; data?: Record<string, unknown> }`
  - `export interface DfsResponse { status_code: number; status_message: string; cost?: number; tasks?: DfsTask[] }`
  - `export async function dfsRequest(method: "GET" | "POST", path: string, body?: unknown[], opts?: { okTaskCodes?: number[]; checkTasks?: boolean; retry?: { attempts?: number; baseDelayMs?: number } }): Promise<DfsResponse>`
    - bez loginu/hasła: `Error("Brak DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD")`
    - HTTP 402: `PAYMENT_REQUIRED_MESSAGE`; HTTP 429/5xx: `TransientError`; inne nie-OK: `Error("DataForSEO HTTP <status>: <300 znaków>")`
    - `status_code !== 20000`: `Error("DataForSEO status …")`
    - przy `checkTasks` (domyślnie true) każde zadanie: 40101 → `TransientError`, 40200 → `PAYMENT_REQUIRED_MESSAGE`, kod spoza `okTaskCodes` (domyślnie `[20000]`) → `Error("DataForSEO task <kod>: <komunikat>")`
    - całość w `withRetry` (`src/lib/engines/retry.ts`) z `opts.retry`
    - nagłówki jako zwykły obiekt `{ Authorization: "Basic …", "Content-Type": "application/json" }` (test AIO czyta `init.headers.Authorization`)

- [ ] **Step 1: Write the failing tests** w `tests/dataforseo/client.test.ts` (wzór mocków: `tests/engines/google-ai-overview.test.ts`, `vi.stubGlobal("fetch", …)`):
  - `"402 daje komunikat o braku środków"`: odpowiedź status 402 → `rejects.toThrow("brak środków")`
  - `"zadanie 40200 daje komunikat o braku środków"`: 200, `{status_code:20000, tasks:[{status_code:40200,…}]}` → rejects `"brak środków"`
  - `"40101 jest ponawiane"`: pierwsza odpowiedź zadanie 40101, druga 20000, `retry: { baseDelayMs: 1 }` → resolves, `fetch` wywołany 2 razy
  - `"okTaskCodes przepuszcza 20100"`: zadanie 20100 z `okTaskCodes: [20100]` → resolves
  - `"checkTasks false nie sprawdza zadań"`: zadanie 40501 z `checkTasks: false` → resolves
  - `"brak loginu"`: usuń zmienne → rejects `"Brak DATAFORSEO_LOGIN"`
  - `"GET bez body"`: `dfsRequest("GET", "/serp/google/organic/tasks_ready")` → `init.method === "GET"`, `init.body === undefined`, URL `DFS_BASE + path`
- [ ] **Step 2: Run** `npm test -- --run tests/dataforseo` → FAIL (moduł nie istnieje)
- [ ] **Step 3: Implement** `src/lib/dataforseo/client.ts`; przepnij adapter AIO na `dfsRequest("POST", "/serp/google/organic/live/advanced", body)` z `dfsLocationCode()`, parser i koszt bez zmian
- [ ] **Step 4: Run** `npm test -- --run tests/dataforseo tests/engines` → PASS (test AIO bez edycji)
- [ ] **Step 5: Commit** `feat(dataforseo): shared client extracted from the AIO adapter`

---

### Task 2: Schemat `seo_core`, rejestr zadań i budżet SEO

**Files:**
- Create: `supabase/migrations/20261102000000_seo_core.sql`, `src/lib/seo/jobs.ts`, `src/lib/seo/budget.ts`
- Modify: `src/lib/db-types.ts` (regeneracja), `tests/db/rls.test.ts`
- Test: `tests/seo/jobs.test.ts`, `tests/seo/budget.test.ts`

**Interfaces:**
- Produces:
  - kolumny `projects.gsc_property text null`, `projects.seo_budget_usd numeric(10,2) not null default 10`, `projects.trends_anchor text null`
  - tabela `seo_jobs(id uuid pk default gen_random_uuid(), project_id uuid not null references projects on delete cascade, kind text not null check (kind in ('gsc_sync','rank_check','url_inspection','pagespeed','keyword_volumes','keyword_research','seo_recommend','seo_weekly')), status text not null default 'running' check (status in ('running','done','failed','budget_exceeded','skipped')), started_at timestamptz not null default now(), finished_at timestamptz, cost_usd numeric(10,4) not null default 0, stats jsonb not null default '{}', error text)`, indeks `seo_jobs_project_kind (project_id, kind, started_at desc)`, RLS
  - `src/lib/seo/jobs.ts`: `export type SeoJobKind = "gsc_sync" | "rank_check" | "url_inspection" | "pagespeed" | "keyword_volumes" | "keyword_research" | "seo_recommend" | "seo_weekly"`; `export type SeoJobStatus = "done" | "failed" | "budget_exceeded" | "skipped"`; `startJob(admin: SupabaseClient<Database>, projectId: string, kind: SeoJobKind): Promise<string>`; `finishJob(admin, jobId: string, r: { status: SeoJobStatus; stats?: Record<string, unknown>; error?: string; costUsd?: number }): Promise<void>` (ustawia `finished_at`)
  - `src/lib/seo/budget.ts`: `seoMonthSpend(admin, projectId: string, now?: Date): Promise<number>` (suma `seo_jobs.cost_usd` od `monthStartIso(now)` z `src/lib/budget.ts`, liczby jako tekst też); `decideSeoSpend(spent: number, estimate: number, budget: number): { kind: "go" } | { kind: "budget_exceeded"; spent: number; estimate: number }`

- [ ] **Step 1: Migracja** zgodnie z Interfaces (styl: `supabase/migrations/20261013030000_calibrations.sql`)
- [ ] **Step 2: Zastosuj i wygeneruj typy**: `npx supabase migration up --local`, `npx supabase gen types typescript --local > src/lib/db-types.ts`, `git diff --stat src/lib/db-types.ts` → tylko nowe kolumny i tabela
- [ ] **Step 3: Testy RLS**: w `tests/db/rls.test.ts` przypadek `"anon i nie-członek nie widzą zadań SEO, członek org widzi"` wzorowany na kalibracjach (insert `seo_jobs` dla projektu seed, anon 0, nie-członek 0, członek 1, sprzątanie w `finally`)
- [ ] **Step 4: Failing tests** (fake admin jak w `tests/budget.test.ts`):
  - `budget.test.ts`: `"seoMonthSpend sumuje cost_usd od początku miesiąca"` (`[{cost_usd:1.25},{cost_usd:"0.7500"}]` → 2.0, tabela `seo_jobs`, filtry `eq project_id`, `gte started_at 2026-11-01T00:00:00.000Z` dla `now=2026-11-15`); `"decideSeoSpend"`: `(9.5, 0.6, 10)` → budget_exceeded, `(9.0, 0.6, 10)` → go, `(10, 0, 10)` → go
  - `jobs.test.ts`: `"startJob wstawia running i zwraca id"`, `"finishJob zapisuje status, koszt, statystyki i finished_at"` (asercje na payload update: `status`, `cost_usd`, `stats`, `error ?? null`, `finished_at` to ISO)
- [ ] **Step 5: Run** → FAIL; **Implement** `jobs.ts`, `budget.ts`; **Run** `npm test -- --run tests/seo` i testy RLS → PASS; `npx tsc --noEmit` → 0 błędów
- [ ] **Step 6: Commit** `feat(seo): seo_core schema, job ledger and separate SEO budget`

---

### Task 3: Auth Google i klient HTTP

**Files:**
- Create: `src/lib/google/auth.ts`, `src/lib/google/http.ts`, `scripts/check-google.ts`
- Modify: `.env.example`, `trigger.config.ts:9-17` (`TRIGGER_SECRET_VARS` += `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PAGESPEED_API_KEY`), `README.md` (sekcja „Google (Search Console, PageSpeed)” z krokami 1-4 ze spec)
- Test: `tests/google/auth.test.ts`, `tests/google/http.test.ts`

**Interfaces:**
- Produces:
  - `export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"`
  - `export interface ServiceAccount { client_email: string; private_key: string }`
  - `export function parseServiceAccount(raw: string): ServiceAccount` (surowy JSON albo base64 JSON; brak pól → `Error("GOOGLE_SERVICE_ACCOUNT_JSON: brak client_email albo private_key")`)
  - `export interface GoogleAuth { email: string; getAccessToken(): Promise<string> }`
  - `export function createGoogleAuth(sa: ServiceAccount, scopes: string[], deps?: { fetch?: typeof fetch; now?: () => number }): GoogleAuth` (JWT RS256: nagłówek `{alg:"RS256",typ:"JWT"}`, claims `{iss, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat, exp: iat+3600}`, base64url; POST `application/x-www-form-urlencoded` `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=…`; token w pamięci do `expires_in − 60` s)
  - `export function getGoogleAuth(): GoogleAuth` (singleton z env; brak zmiennej → `Error("Brak GOOGLE_SERVICE_ACCOUNT_JSON: skonfiguruj konto usługi Google (README, sekcja Google)")`)
  - `export async function googleJson<T>(auth: GoogleAuth, url: string, init?: { method?: "GET" | "POST"; body?: unknown }, retry?: { attempts?: number; baseDelayMs?: number }): Promise<T>`: 429/5xx → `TransientError` w `withRetry`; 403 → `Error("Google API 403: brak dostępu dla ${auth.email}. Dodaj ten adres jako użytkownika usługi w Search Console. ${detal}")`; inne nie-OK → `Error("Google API <status>: <300 znaków>")`

- [ ] **Step 1: Failing tests**:
  - `auth.test.ts` (para kluczy z `crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })`, eksport PEM pkcs8):
    - `"parseServiceAccount czyta JSON i base64"`
    - `"JWT jest podpisany RS256 i ma poprawne claims"`: przechwyć `assertion` z body, `crypto.verify("RSA-SHA256", …, publicKey, sig)` → true, `aud`, `scope`, `exp - iat === 3600`
    - `"token jest cache'owany i odświeżany po wygaśnięciu"`: fetch zwraca `{access_token:"t1",expires_in:3600}` potem `t2`; dwa wywołania przy `now` stałym → 1 fetch; po przesunięciu `now` o 3550 s → drugi fetch, `"t2"`
  - `http.test.ts`: `"403 podaje e-mail konta usługi"`, `"503 jest ponawiane"` (`retry: { baseDelayMs: 1 }`, 2 wywołania), `"POST wysyła JSON z bearer"`
- [ ] **Step 2: Run** `npm test -- --run tests/google` → FAIL
- [ ] **Step 3: Implement** `auth.ts`, `http.ts` (`node:crypto` `createSign("RSA-SHA256")`, bez nowych zależności)
- [ ] **Step 4: Implement** `scripts/check-google.ts` (użycie: `npx tsx --env-file=.env.local scripts/check-google.ts [property]`): `GET https://www.googleapis.com/webmasters/v3/sites`, wypisuje `siteUrl` + `permissionLevel`, sprawdza obecność `property` (domyślnie `sc-domain:polskaszkola.ai`), kod wyjścia 1 gdy brak; dopisz zmienne do `.env.example`, `trigger.config.ts`, README
- [ ] **Step 5: Run** `npm test -- --run tests/google` → PASS; `npx tsc --noEmit`
- [ ] **Step 6: Commit** `feat(google): service-account auth, JSON client and check script`

---

### Task 4: Menu „Google”, podmenu i ustawienia

**Files:**
- Modify: `src/components/psai/AppNav.tsx:6-9`, `src/lib/validation/settings.ts`, `src/app/app/settings/page.tsx`
- Create: `src/app/app/google/layout.tsx`, `src/app/app/google/GoogleSubNav.tsx`
- Test: `tests/validation/settings.test.ts`, `tests/components/google-subnav.test.tsx`

**Interfaces:**
- Produces:
  - `NAV` z `["/app/google", "Google"]` między „Rekomendacje” a „Odpowiedzi”
  - `export const GOOGLE_NAV: readonly (readonly [string, string])[] = [["/app/google", "Przegląd"]]` w `GoogleSubNav.tsx` (M2 dopisze Frazy, M4 Strony i audyt); podmenu renderuje się dopiero przy co najmniej 2 pozycjach; aktywność: `/app/google` dokładnie, pozostałe `startsWith`
  - `ProjectSettingsSchema` += `gsc_property` (pusty → `null`; inaczej musi pasować do `/^sc-domain:[a-z0-9.-]+$|^https?:\/\/\S+\/$/`, komunikat „Usługa: sc-domain:twojadomena.pl albo adres z ukośnikiem na końcu”), `seo_budget_usd` (`z.coerce.number().min(0)`), `trends_anchor` (pusty → `null`, trim)

- [ ] **Step 1: Failing tests**: w `settings.test.ts` `"gsc_property: sc-domain i prefiks URL"`, `"gsc_property: pusty to null"`, `"gsc_property: zły format daje komunikat"`, `"seo_budget_usd nie może być ujemny"`; w `google-subnav.test.tsx` (wzór: `tests/components/psai.test.tsx`) `"jedna pozycja: podmenu się nie renderuje"` i `"aktywna pozycja ma aria-current"` (dla dwóch pozycji przekazanych propsem `items`)
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**: schemat; sekcja „Google” w formularzu ustawień (3 pola: „Usługa Search Console” z placeholderem `sc-domain:polskaszkola.ai`, „Miesięczny limit SEO (USD)”, „Fraza-kotwica Google Trends”, plus `Meta`: „Konto usługi dodajesz w Search Console → Ustawienia → Użytkownicy i uprawnienia.”); `GoogleSubNav({ items = GOOGLE_NAV })` (klient, `usePathname`, styl linków jak `AppNav`); `layout.tsx` renderuje podmenu i `children`; zaktualizuj nieaktualny `Meta` przy `site_url` („Dziś wersja robocza na Netlify…”) na „Adres produkcyjny strony, np. https://polskaszkola.ai”
- [ ] **Step 4: Run** `npm test -- --run tests/validation tests/components` → PASS; `npm run lint`; `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(google): nav item, sub-nav and Google settings section`

---

### Task 5: Tabele GSC i funkcje SQL

**Files:**
- Create: `supabase/migrations/20261102010000_gsc.sql`
- Modify: `src/lib/db-types.ts` (regeneracja), `tests/db/rls.test.ts`

**Interfaces:**
- Produces:
  - `gsc_site_daily(project_id uuid references projects on delete cascade, date date, clicks int not null, impressions int not null, position numeric(6,2), primary key (project_id, date))`
  - `gsc_page_daily(project_id, date, page text, clicks, impressions, position, primary key (project_id, date, page))`
  - `gsc_query_daily(project_id, date, query text, page text, device text check (device in ('desktop','mobile','tablet')), clicks, impressions, position, primary key (project_id, date, query, page, device))`, indeks `(project_id, query, date)`
  - `gsc_totals(p_project uuid, p_from date, p_to date) returns table(clicks bigint, impressions bigint, position numeric)`: pozycja ważona wyświetleniami `sum(position*impressions)/nullif(sum(impressions),0)`
  - `gsc_top_pages(p_project uuid, p_from date, p_to date, p_limit int) returns table(page text, clicks bigint, impressions bigint, position numeric)`, sortowanie `clicks desc, impressions desc`
  - `gsc_query_windows(p_project uuid, p_cur_from date, p_cur_to date, p_prev_from date, p_prev_to date, p_limit int) returns table(query text, cur_clicks bigint, cur_impressions bigint, cur_position numeric, prev_clicks bigint, prev_impressions bigint, prev_position numeric)`: agregacja po frazie (wszystkie strony i urządzenia) w obu oknach, `full outer join`, braki jako 0 / null, sortowanie `greatest(cur_impressions, prev_impressions) desc`, limit
  - `gsc_query_pages(p_project uuid, p_from date, p_to date, p_min_impressions int) returns table(query text, page text, clicks bigint, impressions bigint, position numeric)`: tylko frazy z co najmniej 2 stronami i łącznie `>= p_min_impressions` wyświetleń
  - wszystkie: `language sql stable security invoker`, `grant execute … to authenticated`; RLS na trzech tabelach

- [ ] **Step 1: Migracja**; **Step 2:** `npx supabase migration up --local` + regeneracja typów (diff: 3 tabele, 4 funkcje)
- [ ] **Step 3: Test RLS i funkcji** w `tests/db/rls.test.ts`: `"GSC: anon i nie-członek nie widzą danych ani agregatów, członek widzi"`: superuser wstawia dla projektu seed 2 dni `gsc_site_daily`, 2 strony i wiersze `gsc_query_daily` z frazą `"szkolenia ai wrocław łódź"` na dwóch stronach; asercje: anon i nie-członek 0 wierszy w tabelach i w `select * from gsc_totals(…)` zwraca `clicks is null`; członek: `gsc_totals` sumuje kliknięcia, `gsc_query_windows` zwraca frazę z polskimi znakami bez zmian, `gsc_query_pages(…, 0)` zwraca 2 strony; sprzątanie `delete … where project_id = seed and date in (…)`
- [ ] **Step 4: Run** testy DB → PASS; `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(db): Search Console daily tables and aggregate functions`

---

### Task 6: Synchronizacja Search Console

**Files:**
- Create: `src/lib/google/gsc.ts`, `src/lib/seo/gsc-sync.ts`, `src/trigger/gsc-sync.ts`, `src/trigger/seo-schedules.ts`, `scripts/gsc-sync-now.ts`
- Test: `tests/google/gsc.test.ts`, `tests/seo/gsc-sync.test.ts`, fixture `tests/fixtures/gsc/query-page.json`

**Interfaces:**
- Consumes: `GoogleAuth`, `googleJson` (Task 3); `startJob`, `finishJob` (Task 2); tabele Task 5
- Produces:
  - `export type GscDimension = "date" | "query" | "page" | "device"`
  - `export interface GscRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }`
  - `export interface GscQuery { startDate: string; endDate: string; dimensions: GscDimension[]; dataState?: "final" | "all"; rowLimit?: number; startRow?: number }`
  - `export async function querySearchAnalytics(auth: GoogleAuth, property: string, q: GscQuery): Promise<GscRow[]>`: `POST https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, body `{ …q, type: "web" }`, brak `rows` → `[]`
  - `export async function fetchAllRows(auth, property, q: Omit<GscQuery, "rowLimit" | "startRow">, pageSize = 25000): Promise<GscRow[]>`: kolejne `startRow` aż strona krótsza niż `pageSize`
  - `src/lib/seo/gsc-sync.ts`:
    - `export function syncWindows(o: { today: Date; lastDate: string | null; backfill: boolean }): { start: string; end: string }[]`: koniec zawsze `today − 1 dzień`; `backfill` albo `lastDate === null` → od pierwszego dnia miesiąca 16 miesięcy wstecz, okna miesięczne (ostatnie przycięte do końca); inaczej start `min(today − 5 dni, lastDate − 2 dni)`, jedno okno
    - `export function toPath(url: string): string` (`new URL(url).pathname`, przy błędzie surowy tekst)
    - `export function mergeRows<K extends string>(rows: { key: K; clicks: number; impressions: number; position: number }[]): …[]`: suma kliknięć i wyświetleń, pozycja ważona wyświetleniami, zaokrąglona do 2 miejsc
    - `export interface RunGscSyncDeps { admin?: SupabaseClient<Database>; auth?: GoogleAuth; fetchRows?: typeof fetchAllRows; now?: () => Date }`
    - `export async function runGscSync(payload: { projectId: string; backfill?: boolean }, deps?: RunGscSyncDeps): Promise<{ status: SeoJobStatus; days: number; siteRows: number; pageRows: number; queryRows: number }>`: brak `gsc_property` → job `skipped` z błędem „Brak usługi Search Console w Ustawieniach → Google”; dla każdego okna trzy zapytania (`["date"]`, `["date","page"]`, `["date","query","page","device"]`, `dataState: "all"`), mapowanie urządzeń na małe litery, strony na ścieżki, `mergeRows`, upsert paczkami po 1000 (`onConflict` = klucz główny); wyjątek → job `failed` z komunikatem i rzucenie dalej; sukces → `done` ze statystykami
  - `src/trigger/gsc-sync.ts`: `export const gscSyncTask = task({ id: "gsc-sync", queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 2 }, maxDuration: 1800, run: (p: { projectId: string; backfill?: boolean }) => runGscSync(p) })`
  - `src/trigger/seo-schedules.ts`: `export const gscSyncDaily = schedules.task({ id: "gsc-sync-daily", cron: { pattern: "30 6 * * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] }, run })`: projekty z `gsc_property is not null` → `gscSyncTask.trigger({ projectId }, { idempotencyKey: \`gsc-sync:${id}:${dzień}\` })`
  - `scripts/gsc-sync-now.ts [projectId] [--backfill] [--local]` (bez `--local` wzór `scripts/recommend-now.ts`; z `--local` woła `runGscSync` z `createAdminSupabase()` i wypisuje wynik)

- [ ] **Step 1: Failing tests**:
  - `gsc.test.ts`: `"adres zawiera zakodowaną usługę sc-domain"` (URL kończy się `sites/sc-domain%3Apolskaszkola.ai/searchAnalytics/query`, body ma `type: "web"`); `"brak rows to pusta lista"`; `"fetchAllRows stronicuje"` (strona 1: 3 wiersze przy `pageSize=3`, strona 2: 1 wiersz → 2 wywołania, `startRow` 0 i 3, wynik 4 wiersze)
  - `gsc-sync.test.ts`:
    - `syncWindows`: `today=2026-11-02, lastDate=null` → pierwsze okno `2025-07-01..2025-07-31`, ostatnie `2026-11-01..2026-11-01`, 17 okien; `today=2026-11-02, lastDate=2026-11-01` → `[{start:"2026-10-28", end:"2026-11-01"}]`; `lastDate=2026-10-20` → start `2026-10-18`
    - `mergeRows`: `/kontakt.html` z `https://polskaszkola.ai` (10 kl., 100 wyśw., poz. 4) i `https://www.polskaszkola.ai` (2 kl., 300 wyśw., poz. 8) → 12 kl., 400 wyśw., poz. 7
    - `runGscSync` (fake admin rejestrujący upserty, `fetchRows` z fixture): brak usługi → `status: "skipped"`, `fetchRows` niewołane; z usługą → 3 tabele dostały wiersze, `device` małymi literami, `page` jako ścieżka, upsert 2500 wierszy idzie w 3 paczkach; `fetchRows` rzuca → job `failed` z komunikatem i wyjątek leci dalej
- [ ] **Step 2: Run** `npm test -- --run tests/google tests/seo` → FAIL
- [ ] **Step 3: Implement** `gsc.ts`, `gsc-sync.ts`, task, harmonogram, skrypt (sprawdź `schedules.task` w `node_modules/@trigger.dev/sdk/dist/commonjs/v3/schedules/index.d.ts`)
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`; `npm run lint`
- [ ] **Step 5: Commit** `feat(seo): daily Search Console sync task, schedule and script`

---

### Task 7: Szanse (czyste funkcje)

**Files:**
- Create: `src/lib/seo/opportunities.ts`
- Test: `tests/seo/opportunities.test.ts`

**Interfaces:**
- Consumes: kształty wierszy z funkcji SQL Task 5
- Produces:
  - `export interface Metrics { clicks: number; impressions: number; position: number | null }`
  - `export interface QueryWindow { query: string; cur: Metrics; prev: Metrics }`
  - `export interface PageMetrics extends Metrics { page: string }`
  - `export interface QueryPage { query: string; page: string; clicks: number; impressions: number; position: number | null }`
  - `export type Opportunity = { kind: "striking" | "low_ctr" | "new" | "lost"; query?: string; page?: string; clicks: number; impressions: number; position: number | null; ctr: number; potentialClicks: number } | { kind: "cannibal"; query: string; impressions: number; pages: { page: string; impressions: number; position: number | null }[]; potentialClicks: number }`
  - `export const THRESHOLDS = { strikingMin: 4, strikingMax: 20, strikingMinImpressions: 50, lowCtrRatio: 0.5, lowCtrMinImpressions: 100, cannibalShare: 0.2, cannibalMinImpressions: 30, newLostMinImpressions: 10, curveMinImpressions: 200 } as const`
  - `export const DEFAULT_CTR: readonly number[] = [0.28, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.03, 0.025, 0.02]` (pozycje 1-10; 11-20: 0.01; dalej 0.005; orientacyjna krzywa branżowa)
  - `export function ctrCurve(rows: Metrics[]): number[]`: dla zaokrąglonej pozycji 1-10 własny CTR, gdy suma wyświetleń na tej pozycji `>= curveMinImpressions`, inaczej `DEFAULT_CTR`
  - `export function expectedCtr(position: number, curve?: number[]): number`
  - `export function strikingDistance(rows: QueryWindow[], curve: number[]): Opportunity[]`: `cur.position` w [4, 20] i `cur.impressions >= 50`; `potentialClicks = cur.impressions × max(0, expectedCtr(3) − ctr)`; sortowanie malejąco
  - `export function lowCtr(items: (QueryWindow | PageMetrics)[], curve: number[]): Opportunity[]`: wyświetlenia `>= 100`, pozycja ≤ 10, `ctr < 0.5 × expectedCtr(position)`; `potentialClicks = impressions × (expectedCtr − ctr)`
  - `export function cannibalization(rows: QueryPage[]): Opportunity[]`: frazy z co najmniej 2 stronami o udziale `>= 0.2` wyświetleń frazy i łącznie `>= 30` wyświetleń; `potentialClicks = impressions × (expectedCtr(1) − ctr frazy)`
  - `export function newAndLost(rows: QueryWindow[]): Opportunity[]`: `new` gdy `prev.impressions === 0 && cur.impressions >= 10`; `lost` odwrotnie; `potentialClicks` = kliknięcia z okna, w którym fraza jest
- [ ] **Step 1: Failing tests** z konkretnymi liczbami: krzywa domyślna przy małych danych i własna przy 250 wyświetleniach na pozycji 1 z 100 kliknięciami (→ 0.4); `strikingDistance` przepuszcza poz. 7.2 z 120 wyśw., odrzuca poz. 3.9 i poz. 21 i 40 wyśw., sortuje po potencjale; `lowCtr` łapie stronę poz. 2 z CTR 0.03 przy 400 wyśw. (oczekiwany 0.15); `cannibalization` łapie frazę z podziałem 60/40 i pomija 90/10; `newAndLost` dla obu kierunków i progu 10
- [ ] **Step 2: Run** → FAIL; **Step 3: Implement**; **Step 4: Run** `npm test -- --run tests/seo/opportunities.test.ts` → PASS
- [ ] **Step 5: Commit** `feat(seo): Search Console opportunities (striking distance, low CTR, cannibalization, new/lost)`

---

### Task 8: Przegląd `/app/google`

**Files:**
- Create: `src/lib/seo/queries.ts`, `src/lib/seo/overview.ts`, `src/app/app/google/page.tsx`, `src/app/app/google/sections.tsx`, `src/app/app/google/actions.ts`, `src/components/GscTrendChart.tsx`
- Test: `tests/seo/overview.test.ts`, `tests/components/gsc-sections.test.tsx`

**Interfaces:**
- Consumes: funkcje SQL (Task 5), `seoMonthSpend` (Task 2), `monthSpend` (`src/lib/budget.ts`), `strikingDistance`, `lowCtr`, `cannibalization`, `newAndLost`, `ctrCurve` (Task 7), `gscSyncTask` (Task 6)
- Produces:
  - `src/lib/seo/overview.ts` (czyste): `gscWindows(lastDate: string): { cur: { from: string; to: string }; prev: { from: string; to: string } }` (cur = 28 dni kończące się `lastDate`, prev = 28 dni przed nimi); `delta(cur: number | null, prev: number | null): number | null` (zmiana względna, `null` gdy brak bazy); `ctr(clicks, impressions): number | null`; `overviewState(o: { gscProperty: string | null; lastDate: string | null; lastJob: { status: string; error: string | null } | null }): "no_property" | "no_data" | "error" | "ok"`
  - `src/lib/seo/queries.ts` (`cache` + `createServerSupabase`): `getGscLastDate(projectId)`, `getGscTotals(projectId, from, to)`, `getGscSeries(projectId, days = 90)` (bezpośredni select `gsc_site_daily`, ≤ 1000 wierszy), `getQueryWindows(projectId, w, limit = 500)`, `getTopPages(projectId, from, to, limit = 10)`, `getQueryPages(projectId, from, to, minImpressions = THRESHOLDS.cannibalMinImpressions)`, `getSeoStatus(projectId): { lastSync: Tables<"seo_jobs"> | null; seoSpent: number; aiSpent: number }`
  - `src/app/app/google/actions.ts`: `syncGscNow()` server action: `getCurrentProject()`, `tasks.trigger<typeof gscSyncTask>("gsc-sync", { projectId }, { idempotencyKey: \`gsc-sync:${id}:${Math.floor(Date.now()/600000)}\`, idempotencyKeyTTL: "10m" })`, `revalidatePath("/app/google")`
  - sekcje (`sections.tsx`): `StatusSection` (ostatnia synchronizacja, stan, „Wydatki w tym miesiącu: SEO x / limit, AI y / budżet”, przycisk „Synchronizuj”), `GscStatsSection` (4× `StatTile`: „Kliknięcia”, „Wyświetlenia”, „CTR”, „Średnia pozycja”, `detail` = „28 dni · ±n% wobec poprzednich 28”), `GscTrendSection` (`GscTrendChart`: kliknięcia na lewej osi, wyświetlenia na prawej, 90 dni), `OpportunitiesSection` (grupy „Blisko top 3”, „Niski CTR”, „Kanibalizacja”, „Nowe i utracone frazy”, po 5 pozycji, każda z frazą/stroną, pozycją, wyświetleniami i „+N kliknięć/28 dni”), `TopQueriesSection` i `TopPagesSection` (top 10; pod frazami `Meta`: „Suma kliknięć fraz jest niższa niż stron: Google ukrywa rzadkie frazy.”)
  - `page.tsx`: `PageHero` („Polska Szkoła AI · Google”, „Widoczność w Google”), dla `overviewState !== "ok"` `EmptyState` z instrukcją (brak usługi: „Wpisz usługę w Ustawienia → Google i dodaj konto usługi w Search Console.”; brak danych: „Kliknij Synchronizuj. Pierwsze pobranie obejmuje 16 miesięcy.”; błąd: treść `lastJob.error`); sekcje w `Suspense` z `TileSkeleton`, układ jak `src/app/app/page.tsx`

- [ ] **Step 1: Failing tests**: `overview.test.ts`: `gscWindows("2026-10-31")` → cur `2026-10-04..2026-10-31`, prev `2026-09-06..2026-10-03`; `delta(120, 100)` → 0.2, `delta(5, 0)` → null, `delta(null, 3)` → null; `overviewState` dla czterech przypadków. `gsc-sections.test.tsx` (wzór `tests/components/mentions-section.test.tsx`): render `OpportunityList` (komponent prezentacyjny wydzielony w `sections.tsx`) z jedną szansą każdego rodzaju → widać frazę, „+N kliknięć”, a pusta lista daje „Brak szans w tej grupie”
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** (przed kodem: przewodnik o server actions i `Suspense` w `node_modules/next/dist/docs/`); `GscTrendChart` wzorowany na `src/components/TrendChart.tsx` (te same tokeny kolorów i czcionek)
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` → wszystko zielone
- [ ] **Step 5: Podgląd**: `preview_start` `dev-3001`, wejście na `/app/google` (bez zalogowania przekierowanie na `/login` to poprawny wynik), konsola bez błędów; widok po zalogowaniu sprawdza Łukasz
- [ ] **Step 6: Commit** `feat(google): Search Console overview page with opportunities`

---

## Po M1

- Scal `feat/google-seo` do `main` po zielonym `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Wdrożenie (po zgodzie Łukasza): `npx supabase db push`, `npx trigger.dev@4.7.3 deploy --project-ref proj_sitwivdlindrogesffbq`, deploy Vercel; w Ustawieniach → Google wpisać `sc-domain:polskaszkola.ai`; po kluczu: `npx tsx --env-file=.env.prod.local scripts/check-google.ts`, potem `scripts/gsc-sync-now.ts --backfill`; porównać sumę kliknięć za 28 dni z interfejsem Search Console.
- M2-M5 dostają osobne plany.
