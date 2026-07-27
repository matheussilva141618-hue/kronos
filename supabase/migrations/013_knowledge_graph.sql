-- ─── 013: Grafo de Conhecimento + Pesos de Diretriz + HNSW Index ────────────
-- Suporte completo ao KRONOS CORE 2.0:
--   - Índice ivfflat/hnsw em kronos_memory para busca vetorial nativa
--   - Tabela directive_weights para pesos de auto-aprendizado
--   - Extensão do schema de user_projects
--   - RPC match_memories aprimorada

-- ─── 1. Habilitar extensão pgvector (se não existir) ─────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 2. Coluna embedding como tipo vector nativo (migração da versão TEXT) ───
-- NOTA: Executa apenas se a coluna ainda for TEXT. Em prod, faça ALTER com cuidado.
DO $$
BEGIN
  -- Adiciona coluna vector nativa se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kronos_memory' AND column_name = 'embedding_vec'
  ) THEN
    ALTER TABLE kronos_memory ADD COLUMN embedding_vec vector(1536);
    -- Popula da coluna TEXT existente
    UPDATE kronos_memory
    SET embedding_vec = embedding::vector
    WHERE embedding IS NOT NULL
      AND embedding != ''
      AND embedding != '[]';
  END IF;
END $$;

-- ─── 3. Índice HNSW nativo no Supabase (pgvector >= 0.5) ─────────────────────
-- m=16 efConstruction=64 são padrões seguros para datasets < 1M
CREATE INDEX IF NOT EXISTS kronos_memory_hnsw_idx
  ON kronos_memory
  USING hnsw (embedding_vec vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice adicional por usuário para filtrar antes do HNSW (composite)
CREATE INDEX IF NOT EXISTS kronos_memory_username_idx
  ON kronos_memory (username, created_at DESC);

-- ─── 4. RPC match_memories com HNSW + filtro por username ────────────────────
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding   text,        -- embedding serializado como JSON string '[0.1,...]'
  match_username    text,
  match_threshold   float  DEFAULT 0.65,
  match_count       int    DEFAULT 4
)
RETURNS TABLE (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q_vec vector(1536);
BEGIN
  -- Parse do JSON string para vector nativo
  q_vec := query_embedding::vector;

  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.metadata,
    1 - (m.embedding_vec <=> q_vec) AS similarity
  FROM kronos_memory m
  WHERE
    m.username = match_username
    AND m.embedding_vec IS NOT NULL
    AND 1 - (m.embedding_vec <=> q_vec) >= match_threshold
  ORDER BY m.embedding_vec <=> q_vec
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_memories TO service_role, authenticated;

-- ─── 5. Tabela directive_weights — pesos de aprendizado por diretriz ─────────
-- Cada correção do usuário decai o peso da diretriz correspondente (NEURAL_LOOP v2)
CREATE TABLE IF NOT EXISTS directive_weights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username         TEXT NOT NULL,
  topic            TEXT NOT NULL,          -- intent/tópico degradado (ex: 'create', 'analyze')
  weight           FLOAT NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0.0 AND 1.0),
  corrections      INT  NOT NULL DEFAULT 0,
  last_correction  TEXT,                   -- última correção aplicada
  last_original    TEXT,                   -- resposta original que foi corrigida
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (username, topic)
);

CREATE INDEX IF NOT EXISTS idx_directive_weights_user
  ON directive_weights (username, weight);

ALTER TABLE directive_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "directive_weights_service_only"
  ON directive_weights FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 6. Grafo de nós de conhecimento (knowledge_graph) ───────────────────────
-- Persiste os nós do grafo cross-domain com suas arestas calculadas
CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT NOT NULL,               -- '__system__' para nós globais
  content    TEXT NOT NULL,
  domain     TEXT NOT NULL DEFAULT 'general',
  weight     FLOAT NOT NULL DEFAULT 1.0,
  edge_ids   TEXT[] DEFAULT '{}',         -- IDs de nós conectados
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_username ON knowledge_graph_nodes (username);
CREATE INDEX IF NOT EXISTS idx_kg_domain   ON knowledge_graph_nodes (domain, weight DESC);

ALTER TABLE knowledge_graph_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_graph_service_only"
  ON knowledge_graph_nodes FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 7. Extend user_projects com campos para agentic loop ────────────────────
ALTER TABLE user_projects
  ADD COLUMN IF NOT EXISTS hypothesis_count  INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_hypothesis   TEXT,
  ADD COLUMN IF NOT EXISTS agentic_score     FLOAT   DEFAULT 0.0;

-- ─── 8. Trigger: sincroniza embedding_vec quando embedding TEXT é inserido ───
CREATE OR REPLACE FUNCTION sync_embedding_vec()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.embedding IS NOT NULL AND NEW.embedding != '' AND NEW.embedding != '[]' THEN
    BEGIN
      NEW.embedding_vec := NEW.embedding::vector;
    EXCEPTION WHEN OTHERS THEN
      -- Ignora erro de parse — embedding_vec fica NULL
      NEW.embedding_vec := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_embedding ON kronos_memory;
CREATE TRIGGER trg_sync_embedding
  BEFORE INSERT OR UPDATE OF embedding ON kronos_memory
  FOR EACH ROW EXECUTE FUNCTION sync_embedding_vec();

-- ─── 9. Função RPC para busca no grafo cross-domain (user + system) ───────────
CREATE OR REPLACE FUNCTION match_knowledge_graph(
  query_embedding  text,
  match_username   text,
  match_threshold  float DEFAULT 0.50,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (
  id         uuid,
  content    text,
  domain     text,
  weight     float,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  q_vec vector(1536);
BEGIN
  q_vec := query_embedding::vector;
  RETURN QUERY
  SELECT
    n.id, n.content, n.domain, n.weight,
    1 - (m.embedding_vec <=> q_vec) AS similarity
  FROM knowledge_graph_nodes n
  JOIN kronos_memory m ON m.id = n.id
  WHERE
    (n.username = match_username OR n.username = '__system__')
    AND m.embedding_vec IS NOT NULL
    AND 1 - (m.embedding_vec <=> q_vec) >= match_threshold
  ORDER BY m.embedding_vec <=> q_vec
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_knowledge_graph TO service_role;

-- ─── 10. Índice de texto para busca textual fallback ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_kronos_memory_content_fts
  ON kronos_memory
  USING gin (to_tsvector('portuguese', content));
