-- Tabela de memória de longo prazo do usuário
create table if not exists public.user_memory (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  username         text,                          -- fallback para usuários sem Auth
  topic            text not null,
  detail           text not null,
  importance_score int  not null default 5 check (importance_score between 1 and 10),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists user_memory_user_id_idx  on public.user_memory(user_id);
create index if not exists user_memory_username_idx on public.user_memory(username);

alter table public.user_memory enable row level security;

create policy "usuarios veem sua propria memoria"
  on public.user_memory for all
  using (auth.uid() = user_id);
