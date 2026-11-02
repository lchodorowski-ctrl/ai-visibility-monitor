-- Moduł Google (klasyczne SEO): ustawienia projektu, rejestr zadań i osobny budżet SEO.
alter table projects add column if not exists gsc_property text;
alter table projects add column if not exists seo_budget_usd numeric(10,2) not null default 10;
alter table projects add column if not exists trends_anchor text;

create table if not exists seo_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('gsc_sync','rank_check','url_inspection','pagespeed','keyword_volumes','keyword_research','seo_recommend','seo_weekly')),
  status text not null default 'running' check (status in ('running','done','failed','budget_exceeded','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cost_usd numeric(10,4) not null default 0,
  stats jsonb not null default '{}',
  error text
);
create index if not exists seo_jobs_project_kind on seo_jobs(project_id, kind, started_at desc);

alter table seo_jobs enable row level security;
drop policy if exists seo_jobs_member on seo_jobs;
create policy seo_jobs_member on seo_jobs for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
