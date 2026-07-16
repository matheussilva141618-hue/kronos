-- Tabela de conversas
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Nova conversa',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Tabela de mensagens
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

-- Índices para performance
create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id);

-- RLS: cada usuário vê apenas suas próprias conversas e mensagens
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "usuarios veem suas conversas"
  on public.conversations for all
  using (auth.uid() = user_id);

create policy "usuarios veem suas mensagens"
  on public.messages for all
  using (auth.uid() = user_id);
