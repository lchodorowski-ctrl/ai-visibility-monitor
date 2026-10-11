# Spec: AI Visibility Monitor (monitoring widoczności w LLM-ach)

## Kontekst

Polska Szkoła AI chce wiedzieć, **czy i jak modele AI (ChatGPT, Gemini, Google AI Overviews, Perplexity, Claude, Copilot, Grok…) polecają PSAI**, na jakie pytania wypadamy wysoko, gdzie wygrywa konkurencja i **co konkretnie zrobić, żeby być wyżej**. Dziś nie ma tego pomiaru. Klasyczne SEO (pozycje w Google) nie pokazuje, co odpowiada ChatGPT.

Ustalenia z rozmowy:
- **Odbiorca:** najpierw narzędzie wewnętrzne PSAI, ale od pierwszego dnia architektura pod wiele marek (później usługa lub produkt dla klientów).
- **Silniki:** wszystkie główne.
- **Rynek:** Polska, pytania po polsku.
- **Rekomendacje:** pełne, czyli monitoring, źródła, konkurencja, audyt strony i priorytetowy plan działań ze szkicami treści.
- **Zbieranie danych:** hybryda. Oficjalne API modeli z web searchem plus dostawca SERP (DataForSEO) dla Google AI Overviews i AI Mode.
- **Stack:** Next.js + Supabase + Vercel, TypeScript.

Kluczowa zmiana myślenia: w LLM-ach nie ma „pozycji na frazę”. Są **pytania (prompty)**, a odpowiedzi są niedeterministyczne. Dlatego mierzymy **prawdopodobieństwo wzmianki** (każdy prompt zadajemy kilka razy), a nie pojedynczą pozycję.

---

## 1. Co aplikacja mierzy (metryki)

| Metryka | Co oznacza |
|---|---|
| **Visibility rate** | % odpowiedzi, w których pada nazwa PSAI (per prompt, silnik, temat) |
| **Średnia pozycja** | Które miejsce na liście rekomendacji zajmujemy (1. polecenie to nie to samo co 7.) |
| **Share of Voice** | Nasz udział we wzmiankach w porównaniu z konkurencją |
| **Citation rate** | % odpowiedzi, które linkują do polskaszkola.ai (i do której podstrony) |
| **Sentyment i kontekst** | Jak nas opisują: pozytywnie, neutralnie, z zastrzeżeniami |
| **Dokładność** | Czy AI mówi o nas prawdę (ceny, oferta, lokalizacja). Wykrywanie halucynacji |
| **AI Visibility Score** | Wskaźnik złożony 0–100 do raportów i trendu |

Każdy prompt × silnik × próbka to jeden pomiar. Domyślnie **1 próbka**, a dla kluczowych promptów **3 próbki** (patrz „Koszty”). Dodatkowo tryb **„wiedza modelu”** (bez web searcha) pokazuje, co model wie o nas z treningu, czyli efekt długoterminowy.

## 2. Funkcje (ekrany)

1. **Przegląd:** AI Visibility Score, trend tygodniowy, SoV w porównaniu z top 5 konkurentów, rozbicie na silniki, najważniejsze zmiany i alerty.
2. **Prompty i tematy:** biblioteka pytań pogrupowana w klastry (np. „kursy AI dla firm”, „szkolenia ChatGPT”, „AI w edukacji”) i intencje (informacyjna / porównawcza / zakupowa / brandowa). Heatmapa prompt × silnik (zielone: jesteśmy, czerwone: brak). Generator promptów: z fraz seed, Google Search Console, „People Also Ask” i person (HR manager, CEO MŚP, nauczyciel), proponowany przez LLM i akceptowany ręcznie.
3. **Konkurencja:** kto wygrywa w których tematach, nowe marki pojawiające się w odpowiedziach (auto-wykrywanie), porównanie head-to-head.
4. **Źródła (najważniejsze dla rekomendacji):** które domeny i URL-e AI cytuje w naszych tematach (rankingi „najlepsze kursy AI”, Wikipedia, Reddit/Wykop, YouTube, LinkedIn, media branżowe). Widok „gdzie cytują konkurencję, a nas nie ma”, czyli lista celów PR i outreachu.
5. **Odpowiedzi:** surowe odpowiedzi z podświetleniem marek i cytowań. Historia zmian dla danego promptu.
6. **Audyt strony (polskaszkola.ai):**
   - dostępność dla botów AI: robots.txt (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended), `llms.txt`, renderowanie bez JS (boty AI nie wykonują JS);
   - dane strukturalne: Organization, Course, FAQPage, Person (trenerzy), Review/AggregateRating, sameAs;
   - jakość treści pod AI: odpowiedź na początku strony, sekcje Q&A, konkretne liczby i fakty, daty aktualizacji, tabele porównawcze;
   - spójność encji: ta sama nazwa, opis i dane w sieci (Google Business, LinkedIn, Wikidata, katalogi).
7. **Rekomendacje (plan działań):** priorytetowy backlog (wpływ × wysiłek), każda pozycja z **dowodem** (które prompty i źródła ją uzasadniają). Typy:
   - *Treść do stworzenia:* brakujący temat, z gotowym szkicem/briefem;
   - *Strona do poprawy:* konkretny URL i co zmienić;
   - *Techniczne:* schema, robots, llms.txt, SSR;
   - *Off-site:* gdzie trafić (ranking, artykuł, wątek Reddit, Wikipedia/Wikidata, katalog), z listą konkretnych URL-i;
   - *Korekta faktów:* gdzie AI mówi o nas nieprawdę i skąd to bierze.
   Statusy (do zrobienia / w toku / zrobione) i **pomiar efektu**: visibility przed i po wdrożeniu dla powiązanych promptów.
8. **Alerty:** spadek visibility, nowy konkurent, halucynacja o marce, utrata cytowania (e-mail i Slack).
9. **Raporty:** tygodniowy i miesięczny PDF/link. Później white-label dla klientów.
10. **Ustawienia:** marka (nazwa, aliasy, domeny), konkurenci, silniki, częstotliwość, budżet API.

## 3. Architektura

```
Vercel Cron ─► Trigger.dev job "run-project"
                 │ fan-out: prompt × silnik × próbka (limity, retry)
                 ▼
        Engine adapters ──► surowa odpowiedź + cytowania ─► Supabase (responses)
                 ▼
        Extractor (LLM, structured output) ─► mentions, citations, sentiment, claims
                 ▼
        Aggregator ─► daily_metrics (snapshoty do wykresów)
                 ▼
        Recommender (tygodniowo) ◄── site_audit (crawler) ─► recommendations
                 ▼
        Next.js dashboard / raporty / alerty
```

**Adaptery silników** (wspólny interfejs `query(prompt, {locale:'pl-PL', search:true}) → {text, citations[], model, raw}`):
- ChatGPT: OpenAI Responses API + narzędzie web_search
- Gemini: Gemini API z groundingiem Google Search
- Claude: Anthropic API + web search tool
- Perplexity: Sonar API (natywne cytowania)
- Grok: xAI API z wyszukiwaniem
- Google AI Overviews i AI Mode: DataForSEO SERP API (lokalizacja Polska, język polski)
- Copilot / DeepSeek: faza 2 (Copilot przez dostawcę SERP, jeśli dostępny; DeepSeek tylko w trybie „wiedza modelu”)

**Ekstrakcja:** Claude (tańszy model) z JSON schema wyciąga listę marek w kolejności, pozycję PSAI, sentyment, cytowane URL-e i twierdzenia o marce. Twierdzenia są porównywane z „kartą faktów” marki wpisaną w ustawieniach (wykrywanie halucynacji). Marki dopasowujemy aliasami („PSAI”, „Polska Szkoła AI”, „polskaszkola.ai”) plus fuzzy match.

**Multi-tenant od dnia 1:** `organizations → projects (marka) → …`, Supabase Auth i RLS po `organization_id`. Bez płatności w MVP.

### Model danych (Postgres)
`organizations`, `memberships`, `projects` (marka, aliasy, domeny, karta faktów), `competitors`, `topics`, `prompts` (tekst, temat, intencja, aktywny), `engines`, `runs`, `responses` (raw w JSONB/Storage), `mentions` (marka, pozycja, sentyment), `citations` (url, domena, czy nasza), `claims` (twierdzenie, poprawne?), `daily_metrics`, `site_audits`, `audit_findings`, `recommendations` (typ, priorytet, dowody, status, baseline), `alerts`.

### Koszty: domyślnie wariant oszczędny
Główny koszt to **opłata za wyszukiwanie w sieci** (ok. 0,5–3,5 centa za zapytanie, zależnie od dostawcy). Tokeny przy tanich modelach to grosze. Ceny trzeba zweryfikować przed startem.

Zasady obniżające koszt (wbudowane od początku):
- **Próbkowanie warstwowe:** 1 próbka dla większości promptów, 3 tylko dla ok. 20 kluczowych.
- **Mniej promptów na start:** 50 dobrze dobranych zamiast 150. Rozbudowa dopiero, gdy wiemy, które tematy są ważne.
- **Częstotliwość wg ważności:** kluczowe prompty co tydzień, reszta co 2–4 tygodnie.
- **Najtańsze modele** (mini/flash/haiku) i darmowe limity, gdzie istnieją (np. pula darmowych zapytań z groundingiem w Gemini, do potwierdzenia).
- **Google AI Overviews i AI Mode przez DataForSEO:** ułamek centa za zapytanie.
- **Ekstrakcja najpierw bez LLM:** dopasowanie aliasów marek i domen kodem; LLM (tani model, batch) tylko do sentymentu i weryfikacji faktów.
- **Twardy limit budżetu** w ustawieniach: run zatrzymuje się po przekroczeniu.

| Wariant | Skala | Szacunek / mies. |
|---|---|---|
| **Start (domyślny)** | 50 promptów × 6 silników × 1 próbka, tygodniowo (+20 kluczowych × 3) | **~15–30 USD** |
| Rozszerzony | 150 promptów × 7 silników × 3 próbki, tygodniowo | ~80–150 USD |

### Ograniczenie, o którym trzeba pamiętać
Odpowiedzi z API nie są identyczne z tym, co widzi użytkownik w aplikacji ChatGPT (personalizacja, pamięć, inne wersje modeli). Kierunek i trendy są wiarygodne. Dla kalibracji raz w miesiącu ręczny spot-check 10 promptów w prawdziwych interfejsach, z wynikami wpisanymi do aplikacji.

## 4. Etapy wdrożenia

| Faza | Zakres | Efekt |
|---|---|---|
| **0. Fundament** (~1 tydz.) | Repo Next.js + Supabase, schemat bazy z RLS, auth, organizacja/projekt PSAI, konfiguracja marki i konkurentów | Szkielet aplikacji |
| **1. Monitoring MVP** (~2 tyg.) | Biblioteka promptów + generator, adaptery: ChatGPT, Perplexity, Gemini, AI Overviews; ekstrakcja; ekrany Przegląd, Prompty, Odpowiedzi | **Pierwszy realny pomiar PSAI** |
| **2. Konkurencja i źródła** (~2 tyg.) | Pozostałe silniki (Claude, Grok, AI Mode, Copilot), SoV, auto-wykrywanie konkurentów, ekran Źródła, analiza luk | Wiemy, kto i dzięki czemu wygrywa |
| **3. Audyt + rekomendacje** (~2 tyg.) | Crawler strony, checklisty techniczne i treściowe, silnik rekomendacji (reguły + synteza LLM), backlog ze statusami, pomiar efektu, szkice treści | **Plan działań** |
| **4. Alerty, raporty, klienci** | Alerty e-mail/Slack, raporty PDF, white-label, zaproszenia klientów, później billing | Gotowe do oferowania klientom |

Następny krok: na podstawie tej specyfikacji powstaje szczegółowy plan implementacyjny fazy 0–1 (zadania, pliki, testy) do akceptacji przed pisaniem kodu.

## 5. Weryfikacja

- **Testy jednostkowe ekstraktora** na zestawie zapisanych odpowiedzi (fixtures) z ręcznie oznaczonymi markami, pozycjami i cytowaniami. Cel: ≥95% zgodności.
- **Testy kontraktowe adapterów:** każdy silnik zwraca znormalizowany format; obsługa błędów, limitów i retry.
- **Złoty zestaw:** 20 promptów sprawdzonych ręcznie w chatgpt.com / perplexity.ai / Google, porównanych z wynikami aplikacji.
- **E2E:** pełny run dla 10 promptów × 4 silniki, potem dashboard pokazuje metryki i można przejść do surowych odpowiedzi.
- **Audyt:** uruchomienie na polskaszkola.ai, ręczna weryfikacja wyników robots/schema/llms.txt.
- **Rekomendacje:** każda pozycja ma podpięte dowody (prompty, źródła). Przegląd pierwszego backlogu z zespołem.
