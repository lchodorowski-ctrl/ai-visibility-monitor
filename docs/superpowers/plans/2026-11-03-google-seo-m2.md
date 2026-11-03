# Moduł Google: M2 (cotygodniowe pozycje fraz) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Co tydzień pozycja każdej śledzonej frazy w Google PL na komputerze i telefonie (top 100): zmiana tydzień do tygodnia, rankujący adres, najlepszy konkurent, cechy SERP (AI Overview i czy nas cytuje, fragment wyróżniony, mapa, PAA, panel wiedzy), szczegóły frazy z historią i top 10 oraz czwarty kafel „Kierunek” na głównym Przeglądzie.

**Architecture:** Nowa tabela `rank_checks` (jeden wiersz na frazę × urządzenie × tydzień). Task Trigger `rank-check` wysyła zadania do kolejki standard DataForSEO SERP (`task_post`, tag = id wiersza), czeka `wait.for` i odbiera wyniki (`task_get/advanced`); wiersze `pending` z `dfs_task_id` wznawia kolejne uruchomienie, więc nic nie płaci się dwa razy. Parser SERP to czysta funkcja na prawdziwych fixture’ach. UI czyta klientem sesji przez funkcję SQL `rank_latest` (security definer z bramką członkostwa, wzór GSC) i bezpośrednio tabelę dla historii jednej frazy.

**Tech Stack:** Next.js (niestandardowa wersja: przed kodem stron przeczytaj `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` i wzór `src/app/app/calibration/[id]/page.tsx`), Supabase Postgres + RLS, Trigger.dev 4.7.3 (`wait.for`), Vitest, recharts, zod 4.

**Spec:** `docs/superpowers/specs/2026-11-02-google-seo-design.md` (Zakres, `rank_checks` w „Dane”, „Frazy”, „Kierunek”); odłożone uwagi: `docs/superpowers/plans/2026-11-03-google-seo-m3-followups.md` (sekcja „Do zrobienia w planie M2”).

## Global Constraints

- Teksty UI i komunikaty po polsku; bez U+2013 i U+2014 w nowych tekstach (minus to U+2212), przecinek dziesiętny, liczby przez helpery z `src/lib/format/number.ts`, odmiana przez `src/lib/format/plural.ts`.
- Nowa tabela: RLS `for all using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)))`; typy przez `npx supabase gen types typescript --local > src/lib/db-types.ts`; nigdy `supabase db reset`. Testy DB: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- --run tests/db`.
- Funkcje SQL dla UI: `language sql stable security definer set search_path = public`, bramka `(select is_org_member(project_org(p_project)))` w `where`, `revoke execute … from public, anon`, `grant execute … to authenticated` (wzór `supabase/migrations/20261102010100_gsc_functions_definer.sql`). Klient admin dostaje z nich puste wyniki: taski czytają tabele bezpośrednio.
- DataForSEO SERP: kolejka standard, `location_code: dfsLocationCode()`, `language_code: "pl"`, `depth: 100`, `load_async_ai_overview: true`, BEZ `stop_crawl_on_match` (ruling M2-R1). Koszt z pola `cost`: przy `task_post` pobierana jest górna granica (0,0066 USD), `task_get` podaje koszt faktyczny po zwrocie.
- Przed każdym płatnym zadaniem bramka `passSeoBudget` (Task 1); przekroczenie = brak wywołania API i job `budget_exceeded`.
- Taski: ciało jako `runX(payload, deps)` z wstrzykiwanym `admin`, klientami API, `sleep` i `now`; `retry: { maxAttempts: 1 }`; skrypty `scripts/*-now.ts` z `--local`.
- Akcje UI: `getCurrentProject()`, klient sesji, trigger w try/catch, klucz idempotencji z oknem 10 minut.
- Commity kończą się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fixtury prawdziwych odpowiedzi (2026-11-03, zebrane jeszcze z `stop_crawl_on_match`, co nie zmienia kształtu): `tests/fixtures/dataforseo/serp-{task-post,task-get-pending,polska-szkola-ai-desktop,kurs-ai-z-certyfikatem-desktop,szkolenia-ai-desktop,szkolenia-ai-mobile}.json`.

## Review Focus

1. Google ukrywa część wyników za `https://google.com/goto?url=…` z `domain: "google.com"`: prawdziwa domena jest tylko w `breadcrumb` („https://www.telewizjagorzow.pl › Artykuły”). Taki wynik nigdy nie liczy się jako google.com, nasza pozycja i konkurenci są rozpoznawani po domenie z `breadcrumb`, a adres jest wtedy nieznany (`url: null`, pokazujemy breadcrumb). Test: Task 3.
2. Nasza domena tylko w panelu wiedzy albo w AI Overview, a nie w wynikach organicznych (fixture „polska szkoła ai”): pozycja `null` („poza top 100”), ale odznaka panelu wiedzy. Testy: Task 3, Task 5.
3. DataForSEO nie odda wyniku w oknie odpytywania: wiersze zostają `pending` z `dfs_task_id`, job `done` z `stats.pending`, następne uruchomienie je odbiera bez ponownego `task_post`. Test: Task 4.
4. Drugie uruchomienie w tym samym tygodniu (przycisk po niedzielnym harmonogramie): sprawdzone już pary fraza × urządzenie nie są wysyłane drugi raz; gdy nie ma nic do wysłania ani do odebrania, job `skipped` z komunikatem. Test: Task 4.
5. Fraza wypada z top 100 albo do niego wchodzi: zmiana „wypadła z top 100” / „nowa w top 100”, a w „Kierunku” brak pozycji liczy się jak 101. Testy: Task 5, Task 7.

## Rulings przyjęte w planie

- M2-R1: bez `stop_crawl_on_match`: na fixture „polska szkoła ai” DataForSEO zatrzymało się na 1. stronie, bo naszą domenę znalazło w panelu wiedzy, a nie w wynikach organicznych; oszczędność to ok. 1 USD/mies. przy 50 frazach, a błąd pozycji jest gorszy.
- M2-R2: harmonogram w poniedziałek 04:00 Europe/Warsaw, `week_start` = poniedziałek tygodnia według daty warszawskiej: ręczne kliknięcie później w tym samym tygodniu dobiera tylko nowe frazy. M4 (orkiestrator tygodniowy) ma uruchamiać pozycje w poniedziałek albo przekazać tydzień jawnie.
- M2-R3: najwyżej `MAX_RANK_KEYWORDS = 100` aktywnych fraz na tydzień (wolumen malejąco, `null` na końcu, potem `created_at`): górna granica 1,32 USD/tydz.
- M2-R4: rezerwacja kosztu: po przejściu bramki job dostaje `cost_usd` = szacunek (górna granica), a na końcu koszt faktyczny; przerwany task zostawia szacunek, więc dwa równoległe zadania nie przejdą bramki na tym samym wydatku (zamyka R9 z M3).
- M2-R5: szanse z pozycji (blisko top 3: pozycja 4-20 i wolumen co najmniej 30; rankuje inna strona niż docelowa) jako oznaczenia w wierszu śledzonej frazy, nie nowe listy na Przeglądzie; Przegląd GSC bez zmian.
- M2-R6: „Kierunek” liczy pozycje z komputera.

---

## Struktura plików

```
src/lib/seo/{jobs,budget,keyword-volumes,keyword-research,gsc-sync,keyword-queries}.ts, src/app/app/google/keywords/sections.tsx  # Task 1
supabase/migrations/20261104000000_rank_checks.sql, src/lib/db-types.ts, tests/db/rls.test.ts                                     # Task 2
src/lib/dataforseo/serp.ts, src/lib/seo/rank-parse.ts, src/lib/seo/costs.ts                                                      # Task 3
src/lib/seo/rank-check.ts, src/trigger/rank-check.ts, src/trigger/seo-schedules.ts, scripts/rank-check-now.ts                    # Task 4
src/lib/seo/{rank-queries,rank-view}.ts, src/app/app/google/keywords/{sections.tsx,actions.ts}                                   # Task 5
src/app/app/google/keywords/[id]/page.tsx, src/components/RankHistoryChart.tsx, src/lib/seo/rank-queries.ts                      # Task 6
src/lib/trends/direction.ts, src/app/app/overview/direction.tsx, src/lib/seo/rank-queries.ts                                     # Task 7
```

---

### Task 1: Wspólna bramka budżetu, rezerwacja kosztu, data „stan na”

**Files:**
- Modify: `src/lib/seo/jobs.ts`, `src/lib/seo/budget.ts`, `src/lib/seo/keyword-volumes.ts`, `src/lib/seo/keyword-research.ts`, `src/lib/seo/gsc-sync.ts` (tylko zamykanie błędu), `src/lib/seo/keyword-queries.ts`, `src/app/app/google/keywords/sections.tsx` (`RankedSection`)
- Test: `tests/seo/jobs.test.ts`, `tests/seo/budget.test.ts`, `tests/seo/keyword-volumes.test.ts`, `tests/seo/keyword-research.test.ts`, `tests/seo/keyword-queries.test.ts`

**Interfaces:**
- Produces:
  - `jobs.ts`: `errorMessage(err: unknown): string`; `reserveJobCost(admin, jobId: string, costUsd: number): Promise<void>` (update `cost_usd`, rzuca przy błędzie); `failJob(admin, jobId: string, err: unknown, costUsd: number, label: string): Promise<void>` (zamyka `failed` z `errorMessage(err)` i kosztem; własny błąd zapisu tylko loguje `console.error(\`${label}: nie udało się zamknąć zadania w rejestrze:\`, …)`, nigdy nie rzuca)
  - `budget.ts`: `passSeoBudget(admin, o: { projectId: string; jobId: string; estimate: number; budget: number; now: Date }): Promise<boolean>`: `seoMonthSpend` + `decideSeoSpend`; przekroczenie → `finishJob(budget_exceeded, error: budgetExceededMessage(...), stats: { spentUsd, estimateUsd, budgetUsd })` i `false`; zgoda → `reserveJobCost(jobId, estimate)` i `true`
  - `runKeywordVolumes` i `runKeywordResearch` używają `passSeoBudget` i `failJob` (zachowanie i wyniki bez zmian poza rezerwacją); `gsc-sync.ts` używa `failJob`/`errorMessage` zamiast własnych kopii
  - `getKeywordJobs(projectId)` zwraca dodatkowo `researchDoneAt: string | null` (`finished_at` najnowszego joba `keyword_research` ze statusem `done`); `RankedSection` pokazuje „stan na” z `researchDoneAt` (R11), `latestStamp` znika
- [ ] **Step 1: Failing tests**: `"passSeoBudget przy zgodzie rezerwuje szacunek w cost_usd"` (update `seo_jobs` z `cost_usd: 0.1` przed wywołaniem klienta); `"passSeoBudget przy przekroczeniu zamyka job budget_exceeded i zwraca false"`; `"failJob nie rzuca, gdy zapis rejestru się nie uda"`; w testach wolumenów i badania: kolejność wywołań rezerwacja → klient → `finishJob` z kosztem faktycznym; `"getKeywordJobs: researchDoneAt z ostatniego zakończonego badania"` (nowszy job `failed` nie zmienia daty)
- [ ] **Step 2: Run** `npm test -- --run tests/seo` → FAIL; **Step 3: Implement**; **Step 4: Run** → PASS, `npx tsc --noEmit`
- [ ] **Step 5: Commit** `refactor(seo): shared budget gate with cost reservation, research date from the job`

---

### Task 2: Tabela `rank_checks` i funkcje SQL

**Files:**
- Create: `supabase/migrations/20261104000000_rank_checks.sql`
- Modify: `src/lib/db-types.ts` (regeneracja), `tests/db/rls.test.ts`

**Interfaces:**
- Produces:
  - `rank_checks(id uuid pk default gen_random_uuid(), project_id uuid not null references projects on delete cascade, keyword_id uuid not null references keywords on delete cascade, device text not null check (device in ('desktop','mobile')), week_start date not null, status text not null default 'pending' check (status in ('pending','done','failed')), dfs_task_id text, position int, rank_absolute int, url text, breadcrumb text, features jsonb not null default '{}', top10 jsonb not null default '[]', competitors jsonb not null default '[]', cost_usd numeric(10,4) not null default 0, checked_at timestamptz, error text, created_at timestamptz not null default now(), unique (keyword_id, device, week_start))`; indeksy `(project_id, week_start desc)`, `(project_id, status)`; RLS
  - `rank_latest(p_project uuid) returns table(keyword_id uuid, device text, week_start date, "position" int, rank_absolute int, url text, breadcrumb text, features jsonb, competitors jsonb, checked_at timestamptz, prev_week_start date, prev_position int)`: dla każdej pary `(keyword_id, device)` najnowszy wiersz `done` i poprzedni `done` (`lag` po `week_start`); `prev_week_start` null = brak wcześniejszego pomiaru, `prev_position` null przy `prev_week_start` = była poza top 100
  - `gsc_query_detail(p_project uuid, p_query text, p_from date, p_to date) returns table(page text, clicks bigint, impressions bigint, "position" numeric)`: sumy dla jednej frazy (`gsc_query_daily.query = p_query`) po stronach, pozycja ważona wyświetleniami, sort po wyświetleniach malejąco
- [ ] **Step 1: Migracja**, `npx supabase migration up --local`, regeneracja typów (diff: tabela i dwie funkcje)
- [ ] **Step 2: Failing tests** (`tests/db/rls.test.ts`, sprzątanie w `finally`): `"rank_checks: anon i nie-członek nie widzą, członek widzi"`; `"rank_latest zwraca najnowszy done i poprzednią pozycję, pomija pending"` (trzy tygodnie: done 52, done null, pending → wiersz z `position` null, `prev_position` 52); `"rank_latest i gsc_query_detail: nie-członek dostaje 0 wierszy, anon błąd 42501"`
- [ ] **Step 3: Implement**; **Step 4: Run** testy DB → PASS, `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(db): weekly rank checks with latest-rank and query-detail functions`

---

### Task 3: Klient SERP, parser wyników, koszt

**Files:**
- Create: `src/lib/dataforseo/serp.ts`, `src/lib/seo/rank-parse.ts`, fixtures `tests/fixtures/dataforseo/serp-*.json` (z `/private/tmp/claude-501/-Users-beard-Leobeard-Work-Polska-szkola-AI-Claude-Aplikacja-do-monitorowania-w-LMM/e30a2869-d694-431d-b704-94476eb2565a/scratchpad/serp/`, kontroler kopiuje je przed zadaniem)
- Modify: `src/lib/seo/costs.ts`
- Test: `tests/dataforseo/serp.test.ts`, `tests/seo/rank-parse.test.ts`, `tests/seo/costs.test.ts`

**Interfaces:**
- Consumes: `dfsRequest`, `dfsLocationCode`, `PAYMENT_REQUIRED_MESSAGE`; `normalizeDomain`, `domainMatches` (`src/lib/engines/domain.ts`)
- Produces:
  - `serp.ts`: `type Device = "desktop" | "mobile"`; `interface SerpTaskInput { tag: string; keyword: string; device: Device }`; `postSerpTasks(tasks: SerpTaskInput[]): Promise<{ posted: { tag: string; id: string; costUsd: number }[]; failed: { tag: string; error: string }[] }>`: paczki po 100, `POST /serp/google/organic/task_post`, body jak w Global Constraints + `tag`, `dfsRequest(..., { checkTasks: false, retry: { attempts: 1 } })` (ponowienie POST mogłoby zapłacić dwa razy); zadanie 20100 → `posted`, 40200 → rzuć `PAYMENT_REQUIRED_MESSAGE`, inne kody → `failed` z `DataForSEO task <kod>: <komunikat>`; tag z `task.data.tag`
  - `type SerpTaskState = { state: "pending" } | { state: "done"; result: unknown; costUsd: number; checkedAt: string | null } | { state: "failed"; error: string }`; `getSerpTask(id: string): Promise<SerpTaskState>`: `GET /serp/google/organic/task_get/advanced/<id>`, `okTaskCodes: [20000, 40102, 40601, 40602]`; 40601/40602 → `pending`; 20000 → `done` (`result = tasks[0].result?.[0] ?? null`, `checkedAt` z `result.datetime` „2026-11-03 13:20:34 +00:00” jako ISO); 40102 (brak wyników) → `done` z `result: null`; błąd `PAYMENT_REQUIRED_MESSAGE` leci dalej, każdy inny wyjątek → `failed` z komunikatem
  - `rank-parse.ts`: `interface SerpFeatures { aiOverview: boolean; aiOverviewCitesUs: boolean; featuredSnippet: boolean; featuredSnippetOurs: boolean; localPack: boolean; peopleAlsoAsk: boolean; knowledgePanelOurs: boolean }`; `interface SerpEntry { position: number; domain: string; url: string | null; title: string; breadcrumb: string | null }`; `interface CompetitorRank { name: string; domain: string; position: number; url: string | null }`; `interface RankReading { position: number | null; rankAbsolute: number | null; url: string | null; breadcrumb: string | null; features: SerpFeatures; top10: SerpEntry[]; competitors: CompetitorRank[] }`; `parseSerp(result: unknown, ctx: { ownDomains: string[]; competitors: { name: string; domains: string[] }[] }): RankReading`:
    ```
    organic = items z type "organic", w kolejności rank_group
    wynik przekierowany: url pasuje do ^https?://(www\.)?google\.[a-z.]+/goto\?  → domain = normalizeDomain(breadcrumb przed pierwszym " › "), url = null
    inaczej: domain = normalizeDomain(item.domain || item.url), url = item.url
    nasza pozycja: pierwszy organic z domainMatches(domain, ownDomains) → position = rank_group, rankAbsolute, url, breadcrumb
    top10: pierwsze 10 organic → { position: rank_group, domain, url, title, breadcrumb }
    competitors: dla każdego konkurenta najlepszy (najniższy rank_group) organic pasujący do którejkolwiek jego domeny; tylko znalezieni, sort po pozycji
    features: aiOverview = jest item "ai_overview"; aiOverviewCitesUs = domena któregoś references[] (na poziomie AIO i w items[].references) pasuje do ownDomains;
              featuredSnippet = item "featured_snippet" albo organic z is_featured_snippet; featuredSnippetOurs = taki element ma naszą domenę;
              localPack = "local_pack"; peopleAlsoAsk = "people_also_ask"; knowledgePanelOurs = "knowledge_graph" z url naszej domeny
    result null albo bez items → position null, puste listy, wszystkie cechy false
    ```
  - `costs.ts`: `DFS_PRICE` += `serpPage: 0.0006, serpAioSurcharge: 0.0006`; `export const SERP_DEPTH = 100`; `estimateRankCost(checks: number): number` = `checks × (SERP_DEPTH / 10 × serpPage + serpAioSurcharge)` (0,0066 za sprawdzenie)
- [ ] **Step 1: Failing tests**: serp (mock `fetch`, wzór `tests/dataforseo/labs.test.ts`): body pierwszego zadania (`depth` 100, `load_async_ai_overview` true, brak `stop_crawl_on_match`, `tag`), 150 zadań → 2 POST-y; fixture `serp-task-post.json` → 4 `posted` z kosztem 0,0066; zadanie z kodem 40501 → `failed`, reszta `posted`; `serp-task-get-pending.json` → `pending`; `serp-kurs-ai-z-certyfikatem-desktop.json` → `done`, `costUsd` 0.0012, `checkedAt` „2026-11-03T13:…Z”. Parser (`ownDomains: ["polskaszkola.ai"]`): „kurs ai z certyfikatem” → position 16, rankAbsolute 19, url `https://polskaszkola.ai/`; `top10[1]` domain `imperiumszkoleniowe.pl`, url null; konkurent Kodołamacz (`kodolamacz.pl`) najlepiej na 1 (nie 12), Coders Lab (`coderslab.pl`) na 6 z breadcrumb; `aiOverview` true, `aiOverviewCitesUs` false. „polska szkoła ai” → position null, `knowledgePanelOurs` true, `top10[0].domain` `telewizjagorzow.pl`, żaden wpis top10 nie ma domeny `google.com`, `ai-katalog.pl` na 3. „szkolenia ai” desktop → position 37, rankAbsolute 41, url `https://polskaszkola.ai/szkolenia.html`, `aiOverview` true, `aiOverviewCitesUs` false; „szkolenia ai” mobile → position 45, rankAbsolute 56, url null, breadcrumb `https://polskaszkola.ai` (nasz wynik przyszedł jako przekierowanie `google.com/goto`), `peopleAlsoAsk` true; `getSerpTask` na fixture mobile → `costUsd` 0.006. `result: null` → pusty odczyt. Koszt: `estimateRankCost(10)` = 0.066
- [ ] **Step 2: Run** `npm test -- --run tests/dataforseo tests/seo/rank-parse.test.ts tests/seo/costs.test.ts` → FAIL; **Step 3: Implement**; **Step 4: Run** → PASS, `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(dataforseo): standard-queue SERP client and rank parser with redirect-aware domains`

---

### Task 4: Task `rank-check`, harmonogram, skrypt

**Files:**
- Create: `src/lib/seo/rank-check.ts`, `src/trigger/rank-check.ts`, `scripts/rank-check-now.ts`
- Modify: `src/trigger/seo-schedules.ts`
- Test: `tests/seo/rank-check.test.ts`, `tests/seo/seo-schedules.test.ts`

**Interfaces:**
- Consumes: Task 1 `passSeoBudget`, `failJob`, `startJob`, `finishJob`; Task 2 tabela; Task 3 `postSerpTasks`, `getSerpTask`, `parseSerp`, `estimateRankCost`
- Produces:
  - `export const MAX_RANK_KEYWORDS = 100`, `POLL_INTERVAL_MS = 60_000`, `MAX_POLLS = 60`, `DEVICES = ["desktop", "mobile"] as const`, `NOTHING_TO_CHECK_MESSAGE = "Pozycje z tego tygodnia są już sprawdzone"`
  - `rankWeekStart(now: Date): string`: data poniedziałku tygodnia według kalendarza Europe/Warsaw (`Intl.DateTimeFormat`), np. niedziela 2026-11-08 23:30 Warszawa → `2026-11-02`, poniedziałek 2026-11-09 00:30 Warszawa (8.11 23:30 UTC) → `2026-11-09`
  - `runRankCheck(payload: { projectId: string }, deps?: { admin?; postSerpTasks?; getSerpTask?; sleep?: (ms: number) => Promise<void>; now?: () => Date }): Promise<{ status: SeoJobStatus; posted: number; done: number; failed: number; pending: number; costUsd: number }>`:
    1. projekt (`seo_budget_usd`, `domains`), konkurenci (`name, domains`), aktywne frazy (M2-R3); brak fraz albo brak domeny → `skipped` z komunikatem
    2. `week = rankWeekStart(now())`; wiersze projektu z tego tygodnia dla tych fraz: `done` pomijamy, `pending` z `dfs_task_id` odbieramy, reszta (brak wiersza, `failed`, `pending` bez id) do wysłania; `pending` z `dfs_task_id` z wcześniejszych tygodni i `created_at` w ostatnich 7 dniach też odbieramy, starsze oznaczamy `failed` („Wynik nie został odebrany”)
    3. nic do wysłania i nic do odebrania → `skipped` z `NOTHING_TO_CHECK_MESSAGE`; do wysłania > 0 → `passSeoBudget(estimateRankCost(n))`
    4. upsert wierszy `pending` (`onConflict: "keyword_id,device,week_start"`, `status: "pending"`, `error: null`), `postSerpTasks` z `tag` = id wiersza, update `dfs_task_id` i `cost_usd`; odrzucone → `failed` z błędem
    5. pętla: `sleep(POLL_INTERVAL_MS)`, `getSerpTask` dla każdego oczekującego (najwyżej 5 naraz); `done` → `parseSerp` (własne domeny projektu, konkurenci) i update wiersza (`status: "done"`, pola odczytu, `cost_usd` faktyczny, `checked_at`, `error: null`); `failed` → `status: "failed"`, `error`; koniec, gdy nic nie czeka albo po `MAX_POLLS`
    6. `finishJob(done)`, koszt = suma po wysłanych w tym jobie (faktyczny, gdy odebrany, inaczej koszt z `task_post`), `stats: { posted, resumed, done, failed, pending, estimateUsd }`; wyjątek → `failJob(..., "rank-check")` i rzucenie dalej
  - `src/trigger/rank-check.ts`: `rankCheckTask = task({ id: "rank-check", queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 1 }, maxDuration: 900, run: (p) => runRankCheck(p, { sleep: (ms) => wait.for({ seconds: Math.round(ms / 1000) }) }) })`
  - `seo-schedules.ts`: `runRankCheckWeekly(payload, deps)` + `rankCheckWeekly = schedules.task({ id: "rank-check-weekly", cron: { pattern: "0 4 * * 1", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] }, run })`: projekty z aktywną frazą (jak `runKeywordVolumesMonthly`) → `rankCheckTask.trigger({ projectId }, { idempotencyKey: \`rank-check:${id}:${rankWeekStart(timestamp)}\` })`
  - `scripts/rank-check-now.ts [projectId] [--local]` (wzór `scripts/keyword-volumes-now.ts`; `--local` z prawdziwym `setTimeout`)
- [ ] **Step 1: Failing tests** (fake admin + fake klienci, `sleep` natychmiastowy): `rankWeekStart` dla dwóch przypadków wyżej; brak fraz → `skipped`; budżet przekroczony → `postSerpTasks` niewołany, `budget_exceeded`; szczęśliwa ścieżka 2 frazy × 2 urządzenia → 4 zadania z tagami = id wierszy, wynik `done` zapisany z pozycją z parsera i kosztem faktycznym, koszt joba = suma faktycznych; wynik niegotowy przez `MAX_POLLS` → wiersz zostaje `pending`, job `done` z `pending: 1`, koszt z `task_post`; drugie uruchomienie z wierszem `pending` + `dfs_task_id` → brak `postSerpTasks`, odbiór i zapis; wszystkie pary `done` → `skipped` z `NOTHING_TO_CHECK_MESSAGE`; `postSerpTasks` rzuca brak środków → job `failed` z komunikatem; harmonogram: klucz idempotencji z poniedziałkiem, projekty bez fraz pominięte
- [ ] **Step 2: Run** `npm test -- --run tests/seo` → FAIL; **Step 3: Implement**; **Step 4: Run** → PASS, `npx tsc --noEmit`, eslint zmienionych
- [ ] **Step 5: Commit** `feat(seo): weekly rank check task on the DataForSEO standard queue`

---

### Task 5: Pozycje w widoku „Frazy”

**Files:**
- Create: `src/lib/seo/rank-queries.ts`, `src/lib/seo/rank-view.ts`
- Modify: `src/lib/seo/keyword-queries.ts` (`getKeywordJobs` += `ranks`), `src/app/app/google/keywords/sections.tsx`, `src/app/app/google/keywords/actions.ts`
- Test: `tests/seo/rank-view.test.ts`, `tests/seo/rank-queries.test.ts`, `tests/seo/keyword-actions.test.ts`, `tests/components/keyword-sections.test.tsx`

**Interfaces:**
- Consumes: `rank_latest` (Task 2), `SerpFeatures`, `CompetitorRank` (Task 3), `rankCheckTask` id `rank-check`, `estimateRankCost`, `MAX_RANK_KEYWORDS` (Task 4)
- Produces:
  - `rank-queries.ts`: `interface RankView { weekStart: string; position: number | null; rankAbsolute: number | null; url: string | null; breadcrumb: string | null; features: SerpFeatures; competitors: CompetitorRank[]; checkedAt: string | null; prevWeekStart: string | null; prevPosition: number | null }`; `getLatestRanks(projectId): Promise<Map<string, Partial<Record<Device, RankView>>>>` (`cache`, `rpc("rank_latest")`, jsonb parsowane defensywnie jak w `keyword-queries.ts`)
  - `rank-view.ts` (czyste): `positionText(p: number | null): string` („52” albo „poza top 100”); `rankChange(r: Pick<RankView, "position" | "prevPosition" | "prevWeekStart">): { kind: "up" | "down" | "same" | "new" | "lost" | "none"; places: number }` (bez `prevWeekStart` → `none`; null → liczba = `new`; liczba → null = `lost`); `rankChangeText(c): string` („↑ 3”, „↓ 2”, „bez zmian”, „nowa w top 100”, „wypadła z top 100”, `none` → „”); `featureBadges(f: SerpFeatures): string[]` w tej kolejności: „AI Overview: cytuje Was” / „AI Overview: bez Was”, „Fragment wyróżniony: Wasz” / „Fragment wyróżniony”, „Mapa z firmami”, „Pytania (PAA)”, „Panel wiedzy: Wasz”; `nearTop3(position: number | null, volume: number | null): boolean` (4-20 i wolumen ≥ 30); `rankedElsewhere(url: string | null, targetPath: string | null): boolean` (oba znane i ścieżka adresu różna od `targetPath`, porównanie bez końcowego „/”)
  - `getKeywordJobs` zwraca też `ranks: Tables<"seo_jobs"> | null` (ostatni `rank_check`)
  - `actions.ts`: `checkRanks()`: trigger `rank-check` z `{ projectId }`, klucz `rank-check:${projectId}:${okno10min}`, `idempotencyKeyTTL: "10m"`, błąd logowany
  - UI: `KeywordStatusSection` += `JobLine` „Pozycje” (stan `pending` z `stats.pending` > 0 jako „N wyników w kolejce DataForSEO, odbierze je następne sprawdzenie”) i przycisk „Sprawdź pozycje (najwyżej X USD)” z `estimateRankCost(min(aktywne, 100) × 2)`; każda kwota „najwyżej” na stronie (też dwie istniejące z M3) zaokrąglana w górę do centa helperem `usdUpTo(n)` w `sections.tsx` (`Math.ceil(n × 100) / 100`, odłożona uwaga M3), nota „Frazy sprawdzone w tym tygodniu nie są sprawdzane drugi raz.”; `KeywordItem`: nazwa frazy jako link do `/app/google/keywords/<id>`, kolumna pozycji „komputer 52 ↑ 3”, „telefon poza top 100”, rankujący adres (url albo breadcrumb), „najlepszy konkurent: Altkom Akademia, 7.”, odznaki `featureBadges`, oznaczenia „blisko top 3” i „rankuje inna strona niż docelowa”; bez pomiaru: „pozycja: jeszcze nie sprawdzano”
- [ ] **Step 1: Failing tests**: `rank-view` (wszystkie rodzaje zmian i teksty, kolejność odznak, `nearTop3(4, 30)` true i `(21, 1000)` false, `rankedElsewhere("https://polskaszkola.ai/szkolenia.html", "/szkolenia.html/")` false); `rank-queries` (mapowanie liczb z tekstu, uszkodzony jsonb → puste); akcje (`checkRanks` przy błędzie Trigger nie rzuca, klucz z projektem); komponenty („komputer 52”, „↑ 3”, „poza top 100”, odznaka „AI Overview: bez Was”, link do szczegółów, koszt w przycisku „najwyżej 0,14 USD” dla 10 fraz, czyli 0,132 w górę)
- [ ] **Step 2: Run** → FAIL; **Step 3: Implement**; **Step 4: Run** `npm test`, `npx tsc --noEmit`, eslint zmienionych
- [ ] **Step 5: Commit** `feat(google): weekly positions, SERP features and rival on the keywords page`

---

### Task 6: Szczegóły frazy

**Files:**
- Create: `src/app/app/google/keywords/[id]/page.tsx`, `src/components/RankHistoryChart.tsx`
- Modify: `src/lib/seo/rank-queries.ts`
- Test: `tests/seo/rank-queries.test.ts`, `tests/components/rank-history-chart.test.tsx`, `tests/components/keyword-detail.test.tsx`

**Interfaces:**
- Consumes: `getKeywords`/wiersz `keywords`, `rank_checks`, `gsc_query_detail` (Task 2), `rank-view` (Task 5), `gscWindows`, `getGscLastDate`
- Produces:
  - `getKeywordDetail(projectId: string, keywordId: string): Promise<{ keyword: KeywordRow; history: { weekStart: string; desktop: number | null; mobile: number | null }[]; latest: Partial<Record<Device, { weekStart: string; position: number | null; url: string | null; breadcrumb: string | null; top10: SerpEntry[]; competitors: CompetitorRank[]; features: SerpFeatures }>>; gsc: { page: string; clicks: number; impressions: number; position: number | null }[] } | null>` (null, gdy fraza nie należy do projektu; historia z wierszy `done`, rosnąco po tygodniu; GSC z ostatnich 28 dni okna `gscWindows`, pusto bez danych)
  - `RankHistoryChart({ points })` (`"use client"`, recharts jak `GscTrendChart`): oś Y odwrócona (1 na górze, domena 1-100), dwie linie (komputer ciągła, telefon przerywana), `null` jako przerwa, podpis osi X „dd.mm”, mniej niż 2 tygodnie → tekst „Historia pojawi się po drugim pomiarze.”
  - strona: `params: Promise<{ id: string }>`, `isUuid` → `notFound()`; `PageHero` z frazą; kafle komputer/telefon (pozycja, zmiana, adres, odznaki); wykres; „Top 10 w Google” dla komputera (nasza domena pogrubiona, konkurenci z nazwą, wpis przekierowany pokazuje breadcrumb zamiast adresu); „Search Console, ostatnie 28 dni” (strona, kliknięcia, wyświetlenia, średnia pozycja; pusto → „Brak wyświetleń tej frazy w Search Console.”); link „← Wszystkie frazy”
- [ ] **Step 1: Failing tests**: zapytanie (obca fraza → null; historia łączy komputer i telefon po tygodniu); wykres (mniej niż 2 punkty → komunikat; odwrócona oś: `reversed`); strona (komponent strony z mockiem zapytań: „poza top 100”, breadcrumb wpisu przekierowanego, pusta tabela GSC z komunikatem)
- [ ] **Step 2: Run** → FAIL; **Step 3: Implement**; **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run build` (trasa `/app/google/keywords/[id]` na liście)
- [ ] **Step 5: Commit** `feat(google): keyword detail with rank history, top 10 and Search Console data`

---

### Task 7: Czwarty kafel „Kierunek”: pozycje fraz

**Files:**
- Modify: `src/lib/trends/direction.ts`, `src/app/app/overview/direction.tsx`, `src/lib/seo/rank-queries.ts`
- Test: `tests/trends/direction.test.ts`, `tests/components/direction.test.tsx`

**Interfaces:**
- Produces:
  - `rank-queries.ts`: `getRankDirectionRows(projectId): Promise<{ keywordId: string; weekStart: string; position: number | null }[]>` (wiersze `done`, `device = 'desktop'`, ostatnie 42 dni od najnowszego tygodnia, klient sesji) i `countActiveKeywords(projectId): Promise<number>`
  - `DIRECTION_THRESHOLDS` += `rankPlaces: 3` (zmiana pozycji liczona jako ruch), `rankShare: 0.1` (udział porównanych fraz potrzebny do werdyktu)
  - `ChannelSummary.key` += `"rank"`; `SHORT_LABEL.rank = "pozycje fraz"`
  - `rankSummary(rows, ctx: { activeKeywords: number }): ChannelSummary` (label „Google: pozycje fraz”, href `/app/google/keywords`):
    ```
    brak wierszy → unknown, „Brak pomiarów pozycji”, detail: activeKeywords > 0 ? „Kliknij Sprawdź pozycje w Google → Frazy.” : „Dodaj frazy w Google → Frazy.”
    L = najnowszy week_start; cur = wiersze L; headline = `${top10} z ${n} ${n === 1 ? "frazy" : "fraz"} w top 10`
    B = pickBaseline(tygodnie jako { date }, L, 28); brak → unknown, detail „… brak wcześniejszego pomiaru do porównania”
    dla fraz w L i B: diff = (B ?? 101) − (L ?? 101); lepiej: diff ≥ 3, gorzej: diff ≤ −3, reszta bez zmian
    need = max(1, ceil(porównane × 0.1)); net = lepiej − gorzej; up: net ≥ need, down: net ≤ −need, inaczej flat; 0 porównanych → unknown
    detail = `lepiej: ${lepiej}, gorzej: ${gorzej}, bez zmian: ${bez}`; since = B
    ```
  - `DirectionSection` dokłada `rankSummary` (odczyt w try/catch jak GSC: błąd → log i kafel „brak danych”); siatka `md:grid-cols-2 xl:grid-cols-4`
- [ ] **Step 1: Failing tests**: `rankSummary` (brak wierszy z i bez fraz; jeden tydzień → unknown z top 10; 10 fraz: 2 lepiej o 5, 1 gorzej o 4 → need 1, net 1 → up; 20 fraz: 2 lepiej, 1 gorzej → need 2, net 1 → flat; fraza z 101 do 40 liczy się jako lepiej; „1 z 1 frazy w top 10”); `overallHeadline` z czterema kanałami; komponent: cztery kafle, link do `/app/google/keywords`
- [ ] **Step 2: Run** → FAIL; **Step 3: Implement**; **Step 4: Run** `npm test`, `npx tsc --noEmit`, eslint zmienionych, `npm run build`
- [ ] **Step 5: Commit** `feat(overview): rank direction card for tracked keywords`

---

## Po M2

- Sprawdzenie na żywo lokalnie: `scripts/rank-check-now.ts --local` dla 5 śledzonych fraz (najwyżej 0,07 USD), podgląd `/app/google/keywords` i szczegółów frazy w przeglądarce.
- Scalenie do `main` po zielonym `npm test`, `npx tsc --noEmit`, `npm run build`; wdrożenie po zgodzie Łukasza: `npx supabase db push`, `npx trigger.dev@4.7.3 deploy --project-ref proj_sitwivdlindrogesffbq`, push `main`.
- Koszt na produkcji: ok. 0,013 USD za frazę tygodniowo (komputer i telefon), przy 50 frazach ok. 2,9 USD/mies. w limicie SEO 10 USD.
