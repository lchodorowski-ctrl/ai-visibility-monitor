insert into organizations (id, name) values ('11111111-1111-1111-1111-111111111111', 'Polska Szkoła AI');

insert into projects (id, org_id, name, brand_name, brand_aliases, domains, facts, site_url)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
  'Polska Szkoła AI', 'Polska Szkoła AI',
  array['PSAI','polskaszkola.ai','Polska Szkola AI'],
  array['polskaszkola.ai'],
  '{"oferta":"szkolenia i kursy AI dla firm i osób prywatnych","strona":"https://polskaszkola.ai"}'::jsonb,
  'https://polskaszkolaai.netlify.app');

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
