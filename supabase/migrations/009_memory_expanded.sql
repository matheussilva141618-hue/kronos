-- ─── Expansão da memória persistente do Kronos ───────────────────────────────

-- 1. Adiciona campos de metadados na tabela existente
alter table public.user_memory
  add column if not exists category text default 'preference'
    check (category in ('preference','project','fact','interaction','style','feedback')),
  add column if not exists access_count int not null default 0,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists source text default 'auto'; -- 'auto' | 'explicit' | 'feedback'

-- 2. Tabela de histórico de interações (resumos por sessão)
create table if not exists public.interaction_log (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  mode         text not null default 'profissional',
  session_date date not null default current_date,
  topics       text[] default '{}',       -- tópicos abordados na sessão
  summary      text,                       -- resumo gerado da sessão
  message_count int default 0,
  created_at   timestamptz not null default now()
);

create index if not exists interaction_log_username_idx on public.interaction_log(username, session_date desc);

-- 3. Tabela de feedback do usuário (para ajuste de preferências)
create table if not exists public.user_feedback (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  message_hash text not null,             -- hash da mensagem avaliada
  rating       int check (rating between 1 and 5),
  correction   text,                      -- correção textual do usuário
  context      text,                      -- mensagem original
  created_at   timestamptz not null default now()
);

create index if not exists user_feedback_username_idx on public.user_feedback(username);

-- 4. Tabela de projetos ativos do usuário
create table if not exists public.user_projects (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  name         text not null,
  description  text,
  stack        text[],
  status       text default 'active' check (status in ('active','paused','done')),
  last_context text,                       -- último contexto relevante
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (username, name)
);

create index if not exists user_projects_username_idx on public.user_projects(username);

-- 5. RLS policies (service role bypassa automaticamente)
alter table public.interaction_log enable row level security;
alter table public.user_feedback enable row level security;
alter table public.user_projects enable row level security;

-- Policies permissivas para service role (já usa bypass)
create policy "service_interaction_log" on public.interaction_log for all using (true) with check (true);
create policy "service_user_feedback"   on public.user_feedback   for all using (true) with check (true);
create policy "service_user_projects"   on public.user_projects   for all using (true) with check (true);
