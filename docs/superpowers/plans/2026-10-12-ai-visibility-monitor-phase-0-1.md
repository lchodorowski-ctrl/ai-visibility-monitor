# AI Visibility Monitor — plan implementacji fazy 0–1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Działająca aplikacja, która raz w tygodniu zadaje polskie pytania do ChatGPT, Perplexity, Gemini i Google AI Overviews, wykrywa wzmianki o PSAI i konkurentach oraz cytowania, i pokazuje na dashboardzie visibility rate, pozycję, share of voice, citation rate i AI Visibility Score.

**Architecture:** Next.js (App Router, `src/`) + Supabase (Postgres z RLS, Auth) + Trigger.dev (zadania w tle: orkiestrator `run-project` → fan-out `query-engine` → agregacja). Adaptery silników mają wspólny interfejs `EngineAdapter`; ekstrakcja wzmianek jest regułowa (aliasy marek), sentyment przez Claude Haiku. Multi-tenant od początku: `organizations → projects`.

**Tech Stack:** TypeScript, Next.js ≥ 15 (App Router), Tailwind, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Trigger.dev SDK v4, Vitest, Zod, `openai`, `@google/genai`, `@anthropic-ai/sdk`, Recharts.

**Spec:** `docs/superpowers/specs/2026-10-12-ai-visibility-monitor-design.md`

## Global Constraints

- Język pytań i interfejsu: **polski**; lokalizacja zapytań: `country = "PL"`, `locale = "pl-PL"`.
- Próbkowanie: **1 próbka** domyślnie, **3 próbki** dla promptów `is_key = true`.
- Twardy limit budżetu: run zatrzymuje się, gdy suma `cost_usd` z bieżącego miesiąca ≥ `projects.monthly_budget_usd` (domyślnie **30 USD**).
- Najtańsze modele: OpenAI `gpt-5.4-mini`, Gemini `gemini-3.8-flash`, Perplexity preset `fast`, Claude `claude-haiku-5-5` (sentyment), Claude `claude-opus-5-5` (generator promptów, mały wolumen). Wszystkie modele konfigurowalne przez env.
- Każda tabela z danymi projektu ma kolumnę `project_id` i politykę RLS opartą o `is_org_member()`.
- Surowe odpowiedzi API (`raw`) zawsze zapisywane w `responses.raw` (JSONB), nic nie jest obcinane.
- Odpowiedzi bez AI Overview (Google nie pokazał AIO) zapisywane z `no_answer = true` i **wyłączane z mianownika** metryk.
- Dopasowanie marek: bez rozróżniania wielkości liter i **bez polskich znaków diakrytycznych** (NFD + usunięcie znaków łączących), granice słów unicode.
- Sekrety tylko w env (`.env.local`, Vercel, Trigger.dev); `.env.example` bez wartości.

## Review Focus

1. **Alias będący podciągiem innego słowa** (np. alias `PSAI` w słowie „PSAIR” albo `AI` w „AIO”): matcher nie może liczyć wzmianki. Test w Task 10 (`nie dopasowuje aliasu wewnątrz innego słowa`).
2. **Odpowiedź z cytowaniem domeny z `www.` i ścieżką** (`https://www.polskaszkola.ai/kursy?x=1`): musi dać `is_own = true`. Test w Task 5 (`normalizeDomain`) i Task 10.
3. **Silnik zwraca błąd / timeout dla jednego promptu**: run musi dokończyć pozostałe zapytania, zapisać błąd przy tym jednym i policzyć metryki z tego, co się udało. Test w Task 13 (`query-engine zapisuje błąd i nie rzuca`).
4. **Budżet wyczerpany w połowie runu**: kolejne zapytania nie są wysyłane, run ma status `budget_exceeded`. Test w Task 13 (`cost guard`).
5. **Projekt bez żadnego aktywnego promptu lub silnika**: „Uruchom teraz” zwraca czytelny komunikat zamiast pustego runu. Test w Task 13 (`run-project bez promptów`).

---

## Struktura plików

```
.
├── .env.example
├── package.json
├── vercel.json                      # cron tygodniowy
├── trigger.config.ts
├── vitest.config.ts
├── supabase/
│   ├── config.toml                  # z `supabase init`
│   ├── migrations/
│   │   └── 20261012000000_init.sql  # cały schemat fazy 0–1 + RLS
│   └── seed.sql                     # org + projekt PSAI + 10 promptów startowych
├── src/
│   ├── proxy.ts                     # (Next ≥16; w Next 15: src/middleware.ts) odświeżanie sesji + redirect
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # redirect → /app
│   │   ├── login/page.tsx
│   │   ├── api/cron/weekly/route.ts # Vercel Cron → tasks.trigger("run-project")
│   │   └── app/
│   │       ├── layout.tsx           # nawigacja, ensureWorkspace()
│   │       ├── page.tsx             # Przegląd
│   │       ├── prompts/page.tsx     # Prompty i tematy + heatmapa
│   │       ├── responses/page.tsx   # Odpowiedzi
│   │       ├── responses/[id]/page.tsx
│   │       └── settings/page.tsx    # Marka, konkurenci, silniki, budżet
│   ├── lib/
│   │   ├── supabase/{server,client,admin}.ts
│   │   ├── workspace.ts             # ensureWorkspace, getCurrentProject
│   │   ├── engines/
│   │   │   ├── types.ts             # EngineAdapter, EngineResult, Citation
│   │   │   ├── registry.ts          # getAdapter(id), ENGINE_COST_USD
│   │   │   ├── domain.ts            # normalizeDomain, domainMatches
│   │   │   ├── openai.ts
│   │   │   ├── perplexity.ts
│   │   │   ├── gemini.ts
│   │   │   └── google-ai-overview.ts
│   │   ├── extract/
│   │   │   ├── normalize.ts         # foldText (lowercase + bez diakrytyków)
│   │   │   ├── brands.ts            # extractMentions
│   │   │   ├── citations.ts         # classifyCitations
│   │   │   └── sentiment.ts         # Claude Haiku, structured output
│   │   ├── metrics/
│   │   │   ├── aggregate.ts         # computeMetrics (czysta funkcja), score
│   │   │   └── persist.ts           # upsertDailyMetrics
│   │   ├── prompts/generate.ts      # Claude Opus: propozycje promptów
│   │   └── budget.ts                # monthSpend, estimateRunCost
│   ├── trigger/
│   │   ├── run-project.ts
│   │   ├── query-engine.ts
│   │   └── aggregate-project.ts
│   └── components/                  # małe komponenty UI (Card, Table, Heatmap, TrendChart)
└── tests/
    ├── fixtures/responses/*.json    # zapisane odpowiedzi API do testów adapterów i ekstraktora
    ├── engines/*.test.ts
    ├── extract/*.test.ts
    ├── metrics/*.test.ts
    └── trigger/*.test.ts
```

---

## Faza 0 — fundament

### Task 1: Szkielet Next.js + Vitest

**Files:**
- Create: cały projekt przez `create-next-app` w bieżącym katalogu (repo już ma `docs/` i `.git`)
- Create: `vitest.config.ts`, `tests/smoke.test.ts`, `.env.example`

**Interfaces:**
- Produces: skrypty `npm run dev | build | test | lint`; alias importów `@/*` → `src/*`.

- [ ] **Step 1: Wygeneruj aplikację**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Jeśli kreator pyta o React Compiler lub Turbopack, odpowiedz „No”. Jeśli odmawia pracy w niepustym katalogu, uruchom go w `tmp-app/`, a potem przenieś zawartość (`rsync -a tmp-app/ . && rm -rf tmp-app`), nie nadpisując `docs/` i `.git/`.

- [ ] **Step 2: Zainstaluj zależności fazy 0–1**

```bash
npm i @supabase/supabase-js @supabase/ssr zod @trigger.dev/sdk openai @google/genai @anthropic-ai/sdk recharts
npm i -D vitest @vitejs/plugin-react vite-tsconfig-paths supabase
```

- [ ] **Step 3: Konfiguracja Vitest**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

Dodaj do `package.json` → `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Test dymny**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("działa", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 5: `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TRIGGER_SECRET_KEY=
CRON_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
PERPLEXITY_API_KEY=
PERPLEXITY_PRESET=fast
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
DATAFORSEO_LOCATION_CODE=2616
ANTHROPIC_API_KEY=
ANTHROPIC_SENTIMENT_MODEL=claude-haiku-5-5
ANTHROPIC_GENERATOR_MODEL=claude-opus-5-5
```

Upewnij się, że `.gitignore` zawiera `.env*.local` i `.env` (create-next-app dodaje `.env*`; sprawdź, że `.env.example` NIE jest ignorowany — jeśli jest, dopisz `!.env.example`).

- [ ] **Step 6: Build i commit**

Run: `npm run build && npm run lint && npm test`
Expected: build OK, lint bez błędów, 1 test passed.

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 2: Schemat bazy Supabase + RLS + seed

**Files:**
- Create: `supabase/config.toml` (z `supabase init`), `supabase/migrations/20261012000000_init.sql`, `supabase/seed.sql`
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/admin.ts`
- Create: `src/lib/db-types.ts`

**Interfaces:**
- Produces: tabele opisane poniżej; funkcja SQL `is_org_member(org_id uuid) → boolean`; klienci `createServerSupabase()`, `createBrowserSupabase()`, `createAdminSupabase()`; typ `Tables<"prompts">` itd. z `db-types.ts`.

- [ ] **Step 1: Inicjalizacja Supabase CLI**

```bash
npx supabase init
```

Odpowiedz „N” na pytania o VS Code/IntelliJ settings. Lokalnie: `npx supabase start` (wymaga Dockera). Jeśli Docker nie jest dostępny, użyj hostowanego projektu: `npx supabase link --project-ref <ref>` i zamiast `db reset` używaj `npx supabase db push`.

- [ ] **Step 2: Migracja**

`supabase/migrations/20261012000000_init.sql`:
```sql
create extension if not exists "pgcrypto";

-- Organizacje i członkostwa
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','member')),
  primary key (org_id, user_id)
);

create or replace function is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = org and m.user_id = auth.uid());
$$;

-- Projekty (marka)
create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  brand_name text not null,
  brand_aliases text[] not null default '{}',
  domains text[] not null default '{}',
  facts jsonb not null default '{}'::jsonb,
  locale text not null default 'pl-PL',
  country text not null default 'PL',
  monthly_budget_usd numeric(10,2) not null default 30,
  schedule text not null default 'weekly' check (schedule in ('weekly','manual')),
  created_at timestamptz not null default now()
);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  domains text[] not null default '{}'
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null
);

create table prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  topic_id uuid references topics(id) on delete set null,
  text text not null,
  intent text not null default 'informational'
    check (intent in ('informational','comparison','transactional','brand')),
  is_key boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table project_engines (
  project_id uuid not null references projects(id) on delete cascade,
  engine_id text not null,
  enabled boolean not null default true,
  primary key (project_id, engine_id)
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running','done','failed','budget_exceeded','empty')),
  trigger_source text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cost_usd numeric(10,4) not null default 0,
  queries_total int not null default 0,
  queries_failed int not null default 0,
  error text
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine_id text not null,
  sample_idx int not null default 0,
  text text not null default '',
  citations jsonb not null default '[]'::jsonb,
  model text,
  raw jsonb,
  cost_usd numeric(10,4) not null default 0,
  no_answer boolean not null default false,
  error text,
  sentiment text check (sentiment in ('positive','neutral','negative','mixed')),
  sentiment_summary text,
  created_at timestamptz not null default now()
);
create index responses_project_created on responses(project_id, created_at desc);
create index responses_prompt_engine on responses(prompt_id, engine_id);

create table mentions (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  brand_kind text not null check (brand_kind in ('own','competitor')),
  brand_name text not null,
  competitor_id uuid references competitors(id) on delete cascade,
  position int not null,
  char_index int not null
);
create index mentions_project on mentions(project_id, brand_kind);

create table citations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references responses(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  url text not null,
  domain text not null,
  title text,
  is_own boolean not null default false,
  competitor_id uuid references competitors(id) on delete set null
);
create index citations_project_domain on citations(project_id, domain);

create table daily_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  engine_id text,          -- null = wszystkie silniki
  prompt_id uuid references prompts(id) on delete cascade, -- null = wszystkie prompty
  responses_count int not null default 0,
  visibility_rate numeric(5,4) not null default 0,
  avg_position numeric(6,2),
  citation_rate numeric(5,4) not null default 0,
  share_of_voice numeric(5,4) not null default 0,
  score int not null default 0,
  computed_at timestamptz not null default now()
);
create unique index daily_metrics_unique
  on daily_metrics(project_id, date, coalesce(engine_id,''), coalesce(prompt_id,'00000000-0000-0000-0000-000000000000'::uuid));

-- RLS
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table projects enable row level security;
alter table competitors enable row level security;
alter table topics enable row level security;
alter table prompts enable row level security;
alter table project_engines enable row level security;
alter table runs enable row level security;
alter table responses enable row level security;
alter table mentions enable row level security;
alter table citations enable row level security;
alter table daily_metrics enable row level security;

create policy org_member_select on organizations for select using (is_org_member(id));
create policy membership_self on memberships for select using (user_id = auth.uid());
create policy projects_member on projects for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

create or replace function project_org(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from projects where id = p;
$$;

do $$
declare t text;
begin
  foreach t in array array['competitors','topics','prompts','project_engines','runs','responses','mentions','citations','daily_metrics']
  loop
    execute format(
      'create policy %I_member on %I for all using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));',
      t, t);
  end loop;
end $$;
```

- [ ] **Step 3: Seed**

`supabase/seed.sql` (dane startowe; `user_id` członkostwa dopisze `ensureWorkspace()` przy pierwszym logowaniu, więc seed tworzy tylko org + projekt):
```sql
insert into organizations (id, name) values ('11111111-1111-1111-1111-111111111111', 'Polska Szkoła AI');

insert into projects (id, org_id, name, brand_name, brand_aliases, domains, facts)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
  'Polska Szkoła AI', 'Polska Szkoła AI',
  array['PSAI','polskaszkola.ai','Polska Szkola AI'],
  array['polskaszkola.ai'],
  '{"oferta":"szkolenia i kursy AI dla firm i osób prywatnych","strona":"https://polskaszkola.ai"}'::jsonb);

insert into project_engines (project_id, engine_id) values
  ('22222222-2222-2222-2222-222222222222','openai'),
  ('22222222-2222-2222-2222-222222222222','perplexity'),
  ('22222222-2222-2222-2222-222222222222','gemini'),
  ('22222222-2222-2222-2222-222222222222','google_ai_overview');

insert into topics (id, project_id, name) values
  ('33333333-3333-3333-3333-333333333331','22222222-2222-2222-2222-222222222222','Kursy AI dla firm'),
  ('33333333-3333-3333-3333-333333333332','22222222-2222-2222-2222-222222222222','Szkolenia ChatGPT'),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Brand');

insert into prompts (project_id, topic_id, text, intent, is_key) values
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Jakie są najlepsze szkolenia z AI dla firm w Polsce?','comparison',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Polecasz jakiś kurs AI dla pracowników małej firmy?','transactional',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Gdzie w Polsce można zrobić warsztaty z wykorzystania AI w biznesie?','informational',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333332','Jaki kurs ChatGPT dla początkujących po polsku warto wybrać?','comparison',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333332','Szkolenie z ChatGPT dla zespołu marketingu — kogo polecasz?','transactional',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333332','Kto prowadzi dobre szkolenia z narzędzi AI w Warszawie?','informational',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','Co to jest Polska Szkoła AI?','brand',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','Czy Polska Szkoła AI jest godna polecenia?','brand',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Ranking szkół i akademii AI w Polsce','comparison',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Jak nauczyć zespół korzystać z AI? Jakie szkolenie wybrać?','informational',false);
```

- [ ] **Step 4: Zastosuj migrację i wygeneruj typy**

```bash
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > src/lib/db-types.ts
```
Expected: `db reset` kończy się bez błędów i wykonuje seed; `db-types.ts` zawiera `prompts`, `responses`, `daily_metrics`.

Przy hostowanym projekcie: `npx supabase db push`, potem `npx supabase gen types typescript --linked > src/lib/db-types.ts`, a seed: `psql "$DATABASE_URL" -f supabase/seed.sql`.

- [ ] **Step 5: Test polityk RLS (SQL)**

`tests/db/rls.test.ts` — uruchamiany tylko gdy ustawiony `SUPABASE_DB_URL` (lokalny: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`):
```ts
import { describe, it, expect } from "vitest";
import { Client } from "pg";

const url = process.env.SUPABASE_DB_URL;

describe.skipIf(!url)("RLS", () => {
  it("anon nie widzi promptów, członek org widzi", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    const uid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await c.query(`insert into auth.users (id, email) values ($1, 'rls@test.local') on conflict do nothing`, [uid]);
    await c.query(`insert into memberships (org_id, user_id) values ('11111111-1111-1111-1111-111111111111', $1) on conflict do nothing`, [uid]);

    await c.query(`set role anon; select set_config('request.jwt.claims', '{}', true);`);
    const anon = await c.query(`select count(*)::int as n from prompts`);
    await c.query(`reset role`);

    await c.query(`set role authenticated;`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const member = await c.query(`select count(*)::int as n from prompts`);
    await c.query(`reset role`);
    await c.end();

    expect(anon.rows[0].n).toBe(0);
    expect(member.rows[0].n).toBeGreaterThan(0);
  });
});
```
Zainstaluj: `npm i -D pg @types/pg`.

Run: `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -- tests/db`
Expected: PASS.

- [ ] **Step 6: Klienci Supabase**

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db-types";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // wywołanie z Server Component — cookies ustawi proxy/middleware
          }
        },
      },
    },
  );
}
```

`src/lib/supabase/client.ts`:
```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db-types";

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`src/lib/supabase/admin.ts` (tylko serwer i zadania Trigger.dev — omija RLS):
```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";

export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): initial schema, RLS policies, seed and Supabase clients"
```

---
### Task 3: Logowanie, ochrona tras i bootstrap workspace

**Files:**
- Create: `src/proxy.ts` (Next ≥16) **lub** `src/middleware.ts` (Next 15) — sprawdź wersję w `package.json`
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/signout/route.ts`
- Create: `src/lib/workspace.ts`
- Create: `src/app/app/layout.tsx`, `src/app/app/page.tsx` (tymczasowy placeholder), `src/app/page.tsx`
- Test: `tests/workspace.test.ts`

**Interfaces:**
- Produces: `ensureWorkspace(userId, email): Promise<{ orgId: string; projectId: string }>` (idempotentne), `getCurrentProject(): Promise<Tables<"projects">>` (pierwszy projekt organizacji użytkownika; rzuca `redirect("/login")` gdy brak sesji).

- [ ] **Step 1: Test `ensureWorkspace` (z wstrzykniętym klientem)**

`tests/workspace.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { ensureWorkspaceWith } from "@/lib/workspace";

function fakeAdmin(existingMembership: { org_id: string } | null) {
  const inserted: Record<string, unknown[]> = {};
  const from = vi.fn((table: string) => {
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = () => api;
    api.limit = () => api;
    api.maybeSingle = async () => ({ data: table === "memberships" ? existingMembership : null, error: null });
    api.single = async () => ({ data: { id: `${table}-id` }, error: null });
    api.insert = (rows: unknown) => { (inserted[table] ??= []).push(rows); return api; };
    api.order = () => api;
    return api;
  });
  return { client: { from } as never, inserted };
}

describe("ensureWorkspace", () => {
  it("tworzy org, projekt i członkostwo dla nowego użytkownika", async () => {
    const { client, inserted } = fakeAdmin(null);
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");
    expect(inserted.organizations).toHaveLength(1);
    expect(inserted.memberships).toHaveLength(1);
    expect(inserted.projects).toHaveLength(1);
    expect(res.orgId).toBe("organizations-id");
  });

  it("nic nie tworzy, gdy członkostwo istnieje", async () => {
    const { client, inserted } = fakeAdmin({ org_id: "org-x" });
    const res = await ensureWorkspaceWith(client, "user-1", "a@b.pl");
    expect(inserted.organizations).toBeUndefined();
    expect(res.orgId).toBe("org-x");
  });
});
```

- [ ] **Step 2: Uruchom test — ma nie przejść**

Run: `npm test -- tests/workspace`
Expected: FAIL — `Cannot find module '@/lib/workspace'`.

- [ ] **Step 3: Implementacja `workspace.ts`**

`src/lib/workspace.ts`:
```ts
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const DEFAULT_ENGINES = ["openai", "perplexity", "gemini", "google_ai_overview"] as const;

export async function ensureWorkspaceWith(
  admin: SupabaseClient<Database>,
  userId: string,
  email: string,
): Promise<{ orgId: string; projectId: string }> {
  const { data: membership } = await admin
    .from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();

  if (membership) {
    const { data: project } = await admin
      .from("projects").select("id").eq("org_id", membership.org_id).order("created_at").limit(1).maybeSingle();
    return { orgId: membership.org_id, projectId: project?.id ?? "" };
  }

  const { data: org } = await admin
    .from("organizations").insert({ name: `Organizacja ${email}` }).select("id").single();
  await admin.from("memberships").insert({ org_id: org!.id, user_id: userId, role: "owner" });
  const { data: project } = await admin
    .from("projects")
    .insert({ org_id: org!.id, name: "Mój projekt", brand_name: "Moja marka", brand_aliases: [], domains: [] })
    .select("id").single();
  await admin.from("project_engines")
    .insert(DEFAULT_ENGINES.map((engine_id) => ({ project_id: project!.id, engine_id })));
  return { orgId: org!.id, projectId: project!.id };
}

export async function ensureWorkspace(userId: string, email: string) {
  return ensureWorkspaceWith(createAdminSupabase(), userId, email);
}

export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getCurrentProject() {
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects").select("*").order("created_at").limit(1).maybeSingle();
  if (!project) {
    await ensureWorkspace(user.id, user.email ?? "");
    redirect("/app");
  }
  return project;
}
```

Uwaga: seedowany projekt PSAI nie ma członkostwa. Pierwszy zalogowany użytkownik PSAI dopisuje się ręcznie: `insert into memberships (org_id, user_id) values ('11111111-1111-1111-1111-111111111111', '<auth.users.id>')` (Supabase Studio → SQL). Dzięki temu `getCurrentProject()` zwraca projekt PSAI, a nie tworzy pustego.

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- tests/workspace`
Expected: 2 passed.

- [ ] **Step 5: Proxy/middleware odświeżający sesję**

`src/proxy.ts` (w Next 15 ten sam kod w `src/middleware.ts` z eksportem `middleware` zamiast `proxy`):
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && path.startsWith("/app")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return response;
}

export const config = { matcher: ["/app/:path*", "/login"] };
```

- [ ] **Step 6: Strona logowania (e-mail + hasło)**

`src/app/login/actions.ts`:
```ts
"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/workspace";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Błąd logowania")}`);
  await ensureWorkspace(data.user.id, data.user.email ?? email);
  redirect("/app");
}
```

`src/app/login/page.tsx`:
```tsx
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">AI Visibility Monitor</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <form action={signIn} className="space-y-3">
        <input name="email" type="email" required placeholder="E-mail" className="w-full rounded border p-2" />
        <input name="password" type="password" required placeholder="Hasło" className="w-full rounded border p-2" />
        <button className="w-full rounded bg-black p-2 text-white">Zaloguj</button>
      </form>
    </main>
  );
}
```

`src/app/auth/signout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
```

Użytkowników zakładamy w Supabase Studio (Authentication → Add user) — bez publicznej rejestracji w MVP.

- [ ] **Step 7: Layout aplikacji i placeholdery**

`src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function Home() { redirect("/app"); }
```

`src/app/app/layout.tsx`:
```tsx
import Link from "next/link";
import { getCurrentProject } from "@/lib/workspace";

const nav = [
  ["/app", "Przegląd"],
  ["/app/prompts", "Prompty"],
  ["/app/responses", "Odpowiedzi"],
  ["/app/settings", "Ustawienia"],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const project = await getCurrentProject();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4">
        <div className="mb-6 text-sm font-semibold">{project.name}</div>
        <nav className="space-y-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded px-2 py-1 hover:bg-gray-100">{label}</Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="mt-8">
          <button className="text-xs text-gray-500">Wyloguj</button>
        </form>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

`src/app/app/page.tsx` (tymczasowo):
```tsx
export default function OverviewPage() {
  return <h1 className="text-xl font-semibold">Przegląd</h1>;
}
```

- [ ] **Step 8: Weryfikacja ręczna**

Uzupełnij `.env.local` wartościami z `npx supabase status` (API URL, anon key, service_role key). W Studio (http://127.0.0.1:54323) dodaj użytkownika i członkostwo w org PSAI (SQL z kroku 3).

Run: `npm run dev` → otwórz `http://localhost:3000` → redirect na `/login` → zaloguj → `/app` pokazuje „Polska Szkoła AI” w panelu bocznym.
Expected: działa; wylogowanie wraca na `/login`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): login, session proxy and workspace bootstrap"
```

---

### Task 4: Ustawienia projektu (marka, konkurenci, silniki, budżet)

**Files:**
- Create: `src/app/app/settings/page.tsx`, `src/app/app/settings/actions.ts`
- Create: `src/lib/validation/settings.ts`
- Test: `tests/validation/settings.test.ts`

**Interfaces:**
- Produces: schematy Zod `ProjectSettingsSchema`, `CompetitorSchema`; akcje `updateProjectSettings`, `addCompetitor`, `deleteCompetitor`, `toggleEngine`.
- Pomocnik `parseList(input: string): string[]` — dzieli po przecinkach/nowych liniach, trimuje, usuwa puste i duplikaty.

- [ ] **Step 1: Test walidacji**

`tests/validation/settings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ProjectSettingsSchema, parseList } from "@/lib/validation/settings";

describe("parseList", () => {
  it("dzieli po przecinkach i nowych liniach, usuwa duplikaty", () => {
    expect(parseList("PSAI, Polska Szkoła AI\npsai ,")).toEqual(["PSAI", "Polska Szkoła AI", "psai"]);
  });
});

describe("ProjectSettingsSchema", () => {
  it("normalizuje domeny (bez https:// i www.)", () => {
    const r = ProjectSettingsSchema.parse({
      brand_name: "Polska Szkoła AI",
      brand_aliases: "PSAI",
      domains: "https://www.polskaszkola.ai/, polskaszkola.ai",
      monthly_budget_usd: "30",
      facts: "{}",
    });
    expect(r.domains).toEqual(["polskaszkola.ai"]);
    expect(r.monthly_budget_usd).toBe(30);
  });

  it("odrzuca ujemny budżet i niepoprawny JSON faktów", () => {
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "-1", facts: "{}" })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ brand_name: "X", brand_aliases: "", domains: "", monthly_budget_usd: "1", facts: "{" })).toThrow();
  });
});
```

- [ ] **Step 2: Uruchom — FAIL** (`Cannot find module`)

- [ ] **Step 3: Implementacja walidacji**

`src/lib/validation/settings.ts`:
```ts
import { z } from "zod";

export function parseList(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !seen.has(s) && (seen.add(s), true));
}

export function normalizeDomainInput(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

const listField = z.string().default("").transform(parseList);
const domainsField = z.string().default("").transform((s) => [...new Set(parseList(s).map(normalizeDomainInput))]);

export const ProjectSettingsSchema = z.object({
  brand_name: z.string().min(1, "Nazwa marki jest wymagana"),
  brand_aliases: listField,
  domains: domainsField,
  monthly_budget_usd: z.coerce.number().min(0, "Budżet nie może być ujemny"),
  facts: z.string().default("{}").transform((s, ctx) => {
    try { return JSON.parse(s) as Record<string, unknown>; }
    catch { ctx.addIssue({ code: "custom", message: "Karta faktów musi być poprawnym JSON" }); return z.NEVER; }
  }),
});

export const CompetitorSchema = z.object({
  name: z.string().min(1),
  aliases: listField,
  domains: domainsField,
});
```

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Akcje serwerowe**

`src/app/app/settings/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { ProjectSettingsSchema, CompetitorSchema } from "@/lib/validation/settings";

export async function updateProjectSettings(formData: FormData) {
  const project = await getCurrentProject();
  const parsed = ProjectSettingsSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("projects").update(parsed).eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function addCompetitor(formData: FormData) {
  const project = await getCurrentProject();
  const parsed = CompetitorSchema.parse(Object.fromEntries(formData));
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("competitors").insert({ ...parsed, project_id: project.id });
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function deleteCompetitor(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createServerSupabase();
  await supabase.from("competitors").delete().eq("id", id);
  revalidatePath("/app/settings");
}

export async function toggleEngine(formData: FormData) {
  const project = await getCurrentProject();
  const engine_id = String(formData.get("engine_id"));
  const enabled = formData.get("enabled") === "true";
  const supabase = await createServerSupabase();
  await supabase.from("project_engines").upsert({ project_id: project.id, engine_id, enabled });
  revalidatePath("/app/settings");
}
```

- [ ] **Step 6: Strona ustawień**

`src/app/app/settings/page.tsx`:
```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject, DEFAULT_ENGINES } from "@/lib/workspace";
import { updateProjectSettings, addCompetitor, deleteCompetitor, toggleEngine } from "./actions";

const ENGINE_LABELS: Record<string, string> = {
  openai: "ChatGPT (OpenAI)", perplexity: "Perplexity", gemini: "Gemini", google_ai_overview: "Google AI Overviews",
};

export default async function SettingsPage() {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const [{ data: competitors }, { data: engines }] = await Promise.all([
    supabase.from("competitors").select("*").eq("project_id", project.id).order("name"),
    supabase.from("project_engines").select("*").eq("project_id", project.id),
  ]);
  const enabled = new Map((engines ?? []).map((e) => [e.engine_id, e.enabled]));

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h1 className="text-xl font-semibold">Marka</h1>
        <form action={updateProjectSettings} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">Nazwa marki
            <input name="brand_name" defaultValue={project.brand_name} className="rounded border p-2" />
          </label>
          <label className="grid gap-1 text-sm">Aliasy (po przecinku)
            <input name="brand_aliases" defaultValue={project.brand_aliases.join(", ")} className="rounded border p-2" />
          </label>
          <label className="grid gap-1 text-sm">Domeny (po przecinku)
            <input name="domains" defaultValue={project.domains.join(", ")} className="rounded border p-2" />
          </label>
          <label className="grid gap-1 text-sm">Miesięczny budżet API (USD)
            <input name="monthly_budget_usd" type="number" step="1" defaultValue={String(project.monthly_budget_usd)} className="rounded border p-2" />
          </label>
          <label className="grid gap-1 text-sm">Karta faktów (JSON)
            <textarea name="facts" rows={5} defaultValue={JSON.stringify(project.facts, null, 2)} className="rounded border p-2 font-mono text-xs" />
          </label>
          <button className="w-fit rounded bg-black px-4 py-2 text-white">Zapisz</button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Konkurenci</h2>
        <ul className="mt-3 divide-y rounded border">
          {(competitors ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between p-3 text-sm">
              <div><b>{c.name}</b> <span className="text-gray-500">{c.aliases.join(", ")} · {c.domains.join(", ")}</span></div>
              <form action={deleteCompetitor}><input type="hidden" name="id" value={c.id} /><button className="text-red-600">Usuń</button></form>
            </li>
          ))}
        </ul>
        <form action={addCompetitor} className="mt-3 grid grid-cols-4 gap-2 text-sm">
          <input name="name" required placeholder="Nazwa" className="rounded border p-2" />
          <input name="aliases" placeholder="Aliasy" className="rounded border p-2" />
          <input name="domains" placeholder="Domeny" className="rounded border p-2" />
          <button className="rounded bg-black px-3 text-white">Dodaj</button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Silniki</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {DEFAULT_ENGINES.map((id) => {
            const on = enabled.get(id) ?? false;
            return (
              <li key={id} className="flex items-center justify-between rounded border p-3">
                <span>{ENGINE_LABELS[id]}</span>
                <form action={toggleEngine}>
                  <input type="hidden" name="engine_id" value={id} />
                  <input type="hidden" name="enabled" value={String(!on)} />
                  <button className={on ? "text-green-700" : "text-gray-500"}>{on ? "Włączony" : "Wyłączony"}</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Weryfikacja ręczna**

`npm run dev` → `/app/settings`: zmień aliasy, dodaj konkurenta (np. „Akademia AI”, domeny `akademia-ai.pl`), wyłącz i włącz silnik. Odśwież — zmiany trwałe.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(settings): brand, competitors, engines and budget settings"
```

---

## Faza 1 — monitoring MVP

### Task 5: Interfejs adapterów, rejestr i normalizacja domen

**Files:**
- Create: `src/lib/engines/types.ts`, `src/lib/engines/domain.ts`, `src/lib/engines/costs.ts`, `src/lib/engines/registry.ts`
- Test: `tests/engines/domain.test.ts`

**Interfaces:**
- Produces:
```ts
export type EngineId = "openai" | "perplexity" | "gemini" | "google_ai_overview";
export interface EngineQueryOptions { locale: string; country: string }
export interface Citation { url: string; domain: string; title?: string }
export interface EngineResult {
  text: string; citations: Citation[]; model: string; raw: unknown;
  costUsd: number; noAnswer?: boolean;
}
export interface EngineAdapter { id: EngineId; query(prompt: string, opts: EngineQueryOptions): Promise<EngineResult> }
export function getAdapter(id: EngineId): EngineAdapter
export const ENGINE_COST_USD: Record<EngineId, number>  // szacunek na 1 zapytanie, do cost guard
export function normalizeDomain(urlOrHost: string): string  // "https://www.X.pl/a?b" → "x.pl"
export function domainMatches(domain: string, candidates: string[]): boolean // także subdomeny
export function toCitation(url: string, title?: string): Citation | null
```

- [ ] **Step 1: Test domen**

`tests/engines/domain.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeDomain, domainMatches, toCitation } from "@/lib/engines/domain";

describe("normalizeDomain", () => {
  it("usuwa protokół, www, ścieżkę i wielkie litery", () => {
    expect(normalizeDomain("https://www.PolskaSzkola.ai/kursy?x=1")).toBe("polskaszkola.ai");
    expect(normalizeDomain("polskaszkola.ai")).toBe("polskaszkola.ai");
  });
  it("zwraca pusty string dla śmieci", () => {
    expect(normalizeDomain("not a url")).toBe("");
  });
});

describe("domainMatches", () => {
  it("dopasowuje domenę i subdomenę, nie dopasowuje sufiksu", () => {
    expect(domainMatches("blog.polskaszkola.ai", ["polskaszkola.ai"])).toBe(true);
    expect(domainMatches("polskaszkola.ai", ["polskaszkola.ai"])).toBe(true);
    expect(domainMatches("notpolskaszkola.ai", ["polskaszkola.ai"])).toBe(false);
  });
});

describe("toCitation", () => {
  it("buduje cytowanie z domeną lub null dla złego URL", () => {
    expect(toCitation("https://www.example.pl/a", "T")).toEqual({ url: "https://www.example.pl/a", domain: "example.pl", title: "T" });
    expect(toCitation("javascript:void(0)")).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja**

`src/lib/engines/types.ts`:
```ts
export type EngineId = "openai" | "perplexity" | "gemini" | "google_ai_overview";

export interface EngineQueryOptions {
  locale: string;   // "pl-PL"
  country: string;  // "PL"
}

export interface Citation {
  url: string;
  domain: string;
  title?: string;
}

export interface EngineResult {
  text: string;
  citations: Citation[];
  model: string;
  raw: unknown;
  costUsd: number;
  noAnswer?: boolean;
}

export interface EngineAdapter {
  id: EngineId;
  query(prompt: string, opts: EngineQueryOptions): Promise<EngineResult>;
}
```

`src/lib/engines/domain.ts`:
```ts
import type { Citation } from "./types";

export function normalizeDomain(urlOrHost: string): string {
  const s = urlOrHost.trim().toLowerCase();
  if (!s) return "";
  const withProto = /^[a-z]+:\/\//.test(s) ? s : `https://${s}`;
  try {
    const host = new URL(withProto).hostname;
    if (!host.includes(".")) return "";
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function domainMatches(domain: string, candidates: string[]): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  return candidates.some((c) => {
    const n = normalizeDomain(c);
    return n !== "" && (d === n || d.endsWith(`.${n}`));
  });
}

export function toCitation(url: string, title?: string): Citation | null {
  if (!/^https?:\/\//i.test(url)) return null;
  const domain = normalizeDomain(url);
  if (!domain) return null;
  return title ? { url, domain, title } : { url, domain };
}

export function dedupeCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}
```

`src/lib/engines/costs.ts` (osobny plik, żeby adaptery nie importowały rejestru — unikamy cyklu `registry → adapter → registry`):
```ts
import type { EngineId } from "./types";

// Szacunkowy koszt 1 zapytania (USD) — używany przez cost guard PRZED wysłaniem.
// Rzeczywisty koszt zapisujemy w responses.cost_usd, jeśli API go zwraca.
export const ENGINE_COST_USD: Record<EngineId, number> = {
  openai: 0.012,            // web search ~$10/1k + tokeny gpt-5.4-mini
  perplexity: 0.006,        // preset fast
  gemini: 0.014,            // $14/1k po wyczerpaniu 5000 darmowych/mies.
  google_ai_overview: 0.004, // DataForSEO live advanced + async AIO
};
```

`src/lib/engines/registry.ts`:
```ts
import type { EngineAdapter, EngineId } from "./types";
import { openaiAdapter } from "./openai";
import { perplexityAdapter } from "./perplexity";
import { geminiAdapter } from "./gemini";
import { googleAiOverviewAdapter } from "./google-ai-overview";

export { ENGINE_COST_USD } from "./costs";

export const ENGINE_LABELS: Record<EngineId, string> = {
  openai: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini", google_ai_overview: "Google AI Overviews",
};

const adapters: Record<EngineId, EngineAdapter> = {
  openai: openaiAdapter,
  perplexity: perplexityAdapter,
  gemini: geminiAdapter,
  google_ai_overview: googleAiOverviewAdapter,
};

export function getAdapter(id: EngineId): EngineAdapter {
  const a = adapters[id];
  if (!a) throw new Error(`Nieznany silnik: ${id}`);
  return a;
}

export function isEngineId(s: string): s is EngineId {
  return s in adapters;
}
```

Do czasu Tasków 6–9 utwórz cztery pliki adapterów jako szkielety rzucające błąd, żeby rejestr się kompilował. Każdy plik to ten sam wzorzec z innym `id` i nazwą eksportu:

| Plik | Eksport | `id` |
|---|---|---|
| `src/lib/engines/openai.ts` | `openaiAdapter` | `"openai"` |
| `src/lib/engines/perplexity.ts` | `perplexityAdapter` | `"perplexity"` |
| `src/lib/engines/gemini.ts` | `geminiAdapter` | `"gemini"` |
| `src/lib/engines/google-ai-overview.ts` | `googleAiOverviewAdapter` | `"google_ai_overview"` |

```ts
// src/lib/engines/openai.ts
import type { EngineAdapter } from "./types";
export const openaiAdapter: EngineAdapter = {
  id: "openai",
  async query() { throw new Error("openai: adapter jeszcze niezaimplementowany (Task 6)"); },
};
```

- [ ] **Step 4: Uruchom — PASS**, `npx tsc --noEmit` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engines): adapter interface, registry and domain helpers"
```

---

### Task 6: Adapter OpenAI (Responses API + web_search)

**Files:**
- Modify: `src/lib/engines/openai.ts`
- Create: `tests/fixtures/responses/openai.json`
- Test: `tests/engines/openai.test.ts`

**Interfaces:**
- Consumes: `EngineAdapter`, `toCitation`, `dedupeCitations`, `ENGINE_COST_USD` (z `./costs`).
- Produces: `openaiAdapter`, oraz eksport `parseOpenAIResponse(raw): { text: string; citations: Citation[] }` (czysta funkcja do testów).
- API: `client.responses.create({ model, input, tools: [{ type: "web_search", user_location: { type: "approximate", country }, search_context_size: "low" }] })`. Tekst: `output[].type === "message"` → `content[].type === "output_text"` → `.text`; cytowania: `content[].annotations[].type === "url_citation"` → `{ url, title }`.

- [ ] **Step 1: Fixture**

`tests/fixtures/responses/openai.json` (kształt zgodny z dokumentacją Responses API):
```json
{
  "model": "gpt-5.4-mini",
  "output": [
    { "type": "web_search_call", "id": "ws_1", "status": "completed", "action": { "type": "search", "query": "szkolenia AI dla firm" } },
    {
      "type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
      "content": [
        {
          "type": "output_text",
          "text": "Polecane szkolenia AI dla firm w Polsce to m.in. Polska Szkoła AI oraz Akademia AI.",
          "annotations": [
            { "type": "url_citation", "url": "https://www.polskaszkola.ai/dla-firm", "title": "PSAI dla firm", "start_index": 40, "end_index": 57 },
            { "type": "url_citation", "url": "https://akademia-ai.pl/", "title": "Akademia AI", "start_index": 63, "end_index": 74 },
            { "type": "url_citation", "url": "https://akademia-ai.pl/", "title": "Akademia AI", "start_index": 63, "end_index": 74 }
          ]
        }
      ]
    }
  ],
  "usage": { "input_tokens": 120, "output_tokens": 80 }
}
```

- [ ] **Step 2: Test parsera i adaptera z mockiem SDK**

`tests/engines/openai.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "../fixtures/responses/openai.json";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class { responses = { create }; },
}));

describe("openai adapter", () => {
  beforeEach(() => { create.mockReset(); process.env.OPENAI_API_KEY = "test"; });

  it("parseOpenAIResponse wyciąga tekst i unikalne cytowania", async () => {
    const { parseOpenAIResponse } = await import("@/lib/engines/openai");
    const r = parseOpenAIResponse(fixture);
    expect(r.text).toContain("Polska Szkoła AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "akademia-ai.pl"]);
  });

  it("query wysyła web_search z lokalizacją PL i zwraca EngineResult", async () => {
    create.mockResolvedValue(fixture);
    const { openaiAdapter } = await import("@/lib/engines/openai");
    const res = await openaiAdapter.query("Jakie szkolenia AI?", { locale: "pl-PL", country: "PL" });
    const args = create.mock.calls[0][0];
    expect(args.tools[0]).toMatchObject({ type: "web_search", user_location: { type: "approximate", country: "PL" } });
    expect(args.input).toBe("Jakie szkolenia AI?");
    expect(res.model).toBe("gpt-5.4-mini");
    expect(res.citations).toHaveLength(2);
    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.raw).toBe(fixture);
  });
});
```

- [ ] **Step 3: Uruchom — FAIL** (`parseOpenAIResponse is not a function`)

- [ ] **Step 4: Implementacja**

`src/lib/engines/openai.ts`:
```ts
import OpenAI from "openai";
import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";

type AnyRecord = Record<string, unknown>;

export function parseOpenAIResponse(raw: unknown): { text: string; citations: Citation[] } {
  const output = ((raw as AnyRecord)?.output ?? []) as AnyRecord[];
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const item of output) {
    if (item.type !== "message") continue;
    for (const part of (item.content ?? []) as AnyRecord[]) {
      if (part.type !== "output_text") continue;
      texts.push(String(part.text ?? ""));
      for (const a of (part.annotations ?? []) as AnyRecord[]) {
        if (a.type !== "url_citation") continue;
        const c = toCitation(String(a.url ?? ""), a.title ? String(a.title) : undefined);
        if (c) citations.push(c);
      }
    }
  }
  return { text: texts.join("\n\n").trim(), citations: dedupeCitations(citations) };
}

let client: OpenAI | null = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Brak OPENAI_API_KEY");
  return (client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

export const openaiAdapter: EngineAdapter = {
  id: "openai",
  async query(prompt, opts): Promise<EngineResult> {
    const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
    const raw = await getClient().responses.create({
      model,
      input: prompt,
      tools: [
        {
          type: "web_search",
          user_location: { type: "approximate", country: opts.country },
          search_context_size: "low",
        },
      ],
    });
    const { text, citations } = parseOpenAIResponse(raw);
    return {
      text,
      citations,
      model: String((raw as AnyRecord).model ?? model),
      raw,
      costUsd: ENGINE_COST_USD.openai,
      noAnswer: text.length === 0,
    };
  },
};
```

Jeśli typy SDK `openai` odrzucają `search_context_size` lub `user_location` w `tools`, rzutuj obiekt narzędzia przez `as never` i dopisz komentarz z linkiem do docs web search — kształt jest zgodny z dokumentacją.

- [ ] **Step 5: Uruchom — PASS**

- [ ] **Step 6: Test na żywo (jednorazowo, ~0,01 USD)**

`scripts/try-engine.ts` (zmienne z `.env.local` ładuje `tsx --env-file`):
```ts
import { getAdapter, isEngineId } from "@/lib/engines/registry";

const [, , engine, ...rest] = process.argv;
if (!engine || !isEngineId(engine)) { console.error("użycie: tsx scripts/try-engine.ts <engine> <prompt>"); process.exit(1); }
const prompt = rest.join(" ") || "Jakie są najlepsze szkolenia z AI dla firm w Polsce?";
getAdapter(engine).query(prompt, { locale: "pl-PL", country: "PL" }).then((r) => {
  console.log(r.model, "\n", r.text, "\n", r.citations);
});
```
Zainstaluj: `npm i -D tsx`. Dodaj do `package.json` → `"scripts"`: `"try:engine": "tsx --env-file=.env.local scripts/try-engine.ts"`.

Run: `npm run try:engine -- openai`
Expected: polska odpowiedź i lista cytowań z domenami.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engines): OpenAI Responses adapter with web search"
```

---

### Task 7: Adapter Perplexity (Agent API)

**Files:**
- Modify: `src/lib/engines/perplexity.ts`
- Create: `tests/fixtures/responses/perplexity.json`
- Test: `tests/engines/perplexity.test.ts`

**Interfaces:**
- Produces: `perplexityAdapter`, `parsePerplexityResponse(raw)`.
- API: `POST https://api.perplexity.ai/v1/agent`, nagłówek `Authorization: Bearer $PERPLEXITY_API_KEY`, body `{ preset: "fast", input: prompt }`. Odpowiedź: `output[]` z elementami `type: "search_results"` (`results[].{title,url,date,snippet}`) i `type: "message"` (`content[].type === "output_text"` → `text`). Uwaga: stare Sonar Chat Completions wygasło 27.09.2026 — nie używać.

- [ ] **Step 1: Fixture**

`tests/fixtures/responses/perplexity.json`:
```json
{
  "id": "resp_1", "object": "response", "model": "openai/gpt-6-luna", "status": "completed",
  "output": [
    {
      "type": "search_results",
      "queries": ["szkolenia AI dla firm Polska"],
      "results": [
        { "id": 1, "title": "Szkolenia AI dla firm – PSAI", "url": "https://polskaszkola.ai/dla-firm", "date": "2026-05-01", "last_updated": "2026-05-01", "snippet": "", "source": "web" },
        { "id": 2, "title": "Ranking kursów AI", "url": "https://www.example-ranking.pl/kursy-ai", "date": "2026-03-10", "last_updated": "2026-03-10", "snippet": "…", "source": "web" }
      ]
    },
    {
      "type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
      "content": [{ "type": "output_text", "text": "Warto rozważyć Polską Szkołę AI[1] oraz kursy z rankingu[2].", "annotations": [], "logprobs": [] }]
    }
  ],
  "usage": { "input_tokens": 50, "output_tokens": 40, "total_tokens": 90 }
}
```

- [ ] **Step 2: Test z mockiem `fetch`**

`tests/engines/perplexity.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "../fixtures/responses/perplexity.json";

describe("perplexity adapter", () => {
  beforeEach(() => { process.env.PERPLEXITY_API_KEY = "test"; });

  it("parsePerplexityResponse łączy tekst i search_results", async () => {
    const { parsePerplexityResponse } = await import("@/lib/engines/perplexity");
    const r = parsePerplexityResponse(fixture);
    expect(r.text).toContain("Polską Szkołę AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "example-ranking.pl"]);
  });

  it("query woła /v1/agent z presetem i bearerem", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { perplexityAdapter } = await import("@/lib/engines/perplexity");
    const res = await perplexityAdapter.query("Pytanie", { locale: "pl-PL", country: "PL" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.perplexity.ai/v1/agent");
    expect(init.headers.Authorization).toBe("Bearer test");
    expect(JSON.parse(init.body)).toEqual({ preset: "fast", input: "Pytanie" });
    expect(res.citations).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("rzuca czytelny błąd przy HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    const { perplexityAdapter } = await import("@/lib/engines/perplexity");
    await expect(perplexityAdapter.query("x", { locale: "pl-PL", country: "PL" })).rejects.toThrow(/429/);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 3: Uruchom — FAIL**

- [ ] **Step 4: Implementacja**

`src/lib/engines/perplexity.ts`:
```ts
import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";

type AnyRecord = Record<string, unknown>;
const ENDPOINT = "https://api.perplexity.ai/v1/agent";

export function parsePerplexityResponse(raw: unknown): { text: string; citations: Citation[] } {
  const output = ((raw as AnyRecord)?.output ?? []) as AnyRecord[];
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const item of output) {
    if (item.type === "search_results") {
      for (const r of (item.results ?? []) as AnyRecord[]) {
        const c = toCitation(String(r.url ?? ""), r.title ? String(r.title) : undefined);
        if (c) citations.push(c);
      }
    }
    if (item.type === "message") {
      for (const part of (item.content ?? []) as AnyRecord[]) {
        if (part.type === "output_text") texts.push(String(part.text ?? ""));
      }
    }
  }
  return { text: texts.join("\n\n").trim(), citations: dedupeCitations(citations) };
}

export const perplexityAdapter: EngineAdapter = {
  id: "perplexity",
  async query(prompt): Promise<EngineResult> {
    const key = process.env.PERPLEXITY_API_KEY;
    if (!key) throw new Error("Brak PERPLEXITY_API_KEY");
    const preset = process.env.PERPLEXITY_PRESET ?? "fast";
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ preset, input: prompt }),
    });
    if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const raw = (await res.json()) as AnyRecord;
    const { text, citations } = parsePerplexityResponse(raw);
    return {
      text, citations, raw,
      model: String(raw.model ?? `preset:${preset}`),
      costUsd: ENGINE_COST_USD.perplexity,
      noAnswer: text.length === 0,
    };
  },
};
```

- [ ] **Step 5: Uruchom — PASS**

- [ ] **Step 6: Test na żywo**: `npm run try:engine -- perplexity` → polska odpowiedź + cytowania.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engines): Perplexity Agent API adapter"
```

---
### Task 8: Adapter Gemini (Interactions API + Google Search)

**Files:**
- Modify: `src/lib/engines/gemini.ts`
- Create: `tests/fixtures/responses/gemini.json`
- Test: `tests/engines/gemini.test.ts`

**Interfaces:**
- Produces: `geminiAdapter`, `parseGeminiResponse(raw)`.
- API (`@google/genai`): `new GoogleGenAI({ apiKey })` → `client.interactions.create({ model, input, tools: [{ type: "google_search" }] })`. Tekst: `interaction.output_text` lub `steps[].type === "model_output"` → `content[].type === "text"` → `.text`; cytowania: `content[].annotations[].type === "url_citation"` → `{ url, title }`. Darmowe 5000 wyszukiwań/mies. na projekt, potem $14/1000.

- [ ] **Step 1: Fixture**

`tests/fixtures/responses/gemini.json`:
```json
{
  "id": "int_1", "model": "gemini-3.8-flash", "status": "completed",
  "output_text": "Dobre szkolenia AI dla firm oferuje Polska Szkoła AI; alternatywą jest Akademia AI.",
  "steps": [
    { "type": "google_search_call", "arguments": { "queries": ["szkolenia AI dla firm"] } },
    { "type": "google_search_result", "search_suggestions": "<div/>" },
    {
      "type": "model_output",
      "content": [
        {
          "type": "text",
          "text": "Dobre szkolenia AI dla firm oferuje Polska Szkoła AI; alternatywą jest Akademia AI.",
          "annotations": [
            { "type": "url_citation", "url": "https://polskaszkola.ai/", "title": "Polska Szkoła AI", "startIndex": 36, "endIndex": 52 },
            { "type": "url_citation", "url": "https://akademia-ai.pl/oferta", "title": "Akademia AI", "startIndex": 71, "endIndex": 82 }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Test**

`tests/engines/gemini.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "../fixtures/responses/gemini.json";

const create = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { interactions = { create }; },
}));

describe("gemini adapter", () => {
  beforeEach(() => { create.mockReset(); process.env.GEMINI_API_KEY = "test"; });

  it("parseGeminiResponse: tekst z output_text, cytowania z annotations", async () => {
    const { parseGeminiResponse } = await import("@/lib/engines/gemini");
    const r = parseGeminiResponse(fixture);
    expect(r.text).toContain("Polska Szkoła AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "akademia-ai.pl"]);
  });

  it("parseGeminiResponse: bez output_text składa tekst ze steps", async () => {
    const { parseGeminiResponse } = await import("@/lib/engines/gemini");
    const { output_text: _omit, ...noText } = fixture;
    expect(parseGeminiResponse(noText).text).toContain("Akademia AI");
  });

  it("query używa google_search i zwraca EngineResult", async () => {
    create.mockResolvedValue(fixture);
    const { geminiAdapter } = await import("@/lib/engines/gemini");
    const res = await geminiAdapter.query("Pytanie", { locale: "pl-PL", country: "PL" });
    expect(create.mock.calls[0][0]).toMatchObject({ model: "gemini-3.8-flash", input: "Pytanie", tools: [{ type: "google_search" }] });
    expect(res.citations).toHaveLength(2);
    expect(res.model).toBe("gemini-3.8-flash");
  });
});
```

- [ ] **Step 3: Uruchom — FAIL**

- [ ] **Step 4: Implementacja**

`src/lib/engines/gemini.ts`:
```ts
import { GoogleGenAI } from "@google/genai";
import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";

type AnyRecord = Record<string, unknown>;

export function parseGeminiResponse(raw: unknown): { text: string; citations: Citation[] } {
  const r = raw as AnyRecord;
  const texts: string[] = [];
  const citations: Citation[] = [];
  for (const step of (r.steps ?? []) as AnyRecord[]) {
    if (step.type !== "model_output") continue;
    for (const part of (step.content ?? []) as AnyRecord[]) {
      if (part.type !== "text") continue;
      texts.push(String(part.text ?? ""));
      for (const a of (part.annotations ?? []) as AnyRecord[]) {
        if (a.type !== "url_citation") continue;
        const c = toCitation(String(a.url ?? ""), a.title ? String(a.title) : undefined);
        if (c) citations.push(c);
      }
    }
  }
  const text = typeof r.output_text === "string" && r.output_text.trim()
    ? r.output_text.trim()
    : texts.join("\n\n").trim();
  return { text, citations: dedupeCitations(citations) };
}

let client: GoogleGenAI | null = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error("Brak GEMINI_API_KEY");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

export const geminiAdapter: EngineAdapter = {
  id: "gemini",
  async query(prompt): Promise<EngineResult> {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
    const raw = await getClient().interactions.create({
      model,
      input: prompt,
      tools: [{ type: "google_search" }],
    } as never);
    const { text, citations } = parseGeminiResponse(raw);
    return {
      text, citations, raw,
      model: String((raw as AnyRecord).model ?? model),
      costUsd: ENGINE_COST_USD.gemini,
      noAnswer: text.length === 0,
    };
  },
};
```

Jeśli zainstalowana wersja `@google/genai` nie ma `client.interactions` (sprawdź `node -e "console.log(Object.keys(new (require('@google/genai').GoogleGenAI)({apiKey:'x'})))"`), użyj starszego API w tym samym pliku: `client.models.generateContent({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } })`, tekst z `response.text`, cytowania z `response.candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}` — i dopasuj fixture do tego kształtu.

- [ ] **Step 5: Uruchom — PASS**

- [ ] **Step 6: Test na żywo**: `npm run try:engine -- gemini`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engines): Gemini adapter with Google Search grounding"
```

---

### Task 9: Adapter Google AI Overviews (DataForSEO)

**Files:**
- Modify: `src/lib/engines/google-ai-overview.ts`
- Create: `tests/fixtures/responses/dataforseo-aio.json`, `tests/fixtures/responses/dataforseo-no-aio.json`
- Test: `tests/engines/google-ai-overview.test.ts`

**Interfaces:**
- Produces: `googleAiOverviewAdapter`, `parseDataForSeoResponse(raw)`.
- API: `POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced`, nagłówek `Authorization: Basic base64(login:password)`, body `[{ keyword, location_code: 2616, language_code: "pl", device: "desktop", load_async_ai_overview: true }]`. Wynik: `tasks[0].result[0].items[]`; element `type === "ai_overview"` ma `markdown` (lub `items[].{markdown,text}`), `references[].{url,domain,title}` oraz `items[].references` / `items[].links`. Brak elementu `ai_overview` → `noAnswer: true`.

- [ ] **Step 1: Potwierdź kod lokalizacji Polski**

```bash
curl -s -u "$DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD" https://api.dataforseo.com/v3/serp/google/locations \
  | jq '.tasks[0].result[] | select(.location_name=="Poland") | {location_code, location_name}'
```
Expected: `location_code: 2616`. Jeśli inny — popraw `DATAFORSEO_LOCATION_CODE` w `.env.example` i `.env.local`.

- [ ] **Step 2: Fixtures**

`tests/fixtures/responses/dataforseo-aio.json`:
```json
{
  "status_code": 20000, "cost": 0.004,
  "tasks": [{
    "result": [{
      "keyword": "najlepsze szkolenia AI dla firm", "type": "organic",
      "items": [
        { "type": "organic", "rank_absolute": 1, "url": "https://example.pl/" },
        {
          "type": "ai_overview", "rank_absolute": 0, "asynchronous_ai_overview": true,
          "markdown": "Najlepsze szkolenia AI dla firm w Polsce oferują m.in. **Polska Szkoła AI** oraz Akademia AI.",
          "items": [
            { "type": "ai_overview_element", "title": null, "text": "Polska Szkoła AI prowadzi warsztaty dla firm.", "markdown": "Polska Szkoła AI prowadzi warsztaty dla firm.",
              "links": [{ "title": "PSAI dla firm", "url": "https://polskaszkola.ai/dla-firm", "domain": "polskaszkola.ai" }],
              "references": [] }
          ],
          "references": [
            { "type": "ai_overview_reference", "source": "polskaszkola.ai", "domain": "polskaszkola.ai", "url": "https://polskaszkola.ai/dla-firm", "title": "PSAI dla firm", "text": "…" },
            { "type": "ai_overview_reference", "source": "akademia-ai.pl", "domain": "akademia-ai.pl", "url": "https://www.akademia-ai.pl/", "title": "Akademia AI", "text": "…" }
          ]
        }
      ]
    }]
  }]
}
```

`tests/fixtures/responses/dataforseo-no-aio.json`:
```json
{ "status_code": 20000, "cost": 0.002, "tasks": [{ "result": [{ "keyword": "x", "type": "organic", "items": [{ "type": "organic", "rank_absolute": 1, "url": "https://example.pl/" }] }] }] }
```

- [ ] **Step 3: Test**

`tests/engines/google-ai-overview.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import withAio from "../fixtures/responses/dataforseo-aio.json";
import noAio from "../fixtures/responses/dataforseo-no-aio.json";

describe("google ai overview adapter", () => {
  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = "l"; process.env.DATAFORSEO_PASSWORD = "p"; process.env.DATAFORSEO_LOCATION_CODE = "2616";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("parse: markdown + unikalne referencje (references i links)", async () => {
    const { parseDataForSeoResponse } = await import("@/lib/engines/google-ai-overview");
    const r = parseDataForSeoResponse(withAio);
    expect(r.noAnswer).toBe(false);
    expect(r.text).toContain("Polska Szkoła AI");
    expect(r.citations.map((c) => c.domain)).toEqual(["polskaszkola.ai", "akademia-ai.pl"]);
  });

  it("parse: brak AIO → noAnswer", async () => {
    const { parseDataForSeoResponse } = await import("@/lib/engines/google-ai-overview");
    const r = parseDataForSeoResponse(noAio);
    expect(r.noAnswer).toBe(true);
    expect(r.text).toBe("");
  });

  it("query wysyła poprawne body i Basic auth, koszt z odpowiedzi", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(withAio), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { googleAiOverviewAdapter } = await import("@/lib/engines/google-ai-overview");
    const res = await googleAiOverviewAdapter.query("najlepsze szkolenia AI dla firm", { locale: "pl-PL", country: "PL" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/advanced");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("l:p").toString("base64")}`);
    expect(JSON.parse(init.body)[0]).toEqual({
      keyword: "najlepsze szkolenia AI dla firm", location_code: 2616, language_code: "pl", device: "desktop", load_async_ai_overview: true,
    });
    expect(res.costUsd).toBe(0.004);
    expect(res.model).toBe("google_ai_overview");
  });
});
```

- [ ] **Step 4: Uruchom — FAIL**

- [ ] **Step 5: Implementacja**

`src/lib/engines/google-ai-overview.ts`:
```ts
import type { EngineAdapter, EngineResult, Citation } from "./types";
import { toCitation, dedupeCitations } from "./domain";
import { ENGINE_COST_USD } from "./costs";

type AnyRecord = Record<string, unknown>;
const ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

function pushRefs(list: unknown, out: Citation[]) {
  for (const ref of (list ?? []) as AnyRecord[]) {
    const c = toCitation(String(ref.url ?? ""), ref.title ? String(ref.title) : undefined);
    if (c) out.push(c);
  }
}

export function parseDataForSeoResponse(raw: unknown): { text: string; citations: Citation[]; noAnswer: boolean } {
  const tasks = ((raw as AnyRecord)?.tasks ?? []) as AnyRecord[];
  const results = (tasks[0]?.result ?? []) as AnyRecord[];
  const items = (results[0]?.items ?? []) as AnyRecord[];
  const aio = items.find((i) => i.type === "ai_overview");
  if (!aio) return { text: "", citations: [], noAnswer: true };

  const citations: Citation[] = [];
  pushRefs(aio.references, citations);
  const parts: string[] = [];
  if (typeof aio.markdown === "string" && aio.markdown.trim()) parts.push(aio.markdown.trim());
  for (const el of (aio.items ?? []) as AnyRecord[]) {
    const t = (el.markdown ?? el.text) as string | undefined;
    if (t && !parts.length) parts.push(String(t));
    pushRefs(el.references, citations);
    pushRefs(el.links, citations);
  }
  const text = parts.join("\n\n").trim();
  return { text, citations: dedupeCitations(citations), noAnswer: text.length === 0 };
}

export const googleAiOverviewAdapter: EngineAdapter = {
  id: "google_ai_overview",
  async query(prompt): Promise<EngineResult> {
    const login = process.env.DATAFORSEO_LOGIN, password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) throw new Error("Brak DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD");
    const body = [{
      keyword: prompt.slice(0, 700),
      location_code: Number(process.env.DATAFORSEO_LOCATION_CODE ?? 2616),
      language_code: "pl",
      device: "desktop",
      load_async_ai_overview: true,
    }];
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const raw = (await res.json()) as AnyRecord;
    if (raw.status_code !== 20000) throw new Error(`DataForSEO status ${raw.status_code}: ${raw.status_message}`);
    const taskStatus = ((raw.tasks as AnyRecord[])?.[0]?.status_code) as number | undefined;
    if (taskStatus && taskStatus !== 20000) {
      throw new Error(`DataForSEO task ${taskStatus}: ${(raw.tasks as AnyRecord[])[0].status_message}`);
    }
    const { text, citations, noAnswer } = parseDataForSeoResponse(raw);
    const cost = typeof raw.cost === "number" ? raw.cost : ENGINE_COST_USD.google_ai_overview;
    return { text, citations, raw, model: "google_ai_overview", costUsd: cost, noAnswer };
  },
};
```

- [ ] **Step 6: Uruchom — PASS**

- [ ] **Step 7: Test na żywo**: `npm run try:engine -- google_ai_overview najlepsze szkolenia AI dla firm` — zwraca markdown AIO albo `noAnswer` (Google nie zawsze pokazuje AIO; sprawdź 2–3 różne pytania).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(engines): Google AI Overviews adapter via DataForSEO"
```

---
### Task 10: Ekstrakcja wzmianek i klasyfikacja cytowań (regułowa)

**Files:**
- Create: `src/lib/extract/normalize.ts`, `src/lib/extract/brands.ts`, `src/lib/extract/citations.ts`
- Test: `tests/extract/brands.test.ts`, `tests/extract/citations.test.ts`

**Interfaces:**
- Produces:
```ts
export function foldText(s: string): string // lowercase + bez diakrytyków (NFD, usunięcie \p{M}), ł→l
export interface BrandDef { kind: "own" | "competitor"; name: string; aliases: string[]; competitorId?: string }
export interface Mention { kind: "own" | "competitor"; name: string; competitorId?: string; position: number; charIndex: number }
export function extractMentions(text: string, brands: BrandDef[]): Mention[]  // posortowane po charIndex; position 1..n
export interface ClassifiedCitation extends Citation { isOwn: boolean; competitorId?: string }
export function classifyCitations(citations: Citation[], ownDomains: string[], competitors: { id: string; domains: string[] }[]): ClassifiedCitation[]
```

- [ ] **Step 1: Testy**

`tests/extract/brands.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { foldText } from "@/lib/extract/normalize";
import { extractMentions, type BrandDef } from "@/lib/extract/brands";

const brands: BrandDef[] = [
  { kind: "own", name: "Polska Szkoła AI", aliases: ["Polska Szkoła AI", "PSAI", "polskaszkola.ai"] },
  { kind: "competitor", name: "Akademia AI", aliases: ["Akademia AI"], competitorId: "c1" },
];

describe("foldText", () => {
  it("usuwa diakrytyki i wielkość liter", () => {
    expect(foldText("Polska Szkoła AI — ŁÓDŹ")).toBe("polska szkola ai — lodz");
  });
});

describe("extractMentions", () => {
  it("znajduje marki w kolejności wystąpienia z pozycją 1..n", () => {
    const m = extractMentions("Polecam Akademia AI, a także Polską Szkołę AI (PSAI).", brands);
    expect(m.map((x) => [x.name, x.position])).toEqual([["Akademia AI", 1], ["Polska Szkoła AI", 2]]);
  });

  it("dopasowuje bez diakrytyków i wielkości liter", () => {
    const m = extractMentions("polska szkola ai to dobry wybór", brands);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("own");
  });

  it("nie dopasowuje aliasu wewnątrz innego słowa", () => {
    expect(extractMentions("Firma PSAIR i akademia-ai.pl", brands)).toHaveLength(0);
  });

  it("jedna marka liczona raz, nawet przy wielu aliasach", () => {
    const m = extractMentions("PSAI, czyli Polska Szkoła AI, polskaszkola.ai", brands);
    expect(m).toHaveLength(1);
    expect(m[0].charIndex).toBe(0);
  });

  it("pusty tekst → brak wzmianek", () => {
    expect(extractMentions("", brands)).toEqual([]);
  });
});
```

`tests/extract/citations.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { classifyCitations } from "@/lib/extract/citations";

describe("classifyCitations", () => {
  it("oznacza własne i konkurencyjne domeny, także z www i subdomeną", () => {
    const out = classifyCitations(
      [
        { url: "https://www.polskaszkola.ai/kursy?x=1", domain: "polskaszkola.ai" },
        { url: "https://blog.akademia-ai.pl/post", domain: "blog.akademia-ai.pl" },
        { url: "https://wikipedia.org/x", domain: "wikipedia.org" },
      ],
      ["polskaszkola.ai"],
      [{ id: "c1", domains: ["akademia-ai.pl"] }],
    );
    expect(out.map((c) => [c.isOwn, c.competitorId ?? null])).toEqual([[true, null], [false, "c1"], [false, null]]);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja**

`src/lib/extract/normalize.ts`:
```ts
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ł/g, "l").replace(/Ł/g, "L")
    .toLowerCase();
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

`src/lib/extract/brands.ts`:
```ts
import { foldText, escapeRegex } from "./normalize";

export interface BrandDef {
  kind: "own" | "competitor";
  name: string;
  aliases: string[];
  competitorId?: string;
}

export interface Mention {
  kind: "own" | "competitor";
  name: string;
  competitorId?: string;
  position: number;
  charIndex: number;
}

function firstIndex(folded: string, alias: string): number {
  const a = foldText(alias).trim();
  if (!a) return -1;
  // granice: początek/koniec lub znak, który nie jest literą ani cyfrą (unicode)
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escapeRegex(a)})(?=$|[^\\p{L}\\p{N}])`, "u");
  const m = re.exec(folded);
  if (!m) return -1;
  return m.index + m[0].length - m[1].length;
}

export function extractMentions(text: string, brands: BrandDef[]): Mention[] {
  if (!text) return [];
  const folded = foldText(text);
  const found: Omit<Mention, "position">[] = [];
  for (const b of brands) {
    const aliases = [b.name, ...b.aliases];
    let best = -1;
    for (const alias of aliases) {
      const i = firstIndex(folded, alias);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) found.push({ kind: b.kind, name: b.name, competitorId: b.competitorId, charIndex: best });
  }
  found.sort((x, y) => x.charIndex - y.charIndex);
  return found.map((f, i) => ({ ...f, position: i + 1 }));
}
```

`src/lib/extract/citations.ts`:
```ts
import type { Citation } from "@/lib/engines/types";
import { domainMatches } from "@/lib/engines/domain";

export interface ClassifiedCitation extends Citation {
  isOwn: boolean;
  competitorId?: string;
}

export function classifyCitations(
  citations: Citation[],
  ownDomains: string[],
  competitors: { id: string; domains: string[] }[],
): ClassifiedCitation[] {
  return citations.map((c) => {
    const isOwn = domainMatches(c.domain, ownDomains);
    const comp = isOwn ? undefined : competitors.find((k) => domainMatches(c.domain, k.domains));
    return comp ? { ...c, isOwn, competitorId: comp.id } : { ...c, isOwn };
  });
}
```

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(extract): rule-based brand mentions and citation classification"
```

---

### Task 11: Sentyment wzmianki o marce (Claude Haiku, structured output)

**Files:**
- Create: `src/lib/extract/sentiment.ts`
- Test: `tests/extract/sentiment.test.ts`

**Interfaces:**
- Produces:
```ts
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export interface SentimentResult { sentiment: Sentiment; summary: string }
export function analyzeSentiment(text: string, brandName: string, aliases: string[]): Promise<SentimentResult | null>
// null gdy brak ANTHROPIC_API_KEY (funkcja opcjonalna) lub gdy parsowanie się nie uda
```
- Model: `process.env.ANTHROPIC_SENTIMENT_MODEL ?? "claude-haiku-5-5"`, `client.messages.parse` + `zodOutputFormat`, `max_tokens: 512`.

- [ ] **Step 1: Test z mockiem SDK**

`tests/extract/sentiment.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { parse }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (s: unknown) => ({ type: "json_schema", schema: s }) }));

describe("analyzeSentiment", () => {
  beforeEach(() => { parse.mockReset(); });

  it("zwraca null bez klucza API", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { analyzeSentiment } = await import("@/lib/extract/sentiment");
    expect(await analyzeSentiment("x", "PSAI", [])).toBeNull();
  });

  it("zwraca sparsowany wynik", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    parse.mockResolvedValue({ parsed_output: { sentiment: "positive", summary: "Polecana jako solidna." }, stop_reason: "end_turn" });
    const { analyzeSentiment } = await import("@/lib/extract/sentiment");
    const r = await analyzeSentiment("PSAI jest solidna.", "Polska Szkoła AI", ["PSAI"]);
    expect(r).toEqual({ sentiment: "positive", summary: "Polecana jako solidna." });
    const args = parse.mock.calls[0][0];
    expect(args.model).toBe("claude-haiku-5-5");
    expect(args.messages[0].content).toContain("PSAI jest solidna.");
  });

  it("zwraca null gdy parsed_output puste", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    parse.mockResolvedValue({ parsed_output: null, stop_reason: "end_turn" });
    const { analyzeSentiment } = await import("@/lib/extract/sentiment");
    expect(await analyzeSentiment("x", "B", [])).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja**

`src/lib/extract/sentiment.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  summary: z.string().describe("Jedno zdanie po polsku: jak odpowiedź opisuje markę"),
});
export type Sentiment = z.infer<typeof SentimentSchema>["sentiment"];
export type SentimentResult = z.infer<typeof SentimentSchema>;

const SYSTEM = `Oceniasz, jak odpowiedź asystenta AI przedstawia wskazaną markę.
- positive: polecana, chwalona, wskazana jako dobry wybór
- neutral: wymieniona bez oceny
- negative: krytykowana, odradzana
- mixed: zalety i wady
Oceniaj wyłącznie fragmenty dotyczące tej marki.`;

let client: Anthropic | null = null;

export async function analyzeSentiment(
  text: string,
  brandName: string,
  aliases: string[],
): Promise<SentimentResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  const model = process.env.ANTHROPIC_SENTIMENT_MODEL ?? "claude-haiku-5-5";
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 512,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Marka: ${brandName} (aliasy: ${aliases.join(", ") || "brak"})\n\nOdpowiedź AI:\n${text}`,
      }],
      output_config: { format: zodOutputFormat(SentimentSchema) },
    });
    return res.parsed_output ?? null;
  } catch (err) {
    console.error("analyzeSentiment failed", err);
    return null;
  }
}
```

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(extract): brand sentiment via Claude structured output"
```

---

### Task 12: Agregacja metryk (czysta funkcja) i zapis `daily_metrics`

**Files:**
- Create: `src/lib/metrics/aggregate.ts`, `src/lib/metrics/persist.ts`
- Test: `tests/metrics/aggregate.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ResponseFacts {
  promptId: string; engineId: string; noAnswer: boolean; error: boolean;
  ownMentioned: boolean; ownPosition: number | null; ownCited: boolean;
  brandsMentioned: number; // liczba różnych marek (own + competitor) w odpowiedzi
}
export interface MetricRow {
  engineId: string | null; promptId: string | null; responsesCount: number;
  visibilityRate: number; avgPosition: number | null; citationRate: number; shareOfVoice: number; score: number;
}
export function computeScore(m: Pick<MetricRow,"visibilityRate"|"citationRate"|"shareOfVoice"|"avgPosition">): number
export function computeMetrics(rows: ResponseFacts[]): MetricRow[]   // ogółem + per silnik + per prompt + per (silnik,prompt)
export function upsertDailyMetrics(admin, projectId: string, date: string, rows: MetricRow[]): Promise<void>
```
- Definicje: mianownik = odpowiedzi bez `noAnswer` i bez `error`. `visibilityRate = ownMentioned/n`; `citationRate = ownCited/n`; `avgPosition` = średnia `ownPosition` po odpowiedziach z wzmianką; `shareOfVoice = Σ(ownMentioned) / Σ(brandsMentioned)` (0, gdy mianownik 0); `score = round(100 × (0.5·vis + 0.2·cit + 0.2·sov + 0.1·posScore))`, `posScore = avgPosition ? max(0, 1 − (avgPosition−1)/5) : 0`.

- [ ] **Step 1: Test**

`tests/metrics/aggregate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeMetrics, computeScore, type ResponseFacts } from "@/lib/metrics/aggregate";

const f = (p: Partial<ResponseFacts>): ResponseFacts => ({
  promptId: "p1", engineId: "openai", noAnswer: false, error: false,
  ownMentioned: false, ownPosition: null, ownCited: false, brandsMentioned: 0, ...p,
});

describe("computeScore", () => {
  it("100 przy pełnej widoczności na 1. pozycji", () => {
    expect(computeScore({ visibilityRate: 1, citationRate: 1, shareOfVoice: 1, avgPosition: 1 })).toBe(100);
  });
  it("0 bez widoczności", () => {
    expect(computeScore({ visibilityRate: 0, citationRate: 0, shareOfVoice: 0, avgPosition: null })).toBe(0);
  });
});

describe("computeMetrics", () => {
  const rows = [
    f({ ownMentioned: true, ownPosition: 1, ownCited: true, brandsMentioned: 2 }),
    f({ ownMentioned: false, brandsMentioned: 1 }),
    f({ engineId: "gemini", ownMentioned: true, ownPosition: 3, brandsMentioned: 3 }),
    f({ engineId: "gemini", promptId: "p2", noAnswer: true }),   // wyłączone z mianownika
    f({ engineId: "gemini", promptId: "p2", error: true }),      // wyłączone z mianownika
  ];

  it("liczy ogółem z pominięciem noAnswer/error", () => {
    const all = computeMetrics(rows).find((m) => m.engineId === null && m.promptId === null)!;
    expect(all.responsesCount).toBe(3);
    expect(all.visibilityRate).toBeCloseTo(2 / 3);
    expect(all.citationRate).toBeCloseTo(1 / 3);
    expect(all.avgPosition).toBeCloseTo(2);
    expect(all.shareOfVoice).toBeCloseTo(2 / 6);
  });

  it("liczy per silnik i per prompt", () => {
    const out = computeMetrics(rows);
    const gemini = out.find((m) => m.engineId === "gemini" && m.promptId === null)!;
    expect(gemini.responsesCount).toBe(1);
    expect(gemini.visibilityRate).toBe(1);
    const p1 = out.find((m) => m.engineId === null && m.promptId === "p1")!;
    expect(p1.responsesCount).toBe(3);
    const cell = out.find((m) => m.engineId === "openai" && m.promptId === "p1")!;
    expect(cell.visibilityRate).toBeCloseTo(0.5);
  });

  it("pusty zbiór → jeden wiersz ogółem z zerami", () => {
    const out = computeMetrics([]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ engineId: null, promptId: null, responsesCount: 0, score: 0, avgPosition: null });
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja**

`src/lib/metrics/aggregate.ts`:
```ts
export interface ResponseFacts {
  promptId: string;
  engineId: string;
  noAnswer: boolean;
  error: boolean;
  ownMentioned: boolean;
  ownPosition: number | null;
  ownCited: boolean;
  brandsMentioned: number;
}

export interface MetricRow {
  engineId: string | null;
  promptId: string | null;
  responsesCount: number;
  visibilityRate: number;
  avgPosition: number | null;
  citationRate: number;
  shareOfVoice: number;
  score: number;
}

export function computeScore(m: Pick<MetricRow, "visibilityRate" | "citationRate" | "shareOfVoice" | "avgPosition">): number {
  const posScore = m.avgPosition ? Math.max(0, 1 - (m.avgPosition - 1) / 5) : 0;
  return Math.round(100 * (0.5 * m.visibilityRate + 0.2 * m.citationRate + 0.2 * m.shareOfVoice + 0.1 * posScore));
}

function summarize(engineId: string | null, promptId: string | null, rows: ResponseFacts[]): MetricRow {
  const valid = rows.filter((r) => !r.noAnswer && !r.error);
  const n = valid.length;
  const mentioned = valid.filter((r) => r.ownMentioned);
  const positions = mentioned.map((r) => r.ownPosition).filter((p): p is number => p != null);
  const totalBrands = valid.reduce((s, r) => s + r.brandsMentioned, 0);
  const base = {
    engineId, promptId, responsesCount: n,
    visibilityRate: n ? mentioned.length / n : 0,
    avgPosition: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
    citationRate: n ? valid.filter((r) => r.ownCited).length / n : 0,
    shareOfVoice: totalBrands ? mentioned.length / totalBrands : 0,
  };
  return { ...base, score: computeScore(base) };
}

export function computeMetrics(rows: ResponseFacts[]): MetricRow[] {
  const engines = [...new Set(rows.map((r) => r.engineId))];
  const prompts = [...new Set(rows.map((r) => r.promptId))];
  const out: MetricRow[] = [summarize(null, null, rows)];
  for (const e of engines) out.push(summarize(e, null, rows.filter((r) => r.engineId === e)));
  for (const p of prompts) out.push(summarize(null, p, rows.filter((r) => r.promptId === p)));
  for (const e of engines) for (const p of prompts) {
    const cell = rows.filter((r) => r.engineId === e && r.promptId === p);
    if (cell.length) out.push(summarize(e, p, cell));
  }
  return out;
}
```

`src/lib/metrics/persist.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";
import type { MetricRow } from "./aggregate";

export async function upsertDailyMetrics(
  admin: SupabaseClient<Database>,
  projectId: string,
  date: string, // YYYY-MM-DD
  rows: MetricRow[],
) {
  // unikalny indeks używa coalesce(), więc upsert robimy przez delete + insert dla tej daty
  const { error: delErr } = await admin.from("daily_metrics").delete().eq("project_id", projectId).eq("date", date);
  if (delErr) throw new Error(delErr.message);
  const { error } = await admin.from("daily_metrics").insert(
    rows.map((m) => ({
      project_id: projectId, date,
      engine_id: m.engineId, prompt_id: m.promptId,
      responses_count: m.responsesCount,
      visibility_rate: m.visibilityRate, avg_position: m.avgPosition,
      citation_rate: m.citationRate, share_of_voice: m.shareOfVoice, score: m.score,
    })),
  );
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(metrics): aggregate visibility metrics and persist daily snapshots"
```

---
### Task 13: Zadania w tle (Trigger.dev): run-project, query-engine, agregacja, cost guard, cron

**Files:**
- Create: `trigger.config.ts`, `src/trigger/run-project.ts`, `src/trigger/query-engine.ts`, `src/trigger/aggregate-project.ts`
- Create: `src/lib/budget.ts`, `src/lib/runs/plan.ts`, `src/lib/runs/guard.ts`, `src/lib/runs/process-response.ts`
- Create: `src/app/api/cron/weekly/route.ts`, `vercel.json`, `src/app/app/actions.ts` (akcja „Uruchom teraz”)
- Test: `tests/runs/plan.test.ts`, `tests/runs/guard.test.ts`, `tests/runs/process-response.test.ts`, `tests/budget.test.ts`

**Interfaces:**
- Consumes: `getAdapter`, `ENGINE_COST_USD`, `extractMentions`, `classifyCitations`, `analyzeSentiment`, `computeMetrics`, `upsertDailyMetrics`, `createAdminSupabase`.
- Produces:
```ts
// src/lib/runs/plan.ts
export interface QueryJob { promptId: string; promptText: string; engineId: EngineId; sampleIdx: number }
export function planQueries(prompts: { id: string; text: string; is_key: boolean }[], engines: EngineId[]): QueryJob[]
export function estimateCost(jobs: QueryJob[]): number
// src/lib/runs/guard.ts
export type RunDecision = { kind: "empty" } | { kind: "budget_exceeded"; spent: number; estimate: number } | { kind: "go" }
export function decideRun(jobsCount: number, spent: number, estimate: number, budget: number): RunDecision
// src/lib/budget.ts
export function monthStartIso(now?: Date): string
export async function monthSpend(admin, projectId: string, now?: Date): Promise<number>
// src/lib/runs/process-response.ts
export interface ProcessedResponse { facts: ResponseFacts; mentions: Mention[]; citations: ClassifiedCitation[]; sentiment: SentimentResult | null }
export async function processResponse(input: { promptId: string; engineId: EngineId; result: EngineResult; project: ProjectBrand; competitors: CompetitorBrand[] }, deps?: { sentiment?: typeof analyzeSentiment }): Promise<ProcessedResponse>
// zadania: run-project (payload { projectId, source: "manual"|"cron" }), query-engine (payload { runId, projectId, job: QueryJob }), aggregate-project (payload { projectId, date })
```

- [ ] **Step 1: Testy czystych funkcji**

`tests/runs/plan.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planQueries, estimateCost } from "@/lib/runs/plan";

describe("planQueries", () => {
  it("1 próbka zwykłe, 3 próbki kluczowe, dla każdego silnika", () => {
    const jobs = planQueries(
      [{ id: "a", text: "A", is_key: false }, { id: "b", text: "B", is_key: true }],
      ["openai", "gemini"],
    );
    expect(jobs).toHaveLength(2 * (1 + 3));
    expect(jobs.filter((j) => j.promptId === "b" && j.engineId === "openai").map((j) => j.sampleIdx)).toEqual([0, 1, 2]);
  });
  it("brak promptów lub silników → pusto", () => {
    expect(planQueries([], ["openai"])).toEqual([]);
    expect(planQueries([{ id: "a", text: "A", is_key: false }], [])).toEqual([]);
  });
});

describe("estimateCost", () => {
  it("sumuje koszt wg silnika", () => {
    const jobs = planQueries([{ id: "a", text: "A", is_key: false }], ["openai", "google_ai_overview"]);
    expect(estimateCost(jobs)).toBeCloseTo(0.012 + 0.004);
  });
});
```

`tests/runs/guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { decideRun } from "@/lib/runs/guard";

describe("decideRun", () => {
  it("empty bez zadań", () => expect(decideRun(0, 0, 0, 30).kind).toBe("empty"));
  it("budget_exceeded gdy wydatki + szacunek > budżet", () => expect(decideRun(10, 29.5, 1, 30).kind).toBe("budget_exceeded"));
  it("go gdy mieści się w budżecie", () => expect(decideRun(10, 10, 1, 30).kind).toBe("go"));
});
```

`tests/runs/process-response.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { processResponse } from "@/lib/runs/process-response";

const project = { brandName: "Polska Szkoła AI", aliases: ["PSAI"], domains: ["polskaszkola.ai"] };
const competitors = [{ id: "c1", name: "Akademia AI", aliases: [], domains: ["akademia-ai.pl"] }];

describe("processResponse", () => {
  it("łączy wzmianki, cytowania i fakty; sentyment tylko gdy marka wspomniana", async () => {
    const sentiment = vi.fn().mockResolvedValue({ sentiment: "positive", summary: "ok" });
    const out = await processResponse({
      promptId: "p", engineId: "openai",
      result: {
        text: "Polecam Akademia AI i PSAI.", model: "m", raw: {}, costUsd: 0.01,
        citations: [{ url: "https://polskaszkola.ai/x", domain: "polskaszkola.ai" }],
      },
      project, competitors,
    }, { sentiment });
    expect(out.facts).toMatchObject({ ownMentioned: true, ownPosition: 2, ownCited: true, brandsMentioned: 2, noAnswer: false, error: false });
    expect(out.sentiment?.sentiment).toBe("positive");
    expect(sentiment).toHaveBeenCalledOnce();
  });

  it("bez wzmianki nie woła sentymentu", async () => {
    const sentiment = vi.fn();
    const out = await processResponse({
      promptId: "p", engineId: "gemini",
      result: { text: "Nic o nas.", model: "m", raw: {}, costUsd: 0, citations: [] },
      project, competitors,
    }, { sentiment });
    expect(out.facts.ownMentioned).toBe(false);
    expect(sentiment).not.toHaveBeenCalled();
  });

  it("noAnswer przenosi się do faktów", async () => {
    const out = await processResponse({
      promptId: "p", engineId: "google_ai_overview",
      result: { text: "", model: "m", raw: {}, costUsd: 0, citations: [], noAnswer: true },
      project, competitors,
    }, { sentiment: vi.fn() });
    expect(out.facts.noAnswer).toBe(true);
  });
});
```

`tests/budget.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { monthStartIso } from "@/lib/budget";

describe("monthStartIso", () => {
  it("zwraca pierwszy dzień miesiąca w UTC", () => {
    expect(monthStartIso(new Date("2026-10-12T15:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja funkcji czystych**

`src/lib/runs/plan.ts`:
```ts
import type { EngineId } from "@/lib/engines/types";
import { ENGINE_COST_USD } from "@/lib/engines/registry";

export const KEY_PROMPT_SAMPLES = 3;

export interface QueryJob {
  promptId: string;
  promptText: string;
  engineId: EngineId;
  sampleIdx: number;
}

export function planQueries(
  prompts: { id: string; text: string; is_key: boolean }[],
  engines: EngineId[],
): QueryJob[] {
  const jobs: QueryJob[] = [];
  for (const p of prompts) {
    const samples = p.is_key ? KEY_PROMPT_SAMPLES : 1;
    for (const engineId of engines) {
      for (let sampleIdx = 0; sampleIdx < samples; sampleIdx++) {
        jobs.push({ promptId: p.id, promptText: p.text, engineId, sampleIdx });
      }
    }
  }
  return jobs;
}

export function estimateCost(jobs: QueryJob[]): number {
  return jobs.reduce((s, j) => s + ENGINE_COST_USD[j.engineId], 0);
}
```

`src/lib/runs/guard.ts`:
```ts
export type RunDecision =
  | { kind: "empty" }
  | { kind: "budget_exceeded"; spent: number; estimate: number }
  | { kind: "go" };

export function decideRun(jobsCount: number, spent: number, estimate: number, budget: number): RunDecision {
  if (jobsCount === 0) return { kind: "empty" };
  if (spent + estimate > budget) return { kind: "budget_exceeded", spent, estimate };
  return { kind: "go" };
}
```

`src/lib/budget.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db-types";

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function monthSpend(admin: SupabaseClient<Database>, projectId: string, now = new Date()): Promise<number> {
  const { data, error } = await admin
    .from("runs").select("cost_usd").eq("project_id", projectId).gte("started_at", monthStartIso(now));
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}
```

`src/lib/runs/process-response.ts`:
```ts
import type { EngineId, EngineResult } from "@/lib/engines/types";
import { extractMentions, type BrandDef, type Mention } from "@/lib/extract/brands";
import { classifyCitations, type ClassifiedCitation } from "@/lib/extract/citations";
import { analyzeSentiment, type SentimentResult } from "@/lib/extract/sentiment";
import type { ResponseFacts } from "@/lib/metrics/aggregate";

export interface ProjectBrand { brandName: string; aliases: string[]; domains: string[] }
export interface CompetitorBrand { id: string; name: string; aliases: string[]; domains: string[] }

export interface ProcessedResponse {
  facts: ResponseFacts;
  mentions: Mention[];
  citations: ClassifiedCitation[];
  sentiment: SentimentResult | null;
}

export async function processResponse(
  input: { promptId: string; engineId: EngineId; result: EngineResult; project: ProjectBrand; competitors: CompetitorBrand[] },
  deps: { sentiment?: typeof analyzeSentiment } = {},
): Promise<ProcessedResponse> {
  const { promptId, engineId, result, project, competitors } = input;
  const brands: BrandDef[] = [
    { kind: "own", name: project.brandName, aliases: project.aliases },
    ...competitors.map((c) => ({ kind: "competitor" as const, name: c.name, aliases: c.aliases, competitorId: c.id })),
  ];
  const mentions = result.noAnswer ? [] : extractMentions(result.text, brands);
  const citations = classifyCitations(result.citations, project.domains, competitors);
  const own = mentions.find((m) => m.kind === "own");
  const sentimentFn = deps.sentiment ?? analyzeSentiment;
  const sentiment = own ? await sentimentFn(result.text, project.brandName, project.aliases) : null;
  return {
    facts: {
      promptId, engineId,
      noAnswer: Boolean(result.noAnswer), error: false,
      ownMentioned: Boolean(own), ownPosition: own?.position ?? null,
      ownCited: citations.some((c) => c.isOwn),
      brandsMentioned: mentions.length,
    },
    mentions, citations, sentiment,
  };
}
```

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Konfiguracja Trigger.dev**

Załóż projekt na https://cloud.trigger.dev (plan darmowy wystarczy), skopiuj `project ref` i klucz `TRIGGER_SECRET_KEY` (dev) do `.env.local`. W panelu Trigger.dev → Environment variables (dev i prod) dodaj: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY` i opcjonalne `*_MODEL`.

`trigger.config.ts`:
```ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "<project ref z panelu>",
  dirs: ["./src/trigger"],
  maxDuration: 900,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 30000, factor: 2, randomize: true },
  },
});
```

- [ ] **Step 6: Zadanie `query-engine`**

`src/trigger/query-engine.ts`:
```ts
import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/engines/registry";
import type { EngineResult } from "@/lib/engines/types";
import { processResponse, type ProjectBrand, type CompetitorBrand } from "@/lib/runs/process-response";
import type { QueryJob } from "@/lib/runs/plan";

export interface QueryEnginePayload {
  runId: string;
  projectId: string;
  job: QueryJob;
  project: ProjectBrand & { locale: string; country: string };
  competitors: CompetitorBrand[];
}

export const queryEngine = task({
  id: "query-engine",
  queue: { concurrencyLimit: 4 },
  retry: { maxAttempts: 2 },
  run: async (payload: QueryEnginePayload) => {
    const admin = createAdminSupabase();
    const { runId, projectId, job, project, competitors } = payload;
    let result: EngineResult | null = null;
    let errorMessage: string | null = null;

    try {
      result = await getAdapter(job.engineId).query(job.promptText, { locale: project.locale, country: project.country });
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    if (!result) {
      await admin.from("responses").insert({
        run_id: runId, project_id: projectId, prompt_id: job.promptId, engine_id: job.engineId,
        sample_idx: job.sampleIdx, error: errorMessage, text: "",
      });
      return { ok: false as const, costUsd: 0, error: errorMessage };
    }

    const processed = await processResponse({ promptId: job.promptId, engineId: job.engineId, result, project, competitors });

    const { data: response, error } = await admin.from("responses").insert({
      run_id: runId, project_id: projectId, prompt_id: job.promptId, engine_id: job.engineId,
      sample_idx: job.sampleIdx, text: result.text, citations: result.citations as never,
      model: result.model, raw: result.raw as never, cost_usd: result.costUsd,
      no_answer: Boolean(result.noAnswer),
      sentiment: processed.sentiment?.sentiment ?? null, sentiment_summary: processed.sentiment?.summary ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);

    if (processed.mentions.length) {
      await admin.from("mentions").insert(processed.mentions.map((m) => ({
        response_id: response.id, project_id: projectId, brand_kind: m.kind, brand_name: m.name,
        competitor_id: m.competitorId ?? null, position: m.position, char_index: m.charIndex,
      })));
    }
    if (processed.citations.length) {
      await admin.from("citations").insert(processed.citations.map((c) => ({
        response_id: response.id, project_id: projectId, url: c.url, domain: c.domain, title: c.title ?? null,
        is_own: c.isOwn, competitor_id: c.competitorId ?? null,
      })));
    }
    return { ok: true as const, costUsd: result.costUsd, error: null };
  },
});
```

- [ ] **Step 7: Zadanie `aggregate-project`**

`src/trigger/aggregate-project.ts`:
```ts
import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeMetrics, type ResponseFacts } from "@/lib/metrics/aggregate";
import { upsertDailyMetrics } from "@/lib/metrics/persist";

export const aggregateProject = task({
  id: "aggregate-project",
  run: async (payload: { projectId: string; runId: string; date: string }) => {
    const admin = createAdminSupabase();
    const { data: responses, error } = await admin
      .from("responses").select("id, prompt_id, engine_id, no_answer, error").eq("run_id", payload.runId);
    if (error) throw new Error(error.message);
    const ids = (responses ?? []).map((r) => r.id);
    const [{ data: mentions }, { data: citations }] = await Promise.all([
      admin.from("mentions").select("response_id, brand_kind, position").in("response_id", ids),
      admin.from("citations").select("response_id, is_own").in("response_id", ids),
    ]);
    const facts: ResponseFacts[] = (responses ?? []).map((r) => {
      const ms = (mentions ?? []).filter((m) => m.response_id === r.id);
      const own = ms.find((m) => m.brand_kind === "own");
      return {
        promptId: r.prompt_id, engineId: r.engine_id,
        noAnswer: r.no_answer, error: Boolean(r.error),
        ownMentioned: Boolean(own), ownPosition: own?.position ?? null,
        ownCited: (citations ?? []).some((c) => c.response_id === r.id && c.is_own),
        brandsMentioned: ms.length,
      };
    });
    const rows = computeMetrics(facts);
    await upsertDailyMetrics(admin, payload.projectId, payload.date, rows);
    return { rows: rows.length, score: rows[0]?.score ?? 0 };
  },
});
```

- [ ] **Step 8: Zadanie `run-project` (orkiestrator z cost guardem)**

`src/trigger/run-project.ts`:
```ts
import { task } from "@trigger.dev/sdk";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isEngineId } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { planQueries, estimateCost } from "@/lib/runs/plan";
import { decideRun } from "@/lib/runs/guard";
import { monthSpend } from "@/lib/budget";
import { queryEngine } from "./query-engine";
import { aggregateProject } from "./aggregate-project";

export const runProject = task({
  id: "run-project",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (payload: { projectId: string; source: "manual" | "cron" }) => {
    const admin = createAdminSupabase();
    const { projectId } = payload;

    const [{ data: project }, { data: prompts }, { data: engines }, { data: competitors }] = await Promise.all([
      admin.from("projects").select("*").eq("id", projectId).single(),
      admin.from("prompts").select("id, text, is_key").eq("project_id", projectId).eq("active", true),
      admin.from("project_engines").select("engine_id").eq("project_id", projectId).eq("enabled", true),
      admin.from("competitors").select("id, name, aliases, domains").eq("project_id", projectId),
    ]);
    if (!project) throw new Error(`Projekt ${projectId} nie istnieje`);

    const engineIds = (engines ?? []).map((e) => e.engine_id).filter(isEngineId) as EngineId[];
    const jobs = planQueries(prompts ?? [], engineIds);

    const { data: run } = await admin.from("runs")
      .insert({ project_id: projectId, trigger_source: payload.source, queries_total: jobs.length })
      .select("id").single();
    const runId = run!.id;

    const spent = await monthSpend(admin, projectId);
    const estimate = estimateCost(jobs);
    const budget = Number(project.monthly_budget_usd);
    const decision = decideRun(jobs.length, spent, estimate, budget);
    if (decision.kind === "empty") {
      await admin.from("runs").update({ status: "empty", finished_at: new Date().toISOString(), error: "Brak aktywnych promptów lub silników" }).eq("id", runId);
      return { runId, status: "empty" as const };
    }
    if (decision.kind === "budget_exceeded") {
      await admin.from("runs").update({
        status: "budget_exceeded", finished_at: new Date().toISOString(),
        error: `Budżet ${budget} USD: wydano ${spent.toFixed(2)}, run kosztowałby ~${estimate.toFixed(2)}`,
      }).eq("id", runId);
      return { runId, status: "budget_exceeded" as const };
    }

    const brand = {
      brandName: project.brand_name, aliases: project.brand_aliases, domains: project.domains,
      locale: project.locale, country: project.country,
    };
    const results = await queryEngine.batchTriggerAndWait(
      jobs.map((job) => ({ payload: { runId, projectId, job, project: brand, competitors: competitors ?? [] } })),
    );

    let cost = 0, failed = 0;
    for (const r of results.runs) {
      if (r.ok) { cost += r.output.costUsd; if (!r.output.ok) failed++; }
      else failed++;
    }

    const date = new Date().toISOString().slice(0, 10);
    await aggregateProject.triggerAndWait({ projectId, runId, date });

    await admin.from("runs").update({
      status: failed === jobs.length ? "failed" : "done",
      finished_at: new Date().toISOString(), cost_usd: cost, queries_failed: failed,
    }).eq("id", runId);

    return { runId, status: "done" as const, cost, failed, total: jobs.length };
  },
});
```

Uwaga do cost guard: sprawdzamy budżet **przed** runem na podstawie szacunku (`ENGINE_COST_USD`). To spełnia wymaganie „run zatrzymuje się po przekroczeniu” bez sprawdzania per zapytanie (zapytania idą równolegle). Rzeczywisty koszt trafia do `runs.cost_usd` i wpływa na kolejny run.

- [ ] **Step 9: Akcja „Uruchom teraz” i cron**

`src/app/app/actions.ts`:
```ts
"use server";
import { tasks } from "@trigger.dev/sdk";
import { revalidatePath } from "next/cache";
import type { runProject } from "@/trigger/run-project";
import { getCurrentProject } from "@/lib/workspace";

export async function runNow() {
  const project = await getCurrentProject();
  await tasks.trigger<typeof runProject>("run-project", { projectId: project.id, source: "manual" });
  revalidatePath("/app");
}
```

`src/app/api/cron/weekly/route.ts`:
```ts
import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import type { runProject } from "@/trigger/run-project";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminSupabase();
  const { data: projects } = await admin.from("projects").select("id").eq("schedule", "weekly");
  const handles = await Promise.all(
    (projects ?? []).map((p) => tasks.trigger<typeof runProject>("run-project", { projectId: p.id, source: "cron" })),
  );
  return NextResponse.json({ triggered: handles.length });
}
```

`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/weekly", "schedule": "0 5 * * 1" }] }
```
(Vercel wysyła nagłówek `Authorization: Bearer $CRON_SECRET` automatycznie, gdy zmienna `CRON_SECRET` jest ustawiona w projekcie.)

- [ ] **Step 10: Testy orkiestracji**

Run: `npm test`
Expected: PASS, w tym `tests/runs/guard.test.ts` (review-focus #4 `budget_exceeded` i #5 `empty`).

- [ ] **Step 11: Uruchomienie lokalne**

Terminal 1: `npm run dev`. Terminal 2: `npx trigger.dev@latest dev`. Dodaj tymczasowo przycisk na `/app`:
```tsx
import { runNow } from "./actions";
// w JSX:
<form action={runNow}><button className="rounded bg-black px-3 py-2 text-white">Uruchom teraz</button></form>
```
Kliknij. W panelu Trigger.dev widać `run-project` → N × `query-engine` → `aggregate-project`. W Studio: `runs.status = done`, `responses` z tekstem i `raw`, `mentions`, `citations`, `daily_metrics` (wiersz ogółem + per silnik + per prompt).

Expected: dla 10 promptów seedu × 4 silniki × (1 lub 3 próbki) = 4 × (6 + 4×3) = **72 zapytania**, koszt ~0,6 USD, czas 3–6 min.

Test review-focus #3 (błąd jednego silnika): ustaw w `.env` Trigger.dev zły `PERPLEXITY_API_KEY`, uruchom ponownie → run `done`, `queries_failed` = liczba zapytań Perplexity, pozostałe silniki mają odpowiedzi, metryki policzone. Przywróć klucz.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(jobs): Trigger.dev run orchestration, cost guard, aggregation and weekly cron"
```

---
### Task 14: Biblioteka promptów i tematów + generator (Claude)

**Files:**
- Create: `src/lib/prompts/generate.ts`, `src/app/app/prompts/page.tsx`, `src/app/app/prompts/actions.ts`, `src/app/app/prompts/generate/page.tsx`
- Test: `tests/prompts/generate.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PromptProposal { text: string; topic: string; intent: "informational"|"comparison"|"transactional"|"brand" }
export function generatePromptProposals(input: { brandName: string; facts: Record<string, unknown>; topics: string[]; seedPhrases: string[]; personas: string[]; count: number }): Promise<PromptProposal[]>
```
Akcje: `addPrompt`, `togglePromptActive`, `togglePromptKey`, `deletePrompt`, `addTopic`, `acceptProposals(formData)` (zaznaczone propozycje → `prompts`, brakujące tematy → `topics`).
- Model: `process.env.ANTHROPIC_GENERATOR_MODEL ?? "claude-opus-5-5"`, `messages.parse` + `zodOutputFormat`, `max_tokens: 16000`, `output_config: { effort: "medium" }`.

- [ ] **Step 1: Test generatora z mockiem**

`tests/prompts/generate.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { parse }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (s: unknown) => ({ type: "json_schema", schema: s }) }));

describe("generatePromptProposals", () => {
  it("zwraca propozycje i przekazuje kontekst marki", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    parse.mockResolvedValue({ parsed_output: { prompts: [{ text: "Jaki kurs AI dla HR?", topic: "Kursy AI dla firm", intent: "comparison" }] } });
    const { generatePromptProposals } = await import("@/lib/prompts/generate");
    const out = await generatePromptProposals({
      brandName: "Polska Szkoła AI", facts: { oferta: "szkolenia" }, topics: ["Kursy AI dla firm"],
      seedPhrases: ["szkolenia AI"], personas: ["HR manager"], count: 10,
    });
    expect(out).toHaveLength(1);
    const content = parse.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain("HR manager");
    expect(content).toContain("szkolenia AI");
  });

  it("rzuca czytelny błąd bez klucza", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { generatePromptProposals } = await import("@/lib/prompts/generate");
    await expect(generatePromptProposals({ brandName: "X", facts: {}, topics: [], seedPhrases: [], personas: [], count: 5 })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja generatora**

`src/lib/prompts/generate.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const ProposalSchema = z.object({
  prompts: z.array(z.object({
    text: z.string().describe("Naturalne pytanie po polsku, jakie użytkownik zadałby asystentowi AI"),
    topic: z.string().describe("Nazwa tematu (klastra)"),
    intent: z.enum(["informational", "comparison", "transactional", "brand"]),
  })),
});
export type PromptProposal = z.infer<typeof ProposalSchema>["prompts"][number];

const SYSTEM = `Tworzysz zestaw pytań do monitorowania widoczności marki w asystentach AI (ChatGPT, Gemini, Perplexity, Google AI Overviews).
Zasady:
- Pytania po polsku, tak jak piszą prawdziwi użytkownicy (różna długość, czasem potoczne).
- Większość pytań NIE zawiera nazwy marki (intencje informational/comparison/transactional); tylko intent "brand" ją zawiera.
- Pokryj różne persony i etapy decyzji: szukam informacji, porównuję, chcę kupić.
- Unikaj duplikatów i pytań, których nie da się sensownie zadać asystentowi.`;

export async function generatePromptProposals(input: {
  brandName: string; facts: Record<string, unknown>; topics: string[]; seedPhrases: string[]; personas: string[]; count: number;
}): Promise<PromptProposal[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Brak ANTHROPIC_API_KEY");
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: process.env.ANTHROPIC_GENERATOR_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(ProposalSchema) },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        `Marka: ${input.brandName}`,
        `Karta faktów: ${JSON.stringify(input.facts)}`,
        `Istniejące tematy: ${input.topics.join("; ") || "brak"}`,
        `Frazy seed: ${input.seedPhrases.join("; ") || "brak"}`,
        `Persony: ${input.personas.join("; ") || "ogólny użytkownik"}`,
        `Wygeneruj ${input.count} pytań.`,
      ].join("\n"),
    }],
  });
  return res.parsed_output?.prompts ?? [];
}
```

- [ ] **Step 4: Uruchom — PASS**

- [ ] **Step 5: Akcje**

`src/app/app/prompts/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { parseList } from "@/lib/validation/settings";
import { generatePromptProposals, type PromptProposal } from "@/lib/prompts/generate";

const Intent = z.enum(["informational", "comparison", "transactional", "brand"]);

export async function addTopic(formData: FormData) {
  const project = await getCurrentProject();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createServerSupabase();
  await supabase.from("topics").insert({ project_id: project.id, name });
  revalidatePath("/app/prompts");
}

export async function addPrompt(formData: FormData) {
  const project = await getCurrentProject();
  const text = String(formData.get("text") ?? "").trim();
  const topic_id = String(formData.get("topic_id") ?? "") || null;
  const intent = Intent.parse(formData.get("intent") ?? "informational");
  if (!text) return;
  const supabase = await createServerSupabase();
  await supabase.from("prompts").insert({ project_id: project.id, text, topic_id, intent, is_key: formData.get("is_key") === "on" });
  revalidatePath("/app/prompts");
}

export async function togglePromptActive(formData: FormData) {
  const supabase = await createServerSupabase();
  await supabase.from("prompts").update({ active: formData.get("active") === "true" }).eq("id", String(formData.get("id")));
  revalidatePath("/app/prompts");
}

export async function togglePromptKey(formData: FormData) {
  const supabase = await createServerSupabase();
  await supabase.from("prompts").update({ is_key: formData.get("is_key") === "true" }).eq("id", String(formData.get("id")));
  revalidatePath("/app/prompts");
}

export async function deletePrompt(formData: FormData) {
  const supabase = await createServerSupabase();
  await supabase.from("prompts").delete().eq("id", String(formData.get("id")));
  revalidatePath("/app/prompts");
}

export async function generateProposals(formData: FormData): Promise<PromptProposal[]> {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const { data: topics } = await supabase.from("topics").select("name").eq("project_id", project.id);
  return generatePromptProposals({
    brandName: project.brand_name,
    facts: project.facts as Record<string, unknown>,
    topics: (topics ?? []).map((t) => t.name),
    seedPhrases: parseList(String(formData.get("seed") ?? "")),
    personas: parseList(String(formData.get("personas") ?? "")),
    count: Number(formData.get("count") ?? 15),
  });
}

export async function acceptProposals(formData: FormData) {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const selected = formData.getAll("selected").map((v) => JSON.parse(String(v)) as PromptProposal);
  if (!selected.length) return;
  const { data: existing } = await supabase.from("topics").select("id, name").eq("project_id", project.id);
  const topicIds = new Map((existing ?? []).map((t) => [t.name, t.id]));
  for (const name of new Set(selected.map((p) => p.topic))) {
    if (!topicIds.has(name)) {
      const { data } = await supabase.from("topics").insert({ project_id: project.id, name }).select("id").single();
      if (data) topicIds.set(name, data.id);
    }
  }
  await supabase.from("prompts").insert(selected.map((p) => ({
    project_id: project.id, text: p.text, intent: p.intent, topic_id: topicIds.get(p.topic) ?? null,
  })));
  revalidatePath("/app/prompts");
}
```

- [ ] **Step 6: Strona listy promptów**

`src/app/app/prompts/page.tsx`:
```tsx
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { addTopic, addPrompt, togglePromptActive, togglePromptKey, deletePrompt } from "./actions";

const INTENTS = { informational: "informacyjna", comparison: "porównawcza", transactional: "zakupowa", brand: "brandowa" } as const;

export default async function PromptsPage() {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const [{ data: topics }, { data: prompts }] = await Promise.all([
    supabase.from("topics").select("*").eq("project_id", project.id).order("name"),
    supabase.from("prompts").select("*").eq("project_id", project.id).order("created_at"),
  ]);
  const topicName = new Map((topics ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prompty ({prompts?.length ?? 0})</h1>
        <Link href="/app/prompts/generate" className="rounded bg-black px-3 py-2 text-sm text-white">Generuj propozycje</Link>
      </div>

      <form action={addPrompt} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-sm">
        <input name="text" required placeholder="Nowe pytanie…" className="rounded border p-2" />
        <select name="topic_id" className="rounded border p-2">
          <option value="">(bez tematu)</option>
          {(topics ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="intent" className="rounded border p-2">
          {Object.entries(INTENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" name="is_key" /> kluczowy</label>
        <button className="rounded bg-black px-3 text-white">Dodaj</button>
      </form>

      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500"><th>Pytanie</th><th>Temat</th><th>Intencja</th><th>Kluczowy</th><th>Aktywny</th><th /></tr></thead>
        <tbody>
          {(prompts ?? []).map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2 pr-2">{p.text}</td>
              <td>{p.topic_id ? topicName.get(p.topic_id) : "—"}</td>
              <td>{INTENTS[p.intent as keyof typeof INTENTS]}</td>
              <td>
                <form action={togglePromptKey}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="is_key" value={String(!p.is_key)} />
                  <button>{p.is_key ? "★ 3 próbki" : "☆"}</button></form>
              </td>
              <td>
                <form action={togglePromptActive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} />
                  <button className={p.active ? "text-green-700" : "text-gray-400"}>{p.active ? "tak" : "nie"}</button></form>
              </td>
              <td><form action={deletePrompt}><input type="hidden" name="id" value={p.id} /><button className="text-red-600">Usuń</button></form></td>
            </tr>
          ))}
        </tbody>
      </table>

      <section>
        <h2 className="font-semibold">Tematy</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">{(topics ?? []).map((t) => <li key={t.id} className="rounded bg-gray-100 px-2 py-1">{t.name}</li>)}</ul>
        <form action={addTopic} className="mt-2 flex gap-2 text-sm">
          <input name="name" required placeholder="Nowy temat" className="rounded border p-2" />
          <button className="rounded border px-3">Dodaj temat</button>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Strona generatora (klient)**

`src/app/app/prompts/generate/page.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { generateProposals, acceptProposals } from "../actions";
import type { PromptProposal } from "@/lib/prompts/generate";

export default function GeneratePage() {
  const [proposals, setProposals] = useState<PromptProposal[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Generator promptów</h1>
      <form
        className="grid gap-2 text-sm"
        action={(fd) => start(async () => {
          setError(null);
          try { setProposals(await generateProposals(fd)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        })}
      >
        <input name="seed" placeholder="Frazy seed (po przecinku): szkolenia AI, kurs ChatGPT" className="rounded border p-2" />
        <input name="personas" placeholder="Persony (po przecinku): HR manager, CEO MŚP, nauczyciel" className="rounded border p-2" />
        <input name="count" type="number" defaultValue={15} min={1} max={50} className="w-24 rounded border p-2" />
        <button disabled={pending} className="w-fit rounded bg-black px-3 py-2 text-white disabled:opacity-50">{pending ? "Generuję…" : "Generuj"}</button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {proposals.length > 0 && (
        <form action={acceptProposals} className="space-y-2 text-sm">
          {proposals.map((p, i) => (
            <label key={i} className="flex items-start gap-2 rounded border p-2">
              <input type="checkbox" name="selected" value={JSON.stringify(p)} defaultChecked />
              <span><b>{p.text}</b><br /><span className="text-gray-500">{p.topic} · {p.intent}</span></span>
            </label>
          ))}
          <button className="rounded bg-black px-3 py-2 text-white">Dodaj zaznaczone</button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Weryfikacja ręczna**

`/app/prompts`: dodaj prompt, oznacz jako kluczowy, dezaktywuj. `/app/prompts/generate`: wpisz seed „szkolenia AI dla firm”, persony „HR manager, właściciel sklepu”, wygeneruj 10, odznacz 2, „Dodaj zaznaczone” → 8 nowych promptów z tematami na liście.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(prompts): prompt library, topics and Claude-powered generator"
```

---

### Task 15: Dashboard „Przegląd”

**Files:**
- Create: `src/lib/metrics/queries.ts`, `src/components/StatCard.tsx`, `src/components/TrendChart.tsx`, `src/components/RunStatus.tsx`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Produces: `getOverview(supabase, projectId): Promise<{ latest: MetricRow | null; byEngine: MetricRow[]; trend: { date: string; score: number; visibilityRate: number }[]; competitors: { name: string; mentions: number }[]; lastRun: Tables<"runs"> | null }>`.
- Przed implementacją wykresu wykonawca wczytuje skill `dataviz` (kolory, osie, dark mode).

- [ ] **Step 1: Zapytania**

`src/lib/metrics/queries.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/db-types";
import type { MetricRow } from "./aggregate";

function toRow(r: Tables<"daily_metrics">): MetricRow {
  return {
    engineId: r.engine_id, promptId: r.prompt_id, responsesCount: r.responses_count,
    visibilityRate: Number(r.visibility_rate), avgPosition: r.avg_position == null ? null : Number(r.avg_position),
    citationRate: Number(r.citation_rate), shareOfVoice: Number(r.share_of_voice), score: r.score,
  };
}

export async function getOverview(supabase: SupabaseClient<Database>, projectId: string) {
  const { data: all } = await supabase.from("daily_metrics").select("*").eq("project_id", projectId).is("prompt_id", null).order("date");
  const rows = all ?? [];
  const latestDate = rows.at(-1)?.date ?? null;
  const latestRows = rows.filter((r) => r.date === latestDate);
  const latest = latestRows.find((r) => r.engine_id === null) ?? null;
  const byEngine = latestRows.filter((r) => r.engine_id !== null).map(toRow);
  const trend = rows.filter((r) => r.engine_id === null).map((r) => ({ date: r.date, score: r.score, visibilityRate: Number(r.visibility_rate) }));

  const { data: lastRun } = await supabase.from("runs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const { data: mentions } = lastRun
    ? await supabase.from("mentions").select("brand_name, response_id, responses!inner(run_id)").eq("project_id", projectId).eq("responses.run_id", lastRun.id)
    : { data: [] };
  const counts = new Map<string, number>();
  for (const m of mentions ?? []) counts.set(m.brand_name, (counts.get(m.brand_name) ?? 0) + 1);
  const competitors = [...counts.entries()].map(([name, mentions]) => ({ name, mentions })).sort((a, b) => b.mentions - a.mentions);

  return { latest: latest ? toRow(latest) : null, byEngine, trend, competitors, lastRun: lastRun ?? null };
}
```

- [ ] **Step 2: Komponenty**

`src/components/StatCard.tsx`:
```tsx
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
    </div>
  );
}
export const pct = (v: number) => `${Math.round(v * 100)}%`;
```

`src/components/TrendChart.tsx` (klient; załaduj skill `dataviz` i dostosuj kolory/osie do jego zaleceń):
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function TrendChart({ data }: { data: { date: string; score: number; visibilityRate: number }[] }) {
  if (data.length < 2) return <p className="text-sm text-gray-500">Trend pojawi się po drugim pomiarze.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} width={32} />
        <Tooltip formatter={(v: number, name) => [name === "score" ? v : `${Math.round(v * 100)}%`, name === "score" ? "Score" : "Visibility"]} />
        <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

`src/components/RunStatus.tsx`:
```tsx
import type { Tables } from "@/lib/db-types";
const LABEL: Record<string, string> = { running: "w toku", done: "zakończony", failed: "nieudany", budget_exceeded: "budżet wyczerpany", empty: "brak promptów/silników" };
export function RunStatus({ run }: { run: Tables<"runs"> | null }) {
  if (!run) return <p className="text-sm text-gray-500">Jeszcze nie było żadnego pomiaru.</p>;
  return (
    <p className="text-sm text-gray-600">
      Ostatni run: <b>{LABEL[run.status] ?? run.status}</b> · {new Date(run.started_at).toLocaleString("pl-PL")} · {run.queries_total} zapytań,
      {" "}{run.queries_failed} błędów · {Number(run.cost_usd).toFixed(2)} USD{run.error && <> · <span className="text-red-700">{run.error}</span></>}
    </p>
  );
}
```

- [ ] **Step 3: Strona**

`src/app/app/page.tsx`:
```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { getOverview } from "@/lib/metrics/queries";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";
import { StatCard, pct } from "@/components/StatCard";
import { TrendChart } from "@/components/TrendChart";
import { RunStatus } from "@/components/RunStatus";
import { runNow } from "./actions";

export default async function OverviewPage() {
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const o = await getOverview(supabase, project.id);
  const own = o.competitors.find((c) => c.name === project.brand_name);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Przegląd</h1>
        <form action={runNow}><button className="rounded bg-black px-3 py-2 text-sm text-white" disabled={o.lastRun?.status === "running"}>Uruchom teraz</button></form>
      </div>
      <RunStatus run={o.lastRun} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="AI Visibility Score" value={o.latest ? String(o.latest.score) : "—"} hint="0–100" />
        <StatCard label="Visibility rate" value={o.latest ? pct(o.latest.visibilityRate) : "—"} hint="odpowiedzi z wzmianką" />
        <StatCard label="Śr. pozycja" value={o.latest?.avgPosition ? o.latest.avgPosition.toFixed(1) : "—"} />
        <StatCard label="Citation rate" value={o.latest ? pct(o.latest.citationRate) : "—"} hint="linki do naszej domeny" />
        <StatCard label="Share of voice" value={o.latest ? pct(o.latest.shareOfVoice) : "—"} />
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">Trend score</h2>
        <TrendChart data={o.trend} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">Silniki</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500"><th>Silnik</th><th>Visibility</th><th>Pozycja</th><th>Cytowania</th><th>Score</th></tr></thead>
            <tbody>
              {o.byEngine.map((e) => (
                <tr key={e.engineId} className="border-t">
                  <td className="py-1">{ENGINE_LABELS[e.engineId as EngineId] ?? e.engineId}</td>
                  <td>{pct(e.visibilityRate)}</td><td>{e.avgPosition?.toFixed(1) ?? "—"}</td><td>{pct(e.citationRate)}</td><td>{e.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">Wzmianki w ostatnim runie</h2>
          <ul className="text-sm">
            {o.competitors.map((c) => (
              <li key={c.name} className={`flex justify-between border-t py-1 ${c.name === project.brand_name ? "font-semibold" : ""}`}>
                <span>{c.name}</span><span>{c.mentions}</span>
              </li>
            ))}
            {!own && <li className="text-gray-500">Brak wzmianek o {project.brand_name}.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Weryfikacja**

`npm run dev` → `/app`: po runie z Task 13 karty pokazują liczby, tabela silników ma 4 wiersze, lista wzmianek zawiera PSAI i konkurentów. Stan pusty (nowy projekt) nie wywala strony.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dashboard): overview with score, per-engine table, trend and mentions"
```

---

### Task 16: Heatmapa prompt × silnik i widok odpowiedzi

**Files:**
- Create: `src/components/Heatmap.tsx`, `src/components/HighlightedText.tsx`
- Modify: `src/app/app/prompts/page.tsx` (sekcja heatmapy nad listą)
- Create: `src/app/app/responses/page.tsx`, `src/app/app/responses/[id]/page.tsx`
- Test: `tests/components/highlight.test.ts`

**Interfaces:**
- Produces: `buildHighlightSegments(text, mentions: { charIndex: number; name: string; kind: "own"|"competitor" }[], aliasesByName: Record<string,string[]>): { text: string; kind?: "own"|"competitor" }[]` (czysta funkcja do testów), komponent `<Heatmap rows={[{promptText, cells: { engineId, visibilityRate|null }[] }]} />`.

- [ ] **Step 1: Test segmentacji**

`tests/components/highlight.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildHighlightSegments } from "@/components/HighlightedText";

describe("buildHighlightSegments", () => {
  it("dzieli tekst na segmenty z oznaczeniem marki", () => {
    const seg = buildHighlightSegments(
      "Polecam PSAI oraz Akademia AI.",
      [{ charIndex: 8, name: "Polska Szkoła AI", kind: "own" }, { charIndex: 18, name: "Akademia AI", kind: "competitor" }],
      { "Polska Szkoła AI": ["PSAI"], "Akademia AI": ["Akademia AI"] },
    );
    expect(seg).toEqual([
      { text: "Polecam " }, { text: "PSAI", kind: "own" }, { text: " oraz " }, { text: "Akademia AI", kind: "competitor" }, { text: "." },
    ]);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

- [ ] **Step 3: Implementacja**

`src/components/HighlightedText.tsx`:
```tsx
import { foldText } from "@/lib/extract/normalize";

export interface Segment { text: string; kind?: "own" | "competitor" }

export function buildHighlightSegments(
  text: string,
  mentions: { charIndex: number; name: string; kind: "own" | "competitor" }[],
  aliasesByName: Record<string, string[]>,
): Segment[] {
  const folded = foldText(text);
  const marks = mentions
    .map((m) => {
      const aliases = [m.name, ...(aliasesByName[m.name] ?? [])].map(foldText);
      const hit = aliases.find((a) => folded.startsWith(a, m.charIndex));
      return hit ? { start: m.charIndex, end: m.charIndex + hit.length, kind: m.kind } : null;
    })
    .filter((x): x is { start: number; end: number; kind: "own" | "competitor" } => x !== null)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push({ text: text.slice(pos, m.start) });
    out.push({ text: text.slice(m.start, m.end), kind: m.kind });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export function HighlightedText({ text, mentions, aliases }: {
  text: string;
  mentions: Parameters<typeof buildHighlightSegments>[1];
  aliases: Record<string, string[]>;
}) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-6">
      {buildHighlightSegments(text, mentions, aliases).map((s, i) =>
        s.kind ? <mark key={i} className={s.kind === "own" ? "bg-green-200" : "bg-amber-200"}>{s.text}</mark> : <span key={i}>{s.text}</span>,
      )}
    </p>
  );
}
```
Uwaga: `foldText` zachowuje długość tekstu dla polskich znaków (NFD usuwa znaki łączące; `ł→l` to 1:1), więc indeksy z `extractMentions` pasują do oryginału. Test w Task 10 (`charIndex`) i ten test to pilnują.

`src/components/Heatmap.tsx`:
```tsx
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";

export interface HeatmapRow { promptId: string; promptText: string; cells: { engineId: string; visibilityRate: number | null }[] }

function color(v: number | null) {
  if (v === null) return "bg-gray-100 text-gray-400";
  if (v >= 0.67) return "bg-green-200";
  if (v > 0) return "bg-amber-200";
  return "bg-red-200";
}

export function Heatmap({ rows, engines }: { rows: HeatmapRow[]; engines: string[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="text-left">Prompt</th>{engines.map((e) => <th key={e} className="px-2 text-center">{ENGINE_LABELS[e as EngineId] ?? e}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.promptId} className="border-t">
            <td className="py-1 pr-2">{r.promptText}</td>
            {engines.map((e) => {
              const v = r.cells.find((c) => c.engineId === e)?.visibilityRate ?? null;
              return <td key={e} className={`px-2 text-center tabular-nums ${color(v)}`}>{v === null ? "—" : `${Math.round(v * 100)}%`}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

W `src/app/app/prompts/page.tsx` dodaj nad listą sekcję „Heatmapa (ostatni pomiar)”: pobierz `daily_metrics` dla `project_id`, `date = max(date)`, `prompt_id not null`, `engine_id not null`, zmapuj do `HeatmapRow[]`, `engines` = unikalne `engine_id`.

- [ ] **Step 4: Lista i szczegóły odpowiedzi**

`src/app/app/responses/page.tsx`:
```tsx
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { ENGINE_LABELS } from "@/lib/engines/registry";
import type { EngineId } from "@/lib/engines/types";

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<{ engine?: string; prompt?: string }> }) {
  const { engine, prompt } = await searchParams;
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  let q = supabase.from("responses")
    .select("id, engine_id, created_at, no_answer, error, sentiment, prompts(text), mentions(brand_kind)")
    .eq("project_id", project.id).order("created_at", { ascending: false }).limit(200);
  if (engine) q = q.eq("engine_id", engine);
  if (prompt) q = q.eq("prompt_id", prompt);
  const { data } = await q;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Odpowiedzi</h1>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500"><th>Data</th><th>Silnik</th><th>Prompt</th><th>Nasza marka</th><th>Sentyment</th></tr></thead>
        <tbody>
          {(data ?? []).map((r) => {
            const own = r.mentions.some((m) => m.brand_kind === "own");
            return (
              <tr key={r.id} className="border-t">
                <td className="py-1">{new Date(r.created_at).toLocaleString("pl-PL")}</td>
                <td>{ENGINE_LABELS[r.engine_id as EngineId] ?? r.engine_id}</td>
                <td><Link href={`/app/responses/${r.id}`} className="underline">{r.prompts?.text}</Link></td>
                <td>{r.error ? <span className="text-red-700">błąd</span> : r.no_answer ? <span className="text-gray-400">brak AIO</span> : own ? "✅" : "—"}</td>
                <td>{r.sentiment ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

`src/app/app/responses/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentProject } from "@/lib/workspace";
import { HighlightedText } from "@/components/HighlightedText";

export default async function ResponsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getCurrentProject();
  const supabase = await createServerSupabase();
  const [{ data: r }, { data: competitors }] = await Promise.all([
    supabase.from("responses").select("*, prompts(text), mentions(*), citations(*)").eq("id", id).eq("project_id", project.id).maybeSingle(),
    supabase.from("competitors").select("name, aliases").eq("project_id", project.id),
  ]);
  if (!r) notFound();
  const aliases: Record<string, string[]> = { [project.brand_name]: project.brand_aliases };
  for (const c of competitors ?? []) aliases[c.name] = c.aliases;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold">{r.prompts?.text}</h1>
      <p className="text-sm text-gray-500">{r.engine_id} · {r.model} · {new Date(r.created_at).toLocaleString("pl-PL")} · {Number(r.cost_usd).toFixed(3)} USD</p>
      {r.error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{r.error}</p>}
      {r.no_answer && <p className="text-sm text-gray-500">Silnik nie zwrócił odpowiedzi AI dla tego pytania.</p>}
      <HighlightedText
        text={r.text}
        mentions={r.mentions.map((m) => ({ charIndex: m.char_index, name: m.brand_name, kind: m.brand_kind as "own" | "competitor" }))}
        aliases={aliases}
      />
      {r.sentiment && <p className="text-sm"><b>Sentyment:</b> {r.sentiment} — {r.sentiment_summary}</p>}
      <section>
        <h2 className="font-semibold">Cytowane źródła ({r.citations.length})</h2>
        <ul className="mt-1 text-sm">
          {r.citations.map((c) => (
            <li key={c.id} className={c.is_own ? "font-semibold text-green-700" : c.competitor_id ? "text-amber-700" : ""}>
              <a href={c.url} target="_blank" rel="noreferrer" className="underline">{c.title ?? c.url}</a> <span className="text-gray-500">({c.domain})</span>
            </li>
          ))}
        </ul>
      </section>
      <details><summary className="cursor-pointer text-sm text-gray-500">Surowa odpowiedź API</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(r.raw, null, 2)}</pre></details>
    </div>
  );
}
```

- [ ] **Step 5: Uruchom testy — PASS**; ręcznie: heatmapa na `/app/prompts` ma 4 kolumny; `/app/responses` → klik → podświetlone marki (zielone własne, bursztynowe konkurenci), lista źródeł, surowy JSON.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): prompt x engine heatmap and response views with brand highlights"
```

---

### Task 17: Weryfikacja end-to-end, README, deploy

**Files:**
- Create: `README.md`
- Modify: `.env.example` (jeśli doszły zmienne)

- [ ] **Step 1: Pełny zestaw testów i build**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: wszystkie testy PASS, lint i tsc bez błędów, build OK.

- [ ] **Step 2: Złoty zestaw (kalibracja)**

Wybierz 5 promptów z seedu. Zadaj je ręcznie w chatgpt.com, perplexity.ai i Google (PL). Zanotuj w `docs/superpowers/calibration/2026-10-<dd>.md`: czy PSAI było wymienione i na której pozycji. Porównaj z `/app/responses` z ostatniego runu. Cel: zgodność kierunkowa (wymieniony/niewymieniony) ≥ 4/5 na silnik. Rozbieżności opisz — to wejście do kalibracji w fazie 2.

- [ ] **Step 3: README**

`README.md` z sekcjami: Co to jest (2 zdania), Wymagania (Node 20+, Docker lub hostowany Supabase, konta: Trigger.dev, OpenAI, Perplexity, Google AI Studio, DataForSEO, Anthropic), Start lokalny (`npx supabase start`, `.env.local`, `npm run dev`, `npx trigger.dev@latest dev`), Jak działa run (plan → fan-out → ekstrakcja → agregacja; cost guard), Koszty i budżet, Deploy (Vercel + `vercel.json` cron + `CRON_SECRET`; `npx trigger.dev@latest deploy`; `npx supabase db push`), Struktura katalogów.

- [ ] **Step 4: Deploy**

1. Supabase: utwórz projekt hostowany, `npx supabase link`, `npx supabase db push`, załaduj seed, dodaj użytkownika i członkostwo.
2. Trigger.dev: `npx trigger.dev@latest deploy`; ustaw zmienne środowiskowe prod.
3. Vercel: `vercel link`, ustaw wszystkie zmienne z `.env.example` (prod), `vercel --prod`.
4. Test: zaloguj się na produkcji, „Uruchom teraz”, poczekaj na `done`, sprawdź Przegląd. Wywołaj ręcznie `curl -H "Authorization: Bearer $CRON_SECRET" https://<domena>/api/cron/weekly` → `{ "triggered": 1 }`.

- [ ] **Step 5: Commit i tag**

```bash
git add -A
git commit -m "docs: README, calibration notes; phase 1 complete"
git tag v0.1.0-phase1
```

---

## Weryfikacja końcowa fazy 0–1 (lista kontrolna)

- [ ] `npm test` zielone: domain, adaptery ×4, extract (brands, citations, sentiment), metrics, runs (plan, process-response, guard), budget, workspace, validation, highlight, (opcjonalnie) RLS.
- [ ] Run na 10 promptach × 4 silniki kończy się statusem `done`, `daily_metrics` ma wiersze ogółem / per silnik / per prompt / per komórkę.
- [ ] Review Focus #1–#5 sprawdzone: testy aliasów w słowie (Task 10), `www.`+ścieżka (Task 5/10), błąd jednego silnika nie psuje runu (Task 13 krok 11), `budget_exceeded` (Task 13 `guard.test.ts`), pusty projekt → `empty` z komunikatem (Task 13 `guard.test.ts` i `RunStatus`).
- [ ] Dashboard działa dla pustego projektu i dla projektu z danymi.
- [ ] Koszt runu widoczny w `runs.cost_usd`; przy 10 promptach ≈ 0,5–0,8 USD, co przy tygodniowym runie mieści się w budżecie 30 USD/mies. z zapasem na 50 promptów.
