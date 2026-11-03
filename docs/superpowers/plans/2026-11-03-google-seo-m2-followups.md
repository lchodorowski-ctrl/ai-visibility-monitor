# Moduł Google M2: odłożone uwagi i decyzje

Data: 2026-11-03. Plan: `docs/superpowers/plans/2026-11-03-google-seo-m2.md`. Gałąź `feat/google-seo-m2`: 7 zadań z przeglądem po każdym, przegląd całej gałęzi (opus) i jedna fala poprawek. Testy: 1407.

## Ustalenia z prawdziwych odpowiedzi DataForSEO (2026-11-03)

- Google podaje część wyników jako `https://google.com/goto?url=…` z `domain: "google.com"`. Prawdziwa domena jest tylko w `breadcrumb`. Na „szkolenia ai” na telefonie nasz wynik (45. miejsce) przyszedł właśnie tak, a `stop_crawl_on_match` DataForSEO go nie rozpoznało.
- `stop_crawl_on_match` zatrzymuje się też na panelu wiedzy: na „polska szkoła ai” skończyło na 1. stronie, choć polskaszkola.ai nie ma tam wyniku organicznego. Stąd ruling M2-R1: bez tej opcji.
- `task_post` pobiera z góry 0,0066 USD (10 stron i AI Overview), a `task_get` pokazuje koszt po zwrocie: 0,0006 USD za stronę, plus 0,0006 USD tylko wtedy, gdy AI Overview ładował się asynchronicznie.
- Kolejka standard: wyniki po 40 s do ok. 20 min; głębsze wyniki dłużej.

## Decyzje (ruling: co, dlaczego, koszt pomyłki)

- R1: `toKeywordRow` wyeksportowany z keyword-queries.ts, żeby szczegóły frazy nie kopiowały mapowania; koszt: jeden eksport więcej.
- R2: fixtury SERP skopiował kontroler przed Task 3; to dane, nie kod.
- R3: awaria całej paczki `task_post` (HTTP 5xx, sieć) to wpisy `failed`, nie wyjątek, żeby nie zgubić identyfikatorów wcześniejszych, już opłaconych paczek.
- R4: kod 40200 w odpowiedzi `task_post` rzuca „brak środków”; zadania utworzone wcześniej w tej odpowiedzi zostaną wysłane ponownie po doładowaniu (najwyżej 0,0066 USD za zadanie).
- R5: wiersze `failed` wysyła ponownie następne uruchomienie w tym samym tygodniu (zawężone przez R9).
- R6: gdy `task_post` nie przyjął żadnego zadania (brak kluczy, martwe API), zadanie kończy się `failed`, a nie `done` z samymi błędami.
- R7: okno wznawiania liczone po `week_start` (bieżący i poprzedni tydzień), a nie po `created_at` z 7 dni, bo to okno równało się rytmowi harmonogramu.
- R8: po odmowie limitu SEO uruchomienie i tak odbiera już opłacone wyniki (`task_get` jest darmowe).
- R9: błędy transportu przy `task_get` dają `pending` (odbiór w następnym kroku), `failed` tylko dla kodów zadań DataForSEO.
- R10: przy wyjątku z `task_post` job dostaje koszt szacunku; limit 100 fraz liczony na tydzień, nie na uruchomienie.
- R11: wiersze `pending` bez `dfs_task_id` z poprzedniego tygodnia zamykane jako `failed` (nic za nie nie zapłacono).
- R12: komputer jest odniesieniem dla konkurenta i odznak, telefon tylko zastępczo; oznaczenia „blisko top 3” i „rankuje inna strona” z dowolnego urządzenia; kwoty „najwyżej” zaokrąglane w górę.
- R13: jedna fala poprawek po przeglądzie całości: „przerwane” dopiero po czasie odpytywania rank-check, data „stan na” przy pozycji, nieaktualny „Kierunek” po 7 dniach, odporność parsera, brakujący koszt `task_get`, informacja o limicie 100 fraz, odbiór przed wczesnym zamknięciem, pusty wykres, ogólny komunikat błędu, szkielet 4 kafli.
- R14: zostają odłożone pozycje niżej.

## Odłożone drobne uwagi

- „Kierunek” w poniedziałek 04:00-05:00 (w trakcie odpytywania) liczy tylko frazy już sprawdzone w nowym tygodniu.
- Przerwany job rank-check trzyma rezerwację (do 1,32 USD) bez pokazania jej w UI.
- Bramka budżetu: odczyt i rezerwacja nie są atomowe (okno milisekund, `concurrencyLimit: 1` na typ zadania).
- `postSerpTasks`: wyjątek „brak środków” gubi identyfikatory wcześniejszych paczek tego samego wywołania (ponowne wysłanie po doładowaniu); brak `cost` w `task_post` zapisuje 0.
- Wynik, którego parser nie umie odczytać, wraca jako `failed` i jest kupowany ponownie przy każdym ręcznym sprawdzeniu w tym tygodniu.
- Wczesne zamknięcia (brak fraz, brak domeny) nie zamykają starszych wierszy `pending`.
- Szczegóły frazy: zapytanie historii pobiera jsonb każdego tygodnia; konkurent nazwany tylko przy swoim najlepszym wyniku w top 10; konkurenci spoza top 10 niewidoczni.
- Lista fraz: „rankuje inna strona” może pochodzić z telefonu, gdy pokazany adres jest z komputera; błąd `rank_latest` wyłącza całą listę (przez `error.tsx`).
- `num`/`isRecord`/`str` skopiowane po raz trzeci (rank-queries.ts); wspólny moduł parsowania przy następnej zmianie.
- Testy RLS: brak testu `with check` dla `rank_checks`; starsze testy otwierają klienta ręcznie.
- `SuggestionRow.updatedAt` nieużywane po R11 z M3.
- Komunikat `google/error.tsx` kończy się kropką, inne tytuły błędów nie.

## Kolejność wdrożenia

`npx supabase db push` (migracja `20261104000000_rank_checks`) przed deployem Vercel: bez funkcji `rank_latest` strona „Frazy” pokaże błąd.
