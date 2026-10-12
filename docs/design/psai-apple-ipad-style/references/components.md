# Komponenty stylu Apple iPad (PSAI)

Wartości pochodzą z kodu platformy. Kolory to tokeny z `tokens.css`. Działający przykład wszystkich komponentów: `../assets/starter.html`.

## Spis
1. Nagłówek
2. Hero (tytuł strony)
3. Kafel (treść / plik / folder / kurs)
4. Kafel odwrócony (główne wezwanie)
5. Kafel statystyki + pasek postępu
6. Przyciski
7. Pola formularza
8. Stany: ładowanie, pusto, błąd
9. Ścieżka (breadcrumb) i "Wstecz"
10. Stopka
11. Nagłówek co-brandingowy (PSAI + klient)

## 1. Nagłówek
- `position: sticky; top: 0; z-index: 10; border-bottom: 1px solid var(--line); background: rgb(255 255 255 / .9); backdrop-filter: blur(20px)`.
- Wnętrze: `max-width: 1240px; height: 56px; padding: 0 24px` (od 1024 px: 48 px); `display: flex; align-items: center; justify-content: space-between`.
- Logo PSAI wysokość **36 px**, kolor `--logo`. Akcje po prawej: mały drugorzędny przycisk (patrz 6).
- Na telefonie (≤ 520 px) chowaj tekst przycisków, zostaw ikonę.

## 2. Hero (tytuł strony)
```html
<section class="hero">
  <p class="eyebrow">Nazwa klienta · Sekcja</p>   <!-- mono 11px, wersaliki, .14em, t2 -->
  <h1>Pliki do pobrania</h1>                         <!-- clamp(40px, 7vw, 72px), 600, line-height 1.02 -->
</section>
```
Tytuł jest wielki i sam wystarcza. Nie dodawaj podtytułu, jeśli nic nowego nie mówi.

## 3. Kafel
- `border-radius: 28px; background: var(--s1); overflow: hidden; display: flex; flex-direction: column`.
- Hover (tylko gdy klikalny lub zawiera akcję): `transform: translateY(-4px); box-shadow: 0 18px 40px -18px rgb(0 0 0 / .35); transition: transform .3s, box-shadow .3s`.
- **Okładka**: `aspect-ratio: 16 / 9` (kursy: 4 / 3), klasa `.cover-N` (N = hash(id) % 6), w środku wielka etykieta `font-size: 64px; font-weight: 600; letter-spacing: -.03em; color: rgb(29 29 31 / .2)` (rozszerzenie pliku albo pierwsza litera). Dla folderów ikona 64 px w kolorze klienta z krycim 55% na `.cover-client`.
- **Treść**: `padding: 24px; gap: 8px`. Tytuł 20 px/600/`line-height 1.3`; opis 14 px `t1`, maks. 2 linie; meta mono 11 px (patrz SKILL.md), `margin-top: auto`.
- **Akcje**: główny przycisk + cichy link ("Otwórz w Dysku"), `gap: 8px 20px`.
- Cały kafel folderu to link `<a href="#id">` z `aria-label`.

## 4. Kafel odwrócony
`background: var(--accent); color: var(--bg); border-radius: 28px; padding: 32px` (md: 48px). Tytuł 30-36 px/600. Wewnątrz przycisk odwrócony (`background: var(--bg); color: var(--accent)`). **Jeden na stronę**, dla najważniejszego wezwania.

## 5. Kafel statystyki
`background: var(--s1); border-radius: 28px; padding: 32px` (md: 48px). Etykieta 16 px `t1`, wielka liczba `font-size: 96px; font-weight: 600; line-height: 1; letter-spacing: -.05em`, jednostka (`%`) 36 px w `t2`. Pasek postępu poniżej (patrz niżej).

**Pasek postępu**: `height: 6px; border-radius: 999px; background: var(--line-2)`, wypełnienie `background: var(--accent); transition: width .5s`. Atrybuty `role="progressbar"`, `aria-valuenow`.

## 6. Przyciski
| Rodzaj | CSS |
|---|---|
| Główny | `background: var(--accent); color: var(--bg); border-radius: 8px; padding: 10px 18px; font: 500 14px/1.4 var(--font-sans)`; hover `opacity: .85` |
| Drugorzędny | `border: 1px solid var(--line-2); background: transparent; color: var(--t0); border-radius: 8px; padding: 8px 14px`; hover `border-color: var(--line-3)` |
| Cichy link | `color: var(--t1); font-size: 14px`; hover `color: var(--t0)`; w dużych układach z `→` (`font-size: 16px; font-weight: 500`) |
Promień zawsze **8 px**. Ikona 15-16 px przed tekstem, `gap: 8px`. Przycisk nieaktywny: tło `s2`, tekst `t1`, bez hovera.

## 7. Pola formularza
```html
<label for="email">E-mail</label>   <!-- 12px, wersaliki, .07em, 500, t1 -->
<input id="email" type="email">      <!-- radius 8, border line-2, padding 12px 14px, bg var(--bg), fokus: border accent, bez outline -->
```
Odstęp między polami 20 px. Błąd pola: tekst 14 px w `red` pod polem (`role="alert"`).

## 8. Stany
- **Ładowanie**: szkielety w kształcie kafli (`background: linear-gradient(90deg, s2 25%, s1 37%, s2 63%); background-size: 400% 100%; animation: shimmer 1.4s infinite`), 3-4 sztuki. `aria-busy="true"`.
- **Pusto**: kafel `s1`, `padding: 64px 24px`, wyśrodkowany. Ikona 26 px w białym kółku 56 px, nagłówek 30 px/600, opis 16 px `t1` (maks. 440 px), przycisk główny. Treść mówi, co się stanie dalej ("Nowe pliki pojawią się tu automatycznie").
- **Błąd**: jak pusto, ikona w `red`; nagłówek mówi, co się nie udało, opis dlaczego i co zrobić, przycisk "Spróbuj ponownie".
- **W przygotowaniu**: jak błąd, ale ikona neutralna `t2` (to nie awaria).

## 9. Ścieżka i "Wstecz"
Wiersz: przycisk drugorzędny "Wstecz" (ikona strzałki) + breadcrumb 14 px. Elementy `t1`, bieżący `t0` w wadze 500, separatory `/` w `line-3`. `margin-top: 40px`. Chowaj, gdy użytkownik jest w korzeniu.

## 10. Stopka
`margin-top: 80px; padding: 24px 0 40px; border-top: 1px solid var(--line); font-size: 14px; color: var(--t2)`; po lewej nazwa ("Polska Szkoła AI × Klient", `t0`, 500), po prawej krótka notatka.

## 11. Nagłówek co-brandingowy
`[logo PSAI 36px] | [logo klienta]` w `display: flex; align-items: center; gap: 20px`; separator `1px × 26px` w `--line-2`. Logo klienta w jego własnych kolorach (to jedyne miejsce koloru klienta w nagłówku). Wysokość klienta dobierz optycznie do PSAI: znak z napisem (jak Kramp) ok. 26 px, sam napis ok. 22 px.
