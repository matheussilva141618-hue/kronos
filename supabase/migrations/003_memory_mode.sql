-- Adiciona coluna mode na tabela user_memory
alter table public.user_memory
  add column if not exists mode text not null default 'profissional'
  check (mode in ('profissional', 'academy', 'kids'));

create index if not exists user_memory_mode_idx on public.user_memory(username, mode);
