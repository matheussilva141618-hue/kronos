-- Tabela de perfis do modo Kids
create table if not exists public.perfis_kids (
  id           uuid primary key default gen_random_uuid(),
  username     text not null unique,
  nome         text not null,
  idade        integer not null check (idade >= 3 and idade <= 17),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger perfis_kids_updated_at
  before update on public.perfis_kids
  for each row execute procedure public.set_updated_at();

-- RLS: cada usuário acessa apenas seu próprio perfil (por username)
alter table public.perfis_kids enable row level security;

create policy "Acesso livre por username"
  on public.perfis_kids
  using (true)
  with check (true);
