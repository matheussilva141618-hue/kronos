create table if not exists public.email_logs (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,
  to_email    text not null,
  subject     text not null,
  preview     text,
  resend_id   text,
  status      text not null default 'sent' check (status in ('sent', 'failed')),
  created_at  timestamptz not null default now()
);

create index if not exists email_logs_username_idx on public.email_logs(username);

alter table public.email_logs enable row level security;
-- Acesso público por username (sem Auth) — adequado para o sistema atual
create policy "leitura por username"
  on public.email_logs for select using (true);
create policy "escrita por username"
  on public.email_logs for insert with check (true);
