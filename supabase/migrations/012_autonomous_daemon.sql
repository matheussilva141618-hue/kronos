-- ─── 012: Daemon de Consolidação Autônoma ─────────────────────────────────────
-- Adiciona suporte ao background learning daemon e ao scheduler pg_cron.

-- 1. Campo vectorized em conhecimentos_kronos
ALTER TABLE conhecimentos_kronos
  ADD COLUMN IF NOT EXISTS vectorized BOOLEAN DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_conhecimentos_vectorized
  ON conhecimentos_kronos (vectorized, quality_score)
  WHERE vectorized IS NULL;

-- 2. Tabela de execuções do daemon (audit log)
CREATE TABLE IF NOT EXISTS daemon_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daemon_type  TEXT NOT NULL,        -- 'cognitive_loop' | 'proactive_agent' | 'memory_consolidation'
  status       TEXT NOT NULL,        -- 'success' | 'error' | 'partial'
  tema         TEXT,
  quality_score INTEGER,
  consolidated INTEGER DEFAULT 0,
  duration_ms  INTEGER,
  error_msg    TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daemon_runs_type_created
  ON daemon_runs (daemon_type, created_at DESC);

-- RLS: apenas service role pode inserir/ler
ALTER TABLE daemon_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_daemon_runs"
  ON daemon_runs FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Função de trigger para consolidação automática de embeddings
-- Chamada automaticamente quando um novo conhecimento é inserido com score >= 8
CREATE OR REPLACE FUNCTION trigger_knowledge_vectorization()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Marca como pendente de vetorização (NULL = pendente, TRUE = feito, FALSE = falhou)
  IF NEW.quality_score >= 8 AND NEW.vectorized IS NULL THEN
    NEW.vectorized := NULL; -- permanece NULL até o daemon processar
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_knowledge_insert ON conhecimentos_kronos;
CREATE TRIGGER on_knowledge_insert
  BEFORE INSERT ON conhecimentos_kronos
  FOR EACH ROW EXECUTE FUNCTION trigger_knowledge_vectorization();

-- 4. pg_cron: agenda o cognitive-loop a cada 5 minutos via HTTP (requer pg_cron extension)
-- Descomente e configure a URL correta em produção:
-- SELECT cron.schedule(
--   'kronos-cognitive-loop',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://SEU_DOMINIO/api/cognitive-loop',
--     headers := '{"Authorization": "Bearer kronos-loop-2026", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- 5. Função RPC para o daemon consultar conhecimentos pendentes de vetorização
CREATE OR REPLACE FUNCTION get_pending_vectorization(p_limit INT DEFAULT 10)
RETURNS TABLE (
  id             UUID,
  topico         TEXT,
  conteudo_refinado TEXT,
  dominio        TEXT,
  quality_score  INTEGER
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, topico, conteudo_refinado, dominio, quality_score
  FROM conhecimentos_kronos
  WHERE vectorized IS NULL
    AND quality_score >= 8
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

-- Permissão para service role
GRANT EXECUTE ON FUNCTION get_pending_vectorization TO service_role;
