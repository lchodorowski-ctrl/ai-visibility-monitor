# Kalibracja: złoty zestaw promptów

Cel: sprawdzić, czy wyniki z API (strona `/app/responses` po ostatnim runie) zgadzają się kierunkowo z tym, co widzi człowiek w publicznych interfejsach asystentów. Rozbieżności są wejściem do kalibracji w fazie 2.

## Procedura

1. Wybierz 5 promptów z `supabase/seed.sql` (najlepiej mieszankę: 2 kluczowe z kategorii kursy/szkolenia, 1 porównawczy, 1 brandowy, 1 informacyjny).
2. Zadaj każdy z nich ręcznie, w nowej sesji bez zalogowanego kontekstu i bez historii, w trzech interfejsach:
   - chatgpt.com (z włączonym wyszukiwaniem w sieci),
   - perplexity.ai,
   - Google (wersja PL, wynik z AI Overview, jeśli się pojawia).
3. Dla każdej pary prompt x interfejs zanotuj: czy Polska Szkoła AI została wymieniona (tak/nie) i na której pozycji w odpowiedzi, o ile tak.
4. Wykonaj run projektu (przycisk „Uruchom teraz”) i odczytaj te same prompty w `/app/responses`: czy marka jest wymieniona i na której pozycji.
5. Porównaj kierunkowo (wymieniona / niewymieniona). Cel: zgodność w co najmniej 4 z 5 promptów na każdy silnik.
6. Rozbieżności opisz (hipoteza: personalizacja, geolokalizacja, inny model, wariancja odpowiedzi, błąd dopasowania aliasów) i zapisz je w pliku dla danego dnia.

Wyniki zapisuj w osobnym pliku `docs/superpowers/calibration/2026-10-<dd>.md` według poniższego szablonu. Gemini nie ma tu publicznego odpowiednika w tabeli, bo jego interfejs webowy (gemini.google.com) nie jest częścią obowiązkowego zestawu; można go dodać jako dodatkową kolumnę.

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

Podsumowanie zgodności (zgodne / 5):

| Silnik | Zgodne / 5 | Cel ≥ 4/5 osiągnięty? |
|--------|-----------|------------------------|
| ChatGPT |          |                        |
| Perplexity |       |                        |
| Google AI Overviews |  |                    |

## Rozbieżności i wnioski dla fazy 2

(do uzupełnienia)
