# AI Visibility Monitor

## Co to jest

Wewnętrzne narzędzie Polskiej Szkoły AI, które regularnie zadaje asystentom AI (ChatGPT, Perplexity, Gemini, Google AI Overviews) zestaw pytań i sprawdza, czy, na której pozycji i w jakim tonie wymieniają markę oraz konkurentów. Wyniki (wynik widoczności, trendy, cytowania, pełne odpowiedzi z podświetlonymi markami oraz rekomendacje działań) są dostępne w panelu `/app`, a tygodniowy run uruchamia cron.

## Wymagania

- Node.js 20+
- Docker Desktop (lokalny Supabase) **lub** hostowany projekt Supabase
- Konta i klucze API: Trigger.dev, OpenAI, Perplexity, Google AI Studio (Gemini), DataForSEO, Anthropic

## Start lokalny

```bash
npm i
npx supabase start
npx supabase db reset          # stosuje migrację z supabase/migrations i seed z supabase/seed.sql
npx supabase gen types typescript --local > src/lib/db-types.ts
cp .env.example .env.local
```

Do codziennej pracy uruchamiaj `npm run start:prod` (zbudowana wersja, ekrany otwierają się od razu). `npm run dev` tylko przy zmianach w kodzie — pierwsze wejście na każdy ekran kompiluje go i trwa kilka sekund.

1. Uzupełnij `.env.local`. Wartości `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY` weź z `npx supabase status`. Klucze silników, Anthropic i Trigger.dev (`TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`) pochodzą z paneli odpowiednich usług. Jeśli klucz Anthropic nie jest przypisany do workspace'u, ustaw też `ANTHROPIC_WORKSPACE_ID` (wysyłany jako nagłówek `anthropic-workspace-id`). `CRON_SECRET` ustaw na dowolny losowy ciąg.
2. W Supabase Studio (`http://127.0.0.1:64323`, Authentication → Users) dodaj użytkownika z e-mailem i hasłem.
3. Przypisz go do organizacji z seedu (w SQL Editorze), podstawiając `id` użytkownika z `auth.users`:

   ```sql
   insert into memberships (org_id, user_id)
   values ('11111111-1111-1111-1111-111111111111', '<auth.users.id>');
   ```

   **Uwaga: to członkostwo (`insert into memberships ...`) dla organizacji z seedu MUSI być dodane PRZED pierwszym logowaniem. Inaczej `ensureWorkspace` utworzy osobną, pustą organizację dla tego użytkownika.**

4. Uruchom aplikację i worker Trigger.dev w dwóch terminalach:

   ```bash
   npm run dev
   npx trigger.dev@latest dev
   ```

5. Zaloguj się na `http://localhost:3000/login` i w Przeglądzie (`/app`) kliknij „Uruchom teraz”.

Opcjonalnie:

```bash
# test RLS na żywej lokalnej bazie (bez SUPABASE_DB_URL ten test jest pomijany)
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- tests/db

# pojedyncze zapytanie do wybranego silnika (openai | perplexity | gemini | google_ai_overview), czyta .env.local
npm run try:engine -- openai "pytanie"
```

Pozostałe polecenia: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Jak działa run

Run to task Trigger.dev `run-project` (`src/trigger/run-project.ts`), uruchamiany przyciskiem „Uruchom teraz” albo cronem. Kolejka tego taska ma `concurrencyLimit: 1`.

1. **Plan.** Z aktywnych promptów projektu i włączonych silników (`project_engines`) powstaje lista zapytań (`planQueries`, `src/lib/runs/plan.ts`): zwykły prompt dostaje 1 próbkę na silnik, prompt kluczowy (`is_key`) 3 próbki.
2. **Cost guard.** Task tworzy wiersz w `runs`, po czym `decideRun` (`src/lib/runs/guard.ts`) porównuje szacunek kosztu runu (suma `ENGINE_COST_USD` po zapytaniach) plus wydatki bieżącego miesiąca (`monthSpend`, suma `runs.cost_usd` od początku miesiąca UTC) z `projects.monthly_budget_usd`.
3. **Fan-out.** Każde zapytanie to osobny task `query-engine` (`concurrencyLimit: 4`, do 2 prób). Zapytuje adapter silnika, a następnie ekstrahuje dane z odpowiedzi: dopasowanie marki własnej i konkurentów po aliasach (z pozycją w odpowiedzi), cytowane adresy URL i domeny (oznaczone jako własne lub konkurenta) oraz sentyment opisu marki oceniany przez Claude (Anthropic). Odpowiedź, wzmianki i cytowania trafiają do `responses`, `mentions` i `citations`. Błąd jednego silnika zapisuje się jako odpowiedź z błędem i nie przerywa runu.
4. **Agregacja.** Task `aggregate-project` liczy metryki z odpowiedzi i zapisuje je w `daily_metrics` (łącznie, per silnik, per prompt i per komórka prompt x silnik) pod datą startu runu. Snapshot dnia obejmuje wszystkie runy rozpoczęte tego dnia (UTC). Jeśli wszystkie zapytania runu się nie powiodły, agregacja nie jest uruchamiana, a run kończy się statusem `failed` (nie zapisujemy zer).
5. **Zamknięcie.** Run dostaje status i koszt (`runs.cost_usd` z kosztów zwróconych przez adaptery).
6. **Rekomendacje.** Po udanej agregacji `run-project` uruchamia w tle (bez czekania) task `recommend-project`, opisany w sekcji „Rekomendacje”. Przy porażce agregacji rekomendacje nie są generowane.

Statusy runu (`runs.status`):

| Status | Znaczenie |
|--------|-----------|
| `running` | w toku |
| `done` | zakończony, agregacja zapisana (pojedyncze błędne zapytania są liczone w `queries_failed`) |
| `failed` | wszystkie zapytania nieudane, błąd agregacji albo nieoczekiwany wyjątek |
| `budget_exceeded` | szacunek runu przekroczyłby miesięczny budżet; nic nie zostało wysłane do silników |
| `empty` | brak aktywnych promptów lub włączonych silników |

## Szybkość: dev vs prod

`npm run start:prod` to `next build && next start -p 3000`. Tak sprawdzaj szybkość: `npm run dev` kompiluje każdy ekran przy pierwszym wejściu (kilka sekund), więc jego czasy nie mówią nic o produkcji.

Pomiar robi `scripts/measure-ttfb.ts`: dla `/login`, `/app`, `/app/prompts`, `/app/responses`, `/app/recommendations` i `/app/settings` wykonuje 3 próby i wypisuje medianę TTFB oraz czasu pełnej odpowiedzi.

```bash
npm run start:prod
# w drugim terminalu; cookie sesji z DevTools -> Application -> Cookies (nagłówek z sb-...-auth-token)
npx tsx scripts/measure-ttfb.ts http://localhost:3000 "<cookie-header>"
```

Nie wklejaj cookie do commitów, README ani raportów. Cel (spec): każdy ekran TTFB < 500 ms przy lokalnym Supabase, `/app` w całości < 1000 ms.

**Wynik z 2026-10-13, lokalny Supabase, build produkcyjny, bez cookie sesji** (mediana z 3 prób; `/app/*` bez sesji zwraca przekierowanie 307 do `/login`, więc liczby pokazują narzut serwera i sprawdzenia sesji, a nie renderowanie ekranów):

| Ścieżka | Status | TTFB | Całość |
|---------|--------|------|--------|
| `/login` | 200 | 15 ms | 16 ms |
| `/app` | 307 | 5 ms | 6 ms |
| `/app/prompts` | 307 | 3 ms | 3 ms |
| `/app/responses` | 307 | 3 ms | 3 ms |
| `/app/recommendations` | 307 | 3 ms | 3 ms |
| `/app/settings` | 307 | 3 ms | 3 ms |

**Pomiar zalogowany: do wykonania.** Zaloguj się na `http://localhost:3000/login` w przeglądarce, skopiuj nagłówek cookie sesji i uruchom polecenie powyżej. Wynik (statusy powinny być 200) dopisz tutaj z datą.

## Koszty i budżet

Szacunkowy koszt jednego zapytania (`src/lib/engines/costs.ts`), używany przez cost guard przed wysłaniem. Faktyczny koszt zapisywany jest w `responses.cost_usd`, jeśli API go zwraca.

| Silnik | Koszt / zapytanie (USD) |
|--------|-------------------------|
| ChatGPT (`openai`) | 0,012 |
| Perplexity (`perplexity`) | 0,006 |
| Gemini (`gemini`) | 0,014 |
| Google AI Overviews (`google_ai_overview`) | 0,004 |
| Razem 1 zapytanie na każdy z 4 silników | 0,036 |

Przykład: seed ma 10 promptów, z czego 4 kluczowe. Przy 4 silnikach daje to 6 x 4 x 1 + 4 x 4 x 3 = 72 zapytania. Szacunek to 18 x 0,036 = ok. 0,65 USD za run; z uwzględnieniem sentymentu (Anthropic) i rzeczywistych kosztów mieści się w przedziale ok. 0,5-0,8 USD. Przy cotygodniowym runie to kilka USD miesięcznie. Wywołania sentymentu (Claude Haiku) i generatora promptów (Claude Opus) nie wchodzą do `runs.cost_usd`; ich koszt jest pomijalny. Koszt rekomendacji liczony jest osobno w `runs.recommendations_cost_usd` (patrz „Rekomendacje”).

Domyślny budżet to 30 USD miesięcznie na projekt (`projects.monthly_budget_usd`, domyślnie `30`). Wydatki miesiąca liczone są z `runs.cost_usd`. Jeśli suma wydatków i szacunku nowego runu przekracza budżet, run kończy się statusem `budget_exceeded`.

## Rekomendacje

Po każdym udanym runie task `recommend-project` (`src/trigger/recommend-project.ts`) zamienia słabą widoczność w konkretne zadania dla zespołu. Można go też uruchomić ręcznie, bez nowego runu, na danych z wybranego dnia:

```bash
npx tsx --env-file=.env.local scripts/recommend-now.ts [projectId] [YYYY-MM-DD]
```

**Przepływ:** run, agregacja (`daily_metrics`), `recommend-project`.

1. **Kwalifikacja promptów** (`qualifyPrompts`). Do analizy trafia prompt z łączną widocznością poniżej progu `low_visibility_threshold` (domyślnie 0,34) albo z widocznością 0% w co najmniej dwóch silnikach, które faktycznie odpowiedziały. Prompty bez ważnych odpowiedzi są pomijane (brak danych to nie zero). Prompt o intencji `brand` kwalifikuje się tylko poniżej progu.
2. **Generowanie.** Dla każdego zakwalifikowanego promptu Claude (model z `ANTHROPIC_RECOMMENDER_MODEL`, domyślnie `claude-opus-5-5`) dostaje odpowiedzi silników, cytowane domeny i adresy, konkurentów, kartę faktów marki i listę podstron z mapy strony. Zwraca rekomendacje z oceną wpływu (`impact` 1-5) i wysiłku (`effort` 1-5).
3. **Zasada konkretności.** Rekomendacja bez konkretnego artefaktu jest odrzucana: `content_new` wymaga zarysu (co najmniej 3 niepuste punkty `suggested_outline`) i proponowanej ścieżki, a `content_improve` i `offsite` wymagają `target_url` (ścieżka `/...` lub adres http/https). Odrzucone pozycje trafiają do logu taska, nie do bazy.
4. **Reguły techniczne.** Osobno, bez modelu, sprawdzane są `/llms.txt` i `/sitemap.xml` na `site_url`. Rekomendacja `technical` powstaje wyłącznie przy odpowiedzi 404 lub 410; błąd sieci, 403, 429 i 5xx oznaczają „nieznane” i nic nie tworzą.
5. **Zapis (merge po odcisku).** Rekomendacje są łączone po odcisku (`fingerprint`), więc powtórny run aktualizuje istniejące zamiast je dublować, nie zmienia statusu ustawionego przez człowieka i nie obniża wartości `impact` ani `effort`. Uzasadnienie (`rationale`) widać na stronie szczegółów.

**Typy** (`type`): `content_new` (nowa treść), `content_improve` (poprawa istniejącej), `offsite` (działanie poza stroną), `technical` (zmiana techniczna), `fact_fix` (korekta faktów).
**Statusy** (`status`): `todo`, `doing`, `done`, `dismissed`.
**Priorytet** = `impact` x 2 - `effort` (zakres od -3 do 9); lista na `/app/recommendations` jest sortowana malejąco po priorytecie.

**Koszt.** Jedno wywołanie na zakwalifikowany prompt, ok. 0,05-0,15 USD na pytanie przy cenach Opus 5.5 (4 USD / 20 USD za milion tokenów wejścia / wyjścia). Suma z runu trafia do `runs.recommendations_cost_usd` (nie wchodzi do `runs.cost_usd` ani do budżetu miesięcznego).

**Znane ograniczenie.** Jeśli klucz Anthropic nie jest przypisany do workspace'u, żywe generowanie rekomendacji wymaga `ANTHROPIC_WORKSPACE_ID`. Bez niego wywołanie kończy się błędem, a prompt jest liczony jako nieudany. To obecnie blokuje pierwsze żywe uruchomienie.

Zmienne i ustawienia związane z rekomendacjami:

| Nazwa | Gdzie | Znaczenie |
|-------|-------|-----------|
| `ANTHROPIC_RECOMMENDER_MODEL` | `.env.local` (opcjonalna) | model generujący rekomendacje, domyślnie `claude-opus-5-5` |
| `ANTHROPIC_WORKSPACE_ID` | `.env.local` (opcjonalna) | nagłówek `anthropic-workspace-id`; wymagana, gdy klucz nie jest przypisany do workspace'u |
| `site_url` | Ustawienia w panelu (`projects.site_url`) | adres strony do crawla i reguł technicznych; seed wskazuje na staging Netlify, produkcyjny adres to `https://www.polskaszkola.ai` |
| `low_visibility_threshold` | Ustawienia w panelu (`projects.low_visibility_threshold`) | próg kwalifikacji promptu (0-1, domyślnie 0,34) |

## Mapa strony

Task `crawl-site` (`src/trigger/crawl-site.ts`, `src/lib/site/crawl.ts`) buduje tabelę `site_pages`, z której rekomendacje wiedzą, jakie podstrony już istnieją (żeby nie proponować nowej strony tam, gdzie wystarczy poprawić starą).

```bash
npx tsx --env-file=.env.local scripts/crawl-now.ts [projectId]
```

- Adresy pochodzą z `sitemap.xml` (także zagnieżdżonych map), maksymalnie 200 stron. Błąd głównej sitemapy przerywa task, zamiast po cichu wyzerować mapę.
- Crawler przedstawia się jako `PSAI-VisibilityBot/1.0`, respektuje `robots.txt` i pobiera 4 strony równolegle.
- Host adresów z sitemapy jest podmieniany na `site_url`, więc mapa z produkcji da się przeczytać ze stagingu.
- Dla każdej strony zapisywane są ścieżka, status HTTP, tytuł, H1, opis i fragment treści. Strony, które zniknęły z sitemapy, dostają status 410. Pusty wynik crawla nie wygasza istniejących wierszy.
- Crawl nie startuje automatycznie po runie: uruchom go skryptem po zmianie `site_url` lub dużej zmianie treści strony.

## Skrypty

| Skrypt | Do czego |
|--------|----------|
| `scripts/run-now.ts` | ręczne uruchomienie runu (jak przycisk „Uruchom teraz”) |
| `scripts/reaggregate.ts` | przeliczenie snapshotu dnia bez nowych zapytań do silników |
| `scripts/crawl-now.ts` | crawl mapy strony (patrz „Mapa strony”) |
| `scripts/recommend-now.ts` | generowanie rekomendacji (patrz „Rekomendacje”) |
| `scripts/measure-ttfb.ts` | pomiar TTFB ekranów (patrz „Szybkość: dev vs prod”) |
| `scripts/try-engine.ts` | pojedyncze zapytanie do silnika, `npm run try:engine` |

## Deploy

**Supabase (hostowany projekt)**

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Następnie załaduj seed (zawartość `supabase/seed.sql` w SQL Editorze), dodaj użytkownika w Authentication i przypisz go do organizacji zapytaniem `insert into memberships ...` jak w sekcji lokalnej. Zregeneruj typy: `npx supabase gen types typescript --project-id <ref> > src/lib/db-types.ts`.

**Trigger.dev**

```bash
npx trigger.dev@latest deploy
```

W ustawieniach projektu Trigger.dev (środowisko prod) ustaw zmienne używane przez taski: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, klucze i modele silników (`OPENAI_*`, `PERPLEXITY_*`, `GEMINI_*`, `DATAFORSEO_*`) oraz `ANTHROPIC_*`.

**Vercel**

1. Zaimportuj repozytorium i ustaw wszystkie zmienne z `.env.example` (prod).
2. `vercel.json` rejestruje cron `0 5 * * 1` (poniedziałki, 05:00 UTC) na `/api/cron/weekly`. Vercel wywołuje endpoint z nagłówkiem `Authorization: Bearer $CRON_SECRET`, więc `CRON_SECRET` musi być ustawiony w projekcie. Bez niego endpoint zwraca 401.
3. Endpoint uruchamia `run-project` (`source: "cron"`) dla projektów z `schedule = 'weekly'`, z kluczem idempotencji `<projectId>-<tydzień ISO>`; ponowne wywołanie w tym samym tygodniu nie uruchomi runu drugi raz. Odpowiedź: `{ "triggered": <n>, "failed": [] }`, a przy częściowej awarii status 207.
4. Ręczny test:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<domena>/api/cron/weekly
   ```

## Struktura katalogów

```
src/
  app/                 App Router: /login, /app (Przegląd), /app/prompts (+ /generate),
                       /app/responses (+ /[id]), /app/recommendations (+ /[id]), /app/settings,
                       /api/cron/weekly, /auth/signout
  components/          komponenty UI (components/ui = shadcn)
  lib/
    engines/           adaptery silników (openai, perplexity, gemini, google-ai-overview), rejestr, koszty
    extract/           dopasowanie marek, cytowania, normalizacja, sentyment (Claude)
    metrics/           agregacja, zapis daily_metrics, zapytania i widok przeglądu
    runs/              plan zapytań, cost guard, przetwarzanie odpowiedzi, klucz tygodnia ISO
    prompts/           generator propozycji promptów
    recommend/         kwalifikacja promptów, generowanie rekomendacji, reguły techniczne, zapis
    site/              crawl mapy strony (sitemap, robots, ekstrakcja)
    supabase/          klienty: przeglądarka, serwer, admin (service role)
  trigger/             taski Trigger.dev: run-project, query-engine, aggregate-project, recommend-project, crawl-site
supabase/              config.toml, migrations/ (schemat + RLS), seed.sql
scripts/               skrypty pomocnicze (run-now, crawl-now, recommend-now, measure-ttfb, try-engine, ...)
tests/                 Vitest: engines, extract, metrics, runs, prompts, validation, components, db (RLS)
docs/superpowers/      specyfikacja, plan i szablon kalibracji
```

## Co jeszcze nie zostało zweryfikowane

Kod fazy 0-1 jest kompletny, a testy jednostkowe, lint, `tsc` i build przechodzą. Poniższe rzeczy nie były jednak sprawdzone na żywo:

- Migracja `supabase/migrations/20261012000000_init.sql` nie została uruchomiona na żywej bazie, więc test RLS (`tests/db`) jest pomijany. Seed i polityki RLS czekają na pierwszy `supabase db reset`.
- `src/lib/db-types.ts` jest tymczasowo pisany ręcznie. Po pierwszym uruchomieniu bazy zastąp go wynikiem `npx supabase gen types typescript --local` i sprawdź `tsc` oraz build.
- Adaptery silników (OpenAI, Perplexity, Gemini, DataForSEO) i ekstrakcja sentymentu były testowane wyłącznie na mockach. Żaden prawdziwy klucz API nie został użyty.
- Trigger.dev nie był uruchomiony (ani `dev`, ani `deploy`), więc pełny przebieg `run-project` na realnych taskach nie został sprawdzony.
- Kalibracja (złoty zestaw): ręczne porównanie 5 promptów z interfejsami chatgpt.com, perplexity.ai i Google. Procedura i szablon są w `docs/superpowers/calibration/README.md`.
- Deploy (Supabase, Trigger.dev, Vercel) i test crona na produkcji do zrobienia.
