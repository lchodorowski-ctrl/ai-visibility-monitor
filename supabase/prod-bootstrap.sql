-- Bootstrap produkcji (idempotentny: można uruchomić ponownie bez szkody).
-- Uruchom w Supabase SQL Editor po `npx supabase db push`.
-- 1) Seed organizacji, projektu PSAI, silników, tematów i promptów (ten sam co lokalnie).
-- 2) Członkostwo użytkownika z Authentication → Users (podmień e-mail, jeśli inny).
-- Uwaga: członkostwo MUSI istnieć przed pierwszym logowaniem tego użytkownika.

insert into organizations (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Polska Szkoła AI')
on conflict (id) do nothing;

insert into projects (id, org_id, name, brand_name, brand_aliases, domains, facts, site_url)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
  'Polska Szkoła AI', 'Polska Szkoła AI',
  array['PSAI','polskaszkola.ai','Polska Szkola AI'],
  array['polskaszkola.ai'],
  '{"oferta":"szkolenia i kursy AI dla firm i osób prywatnych","strona":"https://polskaszkola.ai"}'::jsonb,
  'https://polskaszkolaai.netlify.app')
on conflict (id) do nothing;

insert into project_engines (project_id, engine_id) values
  ('22222222-2222-2222-2222-222222222222','openai'),
  ('22222222-2222-2222-2222-222222222222','perplexity'),
  ('22222222-2222-2222-2222-222222222222','gemini'),
  ('22222222-2222-2222-2222-222222222222','google_ai_overview')
on conflict do nothing;

insert into topics (id, project_id, name) values
  ('33333333-3333-3333-3333-333333333331','22222222-2222-2222-2222-222222222222','Kursy AI dla firm'),
  ('33333333-3333-3333-3333-333333333332','22222222-2222-2222-2222-222222222222','Szkolenia ChatGPT'),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Brand')
on conflict (id) do nothing;

-- Prompty tylko, jeśli projekt nie ma jeszcze żadnych.
insert into prompts (project_id, topic_id, text, intent, is_key)
select v.project_id::uuid, v.topic_id::uuid, v.text, v.intent, v.is_key from (values
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Jakie są najlepsze szkolenia z AI dla firm w Polsce?','comparison',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Polecasz jakiś kurs AI dla pracowników małej firmy?','transactional',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Gdzie w Polsce można zrobić warsztaty z wykorzystania AI w biznesie?','informational',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333332','Jaki kurs ChatGPT dla początkujących po polsku warto wybrać?','comparison',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333332','Szkolenie z ChatGPT dla zespołu marketingu — kogo polecasz?','transactional',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333332','Kto prowadzi dobre szkolenia z narzędzi AI w Warszawie?','informational',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','Co to jest Polska Szkoła AI?','brand',true),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','Czy Polska Szkoła AI jest godna polecenia?','brand',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Ranking szkół i akademii AI w Polsce','comparison',false),
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331','Jak nauczyć zespół korzystać z AI? Jakie szkolenie wybrać?','informational',false)
) as v(project_id, topic_id, text, intent, is_key)
where not exists (select 1 from prompts p where p.project_id = '22222222-2222-2222-2222-222222222222');

-- Członkostwo po e-mailu (użytkownik musi już istnieć w Authentication → Users):
insert into memberships (org_id, user_id, role)
select '11111111-1111-1111-1111-111111111111', id, 'owner'
from auth.users where email = 'l.chodorowski@polskaszkola.ai'
on conflict do nothing;

-- Kontrola: liczby + Twój e-mail.
select
  (select count(*) from organizations) as organizacje,
  (select count(*) from projects) as projekty,
  (select count(*) from prompts) as prompty,
  (select string_agg(u.email, ', ') from memberships m join auth.users u on u.id = m.user_id) as czlonkowie;
