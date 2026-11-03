# Moduł Google: M3 (frazy, wolumeny, trendy, podpowiedzi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widok „Frazy” w zakładce Google: lista śledzonych fraz z miesięcznym wolumenem, trendem 12 miesięcy i Google Trends, „gdzie już jesteście w Google” (pozycje domeny z indeksu DataForSEO), luki względem konkurencji i podpowiedzi nowych fraz, z kosztem pokazanym przed każdym płatnym zapytaniem.

**Architecture:** Lista fraz (`keywords`, część M2 przeniesiona tutaj, bez śledzenia pozycji) i podpowiedzi (`keyword_suggestions`) w Supabase. Dwa płatne taski Trigger (`keyword-volumes` miesięcznie i na żądanie, `keyword-research` na żądanie) wołają endpointy DataForSEO **live** przez `dfsRequest` (`src/lib/dataforseo/client.ts`), sprawdzają limit SEO przed wywołaniem i zapisują koszt z odpowiedzi w `seo_jobs`. UI czyta tabele klientem sesji (bez funkcji SQL: listy mają limit poniżej 1000 wierszy).

**Tech Stack:** Next.js (niestandardowa wersja: przed kodem stron i akcji przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/`), Supabase Postgres + RLS, Trigger.dev 4.7.3, Vitest 5, zod 4.

**Spec:** `docs/superpowers/specs/2026-11-02-google-seo-design.md` (sekcje M3 i „Frazy”); odłożone uwagi M0/M1: `docs/superpowers/plans/2026-11-02-google-seo-followups.md`.

## Global Constraints

- Teksty UI i komunikaty po polsku; bez U+2013 i U+2014 w nowych tekstach (minus to U+2212), przecinek dziesiętny, liczby przez helpery z `src/lib/format/number.ts`.
- Każda nowa tabela: RLS `for all using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)))`; typy przez `npx supabase gen types typescript --local > src/lib/db-types.ts`; nigdy `supabase db reset`. Testy RLS: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- --run tests/db`.
- DataForSEO: tylko endpointy live (ruling M3-R1), lokalizacja `dfsLocationCode()` (2616), `language_code: "pl"`, błędy i ponawianie przez `dfsRequest`. Koszt zapisujemy z pola `cost` odpowiedzi.
- Przed każdym płatnym zadaniem: `seoMonthSpend` + `decideSeoSpend` wobec `projects.seo_budget_usd`; przekroczenie = brak wywołania API i job `budget_exceeded`.
- Taski: ciało jako `runX(payload, deps)` z wstrzykiwanym `admin`, klientami API i `now`; `retry: { maxAttempts: 1 }` (płatne); skrypty `scripts/*-now.ts` z `--local`.
- Harmonogram: `schedules.task` z `cron: { pattern, timezone: "Europe/Warsaw", environments: ["PRODUCTION"] }`.
- Akcje UI: klient sesji (`createServerSupabase`) i `getCurrentProject()`; wywołanie Trigger w try/catch (błąd logujemy, strona się nie wywraca), klucz idempotencji z oknem 10 minut.
- Frazy porównujemy po kluczu `normalizeKeyword` (NFC, trim, małe litery wg `pl`, pojedyncze spacje); polskie znaki zostają.
- Commity kończą się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fixtury prawdziwych odpowiedzi (2026-11-03): `tests/fixtures/dataforseo/{search-volume,trends-explore,labs-keyword-suggestions,labs-ranked-keywords-own,labs-ranked-keywords-competitor}.json`.

## Review Focus

1. Limit SEO przekroczony: brak wywołania DataForSEO, job `budget_exceeded`, w UI czytelny komunikat z kwotą. Test: Task 4.
2. Google Ads nie podaje wolumenu dla rzadkich fraz (`search_volume: null`, jak „kurs ai dla firm” w fixture): zapisujemy `null`, UI pisze „brak danych”, nigdy 0. Testy: Task 3, Task 5.
3. Kotwica Trends z samymi zerami albo brakami w paczce: wartości tej paczki `null`, nie zawyżone. Test: Task 3.
4. Te same frazy różniące się wielkością liter, spacjami albo postacią Unicode: jeden klucz; polskie znaki zachowane. Test: Task 2.
5. Ponowne wyszukiwanie nie przywraca odrzuconych ani zaakceptowanych podpowiedzi i nie podpowiada fraz już śledzonych. Test: Task 4.

## Rulings przyjęte w planie

- M3-R1: endpointy live zamiast kolejki standard: przy miesięcznym wolumenie różnica to ok. 0,1 USD, a odpada kolejka i odpytywanie (kolejka zostaje dla pozycji w M2).
- M3-R2: trend Google Trends trzymamy jako `keywords.trend jsonb` (52 tygodnie, nadpisywane), nie w osobnej tabeli: unikamy limitu 1000 wierszy przy szkicach dla wielu fraz, a Trends i tak oddaje pełne 12 miesięcy przy każdym odświeżeniu.
- M3-R3: Trends wołamy tylko dla fraz z wolumenem co najmniej 50 (stała `TRENDS_MIN_VOLUME`): rzadkie frazy w Trends to same zera.
- M3-R4: domyślna kotwica `szkolenia ai`, gdy `projects.trends_anchor` jest pusty.

---

## Struktura plików

```
src/lib/seo/budget.ts, src/lib/seo/jobs.ts, src/app/app/settings/page.tsx, tests/components/google-subnav.test.tsx   # Task 1
supabase/migrations/20261103000000_keywords.sql, src/lib/seo/keywords.ts                                           # Task 2
src/lib/dataforseo/{keywords-data,trends,labs}.ts, src/lib/seo/costs.ts                                             # Task 3
src/lib/seo/{keyword-volumes,keyword-research}.ts, src/trigger/{keyword-volumes,keyword-research}.ts,
  src/trigger/seo-schedules.ts, scripts/{keyword-volumes-now,keyword-research-now}.ts                              # Task 4
src/lib/seo/keyword-queries.ts, src/app/app/google/keywords/{page,sections,actions}.tsx|ts,
  src/components/Sparkline.tsx, src/app/app/google/GoogleSubNav.tsx                                                 # Task 5
```

---

### Task 1: Domknięcie uwag przed płatnymi zadaniami

**Files:**
- Modify: `src/lib/seo/budget.ts:17`, `src/lib/seo/jobs.ts:26-45`, `src/app/app/settings/page.tsx` (pola budżetów), `tests/components/google-subnav.test.tsx`
- Test: `tests/seo/budget.test.ts`, `tests/seo/jobs.test.ts`

**Interfaces:**
- Produces:
  - `decideSeoSpend` zwraca `go` tylko gdy `spent + estimate <= budget` (NaN w dowolnym argumencie daje `budget_exceeded`)
  - `finishJob`: gdy `costUsd` nie podano, NIE nadpisuje `cost_usd`; gdy żaden wiersz nie został zaktualizowany (nieznane `jobId`), rzuca `Error("seo_jobs: brak zadania <id>")` (użyj `.select("id")` po `update`)
  - pola „Miesięczny budżet API (USD)” i „Miesięczny limit SEO (USD)”: `required`, `step="any"`
  - test podmenu z jedną pozycją przekazuje `items` jawnie (nie zależy od `GOOGLE_NAV`)
- [ ] **Step 1: Failing tests**: `"decideSeoSpend: NaN to budget_exceeded"` (`(NaN, 1, 10)`, `(1, NaN, 10)`, `(1, 1, NaN)`); `"finishJob bez costUsd nie wysyła cost_usd"`; `"finishJob dla nieznanego id rzuca"`
- [ ] **Step 2: Run** `npm test -- --run tests/seo tests/components` → FAIL; **Step 3: Implement**; **Step 4: Run** → PASS, `npx tsc --noEmit`
- [ ] **Step 5: Commit** `fix(seo): budget gate fails closed, finishJob keeps cost, budget inputs`

---

### Task 2: Tabele fraz i podpowiedzi

**Files:**
- Create: `supabase/migrations/20261103000000_keywords.sql`, `src/lib/seo/keywords.ts`
- Modify: `src/lib/db-types.ts` (regeneracja), `tests/db/rls.test.ts`
- Test: `tests/seo/keywords.test.ts`

**Interfaces:**
- Produces:
  - `keywords(id uuid pk default gen_random_uuid(), project_id uuid not null references projects on delete cascade, text text not null, key text not null, source text not null check (source in ('manual','gsc','suggestion','ranked','gap')), target_path text, active boolean not null default true, search_volume int, competition text, competition_index int, cpc numeric(10,2), monthly_searches jsonb, volume_updated_at timestamptz, trend jsonb, trend_updated_at timestamptz, created_at timestamptz not null default now(), unique (project_id, key))`, indeks `(project_id, active)`
  - `keyword_suggestions(id uuid pk, project_id …, key text not null, text text not null, seed text, source text not null check (source in ('labs','ranked','gap')), search_volume int, keyword_difficulty int, cpc numeric(10,2), own_position int, own_url text, competitor_positions jsonb not null default '[]', status text not null default 'new' check (status in ('new','accepted','dismissed')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (project_id, key))`
  - RLS na obu (wzór `supabase/migrations/20261102000000_seo_core.sql`)
  - `src/lib/seo/keywords.ts`: `normalizeKeyword(text: string): string` (NFC, trim, `toLocaleLowerCase("pl")`, wielokrotne białe znaki → jedna spacja); `parseKeywordList(input: string, max = 200): string[]` (podział po nowych liniach i przecinkach, `normalizeKeyword`, bez pustych, bez dłuższych niż 80 znaków, bez duplikatów, najwyżej `max`); `export const DEFAULT_TRENDS_ANCHOR = "szkolenia ai"`; `export const COMPETITION_LABEL: Record<string, string> = { LOW: "niska", MEDIUM: "średnia", HIGH: "wysoka" }`
- [ ] **Step 1: Migracja**, `npx supabase migration up --local`, regeneracja typów (diff: dwie tabele)
- [ ] **Step 2: Failing tests**: `keywords.test.ts`: `normalizeKeyword("  Szkolenia   AI ")` → `"szkolenia ai"`; NFD „łódź” (`"lódź"` itp.) równa NFC; `"Wrocław"` → `"wrocław"` (znaki zostają); `parseKeywordList("a\nB, a\n\n" + "x".repeat(81))` → `["a","b"]`; limit `max`. RLS: `"anon i nie-członek nie widzą fraz ani podpowiedzi, członek widzi"` (wzór seo_jobs, sprzątanie w `finally`)
- [ ] **Step 3: Implement**; **Step 4: Run** testy seo i DB → PASS, `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(db): keywords and keyword suggestions with RLS`

---

### Task 3: Klienci DataForSEO: wolumeny, Trends, Labs, koszty

**Files:**
- Create: `src/lib/dataforseo/keywords-data.ts`, `src/lib/dataforseo/trends.ts`, `src/lib/dataforseo/labs.ts`, `src/lib/seo/costs.ts`
- Test: `tests/dataforseo/keywords-data.test.ts`, `tests/dataforseo/trends.test.ts`, `tests/dataforseo/labs.test.ts`, `tests/seo/costs.test.ts`

**Interfaces:**
- Consumes: `dfsRequest`, `dfsLocationCode` (`src/lib/dataforseo/client.ts`)
- Produces:
  - `keywords-data.ts`: `interface VolumeItem { keyword: string; searchVolume: number | null; competition: string | null; competitionIndex: number | null; cpc: number | null; monthlySearches: { year: number; month: number; searchVolume: number | null }[] }`; `searchVolume(keywords: string[]): Promise<{ items: VolumeItem[]; costUsd: number }>`: paczki po 1000, `POST /keywords_data/google_ads/search_volume/live`, body `[{ keywords, location_code, language_code: "pl" }]`, wynik `tasks[i].result[]` (każdy element to jedna fraza; patrz fixture), `monthly_searches: null` → `[]`
  - `trends.ts`: `interface TrendSeries { keyword: string; points: { week: string; value: number | null }[] }`; `trendsExplore(keywords: string[]): Promise<{ series: TrendSeries[]; costUsd: number }>` (najwyżej 5 fraz; `POST /keywords_data/google_trends/explore/live`, body `[{ keywords, location_code, language_code: "pl", time_range: "past_12_months", type: "web" }]`; z `result[0].items` bierz element `type === "google_trends_graph"`, `week = data[i].date_from`, `values[j]` odpowiada `item.keywords[j]`); `trendBatches(keywords: string[], anchor: string): string[][]` (po 4 frazy bez kotwicy + kotwica na końcu każdej paczki); `normalizeTrends(batches: TrendSeries[][], anchor: string): Map<string, { week: string; value: number | null }[]>`:
    ```
    ref = seria kotwicy z pierwszej paczki, w której suma wartości kotwicy > 0
    dla każdej paczki: factor = sum(ref) / sum(kotwica w paczce)  (suma 0 albo brak kotwicy → factor = null)
    wartość = factor === null || v === null ? null : round(v * factor, 1)
    kotwica w wyniku raz (z paczki ref); tygodnie łączone po `week`
    ```
  - `labs.ts`: `interface LabsKeyword { keyword: string; searchVolume: number | null; keywordDifficulty: number | null; cpc: number | null }`; `keywordSuggestions(seed: string, limit = 50): Promise<{ items: LabsKeyword[]; costUsd: number }>` (`POST /dataforseo_labs/google/keyword_suggestions/live`, body `[{ keyword: seed, location_code, language_code: "pl", limit, include_seed_keyword: true }]`, pola z `keyword_info` i `keyword_properties.keyword_difficulty`); `interface RankedKeyword extends LabsKeyword { position: number; url: string }`; `rankedKeywords(target: string, limit = 100): Promise<{ items: RankedKeyword[]; costUsd: number }>` (`POST /dataforseo_labs/google/ranked_keywords/live`, body `[{ target, location_code, language_code: "pl", limit, order_by: ["keyword_data.keyword_info.search_volume,desc"] }]`, `position = ranked_serp_element.serp_item.rank_group`, `url = serp_item.url`, tylko `serp_item.type === "organic"`)
  - `src/lib/seo/costs.ts`: `export const DFS_PRICE = { searchVolumeTask: 0.09, trendsTask: 0.011, labsTask: 0.012, labsRow: 0.00012 } as const`; `estimateVolumesCost(keywords: number, trendKeywords: number): number` = `ceil(keywords/1000) × 0.09 + ceil(trendKeywords/4) × 0.011`; `estimateResearchCost(o: { seeds: number; domains: number; suggestionLimit?: number; rankedLimit?: number }): number` = `seeds × (0.012 + 50 × 0.00012) + domains × (0.012 + 100 × 0.00012)` przy domyślnych limitach (50, 100)
- [ ] **Step 1: Failing tests** na fixtures (mock `fetch` jak w `tests/dataforseo/client.test.ts`): wolumeny „szkolenia ai” 1900, `competition` "HIGH", `competitionIndex` 75, `cpc` 2.4, 12 miesięcy; „kurs ai dla firm” `searchVolume` null i `monthlySearches` `[]`; `costUsd` 0.09; URL i body. Trends: 53 tygodnie, pierwszy `week` "2025-11-02", „szkolenie chatgpt” ma `null` w pierwszym tygodniu; `trendBatches` dla 9 fraz → 3 paczki z kotwicą na końcu, kotwica nie dubluje się, gdy jest na liście; `normalizeTrends`: paczka 2 z kotwicą dwa razy mniejszą podwaja wartości, paczka z kotwicą samych zer daje `null`. Labs: 20 podpowiedzi, pierwsza „szkolenia ai” 1900, trudność 8; ranked own: 6 fraz, „szkolenia ai” pozycja 52, URL `https://www.polskaszkola.ai/`; ranked competitor: „szkolenia ai” pozycja 7. Koszty: `estimateVolumesCost(30, 10)` = 0.123, `estimateResearchCost({ seeds: 7, domains: 8 })` = 0.318
- [ ] **Step 2: Run** `npm test -- --run tests/dataforseo tests/seo/costs.test.ts` → FAIL; **Step 3: Implement**; **Step 4: Run** → PASS, `npx tsc --noEmit`
- [ ] **Step 5: Commit** `feat(dataforseo): search volume, Google Trends and Labs clients with cost estimates`

---

### Task 4: Taski: wolumeny i trendy, wyszukiwanie fraz

**Files:**
- Create: `src/lib/seo/keyword-volumes.ts`, `src/lib/seo/keyword-research.ts`, `src/trigger/keyword-volumes.ts`, `src/trigger/keyword-research.ts`, `scripts/keyword-volumes-now.ts`, `scripts/keyword-research-now.ts`
- Modify: `src/trigger/seo-schedules.ts`
- Test: `tests/seo/keyword-volumes.test.ts`, `tests/seo/keyword-research.test.ts`, `tests/seo/seo-schedules.test.ts`

**Interfaces:**
- Consumes: Task 2 tabele i `normalizeKeyword`, `DEFAULT_TRENDS_ANCHOR`; Task 3 klienci i koszty; `startJob`, `finishJob`, `seoMonthSpend`, `decideSeoSpend`
- Produces:
  - `export const TRENDS_MIN_VOLUME = 50`, `export const MAX_TRACKED = 500`
  - `runKeywordVolumes(payload: { projectId: string }, deps?: { admin?; searchVolume?; trendsExplore?; now?: () => Date }): Promise<{ status: SeoJobStatus; keywords: number; trends: number; costUsd: number }>`:
    1. aktywne frazy projektu (najwyżej `MAX_TRACKED`); brak → job `skipped` („Brak aktywnych fraz”)
    2. szacunek `estimateVolumesCost(n, n)` (górna granica), `decideSeoSpend(seoMonthSpend, szacunek, seo_budget_usd)`; przekroczenie → job `budget_exceeded` z komunikatem „Limit SEO: wydano X USD z Y USD, to zadanie kosztuje ok. Z USD”, bez API
    3. `searchVolume` → update każdej frazy (`search_volume`, `competition`, `competition_index`, `cpc`, `monthly_searches`, `volume_updated_at`)
    4. frazy z wolumenem `>= TRENDS_MIN_VOLUME` + kotwica (`trends_anchor ?? DEFAULT_TRENDS_ANCHOR`) → `trendBatches` → `trendsExplore` na paczkę → `normalizeTrends` → update `trend` (lista `{ week, value }`) i `trend_updated_at`
    5. `finishJob` z faktycznym kosztem (suma `costUsd`) i statystykami; wyjątek → `failed` z kosztem do tego momentu i rzucenie dalej
  - `runKeywordResearch(payload: { projectId: string; seeds: string[]; competitors: boolean }, deps?: { admin?; keywordSuggestions?; rankedKeywords?; now? }): Promise<{ status: SeoJobStatus; suggestions: number; costUsd: number }>`:
    1. ziarna: `parseKeywordList(seeds.join("\n"), 10)`; domeny: pierwsza z `projects.domains` (własna) + przy `competitors` pierwsza domena każdego konkurenta (najwyżej 7)
    2. szacunek `estimateResearchCost`, bramka budżetu jak wyżej
    3. `keywordSuggestions(seed, 50)` dla każdego ziarna → source `labs`, `seed`
    4. `rankedKeywords(own, 100)` → source `ranked`, `own_position`, `own_url`
    5. przy `competitors`: `rankedKeywords(domena, 100)`, tylko pozycje `<= 20`; frazy, których nie ma w wynikach własnej domeny → source `gap`, `competitor_positions` lista `{ name, domain, position, url }` scalona po kluczu (posortowana po pozycji)
    6. pomiń klucze już śledzone (`keywords.key`); upsert `keyword_suggestions` po `(project_id, key)` z zachowaniem istniejącego `status` (najpierw odczyt istniejących), `updated_at = now`; przy kolizji źródeł: `ranked` wygrywa z `gap`, `gap` z `labs` (zachowaj `own_position` i `competitor_positions`, jeśli są)
    7. `finishJob` jak wyżej
  - `src/trigger/keyword-volumes.ts`: `keywordVolumesTask = task({ id: "keyword-volumes", queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 1 }, maxDuration: 900, run: (p) => runKeywordVolumes(p) })`; `src/trigger/keyword-research.ts`: analogicznie, id `keyword-research`
  - `seo-schedules.ts`: `runKeywordVolumesMonthly(payload, deps)` + `keywordVolumesMonthly = schedules.task({ id: "keyword-volumes-monthly", cron: { pattern: "0 5 2 * *", timezone: "Europe/Warsaw", environments: ["PRODUCTION"] }, run })`: projekty z co najmniej jedną aktywną frazą → `keywordVolumesTask.trigger({ projectId }, { idempotencyKey: \`keyword-volumes:${id}:${RRRR-MM}\` })`
  - skrypty: `scripts/keyword-volumes-now.ts [projectId] [--local]`, `scripts/keyword-research-now.ts [projectId] --seeds "a, b" [--no-competitors] [--local]` (wzór `scripts/gsc-sync-now.ts`)
- [ ] **Step 1: Failing tests** (fake admin rejestrujący zapytania, fake klienci): brak fraz → `skipped`; budżet 10, wydane 9,95, szacunek 0,10 → `budget_exceeded`, klienci niewołani, komunikat z kwotami; szczęśliwa ścieżka: wolumen `null` zapisany jako `null`, Trends tylko dla fraz `>= 50`, kotwica domyślna, koszt = suma; wyjątek klienta → `failed` z kosztem dotychczasowym. Research: podpowiedzi bez fraz śledzonych; odrzucona wcześniej podpowiedź zostaje `dismissed`; luka tylko gdy własna domena nie rankuje; `competitor_positions` scalone dla dwóch konkurentów; bez `competitors` tylko 1 domena w szacunku. Harmonogram: klucz idempotencji z miesiącem, projekty bez fraz pominięte
- [ ] **Step 2: Run** `npm test -- --run tests/seo` → FAIL; **Step 3: Implement**; **Step 4: Run** → PASS, `npx tsc --noEmit`, eslint zmienionych plików
- [ ] **Step 5: Commit** `feat(seo): keyword volumes, trends and research tasks with budget gate`

---

### Task 5: Widok „Frazy”

**Files:**
- Create: `src/lib/seo/keyword-queries.ts`, `src/app/app/google/keywords/page.tsx`, `src/app/app/google/keywords/sections.tsx`, `src/app/app/google/keywords/actions.ts`, `src/components/Sparkline.tsx`
- Modify: `src/app/app/google/GoogleSubNav.tsx` (`GOOGLE_NAV` += `["/app/google/keywords", "Frazy"]`)
- Test: `tests/seo/keyword-queries.test.ts`, `tests/seo/keyword-actions.test.ts`, `tests/components/keyword-sections.test.tsx`, `tests/components/sparkline.test.tsx`

**Interfaces:**
- Consumes: tabele Task 2, `parseKeywordList`, `normalizeKeyword`, `COMPETITION_LABEL`; `keywordVolumesTask`, `keywordResearchTask`; `estimateVolumesCost`, `estimateResearchCost`; `getQueryWindows`, `gscWindows`, `getGscLastDate` (import z GSC); helpery formatów
- Produces:
  - `keyword-queries.ts` (`cache` + klient sesji): `getKeywords(projectId)` (≤ `MAX_TRACKED`, sort: wolumen malejąco, `null` na końcu), `getSuggestions(projectId, source: "labs" | "ranked" | "gap", limit = 100)` (tylko `status = 'new'`; `ranked` sort po `own_position`, pozostałe po wolumenie), `getKeywordJobs(projectId)` (ostatni job `keyword_volumes` i `keyword_research`)
  - `actions.ts` (server actions, `getCurrentProject`, klient sesji, `revalidatePath("/app/google/keywords")`): `addKeywords(formData)` (pole `keywords`, `parseKeywordList`, insert z `source: "manual"`, duplikaty pomijane przez `onConflict` + `ignoreDuplicates`), `toggleKeyword(formData)`, `deleteKeyword(formData)`, `setTargetPath(formData)` (ścieżka zaczyna się od „/” albo pusta → `null`), `acceptSuggestion(formData)` (insert frazy ze źródłem `labs → suggestion`, `ranked → ranked`, `gap → gap` + status `accepted`), `dismissSuggestion(formData)`, `importFromGsc()` (50 fraz z największą liczbą wyświetleń z ostatnich 28 dni, których nie ma na liście, `source: "gsc"`; bez danych GSC nic nie robi), `refreshVolumes()` i `runResearch(formData)` (pola `seeds`, `competitors`; trigger z kluczem idempotencji 10 minut; błąd Trigger łapany i logowany)
  - `Sparkline({ values, label }: { values: (number | null)[]; label: string })`: SVG 96×24, `role="img"`, `aria-label`, `null` jako przerwa, mniej niż 2 wartości → nic
  - strona `/app/google/keywords` (`PageHero` „Polska Szkoła AI · Google”, „Frazy w Google”), sekcje w `Suspense`:
    1. **Stan**: ostatnie odświeżenie wolumenów i ostatnie wyszukiwanie (data, status, koszt), komunikat `budget_exceeded`/`failed`; przycisk „Odśwież wolumeny i trendy (ok. X USD)”
    2. **Gdzie już jesteście w Google** (`ranked`): fraza, pozycja, wolumen, adres; przycisk „Śledź”; nota „według indeksu DataForSEO z dnia wyszukiwania”; pusto → „Uruchom wyszukiwanie fraz poniżej.”
    3. **Śledzone frazy**: fraza, źródło, wolumen/mies. (`null` → „brak danych”), trend 12 mies. (`Sparkline` z `monthly_searches` od najstarszego), Google Trends (`Sparkline` z `trend`, gdy jest), konkurencja (`COMPETITION_LABEL`), CPC „2,40 USD”, docelowa strona (mały formularz), przełącznik aktywności, usuń; formularz „Dodaj frazy (każda w osobnej linii)”; przycisk „Importuj z Search Console” (wyłączony z podpowiedzią bez danych GSC)
    4. **Luki: konkurencja jest wyżej** (`gap`): fraza, wolumen, najlepszy konkurent („Altkom Akademia: 7. miejsce”), „Śledź” / „Odrzuć”
    5. **Podpowiedzi fraz** (`labs`): fraza, wolumen, trudność 0-100, ziarno, „Śledź” / „Odrzuć”
    6. **Szukaj nowych fraz**: pole ziaren (domyślnie `DEFAULT_SEEDS = ["szkolenia ai", "szkolenie chatgpt", "kurs ai dla firm", "szkolenie ai act", "szkolenia ai warszawa", "szkolenia ai wrocław", "lider w erze ai"]` w `keywords.ts`), pole wyboru „Sprawdź też konkurencję (N domen)”, koszt „ok. X USD” liczony dla domyślnych ustawień, przycisk „Szukaj fraz”
- [ ] **Step 1: Failing tests**: zapytania (mapowanie liczb z tekstu, sort z `null` na końcu, filtr `status = 'new'`); akcje (dodanie 3 fraz z duplikatem → 2 inserty z `source: "manual"`; akceptacja `ranked` tworzy frazę `ranked` i ustawia `accepted`; `refreshVolumes` przy błędzie Trigger nie rzuca; import z GSC pomija śledzone); komponenty (wolumen `null` → „brak danych”, „Altkom Akademia: 7. miejsce”, CPC z przecinkiem, koszt w przycisku, `Sparkline` z `null` w środku rysuje dwa odcinki, `aria-label`)
- [ ] **Step 2: Run** → FAIL; **Step 3: Implement**; **Step 4: Run** `npm test`, `npx tsc --noEmit`, eslint zmienionych, `npm run build` → zielone
- [ ] **Step 5: Commit** `feat(google): keywords page with volumes, trends, rankings and suggestions`

---

## Po M3

- Scalenie do `main` po zielonym `npm test`, `npx tsc --noEmit`, `npm run build`.
- Wdrożenie po zgodzie Łukasza: `npx supabase db push`, `npx trigger.dev@4.7.3 deploy --project-ref proj_sitwivdlindrogesffbq`, push `main` (Vercel z GitHuba).
- Pierwsze wyszukiwanie fraz na produkcji: koszt ok. 0,32 USD (7 ziaren, własna domena i 7 konkurentów), potem odświeżenie wolumenów ok. 0,1 USD.
