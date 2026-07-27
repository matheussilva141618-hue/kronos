-- ═══════════════════════════════════════════════════════════
-- Migration 006: Multi-tenancy — user_id em todas as tabelas
-- RLS estrito: auth.uid() = user_id em tudo
-- ═══════════════════════════════════════════════════════════

-- ── perfis_kids: adiciona user_id ───────────────────────────
alter table public.perfis_kids
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Unique por user_id (não por username)
alter table public.perfis_kids
  drop constraint if exists perfis_kids_username_key;

create unique index if not exists perfis_kids_user_id_key on public.perfis_kids(user_id);

-- Remove policies antigas (política aberta) e cria RLS estrita
drop policy if exists "Acesso livre por username" on public.perfis_kids;

create policy "perfis_kids: dono acessa seu perfil"
  on public.perfis_kids for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── whatsapp_logs: adiciona user_id ─────────────────────────
alter table public.whatsapp_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

drop policy if exists "Acesso livre por username" on public.whatsapp_logs;

create policy "whatsapp_logs: dono vê seus logs"
  on public.whatsapp_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists whatsapp_logs_user_id_idx on public.whatsapp_logs(user_id, created_at desc);

-- ── user_memory: garante RLS por user_id ────────────────────
-- (política já existe na 002, mas reforça)
drop policy if exists "usuarios veem sua propria memoria" on public.user_memory;

create policy "user_memory: dono acessa sua memória"
  on public.user_memory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── conversations + messages: já têm RLS, reforça ───────────
drop policy if exists "usuarios veem suas conversas" on public.conversations;
drop policy if exists "usuarios veem suas mensagens" on public.messages;

create policy "conversations: dono acessa suas conversas"
  on public.conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "messages: dono acessa suas mensagens"
  on public.messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
