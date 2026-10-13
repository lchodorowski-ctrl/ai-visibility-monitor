-- etap trwającego pomiaru (do paska postępu): zapytania -> agregacja -> rekomendacje -> koniec
alter table runs add column if not exists stage text not null default 'queries'
  check (stage in ('queries','aggregating','recommending','done'));

-- runy zakończone przed tą migracją nie mają już żadnego etapu do pokazania
update runs set stage = 'done' where status <> 'running';
