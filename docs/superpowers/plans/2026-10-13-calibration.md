# Kalibracja w aplikacji — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekran kalibracji: ręczne wyniki 10 pytań × 3 interfejsy porównane z ostatnim zakończonym pomiarem — zgodność per silnik, lista rozbieżności z linkami do odpowiedzi API i akcją „dodaj alias”.

**Architecture:** Dwie tabele (`calibrations`, `calibration_checks`) z RLS; porównanie liczone na żądanie czystymi funkcjami z `responses`/`mentions`/`citations` pomiaru; strony w App Router na komponentach PSAI; zapis wierszy server action przy każdej zmianie pola.

**Tech Stack:** Next.js 16.4 (App Router, server actions, `params`/`searchParams` jako Promise), React 19, Supabase (RLS, `@supabase/ssr`), Zod 4, Vitest 5, Tailwind v4 + tokeny PSAI.

**Spec:** `docs/superpowers/specs/2026-10-13-calibration-design.md` (nadrzędny).

## Global Constraints

- Przed pisaniem kodu Next.js przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/` (wymóg `AGENTS.md`).
- Styl PSAI: tylko tokeny motywu (`text-teal`, `text-red`, `bg-s1`, `text-t1`, `border-line`, `bg-ink`…), kolor tylko ze znaczeniem, bez pigułek i gradientów; język polski, sentence case, czasowniki w trybie rozkazującym na przyciskach, liczebniki przez `pluralPl` (`src/lib/format/plural.ts`).
- Każde zapytanie Supabase sprawdza `{ error }` i rzuca; zapisy scoped `.eq("project_id", project.id)`; jedno `getCurrentProject()` (cache) na żądanie.
- Silniki kalibracji: dokładnie `openai` („ChatGPT”), `perplexity` („Perplexity”), `google_ai_overview` („Google AI Overview”). Gemini poza zakresem.
- Liczba pytań w sesji: 10 (kluczowe najpierw, uzupełnienie losowe; kluczowych > 10 → pierwsze 10 wg `created_at`).
- Progi koloru zgodności: teal ≥ 0.8, szarość 0.6–0.79, czerwień < 0.6.
- Brak nowych kosztów API; migracje tylko `npx supabase migration up --local` (nigdy `db reset`); nie dotykaj kontenerów `*Platforma*`.
- Commity po angielsku, zakończone linią `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; przed commitem `npm test -- --run && npx tsc --noEmit && npm run lint`.

## Review Focus

1. **Pytanie × silnik bez ważnej odpowiedzi API** (wszystkie próbki z `error` lub `no_answer`, albo silnik wyłączony): wiersz „brak danych”, nie liczy się do zgodności ani do rozbieżności. Test w Task 2 (`apiOutcome` + `agreementByEngine`).
2. **Wiersz „nie sprawdzono”** (`manual_mentioned = null`): nie liczy się do zgodności; zgodność = `zgodne / sprawdzone`, a nie `/ wszystkie`. Test w Task 2.
3. **Zapis do zamkniętej kalibracji lub cudzej sesji** (stara karta, podrobiony `id`): akcja odrzuca bez zmian w bazie. Test w Task 3 (`assertOpenSession`).
4. **Alias, który już jest w aliasach w innej pisowni** („polska szkoła ai” vs „Polska Szkola AI”): nie dodaje duplikatu. Test w Task 3 (`mergeAlias`).
5. **Adres cytowania w innej formie** (`https://www.parp.gov.pl/x`, `PARP.gov.pl`, śmieci): porównanie po domenie bez `www.`, bez wielkości liter; nieprawidłowe adresy pomijane w porównaniu. Test w Task 2 (`citationCoverage`).

---

## Struktura plików

```
supabase/migrations/20261013030000_calibrations.sql   # tabele + RLS (Task 1)
src/lib/db-types.ts                                   # regeneracja (Task 1)
src/lib/calibration/engines.ts                        # CALIBRATION_ENGINES + etykiety (Task 2)
src/lib/calibration/compare.ts                        # apiOutcome, compareRow, agreementByEngine, citationCoverage, calibrationTone (Task 2)
src/lib/calibration/select.ts                         # selectPrompts (Task 2)
src/lib/calibration/session.ts                        # assertOpenSession, mergeAlias, parseUrls (Task 3)
src/lib/calibration/queries.ts                        # listCalibrations, getCalibration (Task 3)
src/app/app/calibration/actions.ts                    # createCalibration, saveCheck, closeCalibration, addAliasFromCalibration (Task 3)
src/app/app/calibration/page.tsx                      # lista + „Nowa kalibracja” (Task 4)
src/app/app/calibration/[id]/page.tsx                 # wyniki + formularz (Task 4)
src/app/app/calibration/CheckRow.tsx                  # kliencki wiersz z autosave (Task 4)
src/app/app/calibration/ResultsSection.tsx            # zgodność + rozbieżności + cytowania (Task 4)
src/app/app/settings/page.tsx                         # sekcja z linkiem (Task 4)
tests/calibration/*.test.ts(x), tests/db/rls.test.ts  # testy
README.md, docs/superpowers/calibration/README.md     # dokumentacja (Task 5)
```

---

### Task 1: Schemat danych kalibracji

**Files:**
- Create: `supabase/migrations/20261013030000_calibrations.sql`
- Modify: `src/lib/db-types.ts` (regeneracja), `tests/db/rls.test.ts`

**Interfaces (Produces):** tabele `calibrations` (`id, project_id, run_id, status 'open'|'closed', created_by, created_at, closed_at`) i `calibration_checks` (`id, calibration_id, project_id, prompt_id, engine_id, manual_mentioned boolean|null, manual_urls text[], manual_alias text|null, updated_at`, unique `(calibration_id, prompt_id, engine_id)`); typy `Tables<"calibrations">`, `Tables<"calibration_checks">`.

- [ ] **Step 1: Migracja** — utwórz plik dokładnie ze spec (sekcja „Dane”):

```sql
create table if not exists calibrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  run_id uuid references runs(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists calibrations_project on calibrations(project_id, created_at desc);

create table if not exists calibration_checks (
  id uuid primary key default gen_random_uuid(),
  calibration_id uuid not null references calibrations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine_id text not null check (engine_id in ('openai','perplexity','google_ai_overview')),
  manual_mentioned boolean,
  manual_urls text[] not null default '{}',
  manual_alias text,
  updated_at timestamptz not null default now(),
  unique (calibration_id, prompt_id, engine_id)
);

alter table calibrations enable row level security;
alter table calibration_checks enable row level security;
drop policy if exists calibrations_member on calibrations;
create policy calibrations_member on calibrations for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
drop policy if exists calibration_checks_member on calibration_checks;
create policy calibration_checks_member on calibration_checks for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
```

- [ ] **Step 2: Zastosuj i wygeneruj typy**

```bash
npx supabase migration up --local
npx supabase gen types typescript --local > src/lib/db-types.ts
git diff --stat src/lib/db-types.ts
```
Expected: diff tylko dodaje dwie tabele.

- [ ] **Step 3: Test RLS** — dopisz do `tests/db/rls.test.ts` przypadek wzorowany na istniejącym „anon i nie-członek nie widzą rekomendacji, członek org widzi”: superuser wstawia `calibrations` dla projektu seed i jeden `calibration_checks` (prompt z seed, `engine_id='openai'`), asercje: anon 0 wierszy w obu tabelach, nie-członek 0, członek 1; sprzątanie w `finally` (`delete from calibrations where id = …`, kaskada usuwa checks).

- [ ] **Step 4: Uruchom**

```bash
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- --run tests/db
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013030000_calibrations.sql src/lib/db-types.ts tests/db/rls.test.ts
git commit -m "feat(db): calibrations and calibration_checks with RLS"
```

---

### Task 2: Logika porównania i wyboru pytań

**Files:**
- Create: `src/lib/calibration/engines.ts`, `src/lib/calibration/compare.ts`, `src/lib/calibration/select.ts`
- Test: `tests/calibration/compare.test.ts`, `tests/calibration/select.test.ts`

**Interfaces (Produces):**
```ts
// engines.ts
export const CALIBRATION_ENGINES = ["openai", "perplexity", "google_ai_overview"] as const;
export type CalibrationEngine = (typeof CALIBRATION_ENGINES)[number];
export const CALIBRATION_ENGINE_LABEL: Record<CalibrationEngine, string>; // ChatGPT, Perplexity, Google AI Overview
export function isCalibrationEngine(v: string): v is CalibrationEngine;
// compare.ts
export type ApiResponse = { id: string; error: string | null; no_answer: boolean; ownMention: boolean; domains: string[] };
export type ApiOutcome = "mentioned" | "absent" | "no_data";
export function apiOutcome(responses: ApiResponse[]): ApiOutcome;
export type RowResult = "match" | "api_only" | "manual_only" | "skipped";
export function compareRow(manual: boolean | null, api: ApiOutcome): RowResult; // null or no_data → skipped
export type CalibrationRow = { promptId: string; engineId: CalibrationEngine; result: RowResult };
export type EngineAgreement = { engineId: CalibrationEngine; agreed: number; checked: number; rate: number | null };
export function agreementByEngine(rows: CalibrationRow[]): EngineAgreement[]; // always 3 entries, CALIBRATION_ENGINES order
export function normalizeDomain(input: string): string | null; // URL or bare domain → lowercase host without www., null if invalid
export function citationCoverage(manualUrls: string[], apiDomains: string[]): { matched: number; total: number }; // total = valid manual domains (deduped)
export type CalibrationTone = "good" | "weak" | "bad";
export function calibrationTone(rate: number): CalibrationTone; // ≥0.8 good, ≥0.6 weak, else bad
// select.ts
export function selectPrompts<T extends { id: string; is_key: boolean; created_at: string }>(prompts: T[], n?: number, rng?: () => number): T[];
```

- [ ] **Step 1: Testy** — `tests/calibration/compare.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { apiOutcome, compareRow, agreementByEngine, normalizeDomain, citationCoverage, calibrationTone, type ApiResponse, type CalibrationRow } from "@/lib/calibration/compare";

const r = (p: Partial<ApiResponse>): ApiResponse => ({ id: "x", error: null, no_answer: false, ownMention: false, domains: [], ...p });

describe("apiOutcome", () => {
  it("wzmianka w co najmniej jednej ważnej próbce", () => expect(apiOutcome([r({}), r({ ownMention: true })])).toBe("mentioned"));
  it("ważne próbki bez wzmianki", () => expect(apiOutcome([r({}), r({})])).toBe("absent"));
  it("tylko błędy i brak odpowiedzi → brak danych", () => expect(apiOutcome([r({ error: "boom", ownMention: true }), r({ no_answer: true })])).toBe("no_data"));
  it("brak odpowiedzi w ogóle → brak danych", () => expect(apiOutcome([])).toBe("no_data"));
});

describe("compareRow", () => {
  it.each([
    [true, "mentioned", "match"], [false, "absent", "match"],
    [false, "mentioned", "api_only"], [true, "absent", "manual_only"],
    [null, "mentioned", "skipped"], [true, "no_data", "skipped"], [false, "no_data", "skipped"],
  ] as const)("%s / %s → %s", (m, a, out) => expect(compareRow(m, a)).toBe(out));
});

describe("agreementByEngine", () => {
  it("zgodność = zgodne / sprawdzone, pomija skipped, zawsze 3 silniki", () => {
    const rows: CalibrationRow[] = [
      { promptId: "p1", engineId: "openai", result: "match" },
      { promptId: "p2", engineId: "openai", result: "api_only" },
      { promptId: "p3", engineId: "openai", result: "skipped" },
      { promptId: "p1", engineId: "perplexity", result: "match" },
    ];
    expect(agreementByEngine(rows)).toEqual([
      { engineId: "openai", agreed: 1, checked: 2, rate: 0.5 },
      { engineId: "perplexity", agreed: 1, checked: 1, rate: 1 },
      { engineId: "google_ai_overview", agreed: 0, checked: 0, rate: null },
    ]);
  });
});

describe("citationCoverage", () => {
  it("po domenie bez www i wielkości liter, śmieci pominięte, duplikaty raz", () => {
    expect(normalizeDomain("https://www.PARP.gov.pl/x?y=1")).toBe("parp.gov.pl");
    expect(normalizeDomain("parp.gov.pl/kurs")).toBe("parp.gov.pl");
    expect(normalizeDomain("to nie jest adres")).toBeNull();
    expect(citationCoverage(["https://www.parp.gov.pl/a", "PARP.gov.pl", "śmieci", "https://ey.com/x"], ["parp.gov.pl", "wikipedia.org"]))
      .toEqual({ matched: 1, total: 2 });
  });
});

describe("calibrationTone", () => {
  it.each([[1, "good"], [0.8, "good"], [0.79, "weak"], [0.6, "weak"], [0.59, "bad"], [0, "bad"]] as const)("%s → %s", (v, t) => expect(calibrationTone(v)).toBe(t));
});
```

`tests/calibration/select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectPrompts } from "@/lib/calibration/select";

const p = (id: string, is_key: boolean, created_at = "2026-10-01T00:00:00Z") => ({ id, is_key, created_at });

describe("selectPrompts", () => {
  it("kluczowe najpierw, uzupełnienie do n deterministycznie przy rng", () => {
    const list = [p("a", false), p("k1", true), p("b", false), p("k2", true), p("c", false)];
    const out = selectPrompts(list, 3, () => 0);
    expect(out.map((x) => x.id).slice(0, 2)).toEqual(["k1", "k2"]);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((x) => x.id)).size).toBe(3);
  });
  it("więcej kluczowych niż n → pierwsze n wg created_at", () => {
    const list = [p("k3", true, "2026-10-03T00:00:00Z"), p("k1", true, "2026-10-01T00:00:00Z"), p("k2", true, "2026-10-02T00:00:00Z")];
    expect(selectPrompts(list, 2).map((x) => x.id)).toEqual(["k1", "k2"]);
  });
  it("mniej pytań niż n → wszystkie", () => {
    expect(selectPrompts([p("a", false), p("b", true)], 10)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL** (`npm test -- --run tests/calibration`, brak modułów).

- [ ] **Step 3: Implementacja**

`engines.ts`:
```ts
export const CALIBRATION_ENGINES = ["openai", "perplexity", "google_ai_overview"] as const;
export type CalibrationEngine = (typeof CALIBRATION_ENGINES)[number];
export const CALIBRATION_ENGINE_LABEL: Record<CalibrationEngine, string> = { openai: "ChatGPT", perplexity: "Perplexity", google_ai_overview: "Google AI Overview" };
export function isCalibrationEngine(v: string): v is CalibrationEngine {
  return (CALIBRATION_ENGINES as readonly string[]).includes(v);
}
```

`compare.ts`:
```ts
import { CALIBRATION_ENGINES, type CalibrationEngine } from "./engines";

export type ApiResponse = { id: string; error: string | null; no_answer: boolean; ownMention: boolean; domains: string[] };
export type ApiOutcome = "mentioned" | "absent" | "no_data";
export type RowResult = "match" | "api_only" | "manual_only" | "skipped";
export type CalibrationRow = { promptId: string; engineId: CalibrationEngine; result: RowResult };
export type EngineAgreement = { engineId: CalibrationEngine; agreed: number; checked: number; rate: number | null };
export type CalibrationTone = "good" | "weak" | "bad";

export function apiOutcome(responses: ApiResponse[]): ApiOutcome {
  const valid = responses.filter((r) => !r.error && !r.no_answer);
  if (valid.length === 0) return "no_data";
  return valid.some((r) => r.ownMention) ? "mentioned" : "absent";
}

export function compareRow(manual: boolean | null, api: ApiOutcome): RowResult {
  if (manual === null || api === "no_data") return "skipped";
  const apiYes = api === "mentioned";
  if (manual === apiYes) return "match";
  return apiYes ? "api_only" : "manual_only";
}

export function agreementByEngine(rows: CalibrationRow[]): EngineAgreement[] {
  return CALIBRATION_ENGINES.map((engineId) => {
    const own = rows.filter((r) => r.engineId === engineId && r.result !== "skipped");
    const agreed = own.filter((r) => r.result === "match").length;
    return { engineId, agreed, checked: own.length, rate: own.length ? agreed / own.length : null };
  });
}

export function normalizeDomain(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function citationCoverage(manualUrls: string[], apiDomains: string[]): { matched: number; total: number } {
  const manual = new Set(manualUrls.map(normalizeDomain).filter((d): d is string => d !== null));
  const api = new Set(apiDomains.map((d) => normalizeDomain(d)).filter((d): d is string => d !== null));
  let matched = 0;
  for (const d of manual) if (api.has(d)) matched++;
  return { matched, total: manual.size };
}

export function calibrationTone(rate: number): CalibrationTone {
  return rate >= 0.8 ? "good" : rate >= 0.6 ? "weak" : "bad";
}
```

`select.ts`:
```ts
export function selectPrompts<T extends { id: string; is_key: boolean; created_at: string }>(prompts: T[], n = 10, rng: () => number = Math.random): T[] {
  const byDate = (a: T, b: T) => a.created_at.localeCompare(b.created_at);
  const keys = prompts.filter((p) => p.is_key).sort(byDate);
  if (keys.length >= n) return keys.slice(0, n);
  const rest = prompts.filter((p) => !p.is_key).sort(byDate);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...keys, ...rest.slice(0, n - keys.length)];
}
```

- [ ] **Step 4: Uruchom — PASS** (`npm test -- --run tests/calibration`), potem `npx tsc --noEmit && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calibration tests/calibration
git commit -m "feat(calibration): comparison and prompt selection logic"
```

---

### Task 3: Zapytania i akcje

**Files:**
- Create: `src/lib/calibration/session.ts`, `src/lib/calibration/queries.ts`, `src/app/app/calibration/actions.ts`
- Test: `tests/calibration/session.test.ts`, `tests/calibration/queries.test.ts`

**Interfaces:**
- Consumes: Task 1 tabele; Task 2 `selectPrompts`, `apiOutcome`, `compareRow`, `CALIBRATION_ENGINES`, `isCalibrationEngine`, `ApiResponse`; istniejące `getCurrentProject` (`src/lib/workspace.ts`), `createServerSupabase` (`src/lib/supabase/server.ts`), `isUuid` (`src/lib/validation/uuid.ts`), `foldText` (`src/lib/extract/normalize.ts`).
- Produces:
```ts
// session.ts
export function assertOpenSession(s: { status: string } | null): asserts s is { status: "open" };   // throws "Kalibracja zamknięta lub nie istnieje"
export function mergeAlias(aliases: string[], alias: string): string[] | null;                       // null when empty or already present (foldText compare)
export function parseUrls(text: string): string[];                                                     // split by newline, trim, drop empty, max 20
// queries.ts
export type CalibrationListItem = { id: string; status: "open" | "closed"; created_at: string; run_started_at: string | null; agreement: EngineAgreement[] };
export const listCalibrations: (projectId: string) => Promise<CalibrationListItem[]>;
export type CalibrationCheckView = { id: string; promptId: string; promptText: string; engineId: CalibrationEngine; manualMentioned: boolean | null; manualUrls: string[]; manualAlias: string | null; api: ApiOutcome; apiResponseId: string | null; apiDomains: string[]; result: RowResult };
export type CalibrationView = { id: string; status: "open" | "closed"; created_at: string; closed_at: string | null; run: { id: string; started_at: string } | null; checks: CalibrationCheckView[] };
export const getCalibration: (projectId: string, id: string) => Promise<CalibrationView | null>;
export const getLatestDoneRun: (projectId: string) => Promise<{ id: string; started_at: string } | null>;
// actions.ts ("use server")
export async function createCalibration(): Promise<void>;            // redirect(`/app/calibration/${id}`)
export async function saveCheck(formData: FormData): Promise<void>;  // fields: id, mentioned ("yes"|"no"|"unknown"), urls, alias
export async function closeCalibration(formData: FormData): Promise<void>; // field: id
export async function addAliasFromCalibration(formData: FormData): Promise<void>; // fields: calibrationId, alias
```

- [ ] **Step 1: Testy czystych funkcji** — `tests/calibration/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertOpenSession, mergeAlias, parseUrls } from "@/lib/calibration/session";

describe("assertOpenSession", () => {
  it("rzuca dla zamkniętej i brakującej", () => {
    expect(() => assertOpenSession(null)).toThrow(/zamknięta lub nie istnieje/);
    expect(() => assertOpenSession({ status: "closed" })).toThrow(/zamknięta lub nie istnieje/);
    expect(() => assertOpenSession({ status: "open" })).not.toThrow();
  });
});

describe("mergeAlias", () => {
  it("dodaje nowy, odrzuca pusty i duplikat w innej pisowni", () => {
    expect(mergeAlias(["PSAI"], "Polska Szkoła Sztucznej Inteligencji")).toEqual(["PSAI", "Polska Szkoła Sztucznej Inteligencji"]);
    expect(mergeAlias(["Polska Szkola AI"], "  polska szkoła ai ")).toBeNull();
    expect(mergeAlias(["PSAI"], "   ")).toBeNull();
  });
});

describe("parseUrls", () => {
  it("dzieli po liniach, przycina, pomija puste, max 20", () => {
    expect(parseUrls(" https://a.pl \n\n b.pl\r\n")).toEqual(["https://a.pl", "b.pl"]);
    expect(parseUrls(Array.from({ length: 30 }, (_, i) => `x${i}.pl`).join("\n"))).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Implementacja `session.ts`**

```ts
import { foldText } from "@/lib/extract/normalize";

export function assertOpenSession(s: { status: string } | null): asserts s is { status: "open" } {
  if (!s || s.status !== "open") throw new Error("Kalibracja zamknięta lub nie istnieje");
}

export function mergeAlias(aliases: string[], alias: string): string[] | null {
  const a = alias.trim().replace(/\s+/g, " ");
  if (!a) return null;
  const key = foldText(a);
  if (aliases.some((x) => foldText(x.trim()) === key)) return null;
  return [...aliases, a];
}

export function parseUrls(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
```

- [ ] **Step 3: `queries.ts`** (server-only, `React.cache`, klient tworzony wewnątrz, klucz = prymitywy):

```ts
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { isCalibrationEngine, type CalibrationEngine } from "./engines";
import { apiOutcome, compareRow, agreementByEngine, type ApiOutcome, type ApiResponse, type RowResult, type EngineAgreement } from "./compare";

export type CalibrationListItem = { id: string; status: "open" | "closed"; created_at: string; run_started_at: string | null; agreement: EngineAgreement[] };
export type CalibrationCheckView = { id: string; promptId: string; promptText: string; engineId: CalibrationEngine; manualMentioned: boolean | null; manualUrls: string[]; manualAlias: string | null; api: ApiOutcome; apiResponseId: string | null; apiDomains: string[]; result: RowResult };
export type CalibrationView = { id: string; status: "open" | "closed"; created_at: string; closed_at: string | null; run: { id: string; started_at: string } | null; checks: CalibrationCheckView[] };

export const getLatestDoneRun = cache(async (projectId: string) => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("runs").select("id, started_at").eq("project_id", projectId).eq("status", "done").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getLatestDoneRun: ${error.message}`);
  return data;
});

async function apiByPair(projectId: string, runId: string): Promise<Map<string, ApiResponse[]>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("responses")
    .select("id, prompt_id, engine_id, error, no_answer, mentions(brand_kind), citations(domain)")
    .eq("project_id", projectId).eq("run_id", runId).limit(1000);
  if (error) throw new Error(`calibration responses: ${error.message}`);
  const map = new Map<string, ApiResponse[]>();
  for (const r of data ?? []) {
    const key = `${r.prompt_id}:${r.engine_id}`;
    const list = map.get(key) ?? [];
    list.push({ id: r.id, error: r.error, no_answer: r.no_answer, ownMention: (r.mentions ?? []).some((m) => m.brand_kind === "own"), domains: (r.citations ?? []).map((c) => c.domain) });
    map.set(key, list);
  }
  return map;
}

export const getCalibration = cache(async (projectId: string, id: string): Promise<CalibrationView | null> => {
  const supabase = await createServerSupabase();
  const { data: cal, error } = await supabase
    .from("calibrations").select("id, status, created_at, closed_at, run_id, runs(id, started_at)")
    .eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCalibration: ${error.message}`);
  if (!cal) return null;
  const { data: checks, error: cErr } = await supabase
    .from("calibration_checks").select("id, prompt_id, engine_id, manual_mentioned, manual_urls, manual_alias, prompts(text, created_at)")
    .eq("project_id", projectId).eq("calibration_id", id);
  if (cErr) throw new Error(`getCalibration checks: ${cErr.message}`);
  const api = cal.run_id ? await apiByPair(projectId, cal.run_id) : new Map<string, ApiResponse[]>();
  const order = (e: string) => ["openai", "perplexity", "google_ai_overview"].indexOf(e);
  const views: CalibrationCheckView[] = (checks ?? [])
    .filter((c) => isCalibrationEngine(c.engine_id))
    .map((c) => {
      const responses = api.get(`${c.prompt_id}:${c.engine_id}`) ?? [];
      const outcome = apiOutcome(responses);
      const valid = responses.filter((r) => !r.error && !r.no_answer);
      const pick = valid.find((r) => r.ownMention) ?? valid[0] ?? responses[0] ?? null;
      return {
        promptCreated: c.prompts?.created_at ?? "",
        id: c.id, promptId: c.prompt_id, promptText: c.prompts?.text ?? "", engineId: c.engine_id as CalibrationEngine,
        manualMentioned: c.manual_mentioned, manualUrls: c.manual_urls, manualAlias: c.manual_alias,
        api: outcome, apiResponseId: pick?.id ?? null, apiDomains: valid.flatMap((r) => r.domains),
        result: compareRow(c.manual_mentioned, outcome),
      };
    })
    .sort((a, b) => a.promptCreated.localeCompare(b.promptCreated) || a.promptId.localeCompare(b.promptId) || order(a.engineId) - order(b.engineId))
    .map(({ promptCreated: _promptCreated, ...v }) => v);
  const run = cal.runs ? { id: cal.runs.id, started_at: cal.runs.started_at } : null;
  return { id: cal.id, status: cal.status as "open" | "closed", created_at: cal.created_at, closed_at: cal.closed_at, run, checks: views };
});

// Lista ma max 24 pozycje (2 lata miesięcznych kalibracji), więc wywołanie getCalibration per pozycja jest akceptowalne; to ekran używany raz w miesiącu.
export const listCalibrations = cache(async (projectId: string): Promise<CalibrationListItem[]> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("calibrations").select("id, status, created_at, runs(started_at)")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(24);
  if (error) throw new Error(`listCalibrations: ${error.message}`);
  const items: CalibrationListItem[] = [];
  for (const c of data ?? []) {
    const view = await getCalibration(projectId, c.id);
    items.push({ id: c.id, status: c.status as "open" | "closed", created_at: c.created_at, run_started_at: c.runs?.started_at ?? null,
      agreement: agreementByEngine((view?.checks ?? []).map((v) => ({ promptId: v.promptId, engineId: v.engineId, result: v.result }))) });
  }
  return items;
});
```

Sortowanie grupuje wiersze pytania razem: najpierw `prompts.created_at`, potem `prompt_id` (remis), potem kolejność silników `openai, perplexity, google_ai_overview`. Jeśli lint zgłosi nieużytą zmienną w destrukturyzacji, użyj istniejącej konwencji repo (`_`-prefiks lub `// eslint-disable-next-line @typescript-eslint/no-unused-vars`).

- [ ] **Step 4: Test `queries.ts`** — `tests/calibration/queries.test.ts` z fałszywym klientem (`vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => fake }))`, wzorzec: `tests/metrics/queries.test.ts`): (a) wiersz z próbką z błędem i próbką ze wzmianką → `api: "mentioned"`, `apiResponseId` = id próbki ze wzmianką; (b) brak odpowiedzi dla pary → `api: "no_data"`, `result: "skipped"`; (c) kalibracja innego projektu → `null` (fałszywy klient zwraca `null` dla `maybeSingle` gdy `project_id` się nie zgadza); (d) kolejność: dwa pytania × trzy silniki zgrupowane; (e) `{ error }` z dowolnego zapytania → wyjątek.

- [ ] **Step 5: `actions.ts`** (server actions; przeczytaj przewodnik o formularzach i `redirect` w `node_modules/next/dist/docs/`):

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject, requireUser } from "@/lib/workspace";
import { isUuid } from "@/lib/validation/uuid";
import { selectPrompts } from "@/lib/calibration/select";
import { CALIBRATION_ENGINES } from "@/lib/calibration/engines";
import { assertOpenSession, mergeAlias, parseUrls } from "@/lib/calibration/session";
import { getLatestDoneRun } from "@/lib/calibration/queries";

async function loadSession(projectId: string, id: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("calibrations").select("id, status").eq("project_id", projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createCalibration() {
  const project = await getCurrentProject();
  const { user } = await requireUser();
  const run = await getLatestDoneRun(project.id);
  if (!run) throw new Error("Najpierw uruchom pomiar");
  const supabase = await createServerSupabase();
  const { data: prompts, error: pErr } = await supabase.from("prompts").select("id, is_key, created_at").eq("project_id", project.id).eq("active", true);
  if (pErr) throw new Error(pErr.message);
  const chosen = selectPrompts(prompts ?? [], 10);
  const { data: cal, error } = await supabase.from("calibrations").insert({ project_id: project.id, run_id: run.id, created_by: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  const rows = chosen.flatMap((p) => CALIBRATION_ENGINES.map((engine_id) => ({ calibration_id: cal.id, project_id: project.id, prompt_id: p.id, engine_id })));
  if (rows.length) {
    const { error: cErr } = await supabase.from("calibration_checks").insert(rows);
    if (cErr) throw new Error(cErr.message);
  }
  revalidatePath("/app/calibration");
  redirect(`/app/calibration/${cal.id}`);
}

const CheckSchema = z.object({
  id: z.string().refine(isUuid),
  calibrationId: z.string().refine(isUuid),
  mentioned: z.enum(["yes", "no", "unknown"]),
  urls: z.string().max(5000).default(""),
  alias: z.string().max(200).default(""),
});

export async function saveCheck(formData: FormData) {
  const project = await getCurrentProject();
  const f = CheckSchema.parse(Object.fromEntries(formData));
  assertOpenSession(await loadSession(project.id, f.calibrationId));
  const supabase = await createServerSupabase();
  const manual_mentioned = f.mentioned === "unknown" ? null : f.mentioned === "yes";
  const { error } = await supabase.from("calibration_checks")
    .update({ manual_mentioned, manual_urls: parseUrls(f.urls), manual_alias: manual_mentioned ? f.alias.trim() || null : null, updated_at: new Date().toISOString() })
    .eq("project_id", project.id).eq("calibration_id", f.calibrationId).eq("id", f.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/calibration/${f.calibrationId}`);
}

export async function closeCalibration(formData: FormData) {
  const project = await getCurrentProject();
  const id = String(formData.get("id"));
  if (!isUuid(id)) return;
  assertOpenSession(await loadSession(project.id, id));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("calibrations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("project_id", project.id).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/calibration");
  revalidatePath(`/app/calibration/${id}`);
}

export async function addAliasFromCalibration(formData: FormData) {
  const project = await getCurrentProject();
  const calibrationId = String(formData.get("calibrationId"));
  const merged = mergeAlias(project.brand_aliases, String(formData.get("alias") ?? ""));
  if (!merged) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("projects").update({ brand_aliases: merged }).eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
  if (isUuid(calibrationId)) revalidatePath(`/app/calibration/${calibrationId}`);
}
```

`requireUser()` (`src/lib/workspace.ts`, cache) zwraca `{ supabase, user }`; `prompts.active` istnieje (migracja init).

- [ ] **Step 6: Uruchom** — `npm test -- --run tests/calibration && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calibration src/app/app/calibration/actions.ts tests/calibration
git commit -m "feat(calibration): queries and server actions"
```

---

### Task 4: Ekrany kalibracji i link w Ustawieniach

**Files:**
- Create: `src/app/app/calibration/page.tsx`, `src/app/app/calibration/[id]/page.tsx`, `src/app/app/calibration/CheckRow.tsx`, `src/app/app/calibration/ResultsSection.tsx`
- Modify: `src/app/app/settings/page.tsx`
- Test: `tests/calibration/results-section.test.tsx`

**Interfaces:**
- Consumes: Task 2 `agreementByEngine`, `calibrationTone`, `citationCoverage`, `CALIBRATION_ENGINE_LABEL`; Task 3 `listCalibrations`, `getCalibration`, `getLatestDoneRun`, `CalibrationView`, `CalibrationCheckView`, akcje; komponenty `PageHero, SectionHead, Tile, Rows, Row, Meta, EmptyState, StatTile` z `@/components/psai`; `Button`, `buttonVariants` z `@/components/ui/button`; `fmtDate`, `pct` z `@/lib/format/number`; `pluralPl`.
- Produces: `ResultsSection({ view, brandAliases }: { view: CalibrationView; brandAliases: string[] })` (server component, czysty render z danych — testowalny `renderToStaticMarkup`).

- [ ] **Step 1: Test renderu** — `tests/calibration/results-section.test.tsx` buduje `CalibrationView` z 4 wierszami (match / api_only / manual_only z `manualAlias: "Polska Szkoła Sztucznej Inteligencji"` / skipped) i sprawdza w markupie: (a) kafel ChatGPT z „1 z 2” i klasą `text-red` (rate 0.5 < 0.6); (b) sekcja „API: wzmianka, czat: brak” zawiera tekst pytania i link `href="/app/responses/<id>"`; (c) „czat: wzmianka, API: brak” zawiera przycisk z tekstem `Dodaj „Polska Szkoła Sztucznej Inteligencji” do aliasów`; (d) gdy alias już jest w `brandAliases` (inna pisownia) — zamiast przycisku tekst „już w aliasach”; (e) wiersz skipped nie pojawia się w rozbieżnościach. Mockuj `@/app/app/calibration/actions` (`vi.mock`) prostymi funkcjami, bo moduł ma `"use server"`.

- [ ] **Step 2: Uruchom — FAIL.**

- [ ] **Step 3: `ResultsSection.tsx`** (server component):
  - Siatka `grid gap-4 md:grid-cols-3`: dla każdego `agreementByEngine(rows)` — `Tile` z `Meta` nazwy silnika, liczba `{agreed} z {checked}` w `text-[44px] font-semibold` z klasą tonu (`good→text-teal`, `weak→text-t0`, `bad→text-red`; `rate === null` → „—” i `Meta` „nic nie sprawdzono”), pod spodem `Meta` z `pct(rate)`.
  - `SectionHead` „Rozbieżności” + `Meta` z `pluralPl(n, ["rozbieżność","rozbieżności","rozbieżności"])`; dwie grupy `Rows`: „API: wzmianka, czat: brak” i „czat: wzmianka, API: brak”; wiersz: tekst pytania, `Meta` silnika, link „Zobacz odpowiedź API” (`/app/responses/${apiResponseId}`, gdy jest); dla drugiej grupy z `manualAlias` — `<form action={addAliasFromCalibration}>` z hidden `calibrationId`, `alias` i `Button variant="quiet"` „Dodaj „…” do aliasów”, albo `Meta` „już w aliasach”, jeśli `mergeAlias(brandAliases, alias) === null`. Pusta lista → `EmptyState` „Brak rozbieżności” (tone neutral).
  - `SectionHead` „Cytowania”: suma `citationCoverage` po wierszach z `manualUrls.length > 0` — `Meta` „Aplikacja widziała {matched} z {total} domen wskazanych ręcznie”; gdy `total === 0` — „Nie wpisano cytowanych adresów”.

- [ ] **Step 4: `CheckRow.tsx`** (`"use client"`): props `{ check: CalibrationCheckView; calibrationId: string; readOnly: boolean }`. `<form>` z trzema przyciskami radiowymi „Tak / Nie / Nie sprawdzono” (`name="mentioned"`, wartości `yes|no|unknown`), `<textarea name="urls">` (placeholder „Cytowane adresy, jeden w linii”), `<input name="alias">` widoczne tylko przy „Tak” (etykieta „Jak Was nazwał?”), hidden `id` i `calibrationId`. Zapis: `onChange` radia → `startTransition(() => saveCheck(new FormData(form)))`; `onBlur` textarea/input → to samo. Stan „Zapisano” / „Zapisywanie…” w `Meta` (`aria-live="polite"`). `readOnly` → wszystkie pola `disabled`. Przycisk „Kopiuj pytanie” (`navigator.clipboard.writeText(check.promptText)`, po sukcesie `Meta` „Skopiowano”) renderowany w nagłówku grupy pytania w `[id]/page.tsx`, nie w każdym wierszu — wydziel mały `CopyPromptButton` w tym samym pliku (`export`).

- [ ] **Step 5: `[id]/page.tsx`**: `params: Promise<{ id: string }>`; `isUuid` → inaczej `notFound()`; `getCurrentProject()`, `getCalibration(project.id, id)` → `null` → `notFound()`. `PageHero` eyebrow „Kalibracja” + tytuł `Kalibracja z ${fmtDate(created_at)}` + `Meta` „pomiar z {fmtDate(run.started_at)}” (lub „pomiar usunięty”). Gdy `status === "open"` — `<form action={closeCalibration}>` z hidden `id` i `Button` „Zakończ kalibrację”; gdy `closed` — `Meta` „Zakończona {fmtDate(closed_at)}”. Potem `<ResultsSection view={…} brandAliases={project.brand_aliases} />`, potem `SectionHead` „Wyniki ręczne” + instrukcja w `Meta` („Zadaj pytanie w nowej sesji, bez logowania, z włączonym wyszukiwaniem”) i grupy per pytanie: `Tile` z tekstem pytania, `CopyPromptButton`, i trzy `CheckRow` (kolejność silników jak w danych). Strona dynamiczna (bez cache stron).

- [ ] **Step 6: `page.tsx`** (lista): `getCurrentProject()`, `Promise.all([listCalibrations(project.id), getLatestDoneRun(project.id)])`. `PageHero` eyebrow „Ustawienia · Kalibracja”, tytuł „Kalibracja”, opis jednym zdaniem (sens z spec „Cel”). `<form action={createCalibration}>` z `Button` „Nowa kalibracja” — `disabled` i `Meta` „Najpierw uruchom pomiar”, gdy brak zakończonego pomiaru. Lista `Rows`: `Row href=/app/calibration/<id>` z datą, `Meta` „otwarta/zakończona”, i trzy krótkie wyniki `ChatGPT 8/10 · Perplexity 7/10 · Google 9/10` (kolor tonu przez `span`, `—` gdy `rate === null`). Pusta → `EmptyState` „Jeszcze nie było kalibracji”.

- [ ] **Step 7: Ustawienia** — w `src/app/app/settings/page.tsx` dodaj sekcję po „Silniki”: `SectionHead title="Kalibracja"` + `Tile` z jednym zdaniem („Raz w miesiącu porównaj wyniki aplikacji z tym, co widać w publicznych czatach.”) i `Link` „Otwórz kalibrację” (`buttonVariants({ variant: "outline" })`) do `/app/calibration`.

- [ ] **Step 8: Uruchom** — `npm test -- --run && npx tsc --noEmit && npm run lint` → PASS. Jeśli żaden serwer nie korzysta z `.next` (`lsof -iTCP:3000 -sTCP:LISTEN`), także `npm run build`; w przeciwnym razie zapisz w raporcie, że build pominięto.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/calibration src/app/app/settings/page.tsx tests/calibration
git commit -m "feat(calibration): list, session screen with autosave rows, results and alias action"
```

---

### Task 5: Dokumentacja i weryfikacja końcowa

**Files:**
- Modify: `README.md`, `docs/superpowers/calibration/README.md`

- [ ] **Step 1: README** — w sekcji o funkcjach dodaj akapit „Kalibracja” (po polsku): gdzie jest (Ustawienia → Kalibracja), co robi (10 pytań × ChatGPT/Perplexity/Google AI Overview vs ostatni zakończony pomiar), progi koloru zgodności (≥ 80% / 60–79% / < 60%), że wiersze „nie sprawdzono” i „brak danych” nie liczą się do zgodności, i że „Dodaj do aliasów” dopisuje frazę do aliasów marki (następny pomiar ją uwzględni; stare odpowiedzi nie są przeliczane).

- [ ] **Step 2: Procedura** — w `docs/superpowers/calibration/README.md` na górze dodaj akapit: od 2026-10-13 kalibrację prowadzimy w aplikacji (Ustawienia → Kalibracja); poniższa tabela zostaje jako opis procedury i szablon zapasowy. Zaktualizuj krok 4 („Uruchom teraz” → „Uruchom pomiar”) i krok 1 (10 pytań zamiast 5, wybierane automatycznie).

- [ ] **Step 3: Weryfikacja**

```bash
npm test -- --run && npx tsc --noEmit && npm run lint
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:64322/postgres npm test -- --run tests/db
```
Expected: wszystko PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/calibration/README.md
git commit -m "docs: in-app calibration"
```
