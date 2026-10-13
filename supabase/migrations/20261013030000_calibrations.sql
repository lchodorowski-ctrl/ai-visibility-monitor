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
