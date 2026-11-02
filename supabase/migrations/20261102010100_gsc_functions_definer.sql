-- Funkcje agregujące GSC jako security definer z jednorazową bramką członkostwa.
-- Przy security invoker polityka RLS (is_org_member(project_org(project_id))) była wywoływana dla każdego
-- skanowanego wiersza, co przy dziesiątkach tysięcy wierszy dawało sekundy. Tutaj dostęp sprawdzamy raz na
-- wywołanie: `(select is_org_member(project_org(p_project)))` nie zależy od wiersza, więc planer liczy go
-- jako InitPlan. Członek innej organizacji (zalogowany, ale nie członek tego projektu) dostaje to samo co wcześniej:
-- zero wierszy z funkcji zwracających zbiory i jeden wiersz z samymi nullami z gsc_totals. Rola anon nie ma prawa
-- wykonywania tych funkcji (revoke na dole pliku), więc dostaje błąd uprawnień (42501), a nie puste wyniki.
-- Tabele zachowują swoje polityki RLS bez zmian.

create or replace function gsc_totals(p_project uuid, p_from date, p_to date)
returns table(clicks bigint, impressions bigint, "position" numeric)
language sql stable security definer set search_path = public as $$
  select sum(s.clicks)::bigint,
         sum(s.impressions)::bigint,
         sum(s.position * s.impressions) / nullif(sum(s.impressions), 0)
  from gsc_site_daily s
  where s.project_id = p_project
    and (select is_org_member(project_org(p_project)))
    and s.date between p_from and p_to;
$$;

create or replace function gsc_top_pages(p_project uuid, p_from date, p_to date, p_limit int)
returns table(page text, clicks bigint, impressions bigint, "position" numeric)
language sql stable security definer set search_path = public as $$
  select g.page,
         sum(g.clicks)::bigint,
         sum(g.impressions)::bigint,
         sum(g.position * g.impressions) / nullif(sum(g.impressions), 0)
  from gsc_page_daily g
  where g.project_id = p_project
    and (select is_org_member(project_org(p_project)))
    and g.date between p_from and p_to
  group by g.page
  order by sum(g.clicks) desc, sum(g.impressions) desc, g.page
  limit p_limit;
$$;

create or replace function gsc_query_windows(
  p_project uuid, p_cur_from date, p_cur_to date, p_prev_from date, p_prev_to date, p_limit int
)
returns table(
  query text,
  cur_clicks bigint, cur_impressions bigint, cur_position numeric,
  prev_clicks bigint, prev_impressions bigint, prev_position numeric
)
language sql stable security definer set search_path = public as $$
  with cur as (
    select g.query,
           sum(g.clicks)::bigint as clicks,
           sum(g.impressions)::bigint as impressions,
           sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as position
    from gsc_query_daily g
    where g.project_id = p_project
      and (select is_org_member(project_org(p_project)))
      and g.date between p_cur_from and p_cur_to
    group by g.query
  ), prev as (
    select g.query,
           sum(g.clicks)::bigint as clicks,
           sum(g.impressions)::bigint as impressions,
           sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as position
    from gsc_query_daily g
    where g.project_id = p_project
      and (select is_org_member(project_org(p_project)))
      and g.date between p_prev_from and p_prev_to
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

create or replace function gsc_query_pages(p_project uuid, p_from date, p_to date, p_min_impressions int)
returns table(query text, page text, clicks bigint, impressions bigint, "position" numeric)
language sql stable security definer set search_path = public as $$
  with per_page as (
    select g.query, g.page,
           sum(g.clicks)::bigint as clicks,
           sum(g.impressions)::bigint as impressions,
           sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as position
    from gsc_query_daily g
    where g.project_id = p_project
      and (select is_org_member(project_org(p_project)))
      and g.date between p_from and p_to
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

-- Funkcje omijają RLS tabel, więc wywołać je może tylko zalogowany użytkownik (bramka członkostwa w ciele).
revoke execute on function gsc_totals(uuid, date, date) from public, anon;
revoke execute on function gsc_top_pages(uuid, date, date, int) from public, anon;
revoke execute on function gsc_query_windows(uuid, date, date, date, date, int) from public, anon;
revoke execute on function gsc_query_pages(uuid, date, date, int) from public, anon;
grant execute on function gsc_totals(uuid, date, date) to authenticated;
grant execute on function gsc_top_pages(uuid, date, date, int) to authenticated;
grant execute on function gsc_query_windows(uuid, date, date, date, date, int) to authenticated;
grant execute on function gsc_query_pages(uuid, date, date, int) to authenticated;
