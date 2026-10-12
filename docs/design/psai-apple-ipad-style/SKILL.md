---
name: psai-apple-ipad-style
description: >-
  Styl wizualny platformy do nauki Polskiej Szkoły AI (PSAI), inspirowany apple.com/pl/ipad - jasne, przestronne tło, duża typografia Space Grotesk + JetBrains Mono, duże zaokrąglone kafle 28px, czarne przyciski, monochromatyczna paleta, logo klienta obok logo PSAI. Używaj tego skilla ZAWSZE, gdy użytkownik prosi o stronę, panel, platformę, landing, formularz, stronę do pobrania plików lub jakikolwiek interfejs "w stylu Apple", "w stylu iPad", "w stylu naszej platformy do nauki", "jak platforma PSAI", albo o stronę dla klienta PSAI (np. Kramp, Lingaro) w tym samym wyglądzie - nawet jeśli nie pada słowo "styl". Use for any UI that must match the PSAI learning platform / Apple iPad look: airy white layout, huge headlines, 28px tiles, black buttons, Space Grotesk + JetBrains Mono, restrained client co-branding.
---

# Styl Apple iPad (platforma do nauki PSAI)

Ten skill odtwarza wygląd platformy do nauki Polskiej Szkoły AI (`2.0/Platforma`, plik `src/app/globals.css` i komponenty). Platforma jest świadomie inspirowana stroną apple.com/pl/ipad: spokojna, jasna, z dużą typografią i dużymi kafelkami. Cała reszta jest podporządkowana treści, bo to narzędzie do nauki i pobierania materiałów, a nie wizytówka.

## Dlaczego tak to wygląda (zrozum zasadę, a nie tylko wartości)

- **Monochromat.** Czerń `#1d1d1f` na bieli i jasnoszarym `#f5f5f7`. Kolor pojawia się rzadko, więc każdy kolor coś znaczy: czerwony to błąd lub odwołanie, zielony to sukces. Dzięki temu strona wygląda drogo i nie męczy.
- **Wielka typografia zamiast ozdób.** Hierarchię robi rozmiar nagłówka (48-72 px) i dużo powietrza, a nie ramki, cienie czy gradienty.
- **Duże, miękkie kafle.** Treść żyje w kaflach o promieniu 28 px na szarym tle `s1`. Kafel unosi się o 4 px po najechaniu, to jedyny "efekt" w całym systemie.
- **Dwa kroje o różnych rolach.** Space Grotesk to głos strony (nagłówki, treść, przyciski). JetBrains Mono to "metadane": małe, wersalikami, z rozstrzelonymi literami (etykiety, daty, liczniki).

Gdy coś jest niejasne, zapytaj siebie: czy to dodaje spokoju, czy hałasu? Jeśli hałasu, wytnij.

## Tokeny

Pełny, gotowy do wklejenia zestaw jest w `references/tokens.css` (zwykłe CSS oraz wariant Tailwind v4 `@theme`). Skrót:

| Token | Jasny | Użycie |
|---|---|---|
| `bg` | `#ffffff` | tło strony |
| `s1` | `#f5f5f7` | tło kafli |
| `s2` / `s3` | `#ececf0` / `#e2e2e7` | szkielety ładowania, nieaktywne elementy |
| `line` / `line-2` / `line-3` | czerń 8% / 14% / 28% | linie, obramowania, hover obramowań |
| `accent` = `t0` | `#1d1d1f` | tekst główny, czarne przyciski, pasek postępu |
| `t1` / `t2` | `#515154` / `#636366` | tekst drugoplanowy / metadane |
| `red` | `#c3283f` | tylko błędy i odwołane |
| `teal` | `#0a7a63` | tylko sukces |

Ciemny motyw (`data-theme="dark"`): `bg #000`, `s1 #1c1c1e`, `accent/t0 #f5f5f7`. Domyślnie jasny; ciemny wybiera użytkownik.

## Typografia

- Space Grotesk 400/500/600/700, JetBrains Mono 400/500 (Google Fonts, zawiera polskie znaki).
- Body: 16 px, `letter-spacing: -0.005em`, `line-height: 1.5`. Nagłówki: `letter-spacing: -0.025em`, waga 600.
- Skala: tytuł strony 48 px (mobile) i 72 px (desktop); sekcja 30 px; tytuł kafla 20 px; tekst 16/14 px.
- Etykieta nad tytułem (nazwa klienta/sekcji): mono, 11 px, wersaliki, `letter-spacing: 0.14em`, kolor `t2`.
- Meta w kaflu (typ, rozmiar, data): mono, 11 px, wersaliki, `letter-spacing: 0.08em`, `t2`, elementy rozdzielone `·`.
- Etykiety pól formularza: 12 px, wersaliki, `letter-spacing: 0.07em`, 500, `t1`.

## Układ

- Kontener strony: `max-width: 1240px`, boczne odstępy 24 px (od 1024 px: 48 px).
- Nagłówek: lepki, wysokość 56 px, tło `bg` 90% z `backdrop-filter: blur(20px)`, linia dołem `line`. Po lewej logo, po prawej akcje jako małe obrysowane przyciski.
- Treść: `padding-top: 48px`. Między dużymi sekcjami 80 px, wewnątrz sekcji 20-24 px.
- Siatka kafli: `repeat(auto-fill, minmax(min(100%, 320px), 1fr))`, odstęp 24 px.
- Mobile-first: jedna kolumna, kafle pełnej szerokości, brak poziomego przewijania.

## Komponenty (szczegóły i wartości w `references/components.md`)

- **Kafel** (`rounded 28px`, tło `s1`, hover: `translateY(-4px)` i cień `0 18px 40px -18px rgb(0 0 0 / .35)`, 300 ms). Okładka 16:9 lub 4:3 z pastelowym gradientem i wielką, półprzezroczystą literą/rozszerzeniem (`color: rgb(29 29 31 / .2)`).
- **Kafel odwrócony** (tło `accent`, tekst `bg`) dla jednego głównego wezwania do działania na stronie ("Kontynuuj").
- **Przyciski**: główny to `bg accent`, tekst `bg`, promień **8 px** (nie pigułka), `padding 10px 18px`, 14 px/500, hover `opacity .85`. Drugorzędny: obrys `line-2`, hover `line-3`. Trzeci poziom: sam tekst `t1` z `→`.
- **Pola**: promień 8 px, obrys `line-2`, `padding 12px 14px`, fokus: obrys `accent`.
- **Pasek postępu**: wysokość 6 px, pełne zaokrąglenie, tor `line-2`, wypełnienie `accent`.
- **Stany**: ładowanie (szkielety w kształcie kafli), pusto i błąd (kafel `s1`, ikona w białym kółku, nagłówek 30 px, krótki opis, przycisk). Błąd ma ikonę `red`, "w przygotowaniu" ma ikonę neutralną.

## Marka klienta (co-branding)

Gdy strona jest dla klienta (Kramp, Lingaro itd.), logo PSAI i klienta stoją obok siebie w nagłówku, rozdzielone pionową linią `line-2`. Kolor klienta ma tylko dwa miejsca: **jego logo** oraz ewentualnie **delikatny odcień jednej okładki** (np. folderów: gradient `#fbeceb → #f3cfcc` dla czerwieni Kramp). Przyciski i akcenty zostają czarne. Dzięki temu każda strona dla klienta wygląda jak część jednej platformy.

- Logo PSAI: `assets/psai-logo.svg` (wypełnienie `currentColor`, `viewBox="63.2 74.7 1069.3 466.6"`, wysokość 36 px).
- Logo klienta: użyj oficjalnego wektora w jego kolorach; białe wersje przekoloruj. Wysokość dobierz optycznie (wąskie znaki ok. 26 px, napisy ok. 22 px).

## Treści

- Domyślnie po polsku, zdania z wielką literą tylko na początku (sentence case), czasowniki w trybie rozkazującym na przyciskach ("Pobierz", "Odśwież", "Spróbuj ponownie").
- Poprawna polska odmiana liczebników: 1 plik, 2-4 pliki, 5+ plików (12-14 → "plików").
- Pusty ekran to wskazówka, co dalej, a nie nastrój. Błąd mówi, co się stało i co zrobić.

## Dostępność i ruch

- Widoczny fokus: `outline: 2px solid accent; outline-offset: 3px`.
- `prefers-reduced-motion`: wyłącz animacje i przejścia (`0.01ms`).
- Kontrast: `t1` i `t2` na `bg` i `s1` spełniają WCAG AA; nie jaśnieje ich dalej.
- Ikony dekoracyjne `aria-hidden`, kafle-linki mają `aria-label`.

## Czego unikać

- Więcej niż jednego koloru akcentu, kolorowych przycisków, gradientowych teł całej strony.
- Przycisków-pigułek (`999px`) i małych promieni na kaflach. Kontrolki mają 8 px, kafle 28 px, drugorzędne kontenery 24 px.
- Gęstych tabel i ramek, które "porządkują" zamiast dawać powietrze. Jeśli potrzebna jest lista, użyj kafli.
- Animacji wejścia na każdej sekcji. Jedyny ruch to hover kafla i przejścia kolorów 150 ms.
- Ozdobnych elementów (blobów, cieni pod wszystkim). Cień ma tylko unoszący się kafel.

## Jak zastosować

**A. Pojedynczy plik HTML (strony statyczne, FTP).** Zacznij od `assets/starter.html`. Zawiera nagłówek z logo, hero, kafle, stany i stopkę w pełnym stylu. Wytnij to, czego nie potrzebujesz, zamień logo i teksty. Tokeny są zdefiniowane na górze pliku.

**B. Aplikacja Next.js + Tailwind v4 (jak platforma).** Wklej blok `@theme` z `references/tokens.css` do `globals.css`; klasy `bg-s1`, `text-t1`, `border-line-2`, `rounded-[28px]` działają od razu.

**Przed oddaniem sprawdź:** (1) nagłówek ma 56 px i rozmyte tło, (2) tytuł strony jest wielki, (3) kafle mają 28 px i hover, (4) przyciski są czarne z promieniem 8 px, (5) kolor klienta jest tylko w logo, (6) mobile 375 px bez przewijania poziomego, (7) odmiana liczebników po polsku, (8) fokus widoczny.

## Źródła

Platforma: `Polska szkola AI/2.0/Platforma/src/app/globals.css`, `components/course-card.tsx`, `session-card.tsx`, `progress-bar.tsx`, `logo.tsx`, `app/[locale]/(app)/layout.tsx`. Przykład zastosowania dla klienta: strona plików Kramp (`kramp.polskaszkola.ai`).
