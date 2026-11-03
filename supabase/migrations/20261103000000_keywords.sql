-- Moduł Google: śledzone frazy (z miesięcznym wolumenem i Google Trends) oraz skrzynka podpowiedzi fraz.
-- `key` to fraza po normalizacji (NFC, małe litery wg pl, pojedyncze spacje), wspólny klucz porównań.

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  text text not null,
  key text not null,
  source text not null check (source in ('manual','gsc','suggestion','ranked','gap')),
  target_path text,
  active boolean not null default true,
  search_volume int,
  competition text,
  competition_index int,
  cpc numeric(10,2),
  monthly_searches jsonb,
  volume_updated_at timestamptz,
  trend jsonb,
  trend_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);
create index if not exists keywords_project_active on keywords(project_id, active);

create table if not exists keyword_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,
  text text not null,
  seed text,
  source text not null check (source in ('labs','ranked','gap')),
  search_volume int,
  keyword_difficulty int,
  cpc numeric(10,2),
  own_position int,
  own_url text,
  competitor_positions jsonb not null default '[]',
  status text not null default 'new' check (status in ('new','accepted','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);

alter table keywords enable row level security;
alter table keyword_suggestions enable row level security;

drop policy if exists keywords_member on keywords;
create policy keywords_member on keywords for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));

drop policy if exists keyword_suggestions_member on keyword_suggestions;
create policy keyword_suggestions_member on keyword_suggestions for all
  using (is_org_member(project_org(project_id))) with check (is_org_member(project_org(project_id)));
