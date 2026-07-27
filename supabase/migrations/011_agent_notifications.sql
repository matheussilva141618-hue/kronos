-- Tabela de notificações autônomas do agente Kronos
-- Armazena iniciativas proativas que a IA detecta sem intervenção humana
create table if not exists public.agent_notifications (
  id                uuid primary key default gen_random_uuid(),
  username          text not null,                          -- usuário alvo
  type              text not null,                          -- code_optimization | study_reminder | insight | project_status | knowledge_gap | news_alert
  title             text not null,                          -- título curto da notificação
  message           text not null,                          -- corpo da mensagem gerada pela IA
  priority          int  not null default 5 check (priority between 1 and 10),  -- 1=baixa, 10=crítica
  metadata          jsonb default '{}'::jsonb,              -- dados estruturados (ex: { project: "neo", file: "route.ts" })
  source            text not null default 'proactive_agent', -- origem: proactive_agent | cognitive_worker | meta_cognition
  read              boolean not null default false,         -- marcado como lido pelo usuário
  dismissed         boolean not null default false,         -- descartado pelo usuário
  created_at        timestamptz not null default now(),
  expires_at        timestamptz                            -- se preenchido, notificação expira após esta data
);

-- Índices para consultas rápidas
create index if not exists agent_notif_username_idx   on public.agent_notifications(username);
create index if not exists agent_notif_unread_idx     on public.agent_notifications(username, read) where read = false;
create index if not exists agent_notif_priority_idx   on public.agent_notifications(priority desc);
create index if not exists agent_notif_created_idx    on public.agent_notifications(created_at desc);
create index if not exists agent_notif_expires_idx    on public.agent_notifications(expires_at) where expires_at is not null;

-- RLS: apenas o próprio usuário ou service role podem acessar
alter table public.agent_notifications enable row level security;

-- Política para leitura: usuário vê apenas as próprias notificações
create policy "agent_notifications_select_own" on public.agent_notifications
  for select using (
    auth.role() = 'service_role' or
    username = (select current_setting('app.current_username', true))
  );

-- Política para insert: service role pode inserir para qualquer usuário
create policy "agent_notifications_insert_service" on public.agent_notifications
  for insert with check (auth.role() = 'service_role');

-- Política para update: usuário pode marcar como lido/dismissed nas próprias notificações
create policy "agent_notifications_update_own" on public.agent_notifications
  for update using (
    auth.role() = 'service_role' or
    username = (select current_setting('app.current_username', true))
  ) with check (
    auth.role() = 'service_role' or
    username = (select current_setting('app.current_username', true))
  );

-- Função para limpar notificações expiradas (pode ser chamada por cron)
create or replace function public.clean_expired_notifications()
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.agent_notifications
  where expires_at is not null and expires_at < now()
    and read = true;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;