-- ─── Memória Vetorial do Kronos ──────────────────────────────────────────────

-- 1. Extensão pgvector
create extension if not exists vector;

-- 2. Tabela de memória vetorial
create table if not exists public.kronos_memory (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,
  content     text not null,                     -- texto original
  embedding   vector(1536),                      -- vetor de embedding (OpenAI ada-002 compatible)
  metadata    jsonb default '{}'::jsonb,          -- contexto adicional (mode, intent, score, etc.)
  created_at  timestamptz not null default now()
);

create index if not exists kronos_memory_username_idx on public.kronos_memory(username);
create index if not exists kronos_memory_embedding_idx
  on public.kronos_memory
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.kronos_memory enable row level security;
create policy "service_kronos_memory" on public.kronos_memory for all using (true) with check (true);

-- 3. Tabela de auto-correções (loop de aprendizado)
create table if not exists public.self_corrections (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,
  original     text not null,      -- resposta errada original
  correction   text not null,      -- correção do usuário
  context      text,               -- contexto da conversa
  applied      boolean default false,
  priority     int default 8 check (priority between 1 and 10),
  created_at   timestamptz not null default now()
);

create index if not exists self_corrections_username_idx on public.self_corrections(username);
create index if not exists self_corrections_priority_idx on public.self_corrections(priority desc, created_at desc);

alter table public.self_corrections enable row level security;
create policy "service_self_corrections" on public.self_corrections for all using (true) with check (true);

-- 4. Função RPC para busca por similaridade de cosseno
create or replace function match_memories(
  query_embedding  vector(1536),
  match_username   text,
  match_threshold  float    default 0.75,
  match_count      int      default 5
)
returns table (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql stable
as $$
  select
    km.id,
    km.content,
    km.metadata,
    1 - (km.embedding <=> query_embedding) as similarity
  from public.kronos_memory km
  where km.username = match_username
    and 1 - (km.embedding <=> query_embedding) > match_threshold
  order by km.embedding <=> query_embedding
  limit match_count;
$$;
