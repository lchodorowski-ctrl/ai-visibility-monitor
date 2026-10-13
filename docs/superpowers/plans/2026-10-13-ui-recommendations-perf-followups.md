# Follow-upy po planie UI / rekomendacje / szybkość (2026-10-13)

Stan: 15 zadań wykonanych, recenzja całej gałęzi + fala poprawek, tag `v0.2.0-ui-recs` (a47c327). Poniżej odłożone drobiazgi (minor) i zaparkowane uwagi z recenzji — do rozważenia przed produkcją lub w fazie 2.

## Wymagane działania użytkownika
- Ustaw `ANTHROPIC_WORKSPACE_ID` w `.env.local` (klucz Anthropic nie jest przypisany do workspace'u; bez tego sentyment i rekomendacje zwracają 400) albo użyj klucza workspace-scoped.
- Uruchom `npx tsx --env-file=.env.local scripts/recommend-now.ts 22222222-2222-2222-2222-222222222222 2026-10-12` (albo pełny run) i oceń rekomendacje.
- Zalogowany przegląd 1440/375 px oraz `scripts/measure-ttfb.ts` z cookie (wyniki do README, sekcja Szybkość).

## Zaparkowane po recenzji końcowej
- Final: parked — BARE_DOMAIN normalises bare filenames (`sitemap.xml` → https://sitemap.xml) — Ruling: real but low impact (model rarely emits bare filenames; concreteness prompt asks for paths); follow-up.
- Final: parked — `/\host` bypasses the `//` guard — Ruling: negligible (offsite already links external with noreferrer); follow-up.
- Final: parked — inline crawl + 20 Opus calls must fit maxDuration 1800; cost written after loop — Ruling: bounded by cap; follow-up: write cost per prompt or raise maxDuration.
- Final: parked — manual refresh cost lands on latest run even across months — Ruling: acceptable for an internal tool; follow-up.
- Final: parked — countRecommendationsByPrompt selects full evidence jsonb — Ruling: perf nit; follow-up.
- Final: out-of-scope notes carried to user: merged rec keeps first prompt_id (detail shows one prompt); page lock checks latest run only; recommend-project does not enforce monthly budget before spending; crawler SSRF via redirects.

## Odłożone drobiazgi per zadanie
- Task 1: minor (deferred): next.config `path.resolve(process.cwd())` for turbopack.root (prefer import.meta.dirname); `latest=null` when no metrics in 90 days (UI empty state — handled by T5 EmptyState); unused `_supabase` param in getOverview (remove in T5); README note that `dev` and `start:prod` share `.next`.
- Task 2: minor (deferred): shadcn controls use `focus-visible:ring-3 ring-ring/50` overriding global 2px ink outline (normalise when Task 3 touches button.tsx / later components); `card.tsx` still uses dangling `font-heading`; pluralPl non-integers; hard-coded Tailwind palette in Heatmap/HighlightedText (replaced in Task 6/7).
- Task 3: minor (deferred): thin component tests (8/13 untested, no edge cases); NaN guards in ProgressBar/Dots; hard-coded heading levels (h2/h3) in StatTile/EmptyState/TileInverse; ProgressBar bakes `mt-8`; TileSkeleton no role/label; StatTile 72→96px at md instead of 520px (plan-mandated); other shadcn controls keep ring focus style.
- Task 3: minor (deferred): quiet compound variant also applies to size="icon" (h-auto), no call sites today.
- Task 4: minor (deferred): login button "Zaloguj" vs constraint example "Zaloguj się" (plan-mandated); long project name not truncated in header; `startsWith` active matching; unused `NAV` export.
- Task 5: minor (deferred): stale/budget_exceeded run status not red; empty wrapper div in TrendChart; "0 pomiarów" meta before first run; page-level getLastRun before shell streams (spec-mandated); hard-coded "Polską Szkołę AI" in inverse tile title (use project.brand_name — multi-tenant); duplicate CTA when no run.
- Task 6: minor (deferred): heatmap cell aria-label on div (use title/sr-only), prompt cell should be th scope=row; missing topic name renders blank (`?? "bez tematu"`); header-only table when no active prompts; counts truthy-gated (Task 14 passes object); key-toggle button shows state not action (add aria-label); stray blank line; Row padding override in generate page.
- Task 6: minor (deferred): color-mix needs Chrome 111+/Safari 16.2+; text-bg threshold at 45% borderline contrast.
- Task 7: minor (deferred): loose cursor validation (`?before=12` → 500; use ISO regex); strict `lt` may skip same-timestamp rows (plan-mandated, theoretical); stale cursor shows misleading empty state without link back; SENTIMENT_LABELS placed in paging.ts (move to labels); sentiment sentence only when summary exists.
- Task 9: minor (deferred): create policy unguarded (plan-mandated); no updated_at trigger (consumers set it explicitly); generated `priority` typed number|null.
- Task 8: minor (deferred): empty threshold coerces to 0 and "0,34" → NaN with English zod message (preprocess); uppercase scheme fails regex (use /i); help text Meta not linked via aria-describedby and renders uppercase mono (normal-case override); hero eyebrow/title redundancy; validation errors thrown to error boundary instead of inline (pre-existing).
- Task 10: minor (deferred): cross-host redirects followed (consider redirect manual/check res.url); no content-type check or body cap; non-OK bodies undrained; non-200 overwrite good rows with nulls; retired count not "newly"; retire select unpaginated (>1000); robots: consecutive UA lines not merged, failed robots = allow-all, filtering after cap; entity decoding order/coverage, comments not stripped, dropBlocks no word boundary; rewriteHost keeps port; missing crawl tests (timeout, concurrency, UA, non-HTML); global queue limit serialises projects; no logging of failed pages.
- Task 10: minor (deferred): unprefixed <loc> under a prefixed root now dropped (namespace-incorrect XML); prefix regex \w+ excludes '-'/'.' NCNames; 200-with-zero-locs sitemap = silent no-op.
- Task 11: minor (deferred): NFD excerpt test doesn't pin offset mapping; slice may split surrogate pairs; qualify boundary tests missing (== threshold, single zero engine, brand + 2 zero engines); dead second replace in normalizeTitle; visibility_by_engine last-writer-wins; merge ordering not canonical, quotes not deduped; first-10 URLs not prioritised by frequency; raw aggregation keys (verify extractor normalises domains); substring alias match ("EY" in "they"); empty normalised title collapses fingerprints.
- Task 12: minor (deferred): cost ignores cache tokens (system prompt likely below cache minimum anyway); target_url not checked against sitePages; zod min/max violations fail the whole call; tests mock zodOutputFormat and don't assert system/cache_control/format; env restore without finally; `head` helper misnamed; sitemap_index.xml / robots Sitemap: not probed.
- Task 12: minor (deferred): delimiter tags not escaped (literal closing tag in excerpt); SYSTEM data-line names only two sections; isConcreteUrl accepts "/TBD"; throw before cost accounting loses spend of failed call.
- Task 13: minor (deferred): runRecommendProject untested (skip path, empty runIds, failed accounting, day window); persist tests don't assert project_id scope/run_id/updated_at; **re-runs (retry/refresh) double evidence counts via mergeEvidence sums** (design, flag for final review); failed generation loses cost; unordered limit(50) on responses; recommendProject.trigger inside run's try → trigger failure marks a good run failed (consider try/catch + log); refresh uses today's UTC date (no metrics today → only technical rules) and double-click enqueues duplicates; action edge cases (missing id → "null", ZodError raw); recommend-now date unvalidated.
- Task 14: minor (deferred): detail page without Suspense/skeleton; overview empty-state wording when only "doing" items; heading hierarchy (h3 cards, 30px h2 in tiles at 375px); aria-current="page" on filter chips (prefer "true"); Filters Suspense fallback null → layout shift; test gaps (applyFilters single-filter cases, detail helpers, teal done case); RecommendationMeta unused on detail; React.cache ineffective with per-call objects; 500-row cap before filtering; bare-domain target_url renders as internal link.
- Task 14: minor (deferred): list/top queries now fetch rationale text for ≤500 rows (explicit column list later).
- Task 15: minor (deferred): ANTHROPIC_RECOMMENDER_MODEL missing from .env.example; README cookie wording (chunked sb-…-auth-token.0/.1); script prints status of run 1 only; script lacks `export {}`; manual recommend-now records no cost (runId null).

## Pominięte przez plan elementy specyfikacji (z recenzji końcowej)
- Hero Rekomendacji bez liczby otwartych, daty ostatniego odświeżenia i blokady „pomiar w toku” (blokada dodana w fali poprawek).
- Wpływ/wysiłek słownie zamiast `Dots` 1–5.
- Brak jednego kliknięcia „Zrobione” z `todo` (dziś: Zaczynam → Zrobione).
- Dowody na szczegółach linkują do heatmapy, nie do odpowiedzi (`/app/responses?prompt=<id>`).
- Heatmapa poza `Suspense`; strona promptów robi dwa dodatkowe zapytania sekwencyjnie.
- Copy: „run” vs „pomiar”; `pluralPl` w RunStatus; hard-coded podpowiedzi PSAI/Netlify w Ustawieniach i eyebrowach (multi-tenant).
- recommend-project nie sprawdza budżetu miesięcznego przed wydaniem; scalona rekomendacja zachowuje pierwszy prompt_id (szczegóły pokazują jedno pytanie); crawler podąża za przekierowaniami na inne hosty (SSRF przy zaufanych użytkownikach).
