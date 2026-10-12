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
  competitor_id uuid references competitors(id) on delete set null,
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
