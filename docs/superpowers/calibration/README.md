# Kalibracja: złoty zestaw promptów

Od 2026-10-13 kalibrację prowadzimy w aplikacji: Ustawienia → Kalibracja (`/app/calibration`), gdzie pytania, odpowiedzi i zgodność są zapisywane w bazie. Poniższa procedura i tabela zostają jako opis metody i szablon zapasowy, na wypadek gdyby ekran był niedostępny.

Cel: sprawdzić, czy wyniki z API (strona `/app/responses` po ostatnim runie) zgadzają się kierunkowo z tym, co widzi człowiek w publicznych interfejsach asystentów. Rozbieżności są wejściem do kalibracji w fazie 2.

## Procedura

1. Wybierz 10 promptów. W aplikacji dobiera je automatycznie z ostatniego zakończonego pomiaru (najpierw kluczowe, potem losowe). Ręcznie wybierz je z `supabase/seed.sql`, najlepiej mieszankę kategorii: kluczowe (kursy/szkolenia), porównawcze, brandowe i informacyjne.
2. Zadaj każdy z nich ręcznie, w nowej sesji bez zalogowanego kontekstu i bez historii, w trzech interfejsach:
   - chatgpt.com (z włączonym wyszukiwaniem w sieci),
   - perplexity.ai,
   - Google (wersja PL, wynik z AI Overview, jeśli się pojawia).
3. Dla każdej pary prompt x interfejs zanotuj: czy Polska Szkoła AI została wymieniona (tak/nie) i na której pozycji w odpowiedzi, o ile tak.
4. Wykonaj run projektu (przycisk „Uruchom pomiar”) i odczytaj te same prompty w `/app/responses`: czy marka jest wymieniona i na której pozycji.
5. Porównaj kierunkowo (wymieniona / niewymieniona). Cel: zgodność ≥ 80% na każdy silnik (8 z 10 pytań).
6. Rozbieżności opisz (hipoteza: personalizacja, geolokalizacja, inny model, wariancja odpowiedzi, błąd dopasowania aliasów) i zapisz je w pliku dla danego dnia.

Wyniki zapisuj w osobnym pliku `docs/superpowers/calibration/2026-10-<dd>.md` według poniższego szablonu. Gemini nie ma tu publicznego odpowiednika w tabeli, bo jego interfejs webowy (gemini.google.com) nie jest częścią obowiązkowego zestawu; można go dodać jako dodatkową kolumnę.

## Kalibracja rekomendacji

Rekomendacje (`/app/recommendations`) też kalibrujemy, nie tylko wyniki widoczności. Dla każdej rekomendacji typu `offsite` oraz dla źródeł, które model wskazuje w uzasadnieniu i dowodach (cytowane domeny i adresy), sprawdź ręcznie, czy te źródła naprawdę są cytowane przez asystentów przy danym pytaniu: zadaj prompt w ChatGPT i Perplexity (jak w procedurze powyżej) i porównaj listę źródeł z `evidence` rekomendacji. Zanotuj w pliku dnia, ile wskazanych źródeł faktycznie się pojawiło (cel: większość), oraz rekomendacje odwołujące się do domen, których asystenci nie cytują; to sygnał, że generator zbyt swobodnie interpretuje dowody.

## Szablon tabeli

Data kalibracji: ____ · Data i ID runu: ____ · Kto zadawał: ____

| # | Prompt | Interfejs | Ręcznie: wymieniona? | Ręcznie: pozycja | API: wymieniona? | API: pozycja | Zgodne kierunkowo? | Uwagi |
|---|--------|-----------|----------------------|------------------|------------------|--------------|--------------------|-------|
| 1 |        | ChatGPT   |                      |                  |                  |              |                    |       |
| 1 |        | Perplexity |                     |                  |                  |              |                    |       |
| 1 |        | Google AIO |                     |                  |                  |              |                    |       |
| 2 |        | ChatGPT   |                      |                  |                  |              |                    |       |
| 2 |        | Perplexity |                     |                  |                  |              |                    |       |
| 2 |        | Google AIO |                     |                  |                  |              |                    |       |
| 3 |        | ChatGPT   |                      |                  |                  |              |                    |       |
| 3 |        | Perplexity |                     |                  |                  |              |                    |       |
| 3 |        | Google AIO |                     |                  |                  |              |                    |       |
| 4 |        | ChatGPT   |                      |                  |                  |              |                    |       |
| 4 |        | Perplexity |                     |                  |                  |              |                    |       |
| 4 |        | Google AIO |                     |                  |                  |              |                    |       |
| 5 |        | ChatGPT   |                      |                  |                  |              |                    |       |
| 5 |        | Perplexity |                     |                  |                  |              |                    |       |
| 5 |        | Google AIO |                     |                  |                  |              |                    |       |

Szablon pokazuje 5 przykładowych pytań. Dla pytań 6–10 powtórz te same wiersze (3 silniki na pytanie).

Podsumowanie zgodności (zgodne / 10):

| Silnik | Zgodne / 10 | Cel ≥ 80% (8/10) osiągnięty? |
|--------|-----------|------------------------|
| ChatGPT |          |                        |
| Perplexity |       |                        |
| Google AI Overviews |  |                    |

## Rozbieżności i wnioski dla fazy 2

(do uzupełnienia)
