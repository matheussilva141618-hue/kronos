-- KRONOS MIND STATE — Estado cognitivo vivo persistido por usuário
create table if not exists kronos_mind_state (
  username    text primary key,
  state       jsonb not null default '{}',
  updated_at  timestamptz default now()
);

-- RLS
alter table kronos_mind_state enable row level security;
create policy "service_full_access" on kronos_mind_state
  using (true) with check (true);

-- Index para busca rápida
create index if not exists idx_mind_state_username on kronos_mind_state(username);
