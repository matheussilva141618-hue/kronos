-- Tabela de conhecimentos adquiridos pelo agente autônomo com meta-cognição
create table if not exists public.conhecimentos_kronos (
  id                uuid primary key default gen_random_uuid(),
  topico            text not null,
  conteudo          text not null,
  conteudo_refinado text,                              -- versão refinada pela meta-cognição
  origem            text not null default 'agente_autonomo_cerebras',
  dominio           text default 'outro',              -- domínio do conhecimento
  quality_score     int  default 7 check (quality_score between 1 and 10),
  ciclo             int  default 1,
  created_at        timestamptz not null default now()
);

create index if not exists conhecimentos_topico_idx   on public.conhecimentos_kronos(topico);
create index if not exists conhecimentos_dominio_idx  on public.conhecimentos_kronos(dominio);
create index if not exists conhecimentos_score_idx    on public.conhecimentos_kronos(quality_score desc);
create index if not exists conhecimentos_created_idx  on public.conhecimentos_kronos(created_at desc);

alter table public.conhecimentos_kronos enable row level security;
create policy "service_conhecimentos" on public.conhecimentos_kronos
  for all using (true) with check (true);
