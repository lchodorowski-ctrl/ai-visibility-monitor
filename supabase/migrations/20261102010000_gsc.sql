-- Search Console: dzienne dane (suma serwisu, strony, fraza x strona x urządzenie) i funkcje agregujące.
-- Strony zapisujemy jako ścieżki URL, urządzenia małymi literami. Pozycja jest ważona wyświetleniami.

create table if not exists gsc_site_daily (
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  clicks int not null,
  impressions int not null,
  position numeric(6,2),
  primary key (project_id, date)
);

create table if not exists gsc_page_daily (
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  page text not null,
  clicks int not null,
  impressions int not null,
  position numeric(6,2),
  primary key (project_id, date, page)
);

create table if not exists gsc_query_daily (
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  query text not null,
  page text not null,
  device text not null check (device in ('desktop','mobile','tablet')),
  clicks int not null,
  impressions int not null,
  position numeric(6,2),
  primary key (project_id, date, query, page, device)
);
create index if not exists gsc_query_daily_project_query_date on gsc_query_daily(project_id, query, date);

alter table gsc_site_daily enable row level security;
alter table gsc_page_daily enable row level security;
alter table gsc_query_daily enable row level security;

drop policy if exists gsc_site_daily_member on gsc_site_daily;
create policy gsc_site_daily_member on gsc_site_daily for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
drop policy if exists gsc_page_daily_member on gsc_page_daily;
create policy gsc_page_daily_member on gsc_page_daily for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
drop policy if exists gsc_query_daily_member on gsc_query_daily;
create policy gsc_query_daily_member on gsc_query_daily for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));

-- W liście kolumn wyniku `position` wymaga cudzysłowu (słowo kluczowe SQL), nazwa kolumny pozostaje `position`.

-- Suma serwisu w oknie dat (włącznie z oboma końcami).
create or replace function gsc_totals(p_project uuid, p_from date, p_to date)
returns table(clicks bigint, impressions bigint, "position" numeric)
language sql stable security invoker as $$
  select sum(s.clicks)::bigint,
         sum(s.impressions)::bigint,
         sum(s.position * s.impressions) / nullif(sum(s.impressions), 0)
  from gsc_site_daily s
  where s.project_id = p_project and s.date between p_from and p_to;
$$;

-- Najlepsze strony w oknie dat; limit stosowany w SQL, bo PostgREST zwraca najwyżej 1000 wierszy.
create or replace function gsc_top_pages(p_project uuid, p_from date, p_to date, p_limit int)
returns table(page text, clicks bigint, impressions bigint, "position" numeric)
language sql stable security invoker as $$
  select g.page,
         sum(g.clicks)::bigint,
         sum(g.impressions)::bigint,
         sum(g.position * g.impressions) / nullif(sum(g.impressions), 0)
  from gsc_page_daily g
  where g.project_id = p_project and g.date between p_from and p_to
  group by g.page
  order by sum(g.clicks) desc, sum(g.impressions) desc, g.page
  limit p_limit;
$$;

-- Frazy w dwóch oknach (bieżącym i poprzednim), zsumowane po wszystkich stronach i urządzeniach.
-- Brak frazy w oknie daje 0 kliknięć i wyświetleń oraz pozycję null.
create or replace function gsc_query_windows(
  p_project uuid, p_cur_from date, p_cur_to date, p_prev_from date, p_prev_to date, p_limit int
)
returns table(
  query text,
  cur_clicks bigint, cur_impressions bigint, cur_position numeric,
  prev_clicks bigint, prev_impressions bigint, prev_position numeric
)
language sql stable security invoker as $$
  with cur as (
    select g.query,
           sum(g.clicks)::bigint as clicks,
           sum(g.impressions)::bigint as impressions,
           sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as position
    from gsc_query_daily g
    where g.project_id = p_project and g.date between p_cur_from and p_cur_to
    group by g.query
  ), prev as (
    select g.query,
           sum(g.clicks)::bigint as clicks,
           sum(g.impressions)::bigint as impressions,
           sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as position
    from gsc_query_daily g
    where g.project_id = p_project and g.date between p_prev_from and p_prev_to
    group by g.query
  )
  select coalesce(c.query, p.query),
         coalesce(c.clicks, 0), coalesce(c.impressions, 0), c.position,
         coalesce(p.clicks, 0), coalesce(p.impressions, 0), p.position
  from cur c
  full outer join prev p on p.query = c.query
  order by greatest(coalesce(c.impressions, 0), coalesce(p.impressions, 0)) desc, coalesce(c.query, p.query)
  limit p_limit;
$$;

-- Frazy, na które w oknie dat wchodzą co najmniej 2 strony, z łączną liczbą wyświetleń >= p_min_impressions.
-- Frazy z największą liczbą wyświetleń idą pierwsze, bo PostgREST ucina odpowiedź do 1000 wierszy.
create or replace function gsc_query_pages(p_project uuid, p_from date, p_to date, p_min_impressions int)
returns table(query text, page text, clicks bigint, impressions bigint, "position" numeric)
language sql stable security invoker as $$
  with per_page as (
    select g.query, g.page,
           sum(g.clicks)::bigint as clicks,
           sum(g.impressions)::bigint as impressions,
           sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as position
    from gsc_query_daily g
    where g.project_id = p_project and g.date between p_from and p_to
    group by g.query, g.page
  ), shared as (
    select pp.query, sum(pp.impressions) as total_impressions
    from per_page pp
    group by pp.query
    having count(*) >= 2 and sum(pp.impressions) >= p_min_impressions
  )
  select pp.query, pp.page, pp.clicks, pp.impressions, pp.position
  from per_page pp
  join shared s on s.query = pp.query
  order by s.total_impressions desc, pp.query, pp.impressions desc, pp.page;
$$;

grant execute on function gsc_totals(uuid, date, date) to authenticated;
grant execute on function gsc_top_pages(uuid, date, date, int) to authenticated;
grant execute on function gsc_query_windows(uuid, date, date, date, date, int) to authenticated;
grant execute on function gsc_query_pages(uuid, date, date, int) to authenticated;
