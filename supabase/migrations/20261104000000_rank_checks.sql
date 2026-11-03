-- Moduł Google: cotygodniowe pomiary pozycji frazy w Google (DataForSEO SERP) dla śledzonych fraz.
-- Jeden wiersz to jedna fraza na jednym urządzeniu w jednym tygodniu (`week_start` = poniedziałek).
-- `pending` = zlecone u dostawcy (`dfs_task_id`), `done` = wynik zapisany, `failed` = błąd (`error`).
-- `position` null przy `done` oznacza: poza top 100 (pomiar się odbył, frazy nie znaleziono).
-- `top10` i `competitors` trzymają zrzut wyników, bo SERP zmienia się z tygodnia na tydzień.

create table if not exists rank_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  keyword_id uuid not null references keywords(id) on delete cascade,
  device text not null check (device in ('desktop','mobile')),
  week_start date not null,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  dfs_task_id text,
  position int,
  rank_absolute int,
  url text,
  breadcrumb text,
  features jsonb not null default '{}',
  top10 jsonb not null default '[]',
  competitors jsonb not null default '[]',
  cost_usd numeric(10,4) not null default 0,
  checked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (keyword_id, device, week_start)
);
create index if not exists rank_checks_project_week on rank_checks(project_id, week_start desc);
create index if not exists rank_checks_project_status on rank_checks(project_id, status);

alter table rank_checks enable row level security;

drop policy if exists rank_checks_member on rank_checks;
create policy rank_checks_member on rank_checks for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));

-- Funkcje dla UI jako security definer z jednorazową bramką członkostwa, tak jak funkcje GSC
-- (patrz 20261102010100_gsc_functions_definer.sql): `(select is_org_member(...))` nie zależy od wiersza,
-- więc planer liczy go raz na wywołanie. Nie-członek dostaje zero wierszy, rola anon błąd uprawnień (42501).
-- W liście kolumn wyniku `position` wymaga cudzysłowu (słowo kluczowe SQL), nazwa kolumny pozostaje `position`.

-- Dla każdej pary (fraza, urządzenie): najnowszy pomiar `done` i poprzedni pomiar `done`.
-- Wiersze `pending` i `failed` są pomijane, więc trwające zlecenie nie zasłania ostatniego wyniku.
-- prev_week_start null = brak wcześniejszego pomiaru; prev_position null przy prev_week_start = była poza top 100.
create or replace function rank_latest(p_project uuid)
returns table(
  keyword_id uuid, device text, week_start date,
  "position" int, rank_absolute int, url text, breadcrumb text,
  features jsonb, competitors jsonb, checked_at timestamptz,
  prev_week_start date, prev_position int
)
language sql stable security definer set search_path = public as $$
  with done as (
    select r.keyword_id, r.device, r.week_start,
           r.position, r.rank_absolute, r.url, r.breadcrumb,
           r.features, r.competitors, r.checked_at,
           lag(r.week_start) over w as prev_week_start,
           lag(r.position) over w as prev_position,
           row_number() over (partition by r.keyword_id, r.device order by r.week_start desc) as rn
    from rank_checks r
    where r.project_id = p_project
      and (select is_org_member(project_org(p_project)))
      and r.status = 'done'
    window w as (partition by r.keyword_id, r.device order by r.week_start)
  )
  select d.keyword_id, d.device, d.week_start,
         d.position, d.rank_absolute, d.url, d.breadcrumb,
         d.features, d.competitors, d.checked_at,
         d.prev_week_start, d.prev_position
  from done d
  where d.rn = 1
  order by d.keyword_id, d.device;
$$;

-- Jedna fraza z Search Console w oknie dat (włącznie z oboma końcami), rozbita na strony.
-- Pozycja ważona wyświetleniami, sortowanie po wyświetleniach malejąco.
create or replace function gsc_query_detail(p_project uuid, p_query text, p_from date, p_to date)
returns table(page text, clicks bigint, impressions bigint, "position" numeric)
language sql stable security definer set search_path = public as $$
  select g.page,
         sum(g.clicks)::bigint,
         sum(g.impressions)::bigint,
         sum(g.position * g.impressions) / nullif(sum(g.impressions), 0)
  from gsc_query_daily g
  where g.project_id = p_project
    and (select is_org_member(project_org(p_project)))
    and g.query = p_query
    and g.date between p_from and p_to
  group by g.page
  order by sum(g.impressions) desc, g.page;
$$;

-- Funkcje omijają RLS tabel, więc wywołać je może tylko zalogowany użytkownik (bramka członkostwa w ciele).
revoke execute on function rank_latest(uuid) from public, anon;
revoke execute on function gsc_query_detail(uuid, text, date, date) from public, anon;
grant execute on function rank_latest(uuid) to authenticated;
grant execute on function gsc_query_detail(uuid, text, date, date) to authenticated;
