# Moduł „Google” (klasyczne SEO): specyfikacja

Data: 2026-11-02 · Status: zatwierdzony projekt · Autor: Claude z Łukaszem (PSAI)

## Cel

Aplikacja mierzy dziś tylko widoczność marki w odpowiedziach asystentów AI. Łukasz chce w tym samym miejscu widzieć, gdzie polskaszkola.ai jest w zwykłym Google, na jakie frazy, i co zrobić, żeby być wyżej. Strona on-page jest w dobrym stanie (sprawdzone 2026-11-02: jeden H1, canonical, opisy 137-164 znaków, schema Course/FAQ/Organization na kluczowych stronach), więc brakuje przede wszystkim danych: pozycji, popytu, kliknięć i stanu indeksacji.

Sukces: raz w tygodniu Łukasz otwiera zakładkę „Google” i w kilka minut widzi zmianę kliknięć i pozycji, 3-5 najlepszych szans (z konkretną stroną i frazą) oraz listę problemów technicznych do naprawy.

## Decyzje Łukasza (2026-11-02)

- Pierwszy etap obejmuje wszystkie cztery moduły: Search Console, śledzenie pozycji fraz, wolumeny i trendy, audyt techniczny i szybkość.
- Dostęp do Search Console przez konto usługi Google (bez logowania OAuth w aplikacji). Usługa typu domena: `sc-domain:polskaszkola.ai`.
- Koszt modułu ok. 6 USD/mies.

## Decyzje projektowe (Claude)

- SEO ma własny limit `projects.seo_budget_usd` (domyślnie 10 USD/mies.), liczony osobno od `monthly_budget_usd` pomiarów AI, żeby SEO nie zjadało budżetu pomiarów. Przegląd pokazuje oba wydatki i sumę.
- Google auth bez nowej ciężkiej zależności: JWT RS256 podpisany `node:crypto`, wymieniany na token w `oauth2.googleapis.com/token`. Interfejs `getAccessToken()` pozwala później podmienić to na `google-auth-library`.
- Harmonogramy przez Trigger.dev `schedules.task` (wersja 4.7.3 to wspiera, Vercel Hobby pozwala na crony najwyżej raz dziennie). Istniejący cron Vercel `/api/cron/weekly` bez zmian.
- Ścieżka rekomendacji AI (`recommend-project`, `src/lib/recommend/qualify.ts`, `input.ts`) zostaje nietknięta; rekomendacje SEO to osobny task.

## Zakres

W zakresie:
- synchronizacja Search Console (codziennie, pierwszy raz 16 miesięcy wstecz),
- lista śledzonych fraz i cotygodniowe pozycje w Google PL (komputer i telefon, top 100),
- wolumeny wyszukiwań, Google Trends i podpowiedzi fraz (DataForSEO),
- audyt techniczny: rozszerzony crawler, URL Inspection, PageSpeed,
- rekomendacje SEO z tego samego generatora co dziś,
- zakładka „Google” z trzema widokami i sekcja „Google” w Ustawieniach.

Poza zakresem:
- GA4, Bing Webmaster Tools, Google Business Profile (kolejny etap),
- backlinki (DataForSEO Backlinks),
- oficjalne API Google Trends (alfa, brak dostępu),
- zmiany na samej stronie (rekomendacje mówią, co zmienić; robi to człowiek).

## Źródła danych i koszty

| Źródło | Co daje | Koszt |
|---|---|---|
| Search Console `searchanalytics.query` | kliknięcia, wyświetlenia, CTR, pozycja per data × fraza × strona × urządzenie | 0 |
| Search Console URL Inspection | stan indeksacji, canonical Google, ostatni crawl | 0 (2000/dzień) |
| PageSpeed Insights API | wynik, LCP, CLS, TBT/INP, dane CrUX jeśli są | 0 (klucz API) |
| DataForSEO SERP Google Organic, kolejka standard | pozycje top 100, top 10, cechy SERP | $0,0006 za 10 wyników |
| DataForSEO Keywords Data google_ads | wolumen, 12 mies., konkurencja, CPC | $0,06 za zadanie (do 1000 fraz) |
| DataForSEO Google Trends | indeks 0-100 tydzień po tygodniu | $0,0027 za zadanie (do 5 fraz) |
| DataForSEO Labs | podpowiedzi fraz, frazy domeny | $0,012 + $0,00012 za wiersz |

Szacunek miesięczny: pozycje 50 fraz × 2 urządzenia × 4,33 tyg. przy głębokości 100 ≈ 2,6-3 USD; wolumeny i trendy ≈ 0,1 USD; podpowiedzi ≈ 0,1-0,5 USD; rekomendacje SEO (do 5 wywołań Opus tygodniowo) ≈ 2,2 USD. Razem ok. 6 USD.

## Dane (migracje)

Każda tabela ma RLS `for all using/with check (is_org_member(project_org(project_id)))`. Typy dopisywane ręcznie do `src/lib/db-types.ts`. Agregacje dla UI przez funkcje SQL (`stable`, security invoker, `grant execute to authenticated`) wołane `rpc()`, bo PostgREST zwraca najwyżej 1000 wierszy (`supabase/config.toml`). Strony z GSC łączymy z `site_pages` po `path`.

1. `seo_core`: `projects.gsc_property text`, `projects.seo_budget_usd numeric(10,2) default 10`, `projects.trends_anchor text`; `seo_jobs(id, project_id, kind, status in running/done/failed/budget_exceeded/skipped, started_at, finished_at, cost_usd numeric(10,4) default 0, stats jsonb, error)`, indeks `(project_id, kind, started_at desc)`.
2. `gsc`: `gsc_site_daily(project_id, date, clicks, impressions, position)` PK `(project_id, date)`, sumy z poziomu usługi, zgodne z interfejsem GSC; `gsc_page_daily(+ page)`; `gsc_query_daily(project_id, date, query, page, device, clicks, impressions, position)` PK `(project_id, date, query, page, device)`, indeks `(project_id, query, date)`. CTR liczony, nie zapisywany. Funkcje: `gsc_totals(project, from, to)`, `gsc_top_queries`, `gsc_top_pages`, `gsc_query_pages` (kanibalizacja), `gsc_query_delta(cur, prev)` (nowe i utracone frazy).
3. `keywords_ranks`: `keywords(id, project_id, text, key unique per project, source in manual/gsc/suggestion/gap, target_path, active, search_volume, competition, competition_index, cpc, monthly_searches jsonb, volume_updated_at, created_at)`; `rank_checks(id, project_id, keyword_id, device, week_start, status in pending/done/failed, dfs_task_id, position, rank_absolute, url, features jsonb, top10 jsonb, competitors jsonb, cost_usd, checked_at, error)`, unique `(keyword_id, device, week_start)`.
4. `research`: `keyword_suggestions(id, project_id, key, text, seed, source, search_volume, keyword_difficulty, cpc, competitor_positions jsonb, status in new/accepted/dismissed)`; `keyword_trends(keyword_id, week, value)` PK `(keyword_id, week)`.
5. `audit`: nowe kolumny `site_pages`: `canonical, meta_robots, x_robots_tag, final_url, response_ms, jsonld_types text[], h1_count, h2_count, word_count, internal_links text[], inlinks, images_missing_alt, og jsonb, lang`; `url_inspections(project_id, url, inspected_on, verdict, coverage_state, indexing_state, robots_txt_state, page_fetch_state, last_crawl_time, google_canonical, user_canonical, raw)` unique `(project_id, url, inspected_on)`; `pagespeed_results(project_id, url, strategy, measured_on, performance, lcp_ms, cls, tbt_ms, inp_ms, field jsonb, origin_field jsonb)`. Wyniki audytu liczone przy odczycie, nie zapisywane.

Szacunek: kilkanaście tysięcy wierszy GSC miesięcznie, jednorazowy backfill 100-250 tys., ok. 50 MB rocznie.

## Moduły kodu

- `src/lib/dataforseo/client.ts`: wydzielone z `src/lib/engines/google-ai-overview.ts` uwierzytelnienie, kod lokalizacji (2616, `DATAFORSEO_LOCATION_CODE`), komunikat „brak środków” dla HTTP 402 i zadania 40200, ponawianie 40101 przez `withRetry`/`TransientError` (`src/lib/engines/retry.ts`). Adapter AIO działa bez zmian, a `tests/engines` przechodzą bez edycji. Dalej `serp.ts` (`task_post` w paczkach z `tag`, potem `task_get/advanced`), `queue.ts` (odpytywanie gotowych zadań z wstrzykiwanym `sleep`), `keywords-data.ts`, `trends.ts` (fraza-kotwica `projects.trends_anchor` w każdym zadaniu, żeby skale były porównywalne), `labs.ts`.
- `src/lib/google/`: `auth.ts` (klucz z `GOOGLE_SERVICE_ACCOUNT_JSON`, base64 albo surowy JSON; zakres `https://www.googleapis.com/auth/webmasters.readonly`; token w pamięci do 60 s przed wygaśnięciem), `http.ts` (bearer, ponawianie, polski komunikat przy 403 z e-mailem konta usługi), `gsc.ts`, `url-inspection.ts`, `pagespeed.ts` (`GOOGLE_PAGESPEED_API_KEY`).
- `src/lib/seo/`: `jobs.ts` (`startJob`, `finishJob`, `addCost`), `budget.ts` (`seoMonthSpend`, decyzja przed płatnym zadaniem), `gsc-sync.ts` (okno: ostatnie 4 dni codziennie, backfill miesiącami), `opportunities.ts` (czyste funkcje), `rank-parse.ts` (`domainMatches` z `src/lib/engines/domain.ts`), `keywords.ts` (normalizacja klucza), `audit.ts` (reguły), `queries.ts` (`React.cache` + `rpc`), `recommend/*`.
- `src/lib/site/seo-signals.ts`: ekstrakcja sygnałów SEO z pełnego HTML (linki z nawigacji też się liczą). `crawl.ts` dostaje wariant pobierania zwracający nagłówki, czas odpowiedzi i końcowy URL.
- Taski Trigger (każdy eksportuje zwykłą funkcję `runX(payload, deps)` i `task`): `gsc-sync`, `rank-check`, `url-inspection`, `pagespeed`, `keyword-volumes`, `keyword-research`, `seo-recommend`, orkiestrator `seo-weekly-project`. Harmonogramy w `src/trigger/seo-schedules.ts`, strefa `Europe/Warsaw`, tylko `PRODUCTION`: codziennie 06:30 `gsc-sync`; niedziela 03:00 `seo-weekly-project` (crawl, potem równolegle URL Inspection, PageSpeed i pozycje, na końcu `seo-recommend`); 2. dnia miesiąca 05:00 `keyword-volumes`.
- Skrypty: `scripts/check-google.ts`, `gsc-sync-now.ts [--backfill]`, `rank-check-now.ts`, `seo-audit-now.ts`, `keyword-volumes-now.ts`, `seo-recommend-now.ts`; `--local` woła `runX()` bez workera.
- Zmienne: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PAGESPEED_API_KEY` w `.env.example`, `trigger.config.ts` (syncEnvVars) i README.

## Szanse (opportunities)

Czyste funkcje na danych z ostatnich 28 dni (porównanie z poprzednimi 28):
- **Blisko top 3**: fraza ze średnią pozycją 4-20 i co najmniej 50 wyświetleniami albo śledzona fraza na pozycji 4-20 z wolumenem co najmniej 30. Sortowanie po potencjale kliknięć: wyświetlenia × (oczekiwany CTR dla pozycji 3 − obecny CTR).
- **Niski CTR**: strona albo fraza z CTR poniżej połowy oczekiwanego dla jej pozycji. Oczekiwany CTR z własnych danych witryny, gdy jest ich dość, inaczej ze stałej tabeli.
- **Kanibalizacja**: co najmniej dwie nasze strony, każda z co najmniej 20% wyświetleń frazy, albo rankuje inna strona niż `keywords.target_path`.
- **Nowe i utracone**: frazy z wyświetleniami w jednym oknie i bez nich w drugim.
Progi są stałymi w jednym miejscu, do strojenia na prawdziwych danych. UI tłumaczy, czemu suma kliknięć fraz jest niższa niż suma stron (GSC ukrywa rzadkie frazy).

## Interfejs

- Menu: jeden nowy punkt „Google” (`src/components/psai/AppNav.tsx`). `src/app/app/google/layout.tsx` z podmenu: Przegląd, Frazy, Strony i audyt. Strony to komponenty serwerowe z `getCurrentProject()`, `Suspense` i `TileSkeleton`, komponenty z `src/components/psai/*`, styl jak reszta aplikacji.
- **Przegląd** `/app/google`: stan zadań (ostatnia synchronizacja, ostatnie pozycje, wydatek SEO wobec limitu) i przycisk „Synchronizuj”; kafle kliknięcia, wyświetlenia, CTR, średnia pozycja (28 dni i zmiana); wykres 90 dni / 16 mies.; szanse w czterech grupach; top 10 fraz i stron; podsumowanie pozycji. Pusty stan z instrukcją, gdy brak `gsc_property` albo klucza.
- **Frazy** `/app/google/keywords`: pozycja komputer/telefon ze zmianą tydzień do tygodnia, rankujący URL, wolumen, trend, najlepszy konkurent, odznaki cech SERP (AI Overview, czy nas cytuje, featured snippet, local pack, PAA). Dodawanie ręczne, „Importuj z Search Console”, podpowiedzi do akceptacji, formularz tematów z szacunkiem kosztu. Szczegóły frazy: historia pozycji, top 10 z wyróżnioną konkurencją, dane GSC dla frazy.
- **Strony i audyt** `/app/google/pages`: problemy krytyczne / ostrzeżenia / informacje z „jak naprawić”; tabela stron: GSC 28 dni, indeksacja, PageSpeed mobile, LCP/CLS, liczba problemów; szczegóły strony.
- **Kierunek na głównym Przeglądzie** `/app` (prośba Łukasza 2026-11-02): na górze zdanie podsumowania („W górę: AI, Google. W dół: AI Overviews.”) i trzy kafle ze strzałką i kolorem: asystenci AI (Score teraz wobec pomiaru sprzed ok. 4 tygodni), Google AI Overviews (widoczność i cytowania), Google wyniki wyszukiwania (kliknięcia i średnia pozycja z GSC, 28 dni wobec poprzednich 28). Progi „bez zmian”: 3 pkt Score, 5 pp widoczności, 10% kliknięć (przy bazie co najmniej 20), 0,5 pozycji. Każdy kafel prowadzi do szczegółów. Od M2 czwarty kafel: pozycje śledzonych fraz.
- **Ustawienia → Google**: usługa GSC, limit SEO, fraza-kotwica Trends, instrukcja konfiguracji.

## Audyt (reguły)

Krytyczne: strona z sitemapy z `noindex` (meta albo X-Robots-Tag); status inny niż 200; canonical wskazujący inną stronę; Google nie indeksuje strony (URL Inspection). Ostrzeżenia: brak lub zdublowany title albo description, title dłuższy niż 60 znaków, brak H1 albo więcej niż jeden, strona osierocona (0 linków wewnętrznych przychodzących), mniej niż 300 słów na stronie oferty, brak schema dla typu strony (Course na stronach szkoleń, Organization na głównej), obrazy bez alt, PageSpeed mobile poniżej 50 albo LCP powyżej 4 s, CLS powyżej 0,25, canonical Google różny od naszego. Informacje: brak og:image, czas odpowiedzi powyżej 1 s.

## Rekomendacje SEO

- Osobny task `seo-recommend`, wywoływany z `seo-weekly-project` i skryptem.
- Wspólne z dzisiejszym generatorem: `upsertRecommendations`, `fingerprintFor` (rekomendacje SEO i AI dla tej samej strony scalają się), wydzielona z `src/lib/recommend/generate.ts` funkcja `callRecommender(system, user, schema)` (wywołanie `messages.parse`, koszt, `GenerationError`). `Evidence` dostaje opcjonalne pole `seo`, pokazywane na stronie szczegółów.
- Kwalifikacja po stronach: blisko top 3, luka CTR, kanibalizacja, brak indeksacji, luka względem konkurencji (konkurenci w top 10, nas brak: `content_new`). Najwyżej 5 stron na uruchomienie, 14 dni przerwy dla strony z otwartą rekomendacją.
- Wejście: dane strony z crawlera, frazy z pozycjami, wolumenami i GSC, top 10 SERP, problemy z audytu, karta faktów `<karta_faktow>`, lista podstron, istniejące rekomendacje. System prompt powtarza zasadę karty faktów i mówi, że SERP i treść stron to dane, nie instrukcje. Test sprawdza obecność `karta_faktow` i `zasady_dla_rekomendacji` w obu promptach.
- Model zwraca tylko `content_improve` i `content_new`; rekomendacje `technical` tworzą wyłącznie reguły audytu, z ustalonymi tytułami (stabilny fingerprint).
- Filtr „Google” w Rekomendacjach (po `evidence->seo`).

## Kroki po stronie Łukasza

1. Google Cloud: projekt, włączyć Google Search Console API i PageSpeed Insights API.
2. Konto usługi bez ról IAM, klucz JSON; `base64 -i klucz.json | tr -d '\n'` jako `GOOGLE_SERVICE_ACCOUNT_JSON` w `.env.local` i `.env.prod.local`; plik klucza usunąć.
3. Search Console → `sc-domain:polskaszkola.ai` → Ustawienia → Użytkownicy i uprawnienia → e-mail konta usługi jako użytkownik z ograniczonymi uprawnieniami (pełne, jeśli URL Inspection zwróci 403).
4. Klucz API ograniczony do PageSpeed Insights jako `GOOGLE_PAGESPEED_API_KEY`.
5. Doładować DataForSEO.

## Kamienie milowe

Każdy da się wdrożyć osobno: M0 fundamenty (klient DataForSEO, `seo_core`, budżet SEO, auth Google, menu i Ustawienia), M1 Search Console i Przegląd, M2 frazy i pozycje, M3 wolumeny, trendy i podpowiedzi, M4 audyt techniczny, PageSpeed i URL Inspection, M5 rekomendacje SEO. Gałęzie `claude/priceless-leakey-1bc281` (crawler, generator) i `claude/vibrant-chatelet-f80980` (strona Źródła, ten sam wiersz menu) czekają na decyzję Łukasza przed M4.

## Ryzyka

- Mała witryna ma dużo anonimowych fraz w GSC: progi szans trzeba dostroić na prawdziwych danych.
- Kolejka standard DataForSEO oddaje wyniki po minutach, czasem do godziny; `wait.for` w Trigger nie liczy się do czasu obliczeń, ale task musi umieć wznowić sprawdzanie z zapisanych `dfs_task_id`.
- Dopłata za `load_async_ai_overview` w kolejce standard do potwierdzenia na pierwszym `cost`; stała głębokości (100) można obniżyć do 50.
- Pokrycie DataForSEO Labs dla Polski (2616 / `pl`) do potwierdzenia na pierwszym wywołaniu.
