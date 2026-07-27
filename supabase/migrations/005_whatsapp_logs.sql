create table if not exists public.whatsapp_logs (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  destinatario text not null,
  conteudo     text not null,
  status_envio text not null check (status_envio in ('enviado', 'erro')),
  erro_detalhe text,
  message_id   text,
  created_at   timestamptz not null default now()
);

create index if not exists whatsapp_logs_username_idx on public.whatsapp_logs(username, created_at desc);

alter table public.whatsapp_logs enable row level security;

create policy "Acesso livre por username"
  on public.whatsapp_logs
  using (true)
  with check (true);
