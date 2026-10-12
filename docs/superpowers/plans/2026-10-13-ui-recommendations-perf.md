# Interfejs PSAI, rekomendacje per pytanie, szybkość — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikacja wygląda jak platforma PSAI (styl „Apple iPad”), otwiera ekrany szybko, a dla każdego pytania z zerową lub niską widocznością pokazuje konkretne, uzasadnione rekomendacje ze statusem.

**Architecture:** Tokeny i komponenty skilla `docs/design/psai-apple-ipad-style/` wchodzą do `globals.css` (Tailwind v4 `@theme`) i do małej biblioteki `src/components/psai/*`; ekrany są przepisywane na te komponenty, a wolne sekcje strumieniowane przez `<Suspense>`. Rekomendacje to osobny podsystem: crawler sitemapy → `site_pages`; po agregacji zadanie `recommend-project` kwalifikuje pytania, buduje wejście z odpowiedzi/cytowań/mapy strony i woła Claude ze structured output; wyniki trafiają do `recommendations` ze scalaniem po fingerprincie.

**Tech Stack:** Next.js 16.4 (App Router, `src/`, proxy), React 19, Tailwind v4 + shadcn (tylko Select/Checkbox/Input/Label/Textarea/Button), `next/font/google`, Supabase (RLS), Trigger.dev v4, `@anthropic-ai/sdk` (`messages.parse` + `zodOutputFormat`), Zod 4, Vitest 5, Recharts.

**Spec:** `docs/superpowers/specs/2026-10-13-ui-recommendations-perf-design.md` (nadrzędny) + `docs/design/psai-apple-ipad-style/SKILL.md`, `references/tokens.css`, `references/components.md` (wartości stylu są wiążące).

## Global Constraints

- **Przed pisaniem kodu Next.js przeczytaj właściwy przewodnik** w `node_modules/next/dist/docs/01-app/01-getting-started/` (fonty: `13-fonts.md`; dane/Suspense/`React.cache`: `06-fetching-data.md`; CSS: `11-css.md`; proxy: `16-proxy.md`). `AGENTS.md` w repo tego wymaga; API tej wersji różni się od starszych.
- Styl: tokeny dokładnie z `references/tokens.css` (jasny: `bg #ffffff`, `s1 #f5f5f7`, `s2 #ececf0`, `s3 #e2e2e7`, `line rgb(0 0 0/.08)`, `line-2 rgb(0 0 0/.14)`, `line-3 rgb(0 0 0/.28)`, czerń `#1d1d1f`, `t1 #515154`, `t2 #636366`, `red #c3283f`, `teal #0a7a63`); fonty Space Grotesk 400/500/600/700 + JetBrains Mono 400/500 z `subsets: ["latin", "latin-ext"]`; kafle `rounded-[28px]`, kontrolki 8 px, przyciski czarne, nagłówek 56 px; **bez** kolorowych przycisków, gradientów tła, cieni poza hoverem kafla, pigułek.
- W `@theme` czerń skilla nazywa się **`--color-ink`** (nie `accent`, bo shadcn używa `--accent` do hoveru). Klasy: `bg-ink text-bg`, `bg-s1`, `text-t1`, `border-line-2`, `font-mono`.
- Kolor tylko ze znaczeniem: `red` = błąd/odrzucone, `teal` = sukces/zrobione. Heatmapa monochromatyczna.
- Język UI: polski, sentence case, czasowniki w trybie rozkazującym na przyciskach, polskie liczebniki przez `pluralPl`.
- Każdy ekran: 1440 px i 375 px bez przewijania poziomego; fokus `outline: 2px solid var(--color-ink); outline-offset: 3px`; `prefers-reduced-motion` wyłącza animacje.
- Dane: każde zapytanie Supabase sprawdza `{ error }` i rzuca; zapisy w akcjach scoped `.eq("project_id", project.id)`; sekrety tylko w env.
- Rekomendacje: próg `projects.low_visibility_threshold` (domyślnie **0.34**); model `process.env.ANTHROPIC_RECOMMENDER_MODEL ?? "claude-opus-5-5"`, `output_config: { effort: "high", format }`, `max_tokens: 8000`; crawler `User-Agent: PSAI-VisibilityBot/1.0`, limit 200 stron, 4 równolegle, timeout 15 s, respektuje `robots.txt`; `fingerprint = sha1(type + ":" + znormalizowany tytuł)`.
- Szybkość: jedno `auth.getUser()` i jedno zapytanie o projekt na żądanie (`React.cache`), zapytania równoległe, metryki ≤ 90 dni, lista odpowiedzi 100 + „pokaż więcej”.
- Commity: message po angielsku w stylu `feat(ui): …`, zakończony linią `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; `npm test && npx tsc --noEmit && npm run lint` zielone przed każdym commitem (build przy zadaniach zmieniających strony).

## Review Focus

1. **Sitemapa wskazująca inną domenę niż `site_url`** (Netlify → `polskaszkola.ai`): crawler ma pobierać strony z hosta `site_url`, nie z domeny z `<loc>`. Test w Task 10 (`rewriteHost`).
2. **Pytanie z widocznością 0% tylko dlatego, że wszystkie odpowiedzi były `no_answer`/błędem**: nie kwalifikuje się do rekomendacji (brak danych ≠ brak widoczności). Test w Task 11 (`qualifyPrompts` ignoruje wiersze bez `responses_count`).
3. **Model zwraca rekomendację bez konkretu** (brak `target_url`/`suggested_outline` dla `content_new`, brak URL dla `offsite`): odrzucona z logiem, nie zapisana. Test w Task 12.
4. **Ta sama rekomendacja z dwóch pytań**: jedna pozycja z połączonym `evidence.prompt_ids`, status zachowany (zrobione zostaje zrobione). Test w Task 11 (`mergeEvidence`) i Task 13 (persist).
5. **Przeglądarka 375 px**: nagłówek z 5 linkami i przyciskiem nie może łamać układu ani powodować poziomego przewijania; heatmapa przewija się tylko wewnątrz kafla. Ręczny test w Task 4/6 + test jednostkowy `heatmapCellStyle` (Task 6).

---

## Struktura plików

```
src/
├── app/
│   ├── layout.tsx                      # fonty Space Grotesk + JetBrains Mono, lang=pl
│   ├── globals.css                     # tokeny skilla (@theme) + mapowanie shadcn
│   ├── login/page.tsx                  # kafel logowania w stylu
│   ├── app/
│   │   ├── layout.tsx                  # AppHeader (lepki 56 px) + kontener 1240
│   │   ├── loading.tsx                 # szkielet strony
│   │   ├── page.tsx                    # Przegląd: hero + sekcje w <Suspense>
│   │   ├── overview/sections.tsx       # StatsSection, TrendSection, EnginesSection, MentionsSection, TopRecommendation
│   │   ├── prompts/page.tsx            # hero, heatmapa (kafel), lista (Rows), formularze
│   │   ├── prompts/generate/page.tsx   # jak dziś, w stylu
│   │   ├── responses/page.tsx          # Rows + „pokaż więcej”
│   │   ├── responses/[id]/page.tsx
│   │   ├── settings/page.tsx           # + „Adres strony do analizy”, próg
│   │   ├── recommendations/page.tsx    # siatka kafli, filtry, kafel odwrócony
│   │   ├── recommendations/[id]/page.tsx
│   │   └── recommendations/actions.ts  # setRecommendationStatus, refreshRecommendations
├── components/psai/
│   ├── Logo.tsx                        # inline SVG z assets/psai-logo.svg (currentColor)
│   ├── AppHeader.tsx (+ AppNav.tsx "use client")
│   ├── PageHero.tsx, Eyebrow.tsx, Meta.tsx, SectionHead.tsx
│   ├── Tile.tsx, TileInverse.tsx, StatTile.tsx, ProgressBar.tsx
│   ├── Rows.tsx                        # <Rows> / <Row>: lista hairline w kaflu
│   ├── EmptyState.tsx, Skeleton.tsx
│   └── Dots.tsx                        # wpływ/wysiłek 1–5 w mono
├── components/Heatmap.tsx              # monochromatyczna; heatmapCellStyle()
├── components/TrendChart.tsx           # tokeny skilla
├── components/HighlightedText.tsx      # mark: own = ink/10 + underline, competitor = s3
├── lib/format/plural.ts, number.ts     # pluralPl, pct, fmtDate
├── lib/workspace.ts                    # React.cache
├── lib/metrics/queries.ts              # getLatestMetrics, getTrend, getLastRun, getMentionCounts (cache, równolegle)
├── lib/site/{sitemap,extract,robots,crawl}.ts
├── lib/recommend/{qualify,input,fingerprint,generate,rules,persist}.ts
└── trigger/{crawl-site,recommend-project}.ts (+ run-project hook)
supabase/migrations/20261013000000_recommendations.sql
tests/{format,site,recommend,components,metrics}/*.test.ts
```

---

## Faza C — szybkość (fundament pod resztę)

### Task 1: Deduplikacja sesji, zapytania równoległe, tryb produkcyjny

**Files:**
- Modify: `src/lib/workspace.ts` (owinięcie `requireUser`, `getCurrentProject` w `React.cache`)
- Modify: `src/lib/metrics/queries.ts` (rozbicie na cache'owane funkcje, równoległość, limit 90 dni)
- Modify: `src/app/app/page.tsx` (użycie nowych funkcji — minimalna zmiana, bez redesignu)
- Modify: `next.config.ts` (`turbopack.root`), `package.json` (`start:prod`), `README.md`
- Test: `tests/workspace-cache.test.ts`, `tests/metrics/queries.test.ts`

**Interfaces:**
- Produces (`src/lib/workspace.ts`): `requireUser()` i `getCurrentProject()` — te same sygnatury, ale `React.cache`: w jednym żądaniu wiele wywołań = jedno `auth.getUser()` i jedno zapytanie o projekt.
- Produces (`src/lib/metrics/queries.ts`):
```ts
export const getLatestMetrics: (projectId: string) => Promise<{ latest: MetricRow | null; byEngine: MetricRow[] }>
export const getTrend: (projectId: string, days?: number) => Promise<{ date: string; score: number; visibilityRate: number }[]>
export const getLastRun: (projectId: string) => Promise<Tables<"runs"> | null>
export const getMentionCounts: (projectId: string, runId: string) => Promise<{ name: string; mentions: number }[]>
export async function getOverview(supabase, projectId) // zachowane dla zgodności: składa powyższe przez Promise.all
```
Wszystkie cztery używają `createServerSupabase()` wewnątrz i są owinięte w `cache()`.

- [ ] **Step 1: Test deduplikacji sesji**

`tests/workspace-cache.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const maybeSingle = vi.fn();
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ order: () => ({ limit: () => ({ maybeSingle }) }) }) }),
  }),
}));
// React.cache poza renderem React nie deduplikuje — testujemy przez wstrzyknięty cache zgodny z React:
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  const store = new Map<unknown, unknown>();
  return { ...actual, cache: <T extends (...a: never[]) => unknown>(fn: T) => ((...args: Parameters<T>) => {
    const key = fn.toString() + JSON.stringify(args);
    if (!store.has(key)) store.set(key, fn(...args));
    return store.get(key) as ReturnType<T>;
  }) as T };
});

describe("getCurrentProject z React.cache", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1", email: "a@b.pl" } } });
    maybeSingle.mockReset().mockResolvedValue({ data: { id: "p1", name: "PSAI" }, error: null });
  });

  it("trzy wywołania w jednym żądaniu = jedno getUser i jedno zapytanie o projekt", async () => {
    const { getCurrentProject } = await import("@/lib/workspace");
    const [a, b, c] = await Promise.all([getCurrentProject(), getCurrentProject(), getCurrentProject()]);
    expect(a).toBe(b); expect(b).toBe(c);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL** (`getUser` wywołane 3 razy). Run: `npx vitest run tests/workspace-cache`

- [ ] **Step 3: Implementacja w `workspace.ts`**

Zastąp dwie funkcje na końcu pliku:
```ts
import { cache } from "react";
// … (pozostałe importy bez zmian)

export const requireUser = cache(async () => {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
});

export const getCurrentProject = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data: project, error } = await supabase
    .from("projects").select("*").order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(`Nie udało się pobrać projektu: ${error.message}`);
  if (!project) {
    await ensureWorkspace(user.id, user.email ?? "");
    redirect("/app");
  }
  return project;
});
```
Uwaga: `React.cache` deduplikuje tylko w obrębie jednego renderu serwerowego (to wystarcza: layout + strona + sekcje to jedno żądanie). Akcje serwerowe (`"use server"`) mają własne żądanie.

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Test zapytań metryk (limit i równoległość)**

`tests/metrics/queries.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

const calls: string[] = [];
function table(name: string, rows: unknown[]) {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "order", "limit", "gte"]) api[m] = (...a: unknown[]) => { calls.push(`${name}.${m}(${a.map(String).join(",")})`); return api; };
  api.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  api.then = (res: (v: unknown) => void) => res({ data: rows, error: null });
  return api;
}
const rows = { daily_metrics: [{ date: "2026-10-12", engine_id: null, prompt_id: null, responses_count: 10, visibility_rate: "0.2", avg_position: null, citation_rate: "0.1", share_of_voice: "0.5", score: 30 }], runs: [], mentions: [] };
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (n: keyof typeof rows) => table(n, rows[n]) }) }));

describe("queries", () => {
  it("getTrend ogranicza zakres dat (gte) i sortuje po dacie", async () => {
    const { getTrend } = await import("@/lib/metrics/queries");
    const t = await getTrend("p1", 90);
    expect(t).toEqual([{ date: "2026-10-12", score: 30, visibilityRate: 0.2 }]);
    expect(calls.some((c) => c.startsWith("daily_metrics.gte(date,"))).toBe(true);
  });
  it("getLatestMetrics zwraca overall i byEngine", async () => {
    const { getLatestMetrics } = await import("@/lib/metrics/queries");
    const m = await getLatestMetrics("p1");
    expect(m.latest?.score).toBe(30);
    expect(m.byEngine).toEqual([]);
  });
});
```

- [ ] **Step 6: Uruchom — FAIL** (brak eksportów)

- [ ] **Step 7: Implementacja `queries.ts`**

```ts
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db-types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MetricRow } from "./aggregate";
import { shapeOverview } from "./overview";

function daysAgoIso(days: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const getOverallRows = cache(async (projectId: string, days: number) => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("daily_metrics").select("*").eq("project_id", projectId).is("prompt_id", null)
    .gte("date", daysAgoIso(days)).order("date");
  if (error) throw new Error(`Nie udało się pobrać metryk: ${error.message}`);
  return data ?? [];
});

export const getLatestMetrics = cache(async (projectId: string) => {
  const rows = await getOverallRows(projectId, 90);
  const { latest, byEngine } = shapeOverview(rows, []);
  return { latest, byEngine };
});

export const getTrend = cache(async (projectId: string, days = 90) => {
  const rows = await getOverallRows(projectId, days);
  return shapeOverview(rows, []).trend;
});

export const getLastRun = cache(async (projectId: string): Promise<Tables<"runs"> | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Nie udało się pobrać ostatniego runu: ${error.message}`);
  return data ?? null;
});

export const getMentionCounts = cache(async (projectId: string, runId: string) => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mentions").select("brand_name, response_id, responses!inner(run_id)")
    .eq("project_id", projectId).eq("responses.run_id", runId).limit(5000);
  if (error) throw new Error(`Nie udało się pobrać wzmianek: ${error.message}`);
  return shapeOverview([], data ?? []).competitors;
});

// Zachowane dla zgodności z istniejącą stroną; nowe ekrany używają funkcji powyżej bezpośrednio.
export async function getOverview(_supabase: SupabaseClient<Database>, projectId: string) {
  const [{ latest, byEngine }, trend, lastRun] = await Promise.all([
    getLatestMetrics(projectId), getTrend(projectId), getLastRun(projectId),
  ]);
  const competitors = lastRun ? await getMentionCounts(projectId, lastRun.id) : [];
  return { latest, byEngine, trend, competitors, lastRun };
}
```
Sprawdź w `src/lib/metrics/overview.ts`, że `shapeOverview(rows, mentions)` zwraca `{ latest, byEngine, trend, competitors }` i przyjmuje puste tablice (tak jest od Task 15 fazy 1).

- [ ] **Step 8: Uruchom — PASS**; `src/app/app/page.tsx` bez zmian w logice (nadal woła `getOverview`).

- [ ] **Step 9: Tryb produkcyjny i wyciszenie ostrzeżenia**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};
export default nextConfig;
```
`package.json` → scripts: `"start:prod": "next build && next start -p 3000"`.
README, sekcja „Start lokalny”: dopisz akapit: „Do codziennej pracy uruchamiaj `npm run start:prod` (zbudowana wersja, ekrany otwierają się od razu). `npm run dev` tylko przy zmianach w kodzie — pierwsze wejście na każdy ekran kompiluje go i trwa kilka sekund.”

- [ ] **Step 10: Pomiar bazowy** (zapisz wynik w raporcie): przy działającym `npm run dev` zalogowanym w przeglądarce skopiuj ciasteczka sesji z DevTools do pliku poza repo i zmierz `curl -s -o /dev/null -w "%{time_starttransfer}\n" -b "<cookie>" http://localhost:3000/app` trzy razy (drugi i trzeci wynik to „ciepłe” wejścia). Jeśli ciasteczka nie są pod ręką, zmierz `/login` (bez sesji) — to i tak pokazuje różnicę dev/prod.

- [ ] **Step 11: `npm test && npx tsc --noEmit && npm run lint && npm run build`**, potem commit:
```bash
git add src/lib/workspace.ts src/lib/metrics/queries.ts next.config.ts package.json README.md tests/workspace-cache.test.ts tests/metrics/queries.test.ts
git commit -m "perf: dedupe session/project per request, parallel cached metric queries, prod start script"
```

---

## Faza A — interfejs PSAI

### Task 2: Tokeny, fonty, globals.css

**Files:**
- Modify: `src/app/globals.css` (pełna wymiana sekcji `@theme inline`, `:root`, `.dark`, `@layer base`)
- Modify: `src/app/layout.tsx` (fonty)
- Create: `src/lib/format/plural.ts`, `src/lib/format/number.ts`
- Test: `tests/format/plural.test.ts`

**Interfaces:**
- Produces: klasy Tailwind `bg-bg bg-s1 bg-s2 bg-s3 bg-ink text-t0 text-t1 text-t2 text-bg text-red text-teal border-line border-line-2 border-line-3 font-sans font-mono max-w-page h-nav rounded-tile rounded-box`; zmienne CSS `--font-space-grotesk`, `--font-jetbrains-mono`.
- Produces: `pluralPl(n: number, forms: [one: string, few: string, many: string]): string` (np. `pluralPl(5, ["pytanie","pytania","pytań"])` → `"5 pytań"`), `pct(v: number): string` (`"22%"`), `fmtDate(iso: string): string` (`"12.10.2026, 23:30"` w `Europe/Warsaw`).

- [ ] **Step 1: Test liczebników i formatów**

`tests/format/plural.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pluralPl } from "@/lib/format/plural";
import { pct, fmtDate } from "@/lib/format/number";

describe("pluralPl", () => {
  const f: [string, string, string] = ["pytanie", "pytania", "pytań"];
  it.each([[1, "1 pytanie"], [2, "2 pytania"], [4, "4 pytania"], [5, "5 pytań"], [12, "12 pytań"], [14, "14 pytań"], [22, "22 pytania"], [25, "25 pytań"], [0, "0 pytań"], [112, "112 pytań"]])(
    "%i", (n, out) => expect(pluralPl(n, f)).toBe(out),
  );
});
describe("formaty", () => {
  it("pct zaokrągla do całości", () => { expect(pct(0.2249)).toBe("22%"); expect(pct(1)).toBe("100%"); });
  it("fmtDate w strefie Europe/Warsaw", () => { expect(fmtDate("2026-10-12T21:30:59Z")).toBe("12.10.2026, 23:30"); });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja**

`src/lib/format/plural.ts`:
```ts
// 1 pytanie, 2–4 pytania, 5+ pytań; 12–14 i 112–114 → "pytań"
export function pluralPl(n: number, [one, few, many]: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10, mod100 = abs % 100;
  const form = abs === 1 ? one : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many;
  return `${n} ${form}`;
}
```
`src/lib/format/number.ts`:
```ts
export const pct = (v: number) => `${Math.round(v * 100)}%`;

const dateFmt = new Intl.DateTimeFormat("pl-PL", {
  timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso)).replace(" ", "");
```
Sprawdź wynik `dateFmt.format` w Node (`node -e 'console.log(new Intl.DateTimeFormat("pl-PL",{timeZone:"Europe/Warsaw",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date("2026-10-12T21:30:59Z")))'`) — jeśli daje `12.10.2026, 23:30`, usuń `.replace`; jeśli `12.10.2026 23:30`, zamień replace tak, by wyjść na `12.10.2026, 23:30`. Zostaw `pct` także w `src/components/StatCard.tsx` do czasu usunięcia tego pliku w Task 5 (re-eksport: `export { pct } from "@/lib/format/number";`).

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Fonty w root layout**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "AI Visibility Monitor",
  description: "Monitoring widoczności marki w asystentach AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-t0">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: `globals.css`** — zastąp całą zawartość:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* Tokeny stylu PSAI (docs/design/psai-apple-ipad-style/references/tokens.css) */
@theme {
  --color-bg: #ffffff;
  --color-s1: #f5f5f7;
  --color-s2: #ececf0;
  --color-s3: #e2e2e7;
  --color-line: rgb(0 0 0 / 0.08);
  --color-line-2: rgb(0 0 0 / 0.14);
  --color-line-3: rgb(0 0 0 / 0.28);
  --color-ink: #1d1d1f;
  --color-t0: #1d1d1f;
  --color-t1: #515154;
  --color-t2: #636366;
  --color-red: #c3283f;
  --color-teal: #0a7a63;
  --font-sans: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, Menlo, monospace;
  --spacing-nav: 56px;
  --container-page: 1240px;
  --radius-tile: 28px;
  --radius-box: 24px;
}

/* Mapowanie zmiennych shadcn na tokeny (Select/Checkbox/Input/Button korzystają z tych nazw) */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-4xl: 28px;
}

:root {
  --background: #ffffff;
  --foreground: #1d1d1f;
  --card: #f5f5f7;
  --card-foreground: #1d1d1f;
  --popover: #ffffff;
  --popover-foreground: #1d1d1f;
  --primary: #1d1d1f;
  --primary-foreground: #ffffff;
  --secondary: #ececf0;
  --secondary-foreground: #1d1d1f;
  --muted: #f5f5f7;
  --muted-foreground: #636366;
  --accent: #f5f5f7;
  --accent-foreground: #1d1d1f;
  --destructive: #c3283f;
  --border: rgb(0 0 0 / 0.14);
  --input: rgb(0 0 0 / 0.14);
  --ring: #1d1d1f;
  --radius: 8px;
  color-scheme: light;
}

:root[data-theme="dark"] {
  --color-bg: #000000; --color-s1: #1c1c1e; --color-s2: #2c2c2e; --color-s3: #3a3a3c;
  --color-line: rgb(255 255 255 / 0.12); --color-line-2: rgb(255 255 255 / 0.2); --color-line-3: rgb(255 255 255 / 0.36);
  --color-ink: #f5f5f7; --color-t0: #f5f5f7; --color-t1: #b0b0b5; --color-t2: #a1a1a6;
  --color-red: #ff7a8a; --color-teal: #3ccbaa;
  --background: #000000; --foreground: #f5f5f7; --card: #1c1c1e; --card-foreground: #f5f5f7;
  --popover: #1c1c1e; --popover-foreground: #f5f5f7; --primary: #f5f5f7; --primary-foreground: #000000;
  --secondary: #2c2c2e; --secondary-foreground: #f5f5f7; --muted: #1c1c1e; --muted-foreground: #a1a1a6;
  --accent: #1c1c1e; --accent-foreground: #f5f5f7; --destructive: #ff7a8a;
  --border: rgb(255 255 255 / 0.2); --input: rgb(255 255 255 / 0.2); --ring: #f5f5f7;
  color-scheme: dark;
}

@layer base {
  * { @apply border-border; }
  html { @apply bg-bg; -webkit-text-size-adjust: 100%; }
  body { @apply bg-bg text-t0 font-sans; font-size: 16px; line-height: 1.5; letter-spacing: -0.005em; }
  h1, h2, h3 { letter-spacing: -0.025em; }
  :focus-visible { outline: 2px solid var(--color-ink); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}

@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
```
Uwaga: `@theme` (bez `inline`) tworzy klasy `bg-ink`, `text-t1`, `rounded-tile` itd.; shadcn nadal działa przez `@theme inline`. Jeśli Tailwind zgłosi konflikt nazw `--color-accent` (shadcn) z czymś ze skilla — nie ma go, bo czerń nazwaliśmy `ink`.

- [ ] **Step 7: Build i wizualna kontrola**: `npm run build` musi przejść; `npm run dev` → `/login` renderuje się w Space Grotesk (sprawdź w DevTools computed `font-family`). Zrób zrzut 1440 px do raportu.

- [ ] **Step 8: Testy, tsc, lint, commit**
```bash
git add src/app/globals.css src/app/layout.tsx src/lib/format tests/format
git commit -m "feat(ui): PSAI design tokens, Space Grotesk + JetBrains Mono, Polish plural helper"
```

---
### Task 3: Biblioteka komponentów PSAI

**Files:**
- Create: `src/components/psai/Logo.tsx`, `Eyebrow.tsx`, `Meta.tsx`, `PageHero.tsx`, `SectionHead.tsx`, `Tile.tsx`, `TileInverse.tsx`, `StatTile.tsx`, `ProgressBar.tsx`, `Rows.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `Dots.tsx`, `index.ts`
- Test: `tests/components/psai.test.tsx` (render do stringa przez `react-dom/server`)

**Interfaces (Produces):**
```tsx
<Logo className?: string />                       // inline SVG, height 36px, fill currentColor, aria-label "Polska Szkoła AI"
<Eyebrow>POLSKA SZKOŁA AI · PRZEGLĄD</Eyebrow>     // <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-t2">
<Meta>{children}</Meta>                           // mono 11px uppercase tracking-[0.08em] text-t2; elementy rozdzielaj " · "
<PageHero eyebrow={string} title={string} actions?={ReactNode} />  // h1 clamp(40px,7vw,72px)
<SectionHead title={string} meta?={ReactNode} actions?={ReactNode} />  // h2 30px + prawa strona
<Tile as?="div"|"a"|"li" href? className? hover?: boolean>…</Tile>      // rounded-[28px] bg-s1 p-6 md:p-8; hover → -translate-y-1 + cień
<TileInverse eyebrow? title action?={ReactNode}>…</TileInverse>       // bg-ink text-bg, przycisk odwrócony
<StatTile label value unit? detail? progress?: number (0–1) />        // liczba 96px (72px ≤520px), pasek 6px
<ProgressBar value={0..1} label? />                                   // role=progressbar
<Rows>{children}</Rows> / <Row href? className?>…</Row>               // ul w kaflu s1; li: border-t border-line, py-4, min-h-13
<EmptyState title description action?={ReactNode} tone?: "neutral"|"error" />
<Skeleton className?  /> / <TileSkeleton lines?={number} />           // shimmer s2→s1
<Dots value={1..5} label={string} />                                  // ●●●○○ w mono z aria-label "wpływ 3 z 5"
```
Przyciski: używamy shadcn `Button` (po Task 2 ma czarne tło, 8 px). Dodaj w `src/components/ui/button.tsx` wariant `quiet` (`"text-t1 hover:text-t0 px-0 h-auto"`) i `danger-quiet` (`"text-t1 hover:text-red px-0 h-auto"`); nie zmieniaj pozostałych.

- [ ] **Step 1: Test renderowania (markup i klasy kluczowe)**

`tests/components/psai.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatTile, Rows, Row, Dots, EmptyState, PageHero } from "@/components/psai";

describe("komponenty PSAI", () => {
  it("StatTile pokazuje liczbę, jednostkę i pasek postępu", () => {
    const html = renderToStaticMarkup(<StatTile label="Visibility" value="22" unit="%" progress={0.22} />);
    expect(html).toContain("rounded-[28px]");
    expect(html).toContain("bg-s1");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="22"');
    expect(html).toContain(">22<");
  });
  it("Rows renderuje listę z hairline", () => {
    const html = renderToStaticMarkup(<Rows><Row>a</Row><Row href="/x">b</Row></Rows>);
    expect(html).toContain("<ul");
    expect(html).toContain('href="/x"');
    expect(html).toContain("border-line");
  });
  it("Dots ma etykietę dostępności", () => {
    expect(renderToStaticMarkup(<Dots value={3} label="wpływ" />)).toContain('aria-label="wpływ 3 z 5"');
  });
  it("EmptyState z tonem error ma kolor red", () => {
    expect(renderToStaticMarkup(<EmptyState title="Błąd" description="x" tone="error" />)).toContain("text-red");
  });
  it("PageHero ma eyebrow w mono i h1", () => {
    const html = renderToStaticMarkup(<PageHero eyebrow="PSAI · TEST" title="Tytuł" />);
    expect(html).toContain("font-mono");
    expect(html).toContain("<h1");
  });
});
```
Vitest: pliki `.tsx` w `tests/` muszą być objęte `include` (`tests/**/*.test.{ts,tsx}`) i mieć JSX automatyczny: w `vitest.config.mts` dodaj `esbuild: { jsx: "automatic" }` i rozszerz `include`.

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja komponentów** (wartości z `components.md`; klasy Tailwind z tokenów Task 2)

`src/components/psai/Logo.tsx`: skopiuj element `<svg … viewBox="63.2 74.7 1069.3 466.6">` z `docs/design/psai-apple-ipad-style/assets/psai-logo.svg` (oba `<path>`), ustaw `fill="currentColor"`, `role="img"`, `aria-label="Polska Szkoła AI"`, `className={cn("h-9 w-auto", className)}`.

`Eyebrow.tsx`:
```tsx
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`font-mono text-[11px] uppercase tracking-[0.14em] text-t2 ${className}`}>{children}</p>;
}
```
`Meta.tsx`: jak Eyebrow, ale `tracking-[0.08em]`, element `<span>`.

`PageHero.tsx`:
```tsx
import { Eyebrow } from "./Eyebrow";
export function PageHero({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: React.ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-6 pt-6">
      <div>
        <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
        <h1 className="text-[clamp(40px,7vw,72px)] font-semibold leading-[1.02]">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </section>
  );
}
```
`SectionHead.tsx`:
```tsx
export function SectionHead({ title, meta, actions }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-4"><h2 className="text-[30px] font-semibold leading-[1.15]">{title}</h2>{meta}</div>
      {actions}
    </div>
  );
}
```
`Tile.tsx`:
```tsx
import Link from "next/link";
import { cn } from "cn";
type Props = { children: React.ReactNode; className?: string; href?: string; hover?: boolean; as?: "div" | "li"; "aria-label"?: string };
const base = "flex h-full flex-col overflow-hidden rounded-[28px] bg-s1 p-6 md:p-8";
const hoverCls = "transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)]";
export function Tile({ children, className, href, hover, as = "div", ...rest }: Props) {
  const cls = cn(base, (hover || href) && hoverCls, className);
  if (href) return <Link href={href} className={cls} aria-label={rest["aria-label"]}>{children}</Link>;
  const Tag = as;
  return <Tag className={cls}>{children}</Tag>;
}
```
`TileInverse.tsx`:
```tsx
import { Meta } from "./Meta";
export function TileInverse({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-8 rounded-[28px] bg-ink p-8 text-bg md:p-12">
      <div className="max-w-2xl">
        {eyebrow && <Meta className="text-bg/70">{eyebrow}</Meta>}
        <h3 className="mt-2 text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.15]">{title}</h3>
        {children && <div className="mt-3 text-bg/80">{children}</div>}
      </div>
      {action}
    </div>
  );
}
```
(`Meta` musi przyjmować `className`.) Przycisk odwrócony w akcji: `<Button className="bg-bg text-ink hover:opacity-90">…</Button>`.

`ProgressBar.tsx`:
```tsx
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pctValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-valuenow={pctValue} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="mt-8 h-1.5 overflow-hidden rounded-full bg-line-2">
      <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pctValue}%` }} />
    </div>
  );
}
```
`StatTile.tsx`:
```tsx
import { ProgressBar } from "./ProgressBar";
export function StatTile({ label, value, unit, detail, progress }: { label: string; value: string; unit?: string; detail?: React.ReactNode; progress?: number }) {
  return (
    <div className="rounded-[28px] bg-s1 p-8 md:p-12">
      <h2 className="text-base font-medium text-t1">{label}</h2>
      <p className="mt-3 text-[72px] font-semibold leading-none tracking-[-0.05em] md:text-[96px]">
        {value}{unit && <span className="ml-1 text-[36px] tracking-[-0.02em] text-t2">{unit}</span>}
      </p>
      {detail && <p className="mt-3 max-w-xs text-t1">{detail}</p>}
      {progress !== undefined && <ProgressBar value={progress} label={label} />}
    </div>
  );
}
```
`Rows.tsx`:
```tsx
import Link from "next/link";
import { cn } from "cn";
export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("rounded-[28px] bg-s1 px-6 py-2 md:px-8", className)}>{children}</ul>;
}
export function Row({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const inner = cn("flex min-h-13 flex-wrap items-center gap-x-6 gap-y-1 py-4", className);
  return (
    <li className="border-t border-line first:border-t-0">
      {href ? <Link href={href} className={cn(inner, "-mx-2 rounded-lg px-2 transition hover:bg-bg/60")}>{children}</Link> : <div className={inner}>{children}</div>}
    </li>
  );
}
```
`EmptyState.tsx`:
```tsx
export function EmptyState({ title, description, action, tone = "neutral" }: { title: string; description: string; action?: React.ReactNode; tone?: "neutral" | "error" }) {
  return (
    <div className="rounded-[28px] bg-s1 px-6 py-16 text-center">
      <div className={`mx-auto mb-5 grid size-14 place-items-center rounded-full bg-bg ${tone === "error" ? "text-red" : "text-t2"}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
      </div>
      <h2 className="mb-3 text-[30px] font-semibold leading-[1.15]">{title}</h2>
      <p className="mx-auto mb-7 max-w-md text-t1">{description}</p>
      {action}
    </div>
  );
}
```
`Skeleton.tsx`:
```tsx
const shimmer = "animate-[shimmer_1.4s_infinite] bg-[linear-gradient(90deg,var(--color-s2)_25%,var(--color-s1)_37%,var(--color-s2)_63%)] bg-[length:400%_100%]";
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg ${shimmer} ${className}`} />;
}
export function TileSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" className="rounded-[28px] bg-s1 p-8 md:p-12">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className={`mt-4 h-4 ${i % 2 ? "w-2/3" : "w-5/6"}`} />)}
    </div>
  );
}
```
`Dots.tsx`:
```tsx
export function Dots({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return <span className="font-mono text-[11px] tracking-[0.2em] text-t2" aria-label={`${label} ${v} z 5`}>{"●".repeat(v)}{"○".repeat(5 - v)}</span>;
}
```
`index.ts` re-eksportuje wszystko.

- [ ] **Step 4: Uruchom — PASS**; `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: Commit**
```bash
git add src/components/psai src/components/ui/button.tsx vitest.config.mts tests/components/psai.test.tsx
git commit -m "feat(ui): PSAI component library (tiles, rows, hero, stat, empty, skeleton)"
```

---

### Task 4: Powłoka aplikacji (nagłówek górny), `loading.tsx`, logowanie

**Files:**
- Create: `src/components/psai/AppHeader.tsx`, `src/components/psai/AppNav.tsx` (`"use client"`), `src/app/app/loading.tsx`
- Modify: `src/app/app/layout.tsx`, `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `Logo`, `TileSkeleton`, `Button`, `getCurrentProject`.
- Produces: `AppHeader({ projectName })` (server) z `AppNav` (client, `usePathname` → aktywny link). Nawigacja: `[["/app","Przegląd"],["/app/prompts","Prompty"],["/app/recommendations","Rekomendacje"],["/app/responses","Odpowiedzi"],["/app/settings","Ustawienia"]]`. Link `/app/recommendations` prowadzi do strony z Task 14; do tego czasu pokazuje 404 — to akceptowalne w gałęzi, ale **w Task 4 utwórz tymczasowy `src/app/app/recommendations/page.tsx`** z `EmptyState` „Rekomendacje pojawią się po pierwszym pomiarze z analizą” (Task 14 go zastąpi).

- [ ] **Step 1: `AppNav.tsx`**
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export const NAV = [
  ["/app", "Przegląd"], ["/app/prompts", "Prompty"], ["/app/recommendations", "Rekomendacje"],
  ["/app/responses", "Odpowiedzi"], ["/app/settings", "Ustawienia"],
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Główna" className="-mx-2 flex items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
      {NAV.map(([href, label]) => {
        const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition", active ? "font-medium text-t0" : "text-t1 hover:text-t0")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```
- [ ] **Step 2: `AppHeader.tsx`** (server)
```tsx
import Link from "next/link";
import { Logo } from "./Logo";
import { AppNav } from "./AppNav";
import { Button } from "@/components/ui/button";

export function AppHeader({ projectName }: { projectName: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur-[20px]">
      <div className="mx-auto flex h-nav max-w-page items-center justify-between gap-4 px-6 lg:px-12">
        <div className="flex items-center gap-5">
          <Link href="/app" aria-label="Przegląd" className="text-ink"><Logo /></Link>
          <span aria-hidden="true" className="h-[26px] w-px bg-line-2" />
          <span className="hidden text-sm font-medium text-t1 md:inline">{projectName}</span>
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <AppNav />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">Wyloguj</Button>
          </form>
        </div>
      </div>
    </header>
  );
}
```
- [ ] **Step 3: `src/app/app/layout.tsx`**
```tsx
import { AppHeader } from "@/components/psai/AppHeader";
import { getCurrentProject } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const project = await getCurrentProject();
  return (
    <>
      <AppHeader projectName={project.name} />
      <main className="mx-auto w-full max-w-page px-6 pb-20 pt-12 lg:px-12">{children}</main>
    </>
  );
}
```
`src/app/app/loading.tsx`:
```tsx
import { Skeleton, TileSkeleton } from "@/components/psai";
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-10">
      <div className="pt-6"><Skeleton className="h-3 w-40" /><Skeleton className="mt-4 h-16 w-2/3 max-w-xl" /></div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>
    </div>
  );
}
```
Tymczasowa strona rekomendacji: `src/app/app/recommendations/page.tsx` z `PageHero eyebrow="Polska Szkoła AI · Rekomendacje" title="Rekomendacje"` i `EmptyState title="Jeszcze nic do pokazania" description="Rekomendacje pojawią się po pierwszym pomiarze z analizą."`.

- [ ] **Step 4: Logowanie** — `src/app/login/page.tsx`:
```tsx
import { Logo } from "@/components/psai/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-page flex-col px-6 lg:px-12">
      <div className="flex h-nav items-center text-ink"><Logo /></div>
      <section className="mx-auto mt-16 w-full max-w-md rounded-[28px] bg-s1 p-8 md:p-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-t2">Polska Szkoła AI</p>
        <h1 className="mt-3 text-[30px] font-semibold leading-[1.15]">Monitor widoczności w AI</h1>
        {error && <p role="alert" className="mt-4 text-sm text-red">{error}</p>}
        <form action={signIn} className="mt-8 grid gap-5">
          <div><Label htmlFor="email" className="text-xs font-medium uppercase tracking-[0.07em] text-t1">E-mail</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" className="mt-2 bg-bg" /></div>
          <div><Label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.07em] text-t1">Hasło</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" className="mt-2 bg-bg" /></div>
          <Button type="submit" className="w-full py-3">Zaloguj</Button>
        </form>
      </section>
    </main>
  );
}
```
- [ ] **Step 5: Kontrola** — `npm run build`; `npm run dev`: `/login` i `/app` w 1440 i 375 px (DevTools): nagłówek 56 px, logo 36 px, nawigacja przewija się poziomo na 375 px bez przewijania strony; zrzuty do raportu. `npx tsc --noEmit && npm run lint && npm test`.

- [ ] **Step 6: Commit**
```bash
git add src/components/psai src/app/app/layout.tsx src/app/app/loading.tsx src/app/app/recommendations/page.tsx src/app/login/page.tsx
git commit -m "feat(ui): sticky PSAI header with nav, app shell, loading skeleton, login tile"
```

---

### Task 5: Przegląd — kafle statystyk, sekcje w Suspense

**Files:**
- Create: `src/app/app/overview/sections.tsx`
- Modify: `src/app/app/page.tsx` (całość), `src/components/RunStatus.tsx`, `src/components/TrendChart.tsx`
- Delete: `src/components/StatCard.tsx` (po zmianie importów `pct` na `@/lib/format/number`)

**Interfaces:**
- Consumes: `getLatestMetrics`, `getTrend`, `getLastRun`, `getMentionCounts` (Task 1), komponenty PSAI, `isRunStale`, `runNow`.
- Produces: sekcje `StatsSection({ projectId })`, `TrendSection({ projectId })`, `EnginesSection({ projectId })`, `MentionsSection({ projectId, brandName })`, `TopRecommendationSlot({ projectId })` (w tym tasku zwraca `null`; Task 14 wypełni).

- [ ] **Step 1: `sections.tsx`** (server components, każda sama pobiera dane):
```tsx
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { getLatestMetrics, getTrend, getLastRun, getMentionCounts } from "@/lib/metrics/queries";
import { pct } from "@/lib/format/number";
import { pluralPl } from "@/lib/format/plural";
import { StatTile, Tile, Rows, Row, Meta, SectionHead, EmptyState } from "@/components/psai";
import { TrendChart } from "@/components/TrendChart";

export async function StatsSection({ projectId }: { projectId: string }) {
  const { latest } = await getLatestMetrics(projectId);
  const v = (n: number | null | undefined, unit = "") => (n == null ? "—" : `${Math.round(n * 100)}`) + (n == null ? "" : unit);
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <StatTile label="AI Visibility Score" value={latest ? String(latest.score) : "—"} detail="0–100, łączy widoczność, cytowania i udział" progress={latest ? latest.score / 100 : undefined} />
      <StatTile label="Visibility rate" value={latest ? String(Math.round(latest.visibilityRate * 100)) : "—"} unit={latest ? "%" : undefined}
        detail={latest?.avgPosition ? `średnia pozycja ${latest.avgPosition.toFixed(1)}` : "odpowiedzi z wzmianką o marce"} progress={latest?.visibilityRate} />
      <StatTile label="Citation rate" value={latest ? String(Math.round(latest.citationRate * 100)) : "—"} unit={latest ? "%" : undefined} detail="odpowiedzi z linkiem do Waszej domeny" progress={latest?.citationRate} />
      <StatTile label="Share of voice" value={latest ? String(Math.round(latest.shareOfVoice * 100)) : "—"} unit={latest ? "%" : undefined} detail="udział wśród wszystkich wymienionych marek" progress={latest?.shareOfVoice} />
    </div>
  );
}

export async function TrendSection({ projectId }: { projectId: string }) {
  const trend = await getTrend(projectId);
  return (
    <Tile>
      <SectionHead title="Trend score" meta={<Meta>{pluralPl(trend.length, ["pomiar", "pomiary", "pomiarów"])}</Meta>} />
      <TrendChart data={trend} />
    </Tile>
  );
}

export async function EnginesSection({ projectId }: { projectId: string }) {
  const { byEngine } = await getLatestMetrics(projectId);
  const ids = Object.keys(ENGINE_LABELS) as EngineId[];
  return (
    <section>
      <SectionHead title="Silniki" />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {ids.map((id) => {
          const row = byEngine.find((e) => e.engineId === id) ?? null;
          return (
            <Tile key={id} className={row ? "" : "bg-s2"}>
              <h3 className="text-xl font-semibold">{ENGINE_LABELS[id]}</h3>
              <p className="mt-4 text-[48px] font-semibold leading-none tracking-[-0.03em]">{row ? pct(row.visibilityRate) : "—"}</p>
              <Meta className="mt-auto pt-6">{row ? `cytowania ${pct(row.citationRate)} · score ${row.score} · pozycja ${row.avgPosition?.toFixed(1) ?? "—"}` : "brak danych w tym pomiarze"}</Meta>
            </Tile>
          );
        })}
      </div>
    </section>
  );
}

export async function MentionsSection({ projectId, brandName }: { projectId: string; brandName: string }) {
  const run = await getLastRun(projectId);
  const counts = run ? await getMentionCounts(projectId, run.id) : [];
  const own = counts.find((c) => c.name === brandName);
  return (
    <section>
      <SectionHead title="Wzmianki w ostatnim pomiarze" meta={own ? <Meta>{pluralPl(own.mentions, ["wzmianka o was", "wzmianki o was", "wzmianek o was"])}</Meta> : undefined} />
      {counts.length === 0
        ? <EmptyState title="Brak wzmianek" description="Po pierwszym pomiarze zobaczysz tu, które marki wymieniają asystenci AI." />
        : <Rows>{counts.map((c) => (
            <Row key={c.name} className={c.name === brandName ? "font-semibold" : ""}>
              <span className="flex-1">{c.name}</span><span className="font-mono text-sm tabular-nums">{c.mentions}</span>
            </Row>))}</Rows>}
    </section>
  );
}

// Task 14 wypełnia tę sekcję kaflem odwróconym z najważniejszą rekomendacją.
export async function TopRecommendationSlot(_: { projectId: string }) { return null; }
```
(`Meta` przyjmuje `className` — upewnij się w Task 3.)

- [ ] **Step 2: `page.tsx`**
```tsx
import { Suspense } from "react";
import { getCurrentProject } from "@/lib/workspace";
import { getLastRun } from "@/lib/metrics/queries";
import { isRunStale } from "@/lib/runs/stale";
import { PageHero, TileSkeleton, TileInverse } from "@/components/psai";
import { Button } from "@/components/ui/button";
import { RunStatus } from "@/components/RunStatus";
import { runNow } from "./actions";
import { StatsSection, TrendSection, EnginesSection, MentionsSection, TopRecommendationSlot } from "./overview/sections";

export default async function OverviewPage() {
  const project = await getCurrentProject();
  const lastRun = await getLastRun(project.id);
  const running = lastRun?.status === "running" && !isRunStale(lastRun);
  return (
    <div className="space-y-20">
      <div>
        <PageHero eyebrow="Polska Szkoła AI · Przegląd" title="Widoczność w AI"
          actions={<form action={runNow}><Button type="submit" disabled={running}>{running ? "Pomiar w toku…" : "Uruchom pomiar"}</Button></form>} />
        <div className="mt-6"><RunStatus run={lastRun} /></div>
      </div>
      {!lastRun && (
        <TileInverse eyebrow="Pierwszy krok" title="Uruchom pierwszy pomiar, żeby zobaczyć, czy asystenci AI polecają Polską Szkołę AI."
          action={<form action={runNow}><Button type="submit" className="bg-bg text-ink hover:opacity-90">Uruchom pomiar</Button></form>} />
      )}
      <Suspense fallback={<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>}>
        <StatsSection projectId={project.id} />
      </Suspense>
      <Suspense fallback={null}><TopRecommendationSlot projectId={project.id} /></Suspense>
      <Suspense fallback={<TileSkeleton lines={6} />}><TrendSection projectId={project.id} /></Suspense>
      <Suspense fallback={<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4"><TileSkeleton /><TileSkeleton /><TileSkeleton /><TileSkeleton /></div>}>
        <EnginesSection projectId={project.id} />
      </Suspense>
      <Suspense fallback={<TileSkeleton lines={5} />}><MentionsSection projectId={project.id} brandName={project.brand_name} /></Suspense>
    </div>
  );
}
```
- [ ] **Step 3: `RunStatus.tsx`** w stylu: `Meta` z elementami rozdzielonymi ` · `, status w `text-t0` (zrobione) / `text-red` (nieudany), data przez `fmtDate`, koszt `0.65 USD`, błąd w `text-red` pod spodem. Treść i etykiety statusów bez zmian.
- [ ] **Step 4: `TrendChart.tsx`**: kolory na tokeny skilla — linia `var(--color-ink)`, siatka `var(--color-line)`, osie `var(--color-t2)` z `font-mono` 11 px (ustaw `tick={{ fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--color-t2)" }}`), tooltip `bg-bg` z ramką `border-line-2` bez cienia; pusty stan: „Trend pojawi się po drugim pomiarze.” w `text-t1`. Usuń `SERIES_VARS`.
- [ ] **Step 5: Usuń `StatCard.tsx`**, popraw importy `pct` (grep `from "@/components/StatCard"`).
- [ ] **Step 6: Kontrola**: `npm run build`, `npm run dev` → `/app`: hero, 4 kafle z liczbami 96 px, trend, 4 kafle silników, wzmianki; przy pustym projekcie (można sprawdzić tworząc drugiego użytkownika bez członkostwa) kafel odwrócony „Uruchom pierwszy pomiar” i stany puste. Zrzuty 1440/375 do raportu. Testy, tsc, lint.
- [ ] **Step 7: Commit**
```bash
git add src/app/app/page.tsx src/app/app/overview src/components/RunStatus.tsx src/components/TrendChart.tsx
git rm src/components/StatCard.tsx
git commit -m "feat(ui): overview with stat tiles, engine tiles and streamed sections"
```

---
### Task 6: Prompty — heatmapa monochromatyczna, lista jako Rows, formularze

**Files:**
- Modify: `src/components/Heatmap.tsx` (nowy wygląd + `heatmapCellStyle`), `src/app/app/prompts/page.tsx`, `src/app/app/prompts/generate/page.tsx`
- Test: `tests/components/heatmap.test.ts` (rozszerzenie o `heatmapCellStyle`)

**Interfaces:**
- Produces: `heatmapCellStyle(v: number | null): { className: string; style?: React.CSSProperties; label: string }`; `Heatmap({ rows, engines, counts? })` gdzie `counts?: Record<promptId, number>` = liczba rekomendacji (Task 14 poda; do tego czasu `undefined`).
- `buildHeatmapRows` bez zmian w sygnaturze, ale **zwraca wszystkie aktywne prompty** (prompt bez komórek = wiersz z samymi `null`) — zmiana odłożonego minora z fazy 1; test „pomija prompty bez komórek” zamień na „prompt bez komórek ma same null”.

- [ ] **Step 1: Test skali kolorów**

Dopisz do `tests/components/heatmap.test.ts`:
```ts
import { heatmapCellStyle } from "@/components/Heatmap";

describe("heatmapCellStyle (monochromatyczna)", () => {
  it("brak danych: s2 i kreska", () => {
    const s = heatmapCellStyle(null);
    expect(s.className).toContain("bg-s2"); expect(s.label).toBe("—"); expect(s.style).toBeUndefined();
  });
  it("0%: białe tło z obramowaniem line-2", () => {
    const s = heatmapCellStyle(0);
    expect(s.className).toContain("bg-bg"); expect(s.className).toContain("border-line-2"); expect(s.label).toBe("0%");
  });
  it("1–66%: krycie czerni rośnie z wartością, tekst biały od 45%", () => {
    const low = heatmapCellStyle(0.1), mid = heatmapCellStyle(0.5);
    expect(low.style?.backgroundColor).toBe("rgb(29 29 31 / 0.19)");
    expect(low.className).toContain("text-t0");
    expect(mid.style?.backgroundColor).toBe("rgb(29 29 31 / 0.47)");
    expect(mid.className).toContain("text-bg");
  });
  it("≥67%: pełna czerń", () => {
    const s = heatmapCellStyle(0.67);
    expect(s.className).toContain("bg-ink"); expect(s.className).toContain("text-bg"); expect(s.label).toBe("67%");
  });
});
```
Zmień istniejący test `buildHeatmapRows` „pomija prompty…”: prompt bez komórek ma `cells` z `visibilityRate: null` dla każdego silnika.

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja `Heatmap.tsx`**
```tsx
import Link from "next/link";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";

export interface HeatmapRow { promptId: string; promptText: string; cells: { engineId: string; visibilityRate: number | null }[] }

export function buildHeatmapRows(
  cells: { engine_id: string; prompt_id: string; visibility_rate: number }[],
  prompts: { id: string; text: string }[],
): { rows: HeatmapRow[]; engines: string[] } {
  const engines = [...new Set(cells.map((c) => c.engine_id))].sort();
  const byKey = new Map(cells.map((c) => [`${c.prompt_id}:${c.engine_id}`, c.visibility_rate]));
  const rows = prompts.map((p) => ({
    promptId: p.id, promptText: p.text,
    cells: engines.map((engineId) => ({ engineId, visibilityRate: byKey.get(`${p.id}:${engineId}`) ?? null })),
  }));
  return { rows, engines };
}

// Monochromatyczna skala: kolor w tym stylu znaczy tylko błąd (red) lub sukces (teal), więc widoczność = krycie czerni.
export function heatmapCellStyle(v: number | null): { className: string; style?: React.CSSProperties; label: string } {
  const base = "grid h-12 place-items-center rounded-lg font-mono text-xs tabular-nums";
  if (v === null) return { className: `${base} bg-s2 text-t2`, label: "—" };
  const label = `${Math.round(v * 100)}%`;
  if (v === 0) return { className: `${base} border border-line-2 bg-bg text-t1`, label };
  if (v >= 0.67) return { className: `${base} bg-ink text-bg`, label };
  const alpha = Number((0.12 + v * 0.7).toFixed(2));
  return { className: `${base} ${v >= 0.45 ? "text-bg" : "text-t0"}`, style: { backgroundColor: `rgb(29 29 31 / ${alpha})` }, label };
}

export function Heatmap({ rows, engines, counts }: { rows: HeatmapRow[]; engines: string[]; counts?: Record<string, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-y-2">
        <thead>
          <tr>
            <th scope="col" className="pb-2 text-left font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-t2">Pytanie</th>
            {engines.map((e) => <th key={e} scope="col" className="w-28 pb-2 text-center font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-t2">{ENGINE_LABELS[e as EngineId] ?? e}</th>)}
            {counts && <th scope="col" className="w-36 pb-2 text-right font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-t2">Rekomendacje</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.promptId}>
              <td className="pr-6 text-sm leading-snug">{r.promptText}</td>
              {engines.map((e) => {
                const v = r.cells.find((c) => c.engineId === e)?.visibilityRate ?? null;
                const s = heatmapCellStyle(v);
                return <td key={e} className="px-1"><div className={s.className} style={s.style} aria-label={`${ENGINE_LABELS[e as EngineId] ?? e}: ${s.label}`}>{s.label}</div></td>;
              })}
              {counts && (
                <td className="pl-4 text-right text-sm">
                  {counts[r.promptId] ? <Link className="text-t1 underline-offset-4 hover:text-t0 hover:underline" href={`/app/recommendations?prompt=${r.promptId}`}>rekomendacje ({counts[r.promptId]})</Link> : <span className="text-t2">—</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```
- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: `prompts/page.tsx`** — zachowaj logikę pobierania i akcje; zmień układ:
  - `PageHero eyebrow="Polska Szkoła AI · Prompty" title={pluralPl(n, ["pytanie","pytania","pytań"])}` z akcją `<Link href="/app/prompts/generate" className={buttonVariants()}>Generuj propozycje</Link>`;
  - sekcja „Heatmapa ostatniego pomiaru” w `Tile` (gdy `engines.length === 0` → `EmptyState` „Brak pomiarów” / „Uruchom pierwszy pomiar na stronie Przegląd.” z linkiem-przyciskiem do `/app`);
  - formularz dodawania w `Tile` (pola: `Input` text, `Select` topic_id, `Select` intent, `Checkbox` is_key „kluczowy”, `Button` „Dodaj”), układ `grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]`;
  - lista promptów jako `Rows`: w `Row` tekst pytania (flex-1), `Meta` z tematem i intencją, przyciski: kluczowy (`Button variant="quiet"`: „★ 3 próbki” / „☆ 1 próbka”), aktywny (`quiet`: „aktywny” w `text-teal` / „wyłączony” w `text-t2`), „Usuń” (`danger-quiet`);
  - sekcja „Tematy”: chipy jako `<span class="rounded-lg bg-s2 px-3 py-1 text-sm">` + formularz dodawania.
  `generate/page.tsx`: ten sam układ (hero, `Tile` z formularzem, propozycje jako `Rows` z `Checkbox`), błędy w `text-red`.

- [ ] **Step 6: Kontrola** 1440/375 (heatmapa przewija się wewnątrz kafla, strona nie), build, testy, lint. Commit:
```bash
git add src/components/Heatmap.tsx src/app/app/prompts tests/components/heatmap.test.ts
git commit -m "feat(ui): prompts screen with monochrome heatmap and row lists"
```

---

### Task 7: Odpowiedzi — lista z „pokaż więcej”, szczegół

**Files:**
- Modify: `src/app/app/responses/page.tsx`, `src/app/app/responses/[id]/page.tsx`, `src/components/HighlightedText.tsx`

**Interfaces:**
- Lista: `searchParams: { engine?, prompt?, before? }`; pobiera 100 wierszy (`limit(101)` — 101. wiersz oznacza „jest więcej”), `before` = ISO `created_at` ostatniego wiersza; link „Pokaż starsze” → `?before=<created_at>` (zachowuje `engine`/`prompt`).

- [ ] **Step 1: Lista** — `page.tsx`:
```tsx
import Link from "next/link";
import { getCurrentProject } from "@/lib/workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/uuid";
import { ENGINE_LABELS, isEngineId } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { fmtDate } from "@/lib/format/number";
import { PageHero, Rows, Row, Meta, EmptyState } from "@/components/psai";
import { buttonVariants } from "@/components/ui/button";

const PAGE = 100;

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<{ engine?: string; prompt?: string; before?: string }> }) {
  const { engine, prompt, before } = await searchParams;
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  let q = supabase.from("responses")
    .select("id, engine_id, created_at, no_answer, error, sentiment, prompts(text), mentions(brand_kind)")
    .eq("project_id", project.id).order("created_at", { ascending: false }).limit(PAGE + 1);
  if (engine && isEngineId(engine)) q = q.eq("engine_id", engine);
  if (prompt && isUuid(prompt)) q = q.eq("prompt_id", prompt);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).slice(0, PAGE);
  const hasMore = (data ?? []).length > PAGE;
  const next = new URLSearchParams({ ...(engine ? { engine } : {}), ...(prompt ? { prompt } : {}), before: rows.at(-1)?.created_at ?? "" });

  return (
    <div className="space-y-10">
      <PageHero eyebrow="Polska Szkoła AI · Odpowiedzi" title="Odpowiedzi" />
      {rows.length === 0
        ? <EmptyState title="Brak odpowiedzi" description="Po pierwszym pomiarze zobaczysz tu każdą odpowiedź asystentów AI z zaznaczonymi wzmiankami." />
        : <Rows>
            {rows.map((r) => {
              const own = r.mentions.some((m) => m.brand_kind === "own");
              const state = r.error ? <span className="text-red">błąd</span> : r.no_answer ? <span className="text-t2">brak odpowiedzi</span> : own ? <span className="text-teal">wzmianka</span> : <span className="text-t2">bez wzmianki</span>;
              return (
                <Row key={r.id} href={`/app/responses/${r.id}`}>
                  <span className="flex-1 text-sm leading-snug">{r.prompts?.text}</span>
                  <span className="w-28 text-sm">{state}</span>
                  <Meta className="w-56 text-right">{ENGINE_LABELS[r.engine_id as EngineId] ?? r.engine_id} · {fmtDate(r.created_at)}{r.sentiment ? ` · ${r.sentiment}` : ""}</Meta>
                </Row>
              );
            })}
          </Rows>}
      {hasMore && <div className="flex justify-center"><Link href={`/app/responses?${next}`} className={buttonVariants({ variant: "outline" })}>Pokaż starsze</Link></div>}
    </div>
  );
}
```
- [ ] **Step 2: Szczegół** `[id]/page.tsx`: hero z `eyebrow` = `SILNIK · MODEL · DATA · KOSZT` i tytułem = tekst pytania (h1 w `text-[clamp(28px,4vw,44px)]`); błąd jako `EmptyState tone="error"`; `no_answer` jako `EmptyState` neutralny; treść w `Tile` (`HighlightedText`); sentyment jako `Meta` + zdanie; „Cytowane źródła” jako `Rows` (`Row` z linkiem `target=_blank rel=noreferrer`, własna domena z `Meta` „WASZA DOMENA” w `text-teal`, konkurent z `Meta` „KONKURENT”); surowa odpowiedź w `<details>` wewnątrz `Tile`.
- [ ] **Step 3: `HighlightedText.tsx`**: `mark` własnej marki: `bg-ink/10 text-t0 underline decoration-ink/60 underline-offset-4 rounded px-0.5`; konkurenta: `bg-s3 text-t0 rounded px-0.5`. Test `tests/components/highlight.test.ts` dotyczy `buildHighlightSegments` i nie wymaga zmian.
- [ ] **Step 4: Kontrola** (lista 100 + „Pokaż starsze” działa przy >100 odpowiedziach — w bazie są już 200+), build, testy, lint. Commit:
```bash
git add src/app/app/responses src/components/HighlightedText.tsx
git commit -m "feat(ui): responses list with cursor paging and detail tile"
```

---

### Task 8: Ustawienia — adres strony, próg, styl

**Files:**
- Create: `supabase/migrations/20261013000000_recommendations.sql` (część 1: kolumny `projects`; część 2 w Task 9 — **ten sam plik**, Task 9 go rozszerza przed uruchomieniem; w Task 8 uruchamiamy już całość, dlatego zawartość pełnej migracji jest podana w Task 9 — wykonaj Task 9 Step 1 teraz, jeśli migracja jeszcze nie istnieje)
- Modify: `src/lib/validation/settings.ts`, `src/app/app/settings/actions.ts`, `src/app/app/settings/page.tsx`
- Test: `tests/validation/settings.test.ts` (rozszerzenie)

Uwaga kolejności: żeby nie dzielić migracji na dwa pliki, Task 8 **używa pełnej migracji z Task 9 Step 1** (kolumny `projects` + tabele `site_pages`, `recommendations` + RLS + kolumna w `runs`). Implementer Task 8 tworzy ten plik dokładnie według Task 9 Step 1, stosuje go i regeneruje typy; Task 9 wtedy zaczyna od sprawdzenia, że plik istnieje.

**Interfaces:**
- `ProjectSettingsSchema` zyskuje `site_url: z.string().url()` z normalizacją (bez końcowego `/`, tylko `http(s)`), `low_visibility_threshold: z.coerce.number().min(0).max(1)`.
- `projects.site_url`, `projects.low_visibility_threshold` dostępne w `Tables<"projects">`.

- [ ] **Step 1: Migracja** — utwórz plik z Task 9 Step 1, uruchom `npx supabase migration up --local` (bez `db reset` — w bazie są prawdziwe pomiary), potem `npx supabase gen types typescript --local > src/lib/db-types.ts`. Sprawdź, że `Tables<"projects">` ma `site_url` i `low_visibility_threshold`. Ustaw adres roboczy dla PSAI:
```sql
update projects set site_url = 'https://polskaszkolaai.netlify.app' where id = '22222222-2222-2222-2222-222222222222';
```
(wykonaj przez `docker exec supabase_db_ai-visibility-monitor psql -U postgres -c "…"`).

- [ ] **Step 2: Test walidacji** — dopisz do `tests/validation/settings.test.ts`:
```ts
it("normalizuje site_url i waliduje próg", () => {
  const r = ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "https://polskaszkolaai.netlify.app/", low_visibility_threshold: "0.34" });
  expect(r.site_url).toBe("https://polskaszkolaai.netlify.app");
  expect(r.low_visibility_threshold).toBe(0.34);
  expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "ftp://x", low_visibility_threshold: "0.3" })).toThrow();
  expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{}", site_url: "https://x.pl", low_visibility_threshold: "1.5" })).toThrow();
});
```
Istniejące testy schematu muszą dalej przechodzić — dodaj `site_url` i `low_visibility_threshold` do ich wejść (wartości `"https://x.pl"`, `"0.34"`).

- [ ] **Step 3: Implementacja** — w `settings.ts`:
```ts
site_url: z.string().trim().url("Podaj pełny adres z https://").refine((u) => /^https?:\/\//.test(u), "Tylko http(s)").transform((u) => u.replace(/\/+$/, "")),
low_visibility_threshold: z.coerce.number().min(0, "Próg 0–1").max(1, "Próg 0–1"),
```
`actions.ts`: `updateProjectSettings` zapisuje oba pola (parse → update). `page.tsx`: nowa sekcja „Strona” w `Tile`: pole `site_url` (etykieta „Adres strony do analizy”, pomoc: „Dziś wersja robocza na Netlify; po przepięciu domeny wpisz https://www.polskaszkola.ai”), pole `low_visibility_threshold` (etykieta „Próg niskiej widoczności (0–1)”, `step="0.01"`). Cały ekran w stylu: hero „Ustawienia”, sekcje jako `Tile` z `SectionHead`, konkurenci jako `Rows` z chipami `bg-s2`, silniki jako cztery `Row` z przełącznikiem (`Button variant="quiet"`: „włączony” `text-teal` / „wyłączony” `text-t2`).

- [ ] **Step 4: Kontrola** — zapis adresu i progu trwały po odświeżeniu; build, testy (w tym `tests/db` jeśli `SUPABASE_DB_URL` ustawione), lint. Commit:
```bash
git add supabase/migrations/20261013000000_recommendations.sql src/lib/db-types.ts src/lib/validation/settings.ts src/app/app/settings tests/validation/settings.test.ts
git commit -m "feat(settings): site URL and low-visibility threshold; recommendations schema"
```

---
## Faza B — rekomendacje

### Task 9: Schemat danych rekomendacji (migracja) i typy

**Files:**
- Create (jeśli Task 8 jeszcze nie stworzył): `supabase/migrations/20261013000000_recommendations.sql`
- Modify: `src/lib/db-types.ts` (regeneracja), `supabase/seed.sql` (kolumna `site_url` w insercie projektu)

**Interfaces (Produces):** tabele `site_pages`, `recommendations`; kolumny `projects.site_url`, `projects.low_visibility_threshold`, `runs.recommendations_cost_usd`; typy `Tables<"site_pages">`, `Tables<"recommendations">`, `TablesInsert<"recommendations">`.

- [ ] **Step 1: Migracja** `supabase/migrations/20261013000000_recommendations.sql`:
```sql
alter table projects
  add column if not exists site_url text not null default 'https://www.polskaszkola.ai',
  add column if not exists low_visibility_threshold numeric(4,3) not null default 0.34
    check (low_visibility_threshold >= 0 and low_visibility_threshold <= 1);

alter table runs add column if not exists recommendations_cost_usd numeric(10,4) not null default 0;

create table if not exists site_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  url text not null,
  path text not null,
  title text,
  h1 text,
  description text,
  excerpt text,
  status int not null default 200,
  fetched_at timestamptz not null default now(),
  unique (project_id, url)
);
create index if not exists site_pages_project on site_pages(project_id);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  prompt_id uuid references prompts(id) on delete set null,
  run_id uuid references runs(id) on delete set null,
  type text not null check (type in ('content_new','content_improve','offsite','technical','fact_fix')),
  title text not null,
  summary text not null,
  action_steps jsonb not null default '[]'::jsonb,
  target_url text,
  suggested_outline jsonb,
  evidence jsonb not null default '{}'::jsonb,
  impact int not null check (impact between 1 and 5),
  effort int not null check (effort between 1 and 5),
  priority int generated always as (impact * 2 - effort) stored,
  status text not null default 'todo' check (status in ('todo','doing','done','dismissed')),
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);
create index if not exists recommendations_project_status on recommendations(project_id, status, priority desc);

alter table site_pages enable row level security;
alter table recommendations enable row level security;
create policy site_pages_member on site_pages for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
create policy recommendations_member on recommendations for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
```
- [ ] **Step 2: Zastosuj i wygeneruj typy**: `npx supabase migration up --local` → `npx supabase gen types typescript --local > src/lib/db-types.ts`; `npx tsc --noEmit`. W `supabase/seed.sql` dodaj `site_url` do insertu projektu PSAI: `'https://polskaszkolaai.netlify.app'` (kolumna po `facts`).
- [ ] **Step 3: Test RLS** (jeśli DB dostępna): `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- tests/db` — nadal PASS; dopisz do `tests/db/rls.test.ts` analogiczną asercję dla `recommendations`: anon → 0 wierszy po wstawieniu testowego wiersza przez superusera (i usunięciu w `finally`).
- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20261013000000_recommendations.sql supabase/seed.sql src/lib/db-types.ts tests/db/rls.test.ts
git commit -m "feat(db): site_pages, recommendations, project site_url and threshold"
```

---

### Task 10: Mapa strony — sitemapa, ekstrakcja, robots, crawler, zadanie `crawl-site`

**Files:**
- Create: `src/lib/site/sitemap.ts`, `src/lib/site/extract.ts`, `src/lib/site/robots.ts`, `src/lib/site/crawl.ts`, `src/trigger/crawl-site.ts`
- Test: `tests/site/sitemap.test.ts`, `tests/site/extract.test.ts`, `tests/site/robots.test.ts`, `tests/site/crawl.test.ts`

**Interfaces (Produces):**
```ts
// sitemap.ts
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] }   // <urlset> → urls, <sitemapindex> → sitemaps
export function rewriteHost(url: string, baseUrl: string): string                   // "https://polskaszkola.ai/x.html" + "https://polskaszkolaai.netlify.app" → "https://polskaszkolaai.netlify.app/x.html"
// extract.ts
export function extractPage(html: string): { title: string | null; h1: string | null; description: string | null; excerpt: string }
// robots.ts
export function isAllowedByRobots(robotsTxt: string, path: string): boolean         // tylko grupa User-agent: * ; Disallow prefiksowe; pusty Disallow = allow
// crawl.ts
export interface CrawledPage { url: string; path: string; title: string | null; h1: string | null; description: string | null; excerpt: string; status: number }
export async function discoverUrls(siteUrl: string, fetchImpl?: typeof fetch): Promise<string[]>   // sitemap(+index), host przepisany, max 200, dedupe, bez #fragment
export async function crawlSite(siteUrl: string, opts?: { fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number; maxPages?: number }): Promise<CrawledPage[]>
export async function persistSitePages(admin: SupabaseClient<Database>, projectId: string, pages: CrawledPage[]): Promise<{ upserted: number; retired: number }>
```
Zadanie `crawl-site` (`{ projectId }`): czyta `projects.site_url`, `crawlSite`, `persistSitePages`; `queue: { concurrencyLimit: 1 }`, `maxDuration: 900`.

- [ ] **Step 1: Testy** (`tests/site/*.test.ts`):
```ts
// sitemap.test.ts
import { describe, it, expect } from "vitest";
import { parseSitemap, rewriteHost } from "@/lib/site/sitemap";
describe("parseSitemap", () => {
  it("urlset → urls", () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://polskaszkola.ai/</loc></url><url><loc> https://polskaszkola.ai/faq.html </loc><lastmod>2026-01-01</lastmod></url></urlset>`;
    expect(parseSitemap(xml)).toEqual({ urls: ["https://polskaszkola.ai/", "https://polskaszkola.ai/faq.html"], sitemaps: [] });
  });
  it("sitemapindex → sitemaps", () => {
    const xml = `<sitemapindex><sitemap><loc>https://x.pl/a.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({ urls: [], sitemaps: ["https://x.pl/a.xml"] });
  });
});
describe("rewriteHost", () => {
  it("podmienia host na host site_url, zachowuje ścieżkę i query", () => {
    expect(rewriteHost("https://polskaszkola.ai/szkolenia.html?x=1", "https://polskaszkolaai.netlify.app")).toBe("https://polskaszkolaai.netlify.app/szkolenia.html?x=1");
  });
  it("usuwa fragment", () => {
    expect(rewriteHost("https://a.pl/p#sekcja", "https://b.pl")).toBe("https://b.pl/p");
  });
});
```
```ts
// extract.test.ts
import { describe, it, expect } from "vitest";
import { extractPage } from "@/lib/site/extract";
const html = `<html><head><title> Szkolenia AI | PSAI </title><meta name="description" content="Opis &amp; test"><style>.x{}</style></head>
<body><nav>Menu</nav><script>var a=1;</script><main><h1>Szkolenia <em>AI</em> dla firm</h1><p>Pierwszy akapit.</p><p>Drugi   akapit.</p></main></body></html>`;
describe("extractPage", () => {
  it("wyciąga title, h1 (bez tagów), description i excerpt z main", () => {
    const p = extractPage(html);
    expect(p.title).toBe("Szkolenia AI | PSAI");
    expect(p.h1).toBe("Szkolenia AI dla firm");
    expect(p.description).toBe("Opis & test");
    expect(p.excerpt).toBe("Szkolenia AI dla firm Pierwszy akapit. Drugi akapit.");
  });
  it("bez main bierze body, przycina do 600 znaków, pomija script/style", () => {
    const p = extractPage(`<body><script>x()</script><p>${"a".repeat(700)}</p></body>`);
    expect(p.excerpt.length).toBe(600);
    expect(p.excerpt).not.toContain("x()");
  });
  it("puste wejście → null/\"\"", () => {
    expect(extractPage("")).toEqual({ title: null, h1: null, description: null, excerpt: "" });
  });
});
```
```ts
// robots.test.ts
import { describe, it, expect } from "vitest";
import { isAllowedByRobots } from "@/lib/site/robots";
describe("isAllowedByRobots", () => {
  const txt = `User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /tmp/\n`;
  it("blokuje prefiksy z grupy *", () => {
    expect(isAllowedByRobots(txt, "/admin/x")).toBe(false);
    expect(isAllowedByRobots(txt, "/tmp/a")).toBe(false);
  });
  it("przepuszcza resztę i ignoruje grupy innych botów", () => {
    expect(isAllowedByRobots(txt, "/g")).toBe(true);
    expect(isAllowedByRobots(txt, "/szkolenia.html")).toBe(true);
  });
  it("pusty robots → wszystko dozwolone", () => { expect(isAllowedByRobots("", "/x")).toBe(true); });
});
```
```ts
// crawl.test.ts
import { describe, it, expect, vi } from "vitest";
import { discoverUrls, crawlSite } from "@/lib/site/crawl";
const SITE = "https://polskaszkolaai.netlify.app";
function fakeFetch(routes: Record<string, { status?: number; body: string }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const r = routes[url];
    if (!r) return new Response("nope", { status: 404 });
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}
describe("discoverUrls", () => {
  it("czyta sitemap.xml, przepisuje host, deduplikuje, limit 200", async () => {
    const locs = Array.from({ length: 205 }, (_, i) => `<url><loc>https://polskaszkola.ai/p${i}.html</loc></url>`).join("");
    const f = fakeFetch({ [`${SITE}/sitemap.xml`]: { body: `<urlset>${locs}<url><loc>https://polskaszkola.ai/p1.html</loc></url></urlset>` } });
    const urls = await discoverUrls(SITE, f);
    expect(urls).toHaveLength(200);
    expect(urls[0]).toBe(`${SITE}/p0.html`);
  });
  it("obsługuje sitemapindex", async () => {
    const f = fakeFetch({
      [`${SITE}/sitemap.xml`]: { body: `<sitemapindex><sitemap><loc>https://polskaszkola.ai/s1.xml</loc></sitemap></sitemapindex>` },
      [`${SITE}/s1.xml`]: { body: `<urlset><url><loc>https://polskaszkola.ai/a.html</loc></url></urlset>` },
    });
    expect(await discoverUrls(SITE, f)).toEqual([`${SITE}/a.html`]);
  });
  it("brak sitemapy → []", async () => { expect(await discoverUrls(SITE, fakeFetch({}))).toEqual([]); });
});
describe("crawlSite", () => {
  it("pobiera strony z sitemapy, respektuje robots, zapisuje status", async () => {
    const f = fakeFetch({
      [`${SITE}/robots.txt`]: { body: "User-agent: *\nDisallow: /tajne" },
      [`${SITE}/sitemap.xml`]: { body: `<urlset><url><loc>https://polskaszkola.ai/</loc></url><url><loc>https://polskaszkola.ai/tajne.html</loc></url><url><loc>https://polskaszkola.ai/brak.html</loc></url></urlset>` },
      [`${SITE}/`]: { body: `<html><head><title>Start</title></head><body><main><h1>PSAI</h1><p>Hej</p></main></body></html>` },
    });
    const pages = await crawlSite(SITE, { fetchImpl: f, concurrency: 2, timeoutMs: 1000 });
    expect(pages.map((p) => [p.path, p.status])).toEqual([["/", 200], ["/brak.html", 404]]);
    expect(pages[0]).toMatchObject({ title: "Start", h1: "PSAI", excerpt: "PSAI Hej" });
  });
});
```
- [ ] **Step 2: Uruchom — FAIL**
- [ ] **Step 3: Implementacja**

`sitemap.ts`:
```ts
export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  return isIndex ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}
export function rewriteHost(url: string, baseUrl: string): string {
  const u = new URL(url), b = new URL(baseUrl);
  u.protocol = b.protocol; u.host = b.host; u.hash = "";
  return u.toString();
}
```
`extract.ts`:
```ts
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const dropBlocks = (s: string) => s.replace(/<(script|style|noscript|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, " ");

export function extractPage(html: string): { title: string | null; h1: string | null; description: string | null; excerpt: string } {
  if (!html) return { title: null, h1: null, description: null, excerpt: "" };
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const description = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const excerpt = stripTags(dropBlocks(main)).slice(0, 600);
  return { title: title ? stripTags(title) : null, h1: h1 ? stripTags(h1) : null, description: description ? decode(description).trim() : null, excerpt };
}
```
`robots.ts`:
```ts
export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  let inStar = false; const disallow: string[] = [];
  for (const line of lines) {
    const [key, ...rest] = line.split(":"); const value = rest.join(":").trim();
    if (key.toLowerCase() === "user-agent") inStar = value === "*";
    else if (inStar && key.toLowerCase() === "disallow" && value) disallow.push(value);
  }
  return !disallow.some((d) => path.startsWith(d));
}
```
`crawl.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { parseSitemap, rewriteHost } from "./sitemap";
import { extractPage } from "./extract";
import { isAllowedByRobots } from "./robots";

const UA = "PSAI-VisibilityBot/1.0 (+https://polskaszkola.ai)";
const MAX_PAGES = 200;

export interface CrawledPage { url: string; path: string; title: string | null; h1: string | null; description: string | null; excerpt: string; status: number }

async function getText(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    return { status: res.status, body: res.ok ? await res.text() : "" };
  } catch { return { status: 0, body: "" }; }
}

export async function discoverUrls(siteUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 15000): Promise<string[]> {
  const base = siteUrl.replace(/\/+$/, "");
  const seen = new Set<string>(); const out: string[] = [];
  const queue = [`${base}/sitemap.xml`]; const visitedMaps = new Set<string>();
  while (queue.length && out.length < MAX_PAGES) {
    const mapUrl = queue.shift()!; if (visitedMaps.has(mapUrl)) continue; visitedMaps.add(mapUrl);
    const { status, body } = await getText(fetchImpl, mapUrl, timeoutMs);
    if (status !== 200 || !body) continue;
    const { urls, sitemaps } = parseSitemap(body);
    for (const s of sitemaps) queue.push(rewriteHost(s, base));
    for (const u of urls) { const r = rewriteHost(u, base); if (!seen.has(r)) { seen.add(r); out.push(r); if (out.length >= MAX_PAGES) break; } }
  }
  return out;
}

export async function crawlSite(siteUrl: string, opts: { fetchImpl?: typeof fetch; concurrency?: number; timeoutMs?: number; maxPages?: number } = {}): Promise<CrawledPage[]> {
  const fetchImpl = opts.fetchImpl ?? fetch, concurrency = opts.concurrency ?? 4, timeoutMs = opts.timeoutMs ?? 15000;
  const base = siteUrl.replace(/\/+$/, "");
  const robots = (await getText(fetchImpl, `${base}/robots.txt`, timeoutMs)).body;
  const urls = (await discoverUrls(base, fetchImpl, timeoutMs)).slice(0, opts.maxPages ?? MAX_PAGES)
    .filter((u) => isAllowedByRobots(robots, new URL(u).pathname));
  const pages: CrawledPage[] = new Array(urls.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const i = next++; const url = urls[i];
      const { status, body } = await getText(fetchImpl, url, timeoutMs);
      pages[i] = { url, path: new URL(url).pathname, status, ...extractPage(status === 200 ? body : "") };
    }
  }));
  return pages;
}

export async function persistSitePages(admin: SupabaseClient<Database>, projectId: string, pages: CrawledPage[]): Promise<{ upserted: number; retired: number }> {
  if (pages.length) {
    const { error } = await admin.from("site_pages").upsert(
      pages.map((p) => ({ project_id: projectId, url: p.url, path: p.path, title: p.title, h1: p.h1, description: p.description, excerpt: p.excerpt, status: p.status, fetched_at: new Date().toISOString() })),
      { onConflict: "project_id,url" },
    );
    if (error) throw new Error(`site_pages upsert: ${error.message}`);
  }
  const { data: stale, error: staleError } = await admin.from("site_pages").select("id, url").eq("project_id", projectId);
  if (staleError) throw new Error(staleError.message);
  const current = new Set(pages.map((p) => p.url));
  const retiredIds = (stale ?? []).filter((r) => !current.has(r.url)).map((r) => r.id);
  if (retiredIds.length) {
    const { error } = await admin.from("site_pages").update({ status: 410 }).in("id", retiredIds);
    if (error) throw new Error(error.message);
  }
  return { upserted: pages.length, retired: retiredIds.length };
}
```
`src/trigger/crawl-site.ts`:
```ts
import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { crawlSite, persistSitePages } from "@/lib/site/crawl";

export const crawlSiteTask = task({
  id: "crawl-site",
  queue: { concurrencyLimit: 1 },
  maxDuration: 900,
  run: async (payload: { projectId: string }) => {
    const admin = createAdminSupabase();
    const { data: project, error } = await admin.from("projects").select("site_url").eq("id", payload.projectId).single();
    if (error) throw new Error(error.message);
    const pages = await crawlSite(project.site_url);
    const result = await persistSitePages(admin, payload.projectId, pages);
    return { pages: pages.length, ok: pages.filter((p) => p.status === 200).length, ...result };
  },
});
```
- [ ] **Step 4: Uruchom — PASS**; `npx tsc --noEmit`, lint.
- [ ] **Step 5: Test na żywo** (worker `npx trigger.dev@latest dev` działa): dodaj skrypt `scripts/crawl-now.ts` analogiczny do `scripts/run-now.ts` (`tasks.trigger<typeof crawlSiteTask>("crawl-site", { projectId })`), uruchom `npx tsx --env-file=.env.local scripts/crawl-now.ts`, sprawdź w bazie: `select count(*), count(*) filter (where status=200) from site_pages;` — oczekiwane ~44 stron, większość 200; tytuły polskie. Zapisz wynik w raporcie.
- [ ] **Step 6: Commit**
```bash
git add src/lib/site src/trigger/crawl-site.ts scripts/crawl-now.ts tests/site
git commit -m "feat(site): sitemap discovery, page extraction, robots and crawl-site task"
```

---

### Task 11: Kwalifikacja pytań, wejście dla modelu, fingerprint i scalanie

**Files:**
- Create: `src/lib/recommend/qualify.ts`, `src/lib/recommend/input.ts`, `src/lib/recommend/fingerprint.ts`
- Test: `tests/recommend/qualify.test.ts`, `tests/recommend/input.test.ts`, `tests/recommend/fingerprint.test.ts`

**Interfaces (Produces):**
```ts
// qualify.ts
export interface PromptVisibility { promptId: string; intent: string; overall: { visibilityRate: number; responsesCount: number } | null; byEngine: { engineId: string; visibilityRate: number; responsesCount: number }[] }
export function qualifyPrompts(rows: PromptVisibility[], threshold: number): string[]   // promptIds do analizy
// input.ts
export interface RecommendationInput { prompt: { id: string; text: string; intent: string; topic: string | null }; visibility: { overall: number | null; byEngine: Record<string, number> }; excerpts: { engineId: string; text: string }[]; citedDomains: { domain: string; count: number }[]; citedUrls: string[]; competitorsMentioned: { name: string; count: number }[]; brand: { name: string; aliases: string[]; domains: string[]; facts: unknown; siteUrl: string }; sitePages: { path: string; title: string | null; description: string | null }[]; existing: { type: string; title: string }[] }
export function buildExcerpt(text: string, competitorAliases: string[], radius?: number): string   // ±400 znaków wokół pierwszego konkurenta, inaczej początek (800)
export function buildRecommendationInput(args: { prompt; visibility; responses: { engineId: string; text: string; citations: { url: string; domain: string }[]; mentions: { kind: "own"|"competitor"; name: string }[] }[]; brand; sitePages; existing; competitorAliases: string[] }): RecommendationInput   // limity: 2 fragmenty/silnik, 10 URL, 120 stron
// fingerprint.ts
export function normalizeTitle(t: string): string          // NFD, bez diakrytyków, lowercase, bez interpunkcji, pojedyncze spacje, bez "psai"/"polska szkola ai"
export function fingerprint(type: string, title: string): string   // sha1 hex
export function mergeEvidence(a: Evidence, b: Evidence): Evidence   // unia prompt_ids, suma count po domain, unia urls (max 20), suma konkurentów, cytaty max 6
```
`Evidence = { prompt_ids: string[]; visibility_by_engine: Record<string, number>; cited_domains: { domain: string; count: number }[]; cited_urls: string[]; competitors_mentioned: { name: string; count: number }[]; sample_quotes: string[] }`.

- [ ] **Step 1: Testy**
```ts
// qualify.test.ts
import { describe, it, expect } from "vitest";
import { qualifyPrompts, type PromptVisibility } from "@/lib/recommend/qualify";
const row = (p: Partial<PromptVisibility>): PromptVisibility => ({ promptId: "p", intent: "informational", overall: { visibilityRate: 0, responsesCount: 4 }, byEngine: [], ...p });
describe("qualifyPrompts", () => {
  it("kwalifikuje poniżej progu lub 0% w ≥2 silnikach", () => {
    const rows = [
      row({ promptId: "a", overall: { visibilityRate: 0.2, responsesCount: 4 } }),
      row({ promptId: "b", overall: { visibilityRate: 0.5, responsesCount: 4 }, byEngine: [{ engineId: "openai", visibilityRate: 0, responsesCount: 1 }, { engineId: "gemini", visibilityRate: 0, responsesCount: 1 }] }),
      row({ promptId: "c", overall: { visibilityRate: 0.8, responsesCount: 4 } }),
    ];
    expect(qualifyPrompts(rows, 0.34)).toEqual(["a", "b"]);
  });
  it("pomija pytania bez ważnych odpowiedzi (brak danych ≠ brak widoczności)", () => {
    expect(qualifyPrompts([row({ promptId: "x", overall: null }), row({ promptId: "y", overall: { visibilityRate: 0, responsesCount: 0 } })], 0.34)).toEqual([]);
  });
  it("pomija pytania brandowe z widocznością ≥ próg", () => {
    expect(qualifyPrompts([row({ promptId: "b", intent: "brand", overall: { visibilityRate: 0.9, responsesCount: 3 } })], 0.34)).toEqual([]);
    expect(qualifyPrompts([row({ promptId: "b2", intent: "brand", overall: { visibilityRate: 0.1, responsesCount: 3 } })], 0.34)).toEqual(["b2"]);
  });
});
```
```ts
// input.test.ts
import { describe, it, expect } from "vitest";
import { buildExcerpt, buildRecommendationInput } from "@/lib/recommend/input";
describe("buildExcerpt", () => {
  it("wycina ±radius wokół pierwszego konkurenta", () => {
    const text = "x".repeat(500) + " Akademia PARP poleca " + "y".repeat(500);
    const e = buildExcerpt(text, ["Akademia PARP"], 100);
    expect(e.length).toBeLessThanOrEqual(230);
    expect(e).toContain("Akademia PARP");
  });
  it("bez konkurenta bierze początek", () => { expect(buildExcerpt("a".repeat(1000), ["Z"], 100)).toHaveLength(800); });
});
describe("buildRecommendationInput", () => {
  it("agreguje domeny, konkurentów i limituje fragmenty do 2 na silnik", () => {
    const resp = (engineId: string, i: number) => ({ engineId, text: `odp ${i} EY Academy`, citations: [{ url: `https://parp.gov.pl/${i}`, domain: "parp.gov.pl" }], mentions: [{ kind: "competitor" as const, name: "EY Academy" }] });
    const input = buildRecommendationInput({
      prompt: { id: "p1", text: "Q", intent: "comparison", topic: "T" },
      visibility: { overall: 0.1, byEngine: { openai: 0 } },
      responses: [resp("openai", 1), resp("openai", 2), resp("openai", 3), resp("gemini", 4)],
      brand: { name: "PSAI", aliases: [], domains: ["polskaszkola.ai"], facts: {}, siteUrl: "https://x" },
      sitePages: Array.from({ length: 150 }, (_, i) => ({ path: `/${i}`, title: `T${i}`, description: null })),
      existing: [], competitorAliases: ["EY Academy"],
    });
    expect(input.excerpts.filter((e) => e.engineId === "openai")).toHaveLength(2);
    expect(input.citedDomains).toEqual([{ domain: "parp.gov.pl", count: 4 }]);
    expect(input.competitorsMentioned).toEqual([{ name: "EY Academy", count: 4 }]);
    expect(input.sitePages).toHaveLength(120);
    expect(input.citedUrls.length).toBeLessThanOrEqual(10);
  });
});
```
```ts
// fingerprint.test.ts
import { describe, it, expect } from "vitest";
import { normalizeTitle, fingerprint, mergeEvidence } from "@/lib/recommend/fingerprint";
describe("fingerprint", () => {
  it("ten sam tytuł z różną wielkością liter/diakrytykami daje ten sam fingerprint", () => {
    expect(fingerprint("content_new", "Opublikuj stronę: Szkolenia AI dla firm")).toBe(fingerprint("content_new", "opublikuj strone  szkolenia ai dla firm!"));
  });
  it("inny typ → inny fingerprint", () => { expect(fingerprint("offsite", "x")).not.toBe(fingerprint("technical", "x")); });
  it("normalizeTitle usuwa nazwę marki", () => { expect(normalizeTitle("PSAI: dodaj FAQ")).toBe("dodaj faq"); });
});
describe("mergeEvidence", () => {
  it("łączy prompt_ids, sumuje domeny i konkurentów, limituje cytaty", () => {
    const a = { prompt_ids: ["p1"], visibility_by_engine: { openai: 0 }, cited_domains: [{ domain: "parp.gov.pl", count: 2 }], cited_urls: ["u1"], competitors_mentioned: [{ name: "EY", count: 1 }], sample_quotes: ["q1", "q2", "q3", "q4"] };
    const b = { prompt_ids: ["p1", "p2"], visibility_by_engine: { gemini: 0.2 }, cited_domains: [{ domain: "parp.gov.pl", count: 1 }, { domain: "ey.pl", count: 1 }], cited_urls: ["u1", "u2"], competitors_mentioned: [{ name: "EY", count: 2 }], sample_quotes: ["q5", "q6", "q7"] };
    const m = mergeEvidence(a, b);
    expect(m.prompt_ids).toEqual(["p1", "p2"]);
    expect(m.cited_domains).toEqual([{ domain: "parp.gov.pl", count: 3 }, { domain: "ey.pl", count: 1 }]);
    expect(m.cited_urls).toEqual(["u1", "u2"]);
    expect(m.competitors_mentioned).toEqual([{ name: "EY", count: 3 }]);
    expect(m.sample_quotes).toHaveLength(6);
    expect(m.visibility_by_engine).toEqual({ openai: 0, gemini: 0.2 });
  });
});
```
- [ ] **Step 2: Uruchom — FAIL**
- [ ] **Step 3: Implementacja**

`qualify.ts`:
```ts
export interface PromptVisibility { promptId: string; intent: string; overall: { visibilityRate: number; responsesCount: number } | null; byEngine: { engineId: string; visibilityRate: number; responsesCount: number }[] }
export function qualifyPrompts(rows: PromptVisibility[], threshold: number): string[] {
  return rows.filter((r) => {
    if (!r.overall || r.overall.responsesCount === 0) return false;
    const low = r.overall.visibilityRate < threshold;
    const zeroEngines = r.byEngine.filter((e) => e.responsesCount > 0 && e.visibilityRate === 0).length >= 2;
    if (r.intent === "brand" && !low) return false;
    return low || zeroEngines;
  }).map((r) => r.promptId);
}
```
`input.ts`:
```ts
import { foldText } from "@/lib/extract/normalize";
export interface RecommendationInput { /* jak w Interfaces */ }

export function buildExcerpt(text: string, competitorAliases: string[], radius = 400): string {
  const folded = foldText(text);
  let hit = -1;
  for (const alias of competitorAliases) { const i = folded.indexOf(foldText(alias)); if (i >= 0 && (hit < 0 || i < hit)) hit = i; }
  if (hit < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, hit - radius);
  return text.slice(start, Math.min(text.length, hit + radius));
}

export function buildRecommendationInput(args: { /* jak w Interfaces */ }): RecommendationInput {
  const perEngine = new Map<string, number>();
  const excerpts: { engineId: string; text: string }[] = [];
  const domains = new Map<string, number>(); const urls = new Set<string>(); const comps = new Map<string, number>();
  for (const r of args.responses) {
    const n = perEngine.get(r.engineId) ?? 0;
    if (n < 2) { excerpts.push({ engineId: r.engineId, text: buildExcerpt(r.text, args.competitorAliases) }); perEngine.set(r.engineId, n + 1); }
    for (const c of r.citations) { domains.set(c.domain, (domains.get(c.domain) ?? 0) + 1); if (urls.size < 10) urls.add(c.url); }
    for (const m of r.mentions) if (m.kind === "competitor") comps.set(m.name, (comps.get(m.name) ?? 0) + 1);
  }
  const sortDesc = <T extends { count: number }>(x: T[]) => x.sort((a, b) => b.count - a.count);
  return {
    prompt: args.prompt, visibility: args.visibility, excerpts,
    citedDomains: sortDesc([...domains].map(([domain, count]) => ({ domain, count }))),
    citedUrls: [...urls],
    competitorsMentioned: sortDesc([...comps].map(([name, count]) => ({ name, count }))),
    brand: args.brand, sitePages: args.sitePages.slice(0, 120), existing: args.existing,
  };
}
```
`fingerprint.ts`:
```ts
import { createHash } from "node:crypto";
import { foldText } from "@/lib/extract/normalize";
export interface Evidence { prompt_ids: string[]; visibility_by_engine: Record<string, number>; cited_domains: { domain: string; count: number }[]; cited_urls: string[]; competitors_mentioned: { name: string; count: number }[]; sample_quotes: string[] }

export function normalizeTitle(t: string): string {
  return foldText(t).replace(/polska szkola ai|psai/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
export function fingerprint(type: string, title: string): string {
  return createHash("sha1").update(`${type}:${normalizeTitle(title)}`).digest("hex");
}
function sumBy<T extends Record<string, unknown>>(key: keyof T, a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) { const k = String(x[key]); const prev = m.get(k); m.set(k, prev ? { ...prev, count: (prev as { count: number }).count + (x as { count: number }).count } : { ...x }); }
  return [...m.values()];
}
export function mergeEvidence(a: Evidence, b: Evidence): Evidence {
  return {
    prompt_ids: [...new Set([...a.prompt_ids, ...b.prompt_ids])],
    visibility_by_engine: { ...a.visibility_by_engine, ...b.visibility_by_engine },
    cited_domains: sumBy("domain", a.cited_domains, b.cited_domains),
    cited_urls: [...new Set([...a.cited_urls, ...b.cited_urls])].slice(0, 20),
    competitors_mentioned: sumBy("name", a.competitors_mentioned, b.competitors_mentioned),
    sample_quotes: [...a.sample_quotes, ...b.sample_quotes].slice(0, 6),
  };
}
```
- [ ] **Step 4: Uruchom — PASS**; tsc, lint. Commit:
```bash
git add src/lib/recommend tests/recommend
git commit -m "feat(recommend): prompt qualification, model input builder, fingerprint merge"
```

---
### Task 12: Generowanie rekomendacji (Claude, structured output) i reguły deterministyczne

**Files:**
- Create: `src/lib/recommend/generate.ts`, `src/lib/recommend/rules.ts`
- Test: `tests/recommend/generate.test.ts`, `tests/recommend/rules.test.ts`

**Interfaces (Produces):**
```ts
// generate.ts
export const RecommendationSchema = z.object({
  type: z.enum(["content_new", "content_improve", "offsite", "technical", "fact_fix"]),
  title: z.string().min(8).max(120),
  summary: z.string().min(20).max(600),
  action_steps: z.array(z.string().min(5)).min(2).max(7),
  target_url: z.string().nullable(),                     // content_improve/offsite: wymagane (walidacja poza schematem)
  suggested_outline: z.array(z.string()).nullable(),     // content_new: wymagane, 3–8 punktów
  impact: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  rationale_pl: z.string().min(20),
});
export type GeneratedRecommendation = z.infer<typeof RecommendationSchema>;
export function validateConcreteness(r: GeneratedRecommendation): string | null   // null = ok, inaczej powód odrzucenia
export async function generateRecommendations(input: RecommendationInput, deps?: { client?: Anthropic }): Promise<{ accepted: GeneratedRecommendation[]; rejected: { title: string; reason: string }[]; usage: { input_tokens: number; output_tokens: number }; costUsd: number }>
// rules.ts
export async function technicalRules(siteUrl: string, fetchImpl?: typeof fetch): Promise<GeneratedRecommendation[]>  // llms.txt 404 → rekomendacja; sitemap 404 → rekomendacja
```
Koszt: `costUsd = input_tokens/1e6 * 4 + output_tokens/1e6 * 20` dla Opus 5.5 (stałe w `MODEL_PRICES`; inne modele → 0 z ostrzeżeniem w logu).

- [ ] **Step 1: Testy**
```ts
// generate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { parse }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (s: unknown) => ({ type: "json_schema", schema: s }) }));

const base = { type: "content_new", title: "Opublikuj stronę „Szkolenia AI dla firm” z cennikiem", summary: "Asystenci cytują PARP i EY, bo mają strony z cenami i programem. Brak takiej strony u Was.", action_steps: ["Napisz stronę", "Dodaj tabelę cen", "Podlinkuj z menu"], target_url: "/szkolenia-ai-dla-firm", suggested_outline: ["Dla kogo", "Program", "Ceny", "FAQ"], impact: 4, effort: 3, rationale_pl: "Dwa z trzech cytowanych źródeł to strony ofertowe z cenami." };
const input = { prompt: { id: "p1", text: "Q", intent: "comparison", topic: null }, visibility: { overall: 0, byEngine: {} }, excerpts: [], citedDomains: [], citedUrls: [], competitorsMentioned: [], brand: { name: "PSAI", aliases: [], domains: [], facts: {}, siteUrl: "https://x" }, sitePages: [], existing: [] };

describe("generateRecommendations", () => {
  beforeEach(() => { parse.mockReset(); process.env.ANTHROPIC_API_KEY = "k"; });
  it("przyjmuje konkretne rekomendacje i liczy koszt", async () => {
    parse.mockResolvedValue({ parsed_output: { recommendations: [base] }, usage: { input_tokens: 1000, output_tokens: 500 }, stop_reason: "end_turn" });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    const r = await generateRecommendations(input);
    expect(r.accepted).toHaveLength(1); expect(r.rejected).toEqual([]);
    expect(r.costUsd).toBeCloseTo(0.014);
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.output_config.effort).toBe("high");
    expect(args.max_tokens).toBe(8000);
  });
  it("odrzuca content_new bez zarysu i offsite bez URL", async () => {
    parse.mockResolvedValue({ parsed_output: { recommendations: [{ ...base, suggested_outline: null }, { ...base, type: "offsite", title: "Zgłoś się do rankingu", target_url: null }] }, usage: { input_tokens: 1, output_tokens: 1 } });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    const r = await generateRecommendations(input);
    expect(r.accepted).toEqual([]); expect(r.rejected).toHaveLength(2);
    expect(r.rejected[0].reason).toMatch(/zarys/i); expect(r.rejected[1].reason).toMatch(/url/i);
  });
  it("przekazuje w prompcie istniejące rekomendacje, strony i cytowane URL-e", async () => {
    parse.mockResolvedValue({ parsed_output: { recommendations: [] }, usage: { input_tokens: 1, output_tokens: 1 } });
    const { generateRecommendations } = await import("@/lib/recommend/generate");
    await generateRecommendations({ ...input, citedUrls: ["https://parp.gov.pl/kurs"], sitePages: [{ path: "/faq.html", title: "FAQ", description: null }], existing: [{ type: "technical", title: "Opublikuj llms.txt" }] });
    const content = String(parse.mock.calls[0][0].messages[0].content);
    expect(content).toContain("https://parp.gov.pl/kurs"); expect(content).toContain("/faq.html"); expect(content).toContain("Opublikuj llms.txt");
  });
});
```
```ts
// rules.test.ts
import { describe, it, expect, vi } from "vitest";
import { technicalRules } from "@/lib/recommend/rules";
const f = (status: Record<string, number>) => (async (u: RequestInfo | URL) => new Response("", { status: status[String(u)] ?? 404 })) as unknown as typeof fetch;
describe("technicalRules", () => {
  it("brak llms.txt → rekomendacja techniczna; sitemapa jest → brak drugiej", async () => {
    const r = await technicalRules("https://x.pl", f({ "https://x.pl/llms.txt": 404, "https://x.pl/sitemap.xml": 200 }));
    expect(r).toHaveLength(1); expect(r[0].type).toBe("technical"); expect(r[0].title).toMatch(/llms\.txt/);
  });
  it("wszystko jest → []", async () => {
    expect(await technicalRules("https://x.pl", f({ "https://x.pl/llms.txt": 200, "https://x.pl/sitemap.xml": 200 }))).toEqual([]);
  });
});
```
- [ ] **Step 2: Uruchom — FAIL**
- [ ] **Step 3: Implementacja `generate.ts`**
```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { RecommendationInput } from "./input";

export const RecommendationSchema = z.object({ /* jak w Interfaces */ });
const OutputSchema = z.object({ recommendations: z.array(RecommendationSchema).max(3) });
export type GeneratedRecommendation = z.infer<typeof RecommendationSchema>;

const MODEL_PRICES: Record<string, { input: number; output: number }> = { "claude-opus-5-5": { input: 4, output: 20 }, "claude-sonnet-5-5": { input: 2, output: 10 }, "claude-haiku-5-5": { input: 0.1, output: 0.5 } };

const SYSTEM = `Jesteś konsultantem widoczności marki w asystentach AI (ChatGPT, Perplexity, Gemini, Google AI Overviews) dla polskiej firmy szkoleniowej.
Dostajesz jedno pytanie użytkownika, w którym marka jest niewidoczna lub mało widoczna, oraz dowody: kto i co jest cytowane, którzy konkurenci są wymieniani, jakie podstrony ma marka.
Zwróć 1–3 rekomendacje, które realnie zwiększą szansę, że asystent wymieni lub zacytuje markę przy tym pytaniu.
Zasady:
- Po polsku, konkretnie, bez pustych superlatywów. Każda rekomendacja wskazuje jeden artefakt do zrobienia.
- content_new: nowa podstrona — podaj tytuł, 3–8 punktów zarysu (suggested_outline) i proponowaną ścieżkę w target_url (np. /szkolenia-ai-dla-firm). Nie proponuj strony, która już istnieje na liście podstron — wtedy użyj content_improve z jej ścieżką.
- content_improve: istniejąca podstrona (target_url = jej ścieżka z listy) i co konkretnie dodać (liczby, FAQ, porównanie, daty, autor).
- offsite: konkretne miejsce, w którym asystenci cytują konkurencję, a nie markę (target_url = jeden z cytowanych URL-i lub domena) i jak się tam znaleźć.
- technical: zmiana techniczna strony (np. llms.txt, dane strukturalne) — tylko jeśli dowody na to wskazują.
- fact_fix: asystent podaje nieprawdę o marce — wskaż, gdzie opublikować poprawne fakty.
- Nie wymyślaj źródeł ani liczb; odwołuj się do dowodów z wejścia. Nie powtarzaj rekomendacji z listy „istniejące”.
- impact 1–5 (jak bardzo zwiększy widoczność przy tym pytaniu), effort 1–5 (ile pracy).`;

export function validateConcreteness(r: GeneratedRecommendation): string | null {
  if (r.type === "content_new" && (!r.suggested_outline || r.suggested_outline.length < 3)) return "content_new bez zarysu (suggested_outline ≥ 3 punkty)";
  if (r.type === "content_new" && !r.target_url) return "content_new bez proponowanej ścieżki (target_url)";
  if ((r.type === "content_improve" || r.type === "offsite") && !r.target_url) return `${r.type} bez target_url`;
  return null;
}

function renderInput(i: RecommendationInput): string {
  const lines = [
    `Pytanie: ${i.prompt.text} (intencja: ${i.prompt.intent}${i.prompt.topic ? `, temat: ${i.prompt.topic}` : ""})`,
    `Widoczność marki: ogółem ${i.visibility.overall == null ? "brak danych" : Math.round(i.visibility.overall * 100) + "%"}; per silnik: ${Object.entries(i.visibility.byEngine).map(([e, v]) => `${e} ${Math.round(v * 100)}%`).join(", ") || "brak"}`,
    `Marka: ${i.brand.name} (aliasy: ${i.brand.aliases.join(", ") || "brak"}; domeny: ${i.brand.domains.join(", ")}; strona: ${i.brand.siteUrl})`,
    `Karta faktów: ${JSON.stringify(i.brand.facts)}`,
    `Cytowane domeny: ${i.citedDomains.map((d) => `${d.domain} (${d.count})`).join(", ") || "brak"}`,
    `Cytowane URL-e: ${i.citedUrls.join("\n  ") || "brak"}`,
    `Wymieniani konkurenci: ${i.competitorsMentioned.map((c) => `${c.name} (${c.count})`).join(", ") || "brak"}`,
    `Fragmenty odpowiedzi:\n${i.excerpts.map((e) => `[${e.engineId}] ${e.text}`).join("\n---\n") || "brak"}`,
    `Podstrony marki (${i.sitePages.length}):\n${i.sitePages.map((p) => `${p.path} — ${p.title ?? ""}${p.description ? ` — ${p.description}` : ""}`).join("\n") || "brak"}`,
    `Istniejące rekomendacje dla tego pytania: ${i.existing.map((e) => `[${e.type}] ${e.title}`).join("; ") || "brak"}`,
  ];
  return lines.join("\n\n");
}

export async function generateRecommendations(input: RecommendationInput, deps: { client?: Anthropic } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Brak ANTHROPIC_API_KEY");
  const client = deps.client ?? new Anthropic();
  const model = process.env.ANTHROPIC_RECOMMENDER_MODEL ?? "claude-opus-5-5";
  const res = await client.messages.parse({
    model, max_tokens: 8000,
    output_config: { effort: "high", format: zodOutputFormat(OutputSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: renderInput(input) }],
  });
  const items = res.parsed_output?.recommendations ?? [];
  const accepted: GeneratedRecommendation[] = [], rejected: { title: string; reason: string }[] = [];
  for (const r of items) { const why = validateConcreteness(r); if (why) rejected.push({ title: r.title, reason: why }); else accepted.push(r); }
  const usage = { input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0 };
  const price = MODEL_PRICES[model];
  if (!price) console.warn(`generateRecommendations: brak cennika dla ${model}, koszt = 0`);
  const costUsd = price ? (usage.input_tokens / 1e6) * price.input + (usage.output_tokens / 1e6) * price.output : 0;
  return { accepted, rejected, usage, costUsd };
}
```
`rules.ts`:
```ts
import type { GeneratedRecommendation } from "./generate";
async function head(fetchImpl: typeof fetch, url: string): Promise<number> {
  try { return (await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "PSAI-VisibilityBot/1.0" } })).status; } catch { return 0; }
}
export async function technicalRules(siteUrl: string, fetchImpl: typeof fetch = fetch): Promise<GeneratedRecommendation[]> {
  const base = siteUrl.replace(/\/+$/, ""); const out: GeneratedRecommendation[] = [];
  if ((await head(fetchImpl, `${base}/llms.txt`)) !== 200) out.push({
    type: "technical", title: "Opublikuj plik llms.txt z opisem oferty", impact: 3, effort: 1, target_url: "/llms.txt", suggested_outline: null,
    summary: "Asystenci AI i ich crawlery czytają /llms.txt jako skrót tego, czym jest firma i co oferuje. Strona go nie ma.",
    action_steps: ["Utwórz plik tekstowy /llms.txt wg formatu llmstxt.org", "Wpisz: kim jesteście, dla kogo, główne programy z linkami, kontakt", "Dodaj link do llms.txt w stopce i w sitemapie"],
    rationale_pl: "Brak /llms.txt (odpowiedź inna niż 200).",
  });
  if ((await head(fetchImpl, `${base}/sitemap.xml`)) !== 200) out.push({
    type: "technical", title: "Opublikuj sitemap.xml i zgłoś ją w Search Console", impact: 3, effort: 1, target_url: "/sitemap.xml", suggested_outline: null,
    summary: "Bez sitemapy nowe podstrony są później odkrywane przez Google i asystentów opartych o jego indeks.",
    action_steps: ["Wygeneruj sitemap.xml ze wszystkimi podstronami", "Dodaj wpis Sitemap: do robots.txt", "Zgłoś w Google Search Console"],
    rationale_pl: "Brak /sitemap.xml (odpowiedź inna niż 200).",
  });
  return out;
}
```
- [ ] **Step 4: Uruchom — PASS**; tsc, lint. Commit:
```bash
git add src/lib/recommend/generate.ts src/lib/recommend/rules.ts tests/recommend/generate.test.ts tests/recommend/rules.test.ts
git commit -m "feat(recommend): Claude structured recommendations with concreteness guard and technical rules"
```

---

### Task 13: Zadanie `recommend-project`, zapis ze scalaniem, hook w `run-project`, akcje

**Files:**
- Create: `src/lib/recommend/persist.ts`, `src/lib/recommend/collect.ts`, `src/trigger/recommend-project.ts`, `src/app/app/recommendations/actions.ts`, `scripts/recommend-now.ts`
- Modify: `src/trigger/run-project.ts` (po udanej agregacji: `await recommendProject.trigger({ projectId, runId, date })`)
- Test: `tests/recommend/persist.test.ts`, `tests/recommend/collect.test.ts`

**Interfaces (Produces):**
```ts
// collect.ts — czyste funkcje nad danymi z bazy
export function visibilityByPrompt(metricRows: { prompt_id: string | null; engine_id: string | null; visibility_rate: number | string; responses_count: number }[], prompts: { id: string; intent: string }[]): PromptVisibility[]
// persist.ts
export async function upsertRecommendations(admin, projectId: string, runId: string | null, promptId: string | null, items: GeneratedRecommendation[], evidence: Evidence): Promise<{ inserted: number; merged: number }>
  // dla każdej: fingerprint; istnieje → update: evidence = mergeEvidence(stara, nowa), updated_at = now, run_id = runId, status bez zmian, impact/effort = max; nie istnieje → insert
// recommend-project (payload { projectId; runId: string | null; date: string })
//   1) metryki dnia (daily_metrics where date, prompt_id not null) → visibilityByPrompt → qualifyPrompts(threshold)
//   2) dla każdego promptu: odpowiedzi z runów dnia (text, citations, mentions) → buildRecommendationInput (site_pages status 200, existing recs promptu) → generateRecommendations → upsertRecommendations
//   3) technicalRules(site_url) → upsertRecommendations(promptId null)
//   4) runs.recommendations_cost_usd += suma costUsd (jeśli runId); zwraca { prompts, accepted, rejected, costUsd }
//   pomija całość, gdy brak ANTHROPIC_API_KEY (log) ; queue concurrencyLimit 1; maxDuration 1800
// actions.ts ("use server")
export async function setRecommendationStatus(formData: FormData)   // id, status ∈ todo|doing|done|dismissed; scoped project; revalidatePath("/app/recommendations"), "/app", "/app/prompts"
export async function refreshRecommendations()                       // tasks.trigger("recommend-project", { projectId, runId: null, date: today }) ; revalidatePath
```

- [ ] **Step 1: Testy**
```ts
// collect.test.ts
import { describe, it, expect } from "vitest";
import { visibilityByPrompt } from "@/lib/recommend/collect";
describe("visibilityByPrompt", () => {
  it("składa overall i byEngine per prompt, numeric jako string", () => {
    const rows = [
      { prompt_id: "p1", engine_id: null, visibility_rate: "0.2", responses_count: 4 },
      { prompt_id: "p1", engine_id: "openai", visibility_rate: 0, responses_count: 2 },
      { prompt_id: "p2", engine_id: "gemini", visibility_rate: "1", responses_count: 1 },
    ];
    const v = visibilityByPrompt(rows, [{ id: "p1", intent: "comparison" }, { id: "p2", intent: "brand" }, { id: "p3", intent: "informational" }]);
    expect(v.find((x) => x.promptId === "p1")).toEqual({ promptId: "p1", intent: "comparison", overall: { visibilityRate: 0.2, responsesCount: 4 }, byEngine: [{ engineId: "openai", visibilityRate: 0, responsesCount: 2 }] });
    expect(v.find((x) => x.promptId === "p3")?.overall).toBeNull();
  });
});
```
```ts
// persist.test.ts  (fake admin jak w tests/workspace.test.ts)
import { describe, it, expect } from "vitest";
import { upsertRecommendations } from "@/lib/recommend/persist";
import { fingerprint } from "@/lib/recommend/fingerprint";
function fakeAdmin(existing: Record<string, { id: string; evidence: unknown; status: string; impact: number; effort: number }>) {
  const inserted: unknown[] = []; const updated: { id: string; patch: Record<string, unknown> }[] = [];
  const api = (table: string) => {
    const q: Record<string, unknown> = {}; let fp = "";
    q.select = () => q; q.eq = (col: string, v: string) => { if (col === "fingerprint") fp = v; return q; };
    q.maybeSingle = async () => ({ data: existing[fp] ?? null, error: null });
    q.insert = (rows: unknown) => { inserted.push(rows); return { then: (r: (v: unknown) => void) => r({ error: null }) }; };
    q.update = (patch: Record<string, unknown>) => ({ eq: (_c: string, id: string) => { updated.push({ id, patch }); return { then: (r: (v: unknown) => void) => r({ error: null }) }; } });
    return table === "recommendations" ? q : q;
  };
  return { client: { from: api } as never, inserted, updated };
}
const item = { type: "offsite" as const, title: "Zgłoś się do rankingu PARP", summary: "s".repeat(30), action_steps: ["a", "b"], target_url: "https://parp.gov.pl/x", suggested_outline: null, impact: 4, effort: 2, rationale_pl: "r".repeat(20) };
const ev = { prompt_ids: ["p1"], visibility_by_engine: {}, cited_domains: [{ domain: "parp.gov.pl", count: 1 }], cited_urls: [], competitors_mentioned: [], sample_quotes: [] };
describe("upsertRecommendations", () => {
  it("wstawia nową rekomendację z fingerprintem", async () => {
    const { client, inserted } = fakeAdmin({});
    const r = await upsertRecommendations(client, "proj", "run", "p1", [item], ev);
    expect(r).toEqual({ inserted: 1, merged: 0 });
    expect((inserted[0] as { fingerprint: string }).fingerprint).toBe(fingerprint("offsite", item.title));
  });
  it("scala z istniejącą: łączy evidence, zachowuje status, bierze max impact/effort", async () => {
    const fp = fingerprint("offsite", item.title);
    const { client, updated } = fakeAdmin({ [fp]: { id: "r1", evidence: { ...ev, prompt_ids: ["p0"] }, status: "done", impact: 2, effort: 5 } });
    const r = await upsertRecommendations(client, "proj", "run", "p1", [item], ev);
    expect(r).toEqual({ inserted: 0, merged: 1 });
    expect(updated[0].id).toBe("r1");
    expect((updated[0].patch.evidence as { prompt_ids: string[] }).prompt_ids).toEqual(["p0", "p1"]);
    expect(updated[0].patch.status).toBeUndefined();
    expect(updated[0].patch.impact).toBe(4); expect(updated[0].patch.effort).toBe(5);
  });
});
```
- [ ] **Step 2: Uruchom — FAIL**
- [ ] **Step 3: Implementacja**

`collect.ts`:
```ts
import type { PromptVisibility } from "./qualify";
export function visibilityByPrompt(metricRows: { prompt_id: string | null; engine_id: string | null; visibility_rate: number | string; responses_count: number }[], prompts: { id: string; intent: string }[]): PromptVisibility[] {
  return prompts.map((p) => {
    const rows = metricRows.filter((r) => r.prompt_id === p.id);
    const overall = rows.find((r) => r.engine_id === null);
    return {
      promptId: p.id, intent: p.intent,
      overall: overall ? { visibilityRate: Number(overall.visibility_rate), responsesCount: overall.responses_count } : null,
      byEngine: rows.filter((r) => r.engine_id !== null).map((r) => ({ engineId: r.engine_id as string, visibilityRate: Number(r.visibility_rate), responsesCount: r.responses_count })),
    };
  });
}
```
`persist.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { GeneratedRecommendation } from "./generate";
import { fingerprint, mergeEvidence, type Evidence } from "./fingerprint";

export async function upsertRecommendations(admin: SupabaseClient<Database>, projectId: string, runId: string | null, promptId: string | null, items: GeneratedRecommendation[], evidence: Evidence) {
  let inserted = 0, merged = 0;
  for (const item of items) {
    const fp = fingerprint(item.type, item.title);
    const { data: existing, error } = await admin.from("recommendations").select("id, evidence, status, impact, effort").eq("project_id", projectId).eq("fingerprint", fp).maybeSingle();
    if (error) throw new Error(`recommendations select: ${error.message}`);
    if (existing) {
      const { error: upErr } = await admin.from("recommendations").update({
        evidence: mergeEvidence(existing.evidence as Evidence, evidence) as never, run_id: runId, updated_at: new Date().toISOString(),
        impact: Math.max(existing.impact, item.impact), effort: Math.max(existing.effort, item.effort), summary: item.summary, action_steps: item.action_steps as never,
      }).eq("id", existing.id);
      if (upErr) throw new Error(`recommendations update: ${upErr.message}`);
      merged++;
    } else {
      const { error: insErr } = await admin.from("recommendations").insert({
        project_id: projectId, run_id: runId, prompt_id: promptId, type: item.type, title: item.title, summary: item.summary,
        action_steps: item.action_steps as never, target_url: item.target_url, suggested_outline: item.suggested_outline as never,
        evidence: evidence as never, impact: item.impact, effort: item.effort, fingerprint: fp,
      });
      if (insErr) throw new Error(`recommendations insert: ${insErr.message}`);
      inserted++;
    }
  }
  return { inserted, merged };
}
```
`src/trigger/recommend-project.ts`:
```ts
import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { qualifyPrompts } from "@/lib/recommend/qualify";
import { visibilityByPrompt } from "@/lib/recommend/collect";
import { buildRecommendationInput } from "@/lib/recommend/input";
import { generateRecommendations } from "@/lib/recommend/generate";
import { technicalRules } from "@/lib/recommend/rules";
import { upsertRecommendations } from "@/lib/recommend/persist";
import type { Evidence } from "@/lib/recommend/fingerprint";

export interface RecommendProjectPayload { projectId: string; runId: string | null; date: string }

export const recommendProject = task({
  id: "recommend-project",
  queue: { concurrencyLimit: 1 },
  maxDuration: 1800,
  run: async ({ projectId, runId, date }: RecommendProjectPayload) => {
    if (!process.env.ANTHROPIC_API_KEY) { console.warn("recommend-project: brak ANTHROPIC_API_KEY — pomijam"); return { skipped: true }; }
    const admin = createAdminSupabase();
    const [projectRes, promptsRes, metricsRes, compsRes, pagesRes] = await Promise.all([
      admin.from("projects").select("*").eq("id", projectId).single(),
      admin.from("prompts").select("id, text, intent, topic_id, topics(name)").eq("project_id", projectId).eq("active", true),
      admin.from("daily_metrics").select("prompt_id, engine_id, visibility_rate, responses_count").eq("project_id", projectId).eq("date", date).not("prompt_id", "is", null),
      admin.from("competitors").select("name, aliases").eq("project_id", projectId),
      admin.from("site_pages").select("path, title, description").eq("project_id", projectId).eq("status", 200).order("path").limit(120),
    ]);
    for (const r of [projectRes, promptsRes, metricsRes, compsRes, pagesRes]) if (r.error) throw new Error(r.error.message);
    const project = projectRes.data!, prompts = promptsRes.data ?? [];
    const threshold = Number(project.low_visibility_threshold);
    const vis = visibilityByPrompt(metricsRes.data ?? [], prompts.map((p) => ({ id: p.id, intent: p.intent })));
    const qualified = qualifyPrompts(vis, threshold);
    const competitorAliases = (compsRes.data ?? []).flatMap((c) => [c.name, ...c.aliases]);
    const brand = { name: project.brand_name, aliases: project.brand_aliases, domains: project.domains, facts: project.facts, siteUrl: project.site_url };
    const dayStart = `${date}T00:00:00Z`, dayEnd = new Date(Date.parse(dayStart) + 86400000).toISOString();
    const { data: dayRuns, error: runsErr } = await admin.from("runs").select("id").eq("project_id", projectId).gte("started_at", dayStart).lt("started_at", dayEnd);
    if (runsErr) throw new Error(runsErr.message);
    const runIds = (dayRuns ?? []).map((r) => r.id);

    let accepted = 0, rejected = 0, costUsd = 0;
    for (const promptId of qualified) {
      const p = prompts.find((x) => x.id === promptId)!;
      const v = vis.find((x) => x.promptId === promptId)!;
      const [{ data: responses, error: rErr }, { data: existing, error: eErr }] = await Promise.all([
        admin.from("responses").select("engine_id, text, no_answer, error, citations(url, domain), mentions(brand_kind, brand_name)").eq("prompt_id", promptId).in("run_id", runIds).eq("no_answer", false).is("error", null).limit(50),
        admin.from("recommendations").select("type, title").eq("project_id", projectId).eq("prompt_id", promptId).neq("status", "dismissed"),
      ]);
      if (rErr) throw new Error(rErr.message); if (eErr) throw new Error(eErr.message);
      const input = buildRecommendationInput({
        prompt: { id: p.id, text: p.text, intent: p.intent, topic: (p.topics as { name: string } | null)?.name ?? null },
        visibility: { overall: v.overall?.visibilityRate ?? null, byEngine: Object.fromEntries(v.byEngine.map((e) => [e.engineId, e.visibilityRate])) },
        responses: (responses ?? []).map((r) => ({ engineId: r.engine_id, text: r.text, citations: r.citations, mentions: r.mentions.map((m) => ({ kind: m.brand_kind as "own" | "competitor", name: m.brand_name })) })),
        brand, sitePages: pagesRes.data ?? [], existing: existing ?? [], competitorAliases,
      });
      const gen = await generateRecommendations(input);
      const evidence: Evidence = {
        prompt_ids: [promptId], visibility_by_engine: input.visibility.byEngine, cited_domains: input.citedDomains, cited_urls: input.citedUrls,
        competitors_mentioned: input.competitorsMentioned, sample_quotes: input.excerpts.slice(0, 3).map((e) => `[${e.engineId}] ${e.text.slice(0, 300)}`),
      };
      await upsertRecommendations(admin, projectId, runId, promptId, gen.accepted, evidence);
      accepted += gen.accepted.length; rejected += gen.rejected.length; costUsd += gen.costUsd;
      if (gen.rejected.length) console.warn(`recommend-project: odrzucone dla ${promptId}:`, gen.rejected);
    }
    const tech = await technicalRules(project.site_url);
    await upsertRecommendations(admin, projectId, runId, null, tech, { prompt_ids: [], visibility_by_engine: {}, cited_domains: [], cited_urls: [], competitors_mentioned: [], sample_quotes: [] });
    if (runId) {
      const { error } = await admin.from("runs").update({ recommendations_cost_usd: costUsd }).eq("id", runId);
      if (error) throw new Error(error.message);
    }
    return { prompts: qualified.length, accepted, rejected, technical: tech.length, costUsd };
  },
});
```
Hook w `run-project.ts` — po udanej agregacji (`!aggregationError`), przed finalnym `update`:
```ts
      if (!aggregationError) await recommendProject.trigger({ projectId, runId, date });
```
(`trigger`, nie `triggerAndWait` — run kończy się od razu, rekomendacje liczą się w tle.)

`actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import type { recommendProject } from "@/trigger/recommend-project";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";

const Status = z.enum(["todo", "doing", "done", "dismissed"]);
export async function setRecommendationStatus(formData: FormData) {
  const project = await getCurrentProject();
  const id = String(formData.get("id")); const status = Status.parse(formData.get("status"));
  if (!isUuid(id)) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recommendations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("project_id", project.id);
  if (error) throw new Error(error.message);
  for (const p of ["/app/recommendations", `/app/recommendations/${id}`, "/app", "/app/prompts"]) revalidatePath(p);
}
export async function refreshRecommendations() {
  const project = await getCurrentProject();
  await tasks.trigger<typeof recommendProject>("recommend-project", { projectId: project.id, runId: null, date: new Date().toISOString().slice(0, 10) });
  revalidatePath("/app/recommendations");
}
```
`scripts/recommend-now.ts` jak `run-now.ts` z `recommend-project` i datą z argumentu (`process.argv[3] ?? dziś`).

- [ ] **Step 4: Uruchom testy — PASS**; tsc, lint, build.
- [ ] **Step 5: Test na żywo** (worker działa, klucze są): `npx tsx --env-file=.env.local scripts/recommend-now.ts 22222222-2222-2222-2222-222222222222 2026-10-12` → w panelu Trigger.dev zadanie `recommend-project` kończy się; w bazie `select type, title, prompt_id is null as global, impact, effort, priority from recommendations order by priority desc;` — oczekiwane: kilka–kilkanaście pozycji, w tym `technical` „Opublikuj plik llms.txt…”. Zapisz koszt (`runs.recommendations_cost_usd` lub z wyniku zadania) w raporcie.
- [ ] **Step 6: Commit**
```bash
git add src/lib/recommend/persist.ts src/lib/recommend/collect.ts src/trigger/recommend-project.ts src/trigger/run-project.ts src/app/app/recommendations/actions.ts scripts/recommend-now.ts tests/recommend/persist.test.ts tests/recommend/collect.test.ts
git commit -m "feat(recommend): recommend-project task, merge-on-fingerprint persistence, run hook and actions"
```

---
### Task 14: Ekran Rekomendacje, szczegół, link z heatmapy, kafel odwrócony na Przeglądzie

**Files:**
- Modify: `src/app/app/recommendations/page.tsx` (zastępuje tymczasowy z Task 4)
- Create: `src/app/app/recommendations/[id]/page.tsx`, `src/app/app/recommendations/RecommendationCard.tsx`, `src/app/app/recommendations/StatusForm.tsx`, `src/lib/recommend/queries.ts`, `src/lib/recommend/labels.ts`
- Modify: `src/app/app/overview/sections.tsx` (`TopRecommendationSlot` → prawdziwe dane), `src/app/app/prompts/page.tsx` (kolumna `counts` → liczba rekomendacji per prompt, link do `/app/recommendations?prompt=<id>`)
- Test: `tests/recommend/labels.test.ts`, `tests/recommend/queries.test.ts`

**Interfaces:**
- Consumes: `Tile`, `TileInverse`, `Rows`, `Row`, `Eyebrow`, `Meta`, `PageHero`, `SectionHead`, `EmptyState`, `Dots`, `Button` (`quiet`, `danger-quiet`) z Task 3; `setRecommendationStatus`, `refreshRecommendations` z Task 13; `Heatmap` prop `counts: Record<string, number>` z Task 6; `getCurrentProject` (cache) z Task 1.
- Produces:
```ts
// labels.ts
export const TYPE_LABEL: Record<RecType, string>   // content_new "Nowa treść", content_improve "Popraw stronę", offsite "Poza stroną", technical "Techniczne", fact_fix "Korekta faktów"
export const STATUS_LABEL: Record<RecStatus, string> // todo "Do zrobienia", doing "W toku", done "Zrobione", dismissed "Odrzucone"
export function effortLabel(e: number): string      // 1–2 "mały", 3 "średni", 4–5 "duży"
export function priorityLabel(p: number): "wysoki" | "średni" | "niski"  // ≥6 wysoki, 3–5 średni, <3 niski  (priority = impact*2 - effort, zakres -3..9)
export type RecType = "content_new" | "content_improve" | "offsite" | "technical" | "fact_fix";
export type RecStatus = "todo" | "doing" | "done" | "dismissed";
// queries.ts
export type RecFilters = { status?: RecStatus | "open"; type?: RecType; prompt?: string }  // "open" = todo|doing (domyślne)
export const listRecommendations = cache(async (supabase, projectId: string, f: RecFilters) => RecommendationRow[])   // order priority desc, updated_at desc; join prompts(text)
export const getRecommendation = cache(async (supabase, projectId: string, id: string) => RecommendationRow & { prompt: { id; text } | null } | null)
export const countRecommendationsByPrompt = cache(async (supabase, projectId: string) => Record<string, number>)   // tylko status todo|doing
export const getTopRecommendation = cache(async (supabase, projectId: string) => RecommendationRow | null)   // najwyższy priority wśród todo
export function applyFilters(rows: RecommendationRow[], f: RecFilters): RecommendationRow[]   // czysta funkcja używana przez listRecommendations (filtrowanie po stronie serwera po pobraniu ≤ 500 wierszy) — testowalna
```

- [ ] **Step 1: Testy**
```ts
// labels.test.ts
import { describe, it, expect } from "vitest";
import { effortLabel, priorityLabel, TYPE_LABEL, STATUS_LABEL } from "@/lib/recommend/labels";
describe("labels", () => {
  it("effort", () => { expect(effortLabel(1)).toBe("mały"); expect(effortLabel(3)).toBe("średni"); expect(effortLabel(5)).toBe("duży"); });
  it("priority", () => { expect(priorityLabel(9)).toBe("wysoki"); expect(priorityLabel(6)).toBe("wysoki"); expect(priorityLabel(5)).toBe("średni"); expect(priorityLabel(2)).toBe("niski"); expect(priorityLabel(-3)).toBe("niski"); });
  it("ma etykiety dla wszystkich typów i statusów", () => { expect(Object.keys(TYPE_LABEL)).toHaveLength(5); expect(Object.keys(STATUS_LABEL)).toHaveLength(4); });
});
```
```ts
// queries.test.ts
import { describe, it, expect } from "vitest";
import { applyFilters } from "@/lib/recommend/queries";
const r = (id: string, status: string, type: string, prompt_id: string | null) => ({ id, status, type, prompt_id, priority: 5 }) as never;
describe("applyFilters", () => {
  const rows = [r("a", "todo", "offsite", "p1"), r("b", "done", "offsite", "p1"), r("c", "doing", "technical", null), r("d", "dismissed", "content_new", "p2")];
  it("domyślnie otwarte (todo|doing)", () => expect(applyFilters(rows, {}).map((x: { id: string }) => x.id)).toEqual(["a", "c"]));
  it("status done", () => expect(applyFilters(rows, { status: "done" }).map((x: { id: string }) => x.id)).toEqual(["b"]));
  it("typ + prompt", () => expect(applyFilters(rows, { status: "open", type: "offsite", prompt: "p1" }).map((x: { id: string }) => x.id)).toEqual(["a"]));
});
```
- [ ] **Step 2: Uruchom — FAIL**
- [ ] **Step 3: Implementacja**

`labels.ts` dokładnie wg Interfaces. `queries.ts`:
```ts
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { RecStatus, RecType } from "./labels";
export type RecFilters = { status?: RecStatus | "open"; type?: RecType; prompt?: string };
export type RecommendationRow = Database["public"]["Tables"]["recommendations"]["Row"] & { prompts: { text: string } | null };
export function applyFilters<T extends { status: string; type: string; prompt_id: string | null }>(rows: T[], f: RecFilters): T[] {
  const status = f.status ?? "open";
  return rows.filter((r) => (status === "open" ? r.status === "todo" || r.status === "doing" : r.status === status) && (!f.type || r.type === f.type) && (!f.prompt || r.prompt_id === f.prompt));
}
export const listRecommendations = cache(async (supabase: SupabaseClient<Database>, projectId: string, f: RecFilters) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(text)").eq("project_id", projectId).order("priority", { ascending: false }).order("updated_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return applyFilters((data ?? []) as RecommendationRow[], f);
});
export const getRecommendation = cache(async (supabase: SupabaseClient<Database>, projectId: string, id: string) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(id, text)").eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});
export const countRecommendationsByPrompt = cache(async (supabase: SupabaseClient<Database>, projectId: string) => {
  const { data, error } = await supabase.from("recommendations").select("prompt_id").eq("project_id", projectId).in("status", ["todo", "doing"]).not("prompt_id", "is", null);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of data ?? []) if (r.prompt_id) out[r.prompt_id] = (out[r.prompt_id] ?? 0) + 1;
  return out;
});
export const getTopRecommendation = cache(async (supabase: SupabaseClient<Database>, projectId: string) => {
  const { data, error } = await supabase.from("recommendations").select("*, prompts(text)").eq("project_id", projectId).eq("status", "todo").order("priority", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RecommendationRow | null;
});
```
`StatusForm.tsx` (server component z formularzami akcji, bez JS):
```tsx
import { setRecommendationStatus } from "./actions";
import { Button } from "@/components/ui/button";
import type { RecStatus } from "@/lib/recommend/labels";
const NEXT: Record<RecStatus, { label: string; status: RecStatus; variant?: "quiet" | "danger-quiet" }[]> = {
  todo: [{ label: "Zaczynam", status: "doing" }, { label: "Odrzuć", status: "dismissed", variant: "danger-quiet" }],
  doing: [{ label: "Zrobione", status: "done" }, { label: "Wróć do listy", status: "todo", variant: "quiet" }],
  done: [{ label: "Otwórz ponownie", status: "todo", variant: "quiet" }],
  dismissed: [{ label: "Przywróć", status: "todo", variant: "quiet" }],
};
export function StatusForm({ id, status }: { id: string; status: RecStatus }) {
  return (<div className="flex flex-wrap gap-2">{NEXT[status].map((n) => (
    <form key={n.status} action={setRecommendationStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={n.status} />
      <Button type="submit" variant={n.variant ?? "default"} size="sm">{n.label}</Button></form>))}</div>);
}
```
`RecommendationCard.tsx` — kafel: góra `Eyebrow` = `TYPE_LABEL[type]` + `Meta` "priorytet wysoki · wysiłek mały"; tytuł `font-display text-[19px] font-semibold tracking-[-0.01em]`; `summary` w `text-t1 text-[14px]`; pod spodem, jeśli `prompts?.text`: `Meta` „Pytanie: …” (obcięte do 90 zn.); `target_url` jako link mono 12px (zewnętrzny z `rel="noreferrer"`, wewnętrzny zwykły); dół: `StatusForm` + link „Szczegóły →” do `/app/recommendations/${id}`. Prop `inverse?: boolean` → `TileInverse` (tekst `text-white/70`, przyciski białe/`border-white/30`); pierwszy kafel na liście (bez filtrów, status open) renderowany jako inverse.

`page.tsx` (lista): `searchParams` Promise (Next 16: `const sp = await searchParams`), filtry z `status|type|prompt`; `PageHero` eyebrow „Rekomendacje” + tytuł „Co zrobić, żeby asystenci nas polecali” + opis „Z odpowiedzi AI i mapy Waszej strony. Nowe po każdym runie.”; pasek filtrów = linki (`<Link>`) w stylu chipów (`rounded-[8px] border border-line px-3 py-1 text-[13px]`, aktywny `bg-ink text-white`) dla statusu: Otwarte / Zrobione / Odrzucone; typu: Wszystkie + 5 typów; gdy `prompt` w URL → chip „Pytanie: …” z „×”. Przycisk „Odśwież rekomendacje” = `<form action={refreshRecommendations}>` z `Button variant="quiet"`; gdy brak `site_url` w projekcie → przycisk wyłączony z `Meta` „Ustaw adres strony w Ustawieniach”. Lista: `grid gap-4 md:grid-cols-2`; pusta → `EmptyState` „Brak rekomendacji. Uruchom run albo kliknij Odśwież.”. Wszystko w `Suspense` z `TileSkeleton` ×4.

`[id]/page.tsx`: `notFound()` gdy brak; nagłówek jak karta (inverse), sekcje w `Tile`: „Kroki” (ol z numerami mono), „Zarys treści” (gdy `suggested_outline`), „Dlaczego” (`rationale_pl`), „Dowody” — `Rows`: pytania (link do promptu w heatmapie `/app/prompts#<promptId>`), widoczność per silnik (`pct`), cytowane domeny z licznikami, konkurenci, `sample_quotes` jako `blockquote` mono 12px; `StatusForm` na dole; `Meta` z datami (`fmtDate(created_at)`, `fmtDate(updated_at)`).

`sections.tsx` `TopRecommendationSlot`: `getTopRecommendation` → gdy null → `Tile` z `EmptyState` „Brak otwartych rekomendacji”; inaczej `RecommendationCard inverse` + link „Wszystkie rekomendacje →”.

`prompts/page.tsx`: `countRecommendationsByPrompt` równolegle z resztą (`Promise.all`), przekazane do `Heatmap counts`; komórka licznika to `<Link href={`/app/recommendations?prompt=${id}`}>` z liczbą (mono) lub „—”.

- [ ] **Step 4: Uruchom — PASS**; tsc, lint, build.
- [ ] **Step 5: Smoke w przeglądarce** (`npm run start:prod`): `/app/recommendations` pokazuje kafle z Task 13 Step 5, pierwszy odwrócony; zmiana statusu działa bez przeładowania strony przez JS (formularz server action); `/app/recommendations?type=technical` filtruje; szczegół pokazuje dowody; heatmapa ma liczby w kolumnie rekomendacji; Przegląd pokazuje kafel odwrócony. Zrzuty do `docs/superpowers/screens/` nie są wymagane; w raporcie opisz, co widać.
- [ ] **Step 6: Commit**
```bash
git add src/app/app/recommendations src/lib/recommend/queries.ts src/lib/recommend/labels.ts src/app/app/overview/sections.tsx src/app/app/prompts/page.tsx tests/recommend/labels.test.ts tests/recommend/queries.test.ts
git commit -m "feat(ui): recommendations list, detail, heatmap counts and overview slot"
```

---

### Task 15: Pomiar szybkości, README, weryfikacja końcowa

**Files:**
- Modify: `README.md` (sekcje: „Szybkość: dev vs prod”, „Rekomendacje”, „Mapa strony”, nowe skrypty i zmienne), `docs/superpowers/calibration/README.md` (jeden akapit: rekomendacje też kalibrujemy — czy wskazane źródła naprawdę są cytowane)
- Create: `scripts/measure-ttfb.ts`

**Interfaces:** brak nowych.

- [ ] **Step 1: Skrypt pomiaru**
```ts
// scripts/measure-ttfb.ts — `npx tsx scripts/measure-ttfb.ts http://localhost:3000 <cookie-header>`
// Mierzy TTFB i czas pełnej odpowiedzi dla /app, /app/prompts, /app/responses, /app/recommendations, /app/settings (3 próby, mediana), wypisuje tabelę.
const [base = "http://localhost:3000", cookie = ""] = process.argv.slice(2);
const paths = ["/app", "/app/prompts", "/app/responses", "/app/recommendations", "/app/settings"];
async function once(path: string) {
  const t0 = performance.now();
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const ttfb = performance.now() - t0; await res.arrayBuffer();
  return { status: res.status, ttfb, total: performance.now() - t0 };
}
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const p of paths) {
  const runs = [await once(p), await once(p), await once(p)];
  console.log(`${p.padEnd(24)} ${runs[0].status}  TTFB ${Math.round(median(runs.map((r) => r.ttfb)))} ms  total ${Math.round(median(runs.map((r) => r.total)))} ms`);
}
```
Cookie: z DevTools → Application → Cookies → skopiuj nagłówek `sb-127-auth-token…` (lub przekaż pusty i zmierz redirect do `/login`, który i tak pokazuje narzut serwera). **Nie wklejaj cookie do commitów ani raportów.**
- [ ] **Step 2: Pomiar** — `npm run build && npm run start:prod`, potem skrypt. Oczekiwane (spec): każda strona TTFB < 500 ms przy lokalnym Supabase, `/app` total < 1000 ms. Jeśli nie — profiluj (`console.time` wokół zapytań w `queries.ts`), popraw i zmierz ponownie. Wynik tabelą do raportu i do README (sekcja „Szybkość”, z datą i że to lokalny Supabase).
- [ ] **Step 3: README** — dodaj: `npm run start:prod` (build + start, „tak sprawdzaj szybkość, dev kompiluje przy pierwszym wejściu”), `scripts/crawl-now.ts`, `scripts/recommend-now.ts`, `scripts/measure-ttfb.ts`; zmienne `ANTHROPIC_RECOMMENDER_MODEL` (opcjonalna), ustawienia `site_url`, `low_visibility_threshold`; opis przepływu: run → agregacja → `recommend-project` (koszt ~0.05–0.15 USD na pytanie z Opus 5.5; `runs.recommendations_cost_usd`); typy rekomendacji i statusy; zasada „rekomendacja bez konkretnego artefaktu jest odrzucana”.
- [ ] **Step 4: Weryfikacja końcowa**
```bash
npx tsc --noEmit && npm run lint && npm test -- --run && npm run build
```
Wszystko zielone. Ręcznie: login → Przegląd (kafle PSAI, skeletony przy wolnej sieci — DevTools throttling „Slow 3G” pokazuje skeleton zamiast pustej strony) → Prompty (heatmapa monochrom, wszystkie prompty, licznik rekomendacji) → Odpowiedzi (paging „Starsze →”) → Rekomendacje (filtry, status) → Ustawienia (site_url zapisany, próg).
- [ ] **Step 5: Commit i tag**
```bash
git add README.md docs/superpowers/calibration/README.md scripts/measure-ttfb.ts
git commit -m "docs: performance numbers, recommendations and crawl docs; ttfb script"
git tag v0.2.0-ui-recs
```

---

## Kolejność i zależności

C (szybkość): Task 1 → A (interfejs): Tasks 2 → 3 → 4 → 5 → 6 → 7 → 8 → B (rekomendacje): 9 → 10 → 11 → 12 → 13 → 14 → 15. Task 8 zależy od migracji z Task 9 (kolumny `site_url`, `low_visibility_threshold`) — **wykonaj Task 9 przed Task 8** (kolejność wykonania: 1, 2, 3, 4, 5, 6, 7, 9, 8, 10, 11, 12, 13, 14, 15). Task 14 zastępuje tymczasową stronę z Task 4.
