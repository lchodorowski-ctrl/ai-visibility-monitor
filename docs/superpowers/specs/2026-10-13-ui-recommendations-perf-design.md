# Spec: nowy interfejs (styl PSAI), rekomendacje per pytanie, szybkość

Data: 2026-10-13. Rozszerza spec fazy 0–1 (`2026-10-12-ai-visibility-monitor-design.md`). Kod bazowy: gałąź `feat/phase-0-1` po pierwszych realnych runach.

## Kontekst i cel

Aplikacja działa i mierzy widoczność PSAI, ale (1) wygląda jak surowy szkielet, (2) pokazuje problem („0% na pytania ogólne”), a nie mówi, co z nim zrobić, (3) w trybie deweloperskim ekrany ładują się po kilka sekund. Po tej pracy:

- każdy ekran wygląda jak platforma do nauki PSAI (styl „Apple iPad”: jasno, przestronnie, wielka typografia, kafle 28 px, czarne przyciski, dwa kroje pisma);
- dla każdego pytania z zerową lub niską widocznością użytkownik dostaje **konkretne, uzasadnione rekomendacje** (co opublikować, co poprawić, gdzie się zgłosić), z dowodem i statusem;
- aplikacja otwiera ekrany szybko: jedno sprawdzenie sesji, zapytania równolegle, strumieniowanie wolnych sekcji, tryb produkcyjny do codziennej pracy.

Kolejność wdrożenia: **C (szybkość) → A (interfejs) → B (rekomendacje)**.

## Część A. Interfejs w stylu PSAI

**Źródło prawdy stylu:** `docs/design/psai-apple-ipad-style/` (SKILL.md, `references/tokens.css`, `references/components.md`, `assets/starter.html`, `assets/psai-logo.svg`). Wartości z tych plików są wiążące; poniżej tylko decyzje, których skill nie rozstrzyga dla aplikacji z danymi.

### Tokeny i fonty
- Blok `@theme` z `tokens.css` (wariant B, Tailwind v4) trafia do `src/app/globals.css`; zmienne shadcn (`--background`, `--primary`, `--radius`, `--border`, `--muted`, `--muted-foreground`…) mapujemy na tokeny skilla (`--primary: #1d1d1f`, `--radius: 8px`, `--border: rgb(0 0 0 / 0.14)`, `--muted: #f5f5f7`, `--muted-foreground: #636366`).
- Fonty przez `next/font/google`: Space Grotesk 400/500/600/700 (`variable: "--font-space-grotesk"`), JetBrains Mono 400/500 (`--font-jetbrains-mono`), `subsets: ["latin", "latin-ext"]` (polskie znaki).
- Motyw jasny domyślnie; tokeny ciemne (`:root[data-theme="dark"]`) wklejone, bez przełącznika w tej iteracji.

### Układ aplikacji
- **Nagłówek górny** (zamiast bocznego paska): lepki, 56 px, tło `bg/90` + blur, linia `line`. Po lewej logo PSAI (36 px, `psai-logo.svg`, `currentColor`), po prawej nawigacja jako ciche linki 14 px (`Przegląd · Prompty · Rekomendacje · Odpowiedzi · Ustawienia`; aktywny `t0` 500, reszta `t1`) i przycisk drugorzędny „Wyloguj”. Na ≤ 520 px linki w poziomym przewijanym rzędzie.
- Kontener `max-width: 1240px`, padding 24/48 px, `padding-top: 48px`, sekcje co 80 px, w sekcji 20–24 px.
- Każda strona zaczyna się od **hero**: etykieta mono (eyebrow, np. `POLSKA SZKOŁA AI · PRZEGLĄD`) i tytuł `clamp(40px, 7vw, 72px)`.

### Zasady dla danych (rozstrzygnięcia poza skillem)
- **Listy danych** (odpowiedzi, prompty): wiersze oddzielone hairline `line` **wewnątrz jednego kafla** `s1` (bez obramowań tabel, bez zebry). Wysokość wiersza ≥ 52 px, meta w mono 11 px, tytuł 16 px. Nagłówki kolumn jako meta mono.
- **Heatmapa** (prompt × silnik): komórki kwadratowe w siatce wewnątrz kafla; skala **monochromatyczna**: brak danych `s2` z „—” w `t2`; 0% `bg` z obramowaniem `line-2` i tekstem `t1`; 1–66% czerń z kryciem proporcjonalnym (`rgb(29 29 31 / 0.15–0.6)`), tekst `t0`; ≥ 67% `accent` z tekstem `bg`. Żadnych czerwieni/zieleni (czerwony = błąd, teal = sukces, tylko tam).
- **Kafle statystyk** na Przeglądzie: cztery (`Score`, `Visibility`, `Citation rate`, `Share of voice`) z wielką liczbą 96 px (72 px ≤ 520 px) i paskiem postępu; „Śr. pozycja” jako detail pod Visibility.
- **Silniki**: cztery kafle w siatce (nazwa 20 px, visibility 48 px, meta mono: cytowania · score · pozycja). Brak danych → kafel w `s2` z „—”.
- **Wykres trendu**: w kaflu, linia `accent` 2 px, siatka pozioma `line`, osie w mono 11 px `t2`; bez wypełnień i cieni.
- **Jeden kafel odwrócony na ekran**: na Przeglądzie to wezwanie „Uruchom pomiar” (gdy nie było runu) albo najważniejsza rekomendacja (gdy są); na Rekomendacjach — pierwsza na liście.
- **Przyciski**: główny czarny 8 px, drugorzędny obrys; akcje destrukcyjne („Usuń”) jako ciche linki w `t1`, po najechaniu `red`.
- **Stany**: szkielety w kształcie kafli przy strumieniowaniu; puste ekrany i błędy wg `components.md` §8 z instrukcją co dalej („Uruchom pierwszy pomiar na stronie Przegląd”).
- **Polskie liczebniki** w etykietach (1 pytanie / 2–4 pytania / 5+ pytań) przez `pluralPl(n, forms)`.
- **Komponenty shadcn** zostają tylko tam, gdzie niosą zachowanie (Select, Checkbox); karty, tabele i odznaki shadcn zastępują komponenty skilla: `Tile`, `TileInverse`, `StatTile`, `Rows`, `Meta`, `Eyebrow`, `PageHero`, `EmptyState`, `Skeleton`.

### Ekrany (zakres)
Przegląd, Prompty (lista + heatmapa + generator), Odpowiedzi (lista + szczegół z podświetleniem), Ustawienia (marka, konkurenci, silniki, budżet, **adres strony**), Rekomendacje (nowy), Logowanie. Dostępność: fokus 2 px `accent`, `prefers-reduced-motion`, kontrast AA, `aria-label` na kaflach-linkach.

## Część B. Rekomendacje per pytanie

### Dane
- `projects.site_url text` (nowe pole; domyślnie `https://www.polskaszkola.ai`, dla PSAI ustawione na `https://polskaszkolaai.netlify.app` do czasu przepięcia domeny). Edytowalne w Ustawieniach, walidacja URL http(s).
- `site_pages (id, project_id, url, path, title, h1, description, excerpt text, status int, fetched_at, unique(project_id, url))` — mapa strony z sitemapy. Crawler: pobiera `${site_url}/sitemap.xml` (albo indeks sitemap), **podmienia host każdego `<loc>` na host `site_url`** (sitemapa Netlify wskazuje `polskaszkola.ai`), pobiera każdą stronę (limit 200 stron, 4 równolegle, timeout 15 s, `User-Agent: PSAI-VisibilityBot/1.0`), wyciąga `<title>`, pierwszy `<h1>`, `meta description`, pierwsze ~600 znaków tekstu głównego. Respektuje `robots.txt` (Disallow dla `*`). Zapis upsert po `(project_id, url)`; strony nieobecne w nowej sitemapie dostają `status = 410`.
- `recommendations (id, project_id, prompt_id null, run_id, type ∈ {content_new, content_improve, offsite, technical, fact_fix}, title, summary, action_steps jsonb[], target_url null, suggested_outline jsonb null, evidence jsonb, impact 1–5, effort 1–5, priority = impact*2 - effort, status ∈ {todo, doing, done, dismissed}, fingerprint text, created_at, updated_at; unique(project_id, fingerprint))`.
  - `evidence = { prompt_ids[], visibility_by_engine{}, cited_domains[{domain, count}], cited_urls[], competitors_mentioned[], sample_quotes[] }`.
  - `fingerprint = sha1(type + normalizowany title)` — scalanie tych samych wniosków z różnych pytań: przy kolizji `evidence.prompt_ids` i cytowania są łączone, `updated_at` odświeżany, status zachowany.
- `project_engines` bez zmian. Próg niskiej widoczności: `projects.low_visibility_threshold numeric default 0.34`.

### Generowanie
- Zadanie Trigger.dev `recommend-project` uruchamiane przez `run-project` po udanej agregacji (i ręcznie z ekranu Rekomendacje: „Odśwież rekomendacje”). Pomija się, gdy brak `ANTHROPIC_API_KEY`.
- Wejście dla jednego pytania: tekst, intencja, temat; `visibility_rate` per silnik z dzisiejszego snapshotu; z odpowiedzi tego dnia: do 2 fragmentów na silnik (±400 znaków wokół pierwszej wzmianki konkurenta lub początek), cytowane domeny z liczbą wystąpień i do 10 konkretnych URL‑i, wymienieni konkurenci z liczbą; karta faktów marki; lista podstron (`title`, `path`, `description`) z `site_pages` (do 120 wierszy); istniejące rekomendacje dla pytania (żeby nie dublować).
- Kwalifikacja pytania: `visibility_rate` ogółem < próg **lub** 0% w ≥ 2 silnikach. Pytania brandowe (`intent = brand`) z widocznością ≥ próg pomijane.
- Model: `process.env.ANTHROPIC_RECOMMENDER_MODEL ?? "claude-opus-5-5"`, `messages.parse` + `zodOutputFormat`, `output_config.effort: "high"`, `max_tokens: 8000`, system prompt w pamięci podręcznej (cache_control). Schemat odpowiedzi: `recommendations[1..3]` z polami jak w tabeli (bez `priority`, bez `fingerprint`) plus `rationale_pl`. System prompt mówi: język polski, głos PSAI (konkret, bez pustych superlatywów), każda rekomendacja musi wskazywać **konkretny artefakt** (tytuł nowej strony + 5‑punktowy zarys + docelowa ścieżka; albo istniejąca podstrona po `path` + co dodać; albo konkretny URL rankingu/artykułu/katalogu, w którym cytowana jest konkurencja; albo konkretna zmiana techniczna), ma odwoływać się do dowodów z wejścia i nie wymyślać źródeł.
- Reguły deterministyczne (bez LLM) dodawane przez kod: brak `/llms.txt` na `site_url` → `technical` „Opublikuj llms.txt”; brak reguł dla botów AI w `robots.txt` → informacja (nie rekomendacja, bo `Allow: /` wystarcza); sitemapa niedostępna → `technical`.
- Koszt: ~6–8 tys. tokenów wejścia i ~1 tys. wyjścia na pytanie; przy 20 pytaniach ≈ 0,8–1,2 USD na run (Opus 5.5). Liczone i zapisywane w `runs.cost_usd` jako osobna pozycja `recommendations_cost_usd`.

### Ekran Rekomendacje
- Hero „Rekomendacje”, meta: liczba otwartych, data ostatniego odświeżenia, przycisk drugorzędny „Odśwież rekomendacje” (uruchamia `recommend-project`, blokada gdy run w toku).
- Filtry (ciche linki): Wszystkie · Nowa treść · Popraw stronę · Off‑site · Techniczne; status: otwarte / zrobione / odrzucone.
- Lista jako siatka kafli (320 px min): typ jako meta mono, tytuł 20 px, 1–2 zdania `summary`, pasek „wpływ”/„wysiłek” jako kropki 1–5 w mono, u dołu akcje: „Oznacz jako zrobione”, „Odrzuć”, „Szczegóły”. Pierwszy kafel (najwyższy priorytet, status `todo`) odwrócony.
- Szczegół (`/app/recommendations/[id]`): kroki działania (lista numerowana), zarys treści (jeśli `content_new`), docelowy URL, **dowody**: pytania (linki do odpowiedzi), cytowane źródła z licznikami, wymienieni konkurenci, cytaty z odpowiedzi; przyciski statusu.
- Na Promptach: w heatmapie przy pytaniu licznik „rekomendacje (n)” → link na ekran z filtrem `?prompt=`.
- Na Przeglądzie: kafel odwrócony z pierwszą rekomendacją, gdy istnieje.

## Część C. Szybkość
- `getCurrentProject()` i `requireUser()` owinięte w `React.cache()` — jedno `getUser()` i jedno zapytanie o projekt na żądanie; proxy nadal sprawdza sesję (to inna warstwa).
- Zapytania na stronach wykonywane równolegle (`Promise.all`), metryki ograniczone do ostatnich 90 dni (`order date desc, limit`), lista odpowiedzi 100 + „pokaż więcej” (paginacja kursorem po `created_at`).
- Wolne sekcje (trend, wzmianki, heatmapa, rekomendacje) jako osobne komponenty serwerowe w `<Suspense>` ze szkieletem w kształcie kafla.
- `next.config.ts`: `turbopack.root` ustawiony na katalog projektu (wycisza ostrzeżenie o `package-lock.json`).
- `package.json`: `"start:prod": "next build && next start -p 3000"`; README: „do codziennej pracy uruchamiaj `npm run start:prod`, `npm run dev` tylko przy zmianach w kodzie”.
- Cel mierzalny: w trybie `start` TTFB `/app` < 400 ms lokalnie (zmierzone `curl -w %{time_starttransfer}` z ciasteczkiem sesji), w trybie `dev` drugi i kolejne wejścia na ekran < 1 s.

## Poza zakresem (świadomie)
Ciemny motyw z przełącznikiem, pełny audyt techniczny strony (schema.org, jakość treści per strona), automatyczne tworzenie treści, pomiar efektu rekomendacji (before/after), powiadomienia. To faza 3/4 ze specyfikacji głównej.

## Weryfikacja
- Testy jednostkowe: parser sitemapy (indeks + zwykła, podmiana hosta), ekstraktor strony (title/h1/description/excerpt), kwalifikacja pytań do rekomendacji, budowa wejścia dla modelu (limity rozmiaru), fingerprint i scalanie, `pluralPl`, skala kolorów heatmapy, `React.cache` dedupe (test licznika wywołań).
- Testy z mockiem Anthropic SDK: `generateRecommendations` zwraca 1–3 pozycje, odrzuca wynik bez `target_url`/`suggested_outline` tam, gdzie wymagane.
- Ręcznie: każdy ekran w 1440 px i 375 px bez przewijania poziomego; checklista ze SKILL.md (nagłówek 56 px, kafle 28 px, czarne przyciski 8 px, fokus, liczebniki); pełny run → rekomendacje pojawiają się dla pytań z 0% (np. „Jakie są najlepsze szkolenia z AI dla firm w Polsce?”) i każda ma dowody; pomiar TTFB przed/po.
