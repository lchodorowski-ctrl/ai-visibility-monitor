# AI Visibility Monitor

## Co to jest

Wewnętrzne narzędzie Polskiej Szkoły AI, które regularnie zadaje asystentom AI (ChatGPT, Perplexity, Gemini, Google AI Overviews) zestaw pytań i sprawdza, czy, na której pozycji i w jakim tonie wymieniają markę oraz konkurentów. Wyniki (wynik widoczności, trendy, cytowania, pełne odpowiedzi z podświetlonymi markami) są dostępne w panelu `/app`, a tygodniowy run uruchamia cron.

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

1. Uzupełnij `.env.local`. Wartości `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` i `SUPABASE_SERVICE_ROLE_KEY` weź z `npx supabase status`. Klucze silników, Anthropic i Trigger.dev (`TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`) pochodzą z paneli odpowiednich usług. `CRON_SECRET` ustaw na dowolny losowy ciąg.
2. W Supabase Studio (`http://127.0.0.1:54323`, Authentication → Users) dodaj użytkownika z e-mailem i hasłem.
3. Przypisz go do organizacji z seedu (w SQL Editorze), podstawiając `id` użytkownika z `auth.users`:

   ```sql
   insert into memberships (org_id, user_id)
   values ('11111111-1111-1111-1111-111111111111', '<auth.users.id>');
   ```

4. Uruchom aplikację i worker Trigger.dev w dwóch terminalach:

   ```bash
   npm run dev
   npx trigger.dev@latest dev
   ```

5. Zaloguj się na `http://localhost:3000/login` i w Przeglądzie (`/app`) kliknij „Uruchom teraz”.

Opcjonalnie:

```bash
# test RLS na żywej lokalnej bazie (bez SUPABASE_DB_URL ten test jest pomijany)
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -- tests/db

# pojedyncze zapytanie do wybranego silnika (openai | perplexity | gemini | google_ai_overview), czyta .env.local
npm run try:engine -- openai "pytanie"
```

Pozostałe polecenia: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Jak działa run

Run to task Trigger.dev `run-project` (`src/trigger/run-project.ts`), uruchamiany przyciskiem „Uruchom teraz” albo cronem. Kolejka tego taska ma `concurrencyLimit: 1`.

1. **Plan.** Z aktywnych promptów projektu i włączonych silników (`project_engines`) powstaje lista zapytań (`planQueries`, `src/lib/runs/plan.ts`): zwykły prompt dostaje 1 próbkę na silnik, prompt kluczowy (`is_key`) 3 próbki.
2. **Cost guard.** Task tworzy wiersz w `runs`, po czym `decideRun` (`src/lib/runs/guard.ts`) porównuje szacunek kosztu runu (suma `ENGINE_COST_USD` po zapytaniach) plus wydatki bieżącego miesiąca (`monthSpend`, suma `runs.cost_usd` od początku miesiąca UTC) z `projects.monthly_budget_usd`.
3. **Fan-out.** Każde zapytanie to osobny task `query-engine` (`concurrencyLimit: 4`, do 2 prób). Zapytuje adapter silnika, a następnie ekstrahuje dane z odpowiedzi: dopasowanie marki własnej i konkurentów po aliasach (z pozycją w odpowiedzi), cytowane adresy URL i domeny (oznaczone jako własne lub konkurenta) oraz sentyment opisu marki oceniany przez Claude (Anthropic). Odpowiedź, wzmianki i cytowania trafiają do `responses`, `mentions` i `citations`. Błąd jednego silnika zapisuje się jako odpowiedź z błędem i nie przerywa runu.
4. **Agregacja.** Task `aggregate-project` liczy metryki z odpowiedzi tego runu i zapisuje je w `daily_metrics` (łącznie, per silnik, per prompt i per komórka prompt x silnik) pod datą startu runu.
5. **Zamknięcie.** Run dostaje status i koszt (`runs.cost_usd` z kosztów zwróconych przez adaptery).

Statusy runu (`runs.status`):

| Status | Znaczenie |
|--------|-----------|
| `running` | w toku |
| `done` | zakończony, agregacja zapisana (pojedyncze błędne zapytania są liczone w `queries_failed`) |
| `failed` | wszystkie zapytania nieudane, błąd agregacji albo nieoczekiwany wyjątek |
| `budget_exceeded` | szacunek runu przekroczyłby miesięczny budżet; nic nie zostało wysłane do silników |
| `empty` | brak aktywnych promptów lub włączonych silników |

## Koszty i budżet

Szacunkowy koszt jednego zapytania (`src/lib/engines/costs.ts`), używany przez cost guard przed wysłaniem. Faktyczny koszt zapisywany jest w `responses.cost_usd`, jeśli API go zwraca.

| Silnik | Koszt / zapytanie (USD) |
|--------|-------------------------|
| ChatGPT (`openai`) | 0,012 |
| Perplexity (`perplexity`) | 0,006 |
| Gemini (`gemini`) | 0,014 |
| Google AI Overviews (`google_ai_overview`) | 0,004 |
| Razem 1 zapytanie na każdy z 4 silników | 0,036 |

Przykład: seed ma 10 promptów, z czego 4 kluczowe. Przy 4 silnikach daje to 6 x 4 x 1 + 4 x 4 x 3 = 72 zapytania. Szacunek to 18 x 0,036 = ok. 0,65 USD za run; z uwzględnieniem sentymentu (Anthropic) i rzeczywistych kosztów mieści się w przedziale ok. 0,5-0,8 USD. Przy cotygodniowym runie to kilka USD miesięcznie.

Domyślny budżet to 30 USD miesięcznie na projekt (`projects.monthly_budget_usd`, domyślnie `30`). Wydatki miesiąca liczone są z `runs.cost_usd`. Jeśli suma wydatków i szacunku nowego runu przekracza budżet, run kończy się statusem `budget_exceeded`.

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
                       /app/responses (+ /[id]), /app/settings, /api/cron/weekly, /auth/signout
  components/          komponenty UI (components/ui = shadcn)
  lib/
    engines/           adaptery silników (openai, perplexity, gemini, google-ai-overview), rejestr, koszty
    extract/           dopasowanie marek, cytowania, normalizacja, sentyment (Claude)
    metrics/           agregacja, zapis daily_metrics, zapytania i widok przeglądu
    runs/              plan zapytań, cost guard, przetwarzanie odpowiedzi, klucz tygodnia ISO
    prompts/           generator propozycji promptów
    supabase/          klienty: przeglądarka, serwer, admin (service role)
  trigger/             taski Trigger.dev: run-project, query-engine, aggregate-project
supabase/              config.toml, migrations/ (schemat + RLS), seed.sql
scripts/               try-engine.ts
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
