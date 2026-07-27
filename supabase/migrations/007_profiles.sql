-- ═══════════════════════════════════════════════════════════
-- Migration 007: Tabela profiles + trigger automático
-- O user_id é injetado pelo sistema, nunca pelo cliente
-- ═══════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Atualiza updated_at automaticamente
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Trigger: cria um perfil automaticamente quando um usuário é criado no Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS: cada usuário acessa apenas seu próprio perfil
alter table public.profiles enable row level security;

create policy "profiles: dono acessa seu perfil"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Service role pode fazer upsert (usado pelas API routes)
create policy "profiles: service role acesso total"
  on public.profiles for all
  to service_role
  using (true)
  with check (true);
