# Kalibracja w aplikacji — specyfikacja

Data: 2026-10-13 · Status: zatwierdzony projekt (wariant B) · Autor: Claude z Łukaszem (PSAI)

## Cel

Sprawdzać raz w miesiącu, czy to, co aplikacja mierzy przez API asystentów, zgadza się z tym, co widzi człowiek w publicznych czatach, i od razu wskazywać przyczynę rozbieżności. Dziś procedura żyje w `docs/superpowers/calibration/README.md` jako ręczna tabela w Markdown; ta funkcja przenosi ją do aplikacji.

Sukces: osoba z zespołu w 30–40 minut wpisuje wyniki 10 pytań × 3 interfejsy, a aplikacja pokazuje zgodność per silnik i listę rozbieżności z linkami do odpowiedzi API oraz z akcją „dodaj alias”.

## Zakres

W zakresie:
- ekran listy kalibracji (historia ze zgodnością per silnik),
- tworzenie kalibracji na bazie ostatniego zakończonego pomiaru,
- formularz wpisywania wyników ręcznych (wymieniona tak/nie/nie sprawdzono, opcjonalne cytowane adresy, opcjonalna fraza „jak Was nazwał”),
- porównanie z wynikami API: zgodność per silnik, lista rozbieżności dwóch rodzajów, pokrycie cytowań,
- akcja „dodaj do aliasów marki” z rozbieżności typu „czat wymienia, API nie”.

Poza zakresem (świadomie):
- pozycja marki na liście odpowiedzi (trudna do rzetelnego ręcznego wpisania),
- Gemini (brak go w obowiązkowym zestawie obecnej procedury),
- automatyczne zadawanie pytań w publicznych czatach,
- kalibracja rekomendacji (zostaje procedurą w Markdown).

## Przepływ użytkownika

1. Ustawienia → link „Kalibracja” → `/app/calibration` (lista historii, przycisk „Nowa kalibracja”).
2. „Nowa kalibracja” tworzy sesję dla ostatniego pomiaru o `status = 'done'` w projekcie. Jeśli takiego nie ma, przycisk jest wyłączony z podpowiedzią „Najpierw uruchom pomiar”.
3. Aplikacja wybiera 10 pytań: wszystkie aktywne pytania kluczowe (`is_key`), uzupełnione losowo aktywnymi pozostałymi do 10 (jeśli kluczowych jest więcej niż 10, pierwsze 10 według `created_at`). Wybór zapisywany w sesji (stały po utworzeniu).
4. Dla każdego pytania trzy wiersze: ChatGPT (`openai`), Perplexity (`perplexity`), Google AI Overview (`google_ai_overview`). Przy pytaniu przycisk „Kopiuj pytanie” (schowek, kliencko).
5. Pola w wierszu: „Wymieniona?” (tak / nie / nie sprawdzono — domyślnie nie sprawdzono), „Cytowane adresy” (opcjonalne, wiele, po jednym w linii), „Jak Was nazwał?” (opcjonalne, widoczne tylko przy „tak”). Zapis po każdej zmianie pola (server action, bez przycisku „zapisz”).
6. Widok wyników (ten sam ekran, sekcja nad formularzem, przeliczany przy każdym renderze):
   - zgodność per silnik: `zgodne / sprawdzone` + procent, kolor: teal ≥ 80%, szarość 60–79%, czerwień < 60% (ta sama konwencja koloru co reszta aplikacji, osobne progi),
   - rozbieżności: „API: wzmianka, czat: brak” oraz „czat: wzmianka, API: brak”; każda z tekstem pytania, silnikiem, linkiem do odpowiedzi API (`/app/responses/<id>`) i — dla drugiego rodzaju z wpisaną frazą — przyciskiem „Dodaj „<fraza>” do aliasów”,
   - cytowania: dla wierszy z wpisanymi adresami — ile z nich (po domenie) występuje w cytowaniach odpowiedzi API.
7. Kalibrację można oznaczyć jako zakończoną („Zakończ”), co zamraża formularz; lista historii pokazuje datę, pomiar i zgodność per silnik.

## Dane

Migracja `supabase/migrations/20261013030000_calibrations.sql`:

```sql
create table calibrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  run_id uuid references runs(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index calibrations_project on calibrations(project_id, created_at desc);

create table calibration_checks (
  id uuid primary key default gen_random_uuid(),
  calibration_id uuid not null references calibrations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine_id text not null check (engine_id in ('openai','perplexity','google_ai_overview')),
  manual_mentioned boolean,            -- null = nie sprawdzono
  manual_urls text[] not null default '{}',
  manual_alias text,
  updated_at timestamptz not null default now(),
  unique (calibration_id, prompt_id, engine_id)
);

alter table calibrations enable row level security;
alter table calibration_checks enable row level security;
create policy calibrations_member on calibrations for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
create policy calibration_checks_member on calibration_checks for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
```

Wynik API nie jest kopiowany do kalibracji; liczony na żądanie z `responses` pomiaru (`run_id`), `mentions` (`brand_kind = 'own'`) i `citations`. Pytanie × silnik może mieć kilka odpowiedzi (próbki): „API: wzmianka” = co najmniej jedna ważna odpowiedź (bez `error`, bez `no_answer`) z wzmianką własnej marki; „API: brak” = są ważne odpowiedzi i żadna nie ma wzmianki; brak ważnych odpowiedzi = „API: brak danych” (wiersz nie wchodzi do zgodności i jest pokazany osobno).

## Komponenty

- `src/lib/calibration/compare.ts` — czyste funkcje: `apiOutcome(responses)` → `'mentioned' | 'absent' | 'no_data'`; `compareRow(manual, api)` → `'match' | 'api_only' | 'manual_only' | 'skipped'`; `agreementByEngine(rows)`; `citationCoverage(manualUrls, apiDomains)` (porównanie po domenie bez `www.`, wielkość liter bez znaczenia); `calibrationTone(rate)` (progi 0.8 / 0.6).
- `src/lib/calibration/select.ts` — `selectPrompts(prompts, n = 10, rng)` (kluczowe najpierw, deterministyczny przy podanym `rng` dla testów).
- `src/lib/calibration/queries.ts` — `listCalibrations(projectId)`, `getCalibration(projectId, id)` (sesja + checks + dane API pomiaru jednym zestawem zapytań), opakowane `React.cache`, każde zapytanie sprawdza `{ error }`.
- `src/app/app/calibration/actions.ts` — `createCalibration()`, `saveCheck(formData)`, `closeCalibration(formData)`, `addAliasFromCalibration(formData)` (dopisuje frazę do `projects.brand_aliases`, bez duplikatów po `foldText`); wszystkie zapisy scoped `project_id`, walidacja zod, `revalidatePath`.
- `src/app/app/calibration/page.tsx` (lista) i `src/app/app/calibration/[id]/page.tsx` (sesja: wyniki + formularz) w komponentach PSAI (`PageHero`, `Tile`, `Rows`, `StatTile`, `Meta`, `ToneDot`).
- `src/app/app/calibration/CheckRow.tsx` — kliencki wiersz z zapisem po zmianie (`useTransition` + server action), przycisk „Kopiuj pytanie”.
- Link w `src/app/app/settings/page.tsx`: sekcja „Kalibracja” z opisem i linkiem.

## Obsługa błędów i przypadki brzegowe

- Brak zakończonego pomiaru → „Nowa kalibracja” wyłączona z podpowiedzią.
- Pytanie z kalibracji usunięte później → wiersze znikają kaskadowo; wynik liczony z pozostałych.
- Silnik wyłączony w projekcie lub brak odpowiedzi w pomiarze → „API: brak danych”, wiersz poza zgodnością.
- Zamknięta kalibracja → formularz tylko do odczytu; akcje odrzucają zapis do zamkniętej sesji.
- Alias już istnieje (po `foldText`) → przycisk nieaktywny z opisem „już w aliasach”.
- Nieprawidłowe adresy w „Cytowane adresy” → ignorowane przy porównaniu, zachowane w zapisie.

## Testy

- Jednostkowe: `compare.ts` (wszystkie kombinacje `compareRow`, `apiOutcome` z próbkami i błędami, zgodność per silnik, pokrycie cytowań z `www.` i wielkością liter, progi tonu), `select.ts` (kluczowe najpierw, uzupełnianie, mniej niż 10 pytań), walidacja akcji (zod), dopisanie aliasu bez duplikatów.
- RLS: asercja w `tests/db/rls.test.ts`, że anon nie widzi `calibrations` ani `calibration_checks`.
- Render: wiersz rozbieżności i kafel zgodności (`renderToStaticMarkup`).

## Ograniczenia stałe

- Styl PSAI: tokeny motywu, kolor tylko ze znaczeniem, bez pigułek i gradientów, język polski, zdania w trybie rozkazującym na przyciskach.
- Każde zapytanie Supabase sprawdza `{ error }` i rzuca; zapisy scoped `project_id`.
- Brak nowych kosztów API.
- Commity kończą się linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
