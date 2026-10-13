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
