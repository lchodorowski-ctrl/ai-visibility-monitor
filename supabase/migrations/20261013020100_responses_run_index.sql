-- pasek postępu liczy odpowiedzi runu co kilka sekund; FK run_id nie miał indeksu
create index if not exists responses_run on responses(run_id);
