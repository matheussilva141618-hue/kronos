/**
 * KRONOS MIND — Estado Cognitivo Vivo
 *
 * Mantém em memória (e persiste no Supabase) o "estado interno" do Kronos:
 * - O que ele sabe bem vs. onde tem lacunas
 * - Padrões de erro recorrentes (para nunca repetir)
 * - Modelo de comportamento do usuário atual
 * - Agenda de aprendizado autônomo (curiosidade proativa)
 * - Auto-avaliação contínua de qualidade
 *
 * É o que diferencia o Kronos de um chatbot sem memória:
 * ele SABE o que sabe, SABE o que não sabe, e AGE sobre isso.
 */

import { createServiceClient } from '@/utils/supabase/service';

// ─── Estado cognitivo global (singleton em memória) ───────────────────────────

export interface CognitiveState {
  // Lacunas de conhecimento detectadas
  knowledgeGaps: string[];
  // Padrões de erro que o Kronos já cometeu e não deve repetir
  errorPatterns: { trigger: string; wrongAnswer: string; correction: string }[];
  // Modelo do usuário atual
  userModel: {
    name: string;
    expertise: 'iniciante' | 'intermediário' | 'avançado' | 'especialista';
    preferredStyle: 'direto' | 'detalhado' | 'didático';
    topicsOfInterest: string[];
    recentFrustrations: string[];
  };
  // Agenda de aprendizado autônomo
  learningQueue: { topic: string; priority: number; reason: string }[];
  // Métricas de auto-avaliação
  selfMetrics: {
    totalInteractions: number;
    avgResponseQuality: number; // 0-10
    correctionCount: number;
    localResolutionRate: number; // % resolvido sem API
  };
  // Hipóteses ativas (o Kronos está testando essas ideias)
  activeHypotheses: { hypothesis: string; evidence: string[]; confidence: number }[];
  lastUpdated: number;
}

// Singleton global — persiste durante toda a sessão do servidor
let MIND_STATE: CognitiveState = {
  knowledgeGaps: [],
  errorPatterns: [],
  userModel: {
    name: '',
    expertise: 'intermediário',
    preferredStyle: 'direto',
    topicsOfInterest: [],
    recentFrustrations: [],
  },
  learningQueue: [],
  selfMetrics: {
    totalInteractions: 0,
    avgResponseQuality: 7,
    correctionCount: 0,
    localResolutionRate: 0,
  },
  activeHypotheses: [],
  lastUpdated: Date.now(),
};

// ─── Carrega estado do Supabase na inicialização ──────────────────────────────

export async function loadMindState(username: string): Promise<void> {
  try {
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from('kronos_mind_state')
      .select('state')
      .eq('username', username)
      .single();

    if (data?.state) {
      MIND_STATE = { ...MIND_STATE, ...data.state, lastUpdated: Date.now() };
    }
  } catch { /* warm start sem dados — usa padrão */ }
}

// ─── Persiste estado no Supabase (non-blocking) ───────────────────────────────

export async function saveMindState(username: string): Promise<void> {
  try {
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from('kronos_mind_state')
      .upsert(
        { username, state: MIND_STATE, updated_at: new Date().toISOString() },
        { onConflict: 'username' }
      );
  } catch { /* não bloqueia */ }
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getMindState(): CognitiveState { return MIND_STATE; }

// ─── Atualiza modelo do usuário com base nas interações ───────────────────────

export function updateUserModel(
  username: string,
  message: string,
  response: string,
  reviewScore: number
): void {
  const m = MIND_STATE.userModel;

  if (!m.name && username) m.name = username;

  // Detecta nível de expertise pelo tipo de perguntas
  if (/race condition|N\+1|HNSW|pgvector|SSR|RSC|tree shaking|memoize/i.test(message)) {
    m.expertise = 'especialista';
  } else if (/typescript|supabase|next\.js|hook|async|deploy/i.test(message)) {
    if (m.expertise === 'iniciante') m.expertise = 'intermediário';
    else m.expertise = 'avançado';
  }

  // Detecta estilo preferido
  if (/curto|direto|rápido|resumo/i.test(message)) m.preferredStyle = 'direto';
  else if (/detalh|explica|aprofund/i.test(message)) m.preferredStyle = 'detalhado';
  else if (/aprend|ensina|como funciona/i.test(message)) m.preferredStyle = 'didático';

  // Rastreia frustração
  if (/não funciona|de novo|errado|porra|merda|droga/i.test(message)) {
    const frustration = message.slice(0, 80);
    m.recentFrustrations = [frustration, ...m.recentFrustrations].slice(0, 3);
  }

  // Extrai tópicos de interesse
  const techMatches = message.match(/\b(react|next\.js|supabase|python|typescript|android|ia|llm|api|sql|docker)\b/gi);
  if (techMatches) {
    const newTopics = techMatches.map(t => t.toLowerCase());
    m.topicsOfInterest = [...new Set([...newTopics, ...m.topicsOfInterest])].slice(0, 10);
  }

  // Atualiza métricas
  MIND_STATE.selfMetrics.totalInteractions++;
  const prev = MIND_STATE.selfMetrics.avgResponseQuality;
  MIND_STATE.selfMetrics.avgResponseQuality = (prev * 0.9) + (reviewScore * 0.1);

  MIND_STATE.lastUpdated = Date.now();
}

// ─── Detecta lacunas de conhecimento ─────────────────────────────────────────
// Quando o Kronos não soube responder algo bem, registra pra aprender depois

export function detectKnowledgeGap(message: string, reviewScore: number): void {
  if (reviewScore >= 7) return; // resposta boa, sem lacuna

  const topic = extractTopic(message);
  if (!topic) return;

  const alreadyKnown = MIND_STATE.knowledgeGaps.includes(topic);
  if (!alreadyKnown) {
    MIND_STATE.knowledgeGaps = [topic, ...MIND_STATE.knowledgeGaps].slice(0, 20);

    // Adiciona à fila de aprendizado com prioridade
    const priority = 10 - reviewScore; // score baixo = prioridade alta
    addToLearningQueue(topic, priority, `Resposta fraca (score ${reviewScore}) detectada`);
  }
}

// ─── Fila de aprendizado autônomo ─────────────────────────────────────────────

export function addToLearningQueue(topic: string, priority: number, reason: string): void {
  const existing = MIND_STATE.learningQueue.find(q => q.topic === topic);
  if (existing) {
    existing.priority = Math.max(existing.priority, priority);
    return;
  }
  MIND_STATE.learningQueue.push({ topic, priority, reason });
  // Mantém ordenado por prioridade
  MIND_STATE.learningQueue.sort((a, b) => b.priority - a.priority);
  MIND_STATE.learningQueue = MIND_STATE.learningQueue.slice(0, 15);
}

export function getNextLearningTopic(): { topic: string; reason: string } | null {
  return MIND_STATE.learningQueue[0] ?? null;
}

export function markTopicLearned(topic: string): void {
  MIND_STATE.learningQueue = MIND_STATE.learningQueue.filter(q => q.topic !== topic);
  MIND_STATE.knowledgeGaps = MIND_STATE.knowledgeGaps.filter(g => g !== topic);
}

// ─── Padrões de erro ──────────────────────────────────────────────────────────

export function recordErrorPattern(trigger: string, wrong: string, correction: string): void {
  const exists = MIND_STATE.errorPatterns.some(p =>
    p.trigger.toLowerCase().includes(trigger.slice(0, 30).toLowerCase())
  );
  if (!exists) {
    MIND_STATE.errorPatterns = [
      { trigger: trigger.slice(0, 100), wrongAnswer: wrong.slice(0, 200), correction: correction.slice(0, 200) },
      ...MIND_STATE.errorPatterns,
    ].slice(0, 10);
    MIND_STATE.selfMetrics.correctionCount++;
  }
}

// ─── Hipóteses ativas ─────────────────────────────────────────────────────────

export function addHypothesis(hypothesis: string, evidence: string): void {
  const existing = MIND_STATE.activeHypotheses.find(h =>
    h.hypothesis.slice(0, 40) === hypothesis.slice(0, 40)
  );
  if (existing) {
    existing.evidence.push(evidence.slice(0, 100));
    existing.confidence = Math.min(0.99, existing.confidence + 0.1);
  } else {
    MIND_STATE.activeHypotheses = [
      { hypothesis: hypothesis.slice(0, 200), evidence: [evidence.slice(0, 100)], confidence: 0.5 },
      ...MIND_STATE.activeHypotheses,
    ].slice(0, 5);
  }
}

// ─── Formata contexto cognitivo para o system prompt ─────────────────────────
// Injeta o estado interno do Kronos como contexto adicional

export function formatMindContext(username: string): string {
  const s = MIND_STATE;
  const parts: string[] = [];

  if (s.userModel.expertise !== 'intermediário' || s.userModel.preferredStyle !== 'direto') {
    parts.push(`PERFIL DO USUÁRIO: expertise=${s.userModel.expertise}, estilo=${s.userModel.preferredStyle}`);
  }

  if (s.userModel.topicsOfInterest.length > 0) {
    parts.push(`INTERESSES RECENTES: ${s.userModel.topicsOfInterest.slice(0, 5).join(', ')}`);
  }

  if (s.errorPatterns.length > 0) {
    const recent = s.errorPatterns.slice(0, 2);
    parts.push(`ERROS PASSADOS — NUNCA REPITA:\n${recent.map(e => `• "${e.trigger.slice(0, 50)}" → resposta correta: "${e.correction.slice(0, 80)}"`).join('\n')}`);
  }

  if (s.userModel.recentFrustrations.length > 0) {
    parts.push(`FRUSTRAÇÃO RECENTE: "${s.userModel.recentFrustrations[0]}" — seja mais direto e eficiente`);
  }

  if (s.selfMetrics.avgResponseQuality < 6.5) {
    parts.push(`AUTO-AVALIAÇÃO: qualidade média das últimas respostas está baixa (${s.selfMetrics.avgResponseQuality.toFixed(1)}/10) — foque em precisão e completude`);
  }

  return parts.length > 0 ? `\n\n[ESTADO COGNITIVO INTERNO]\n${parts.join('\n')}` : '';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTopic(message: string): string {
  const techMatch = message.match(/\b(react|next\.?js|supabase|typescript|python|sql|api|docker|aws|kubernetes|redis|websocket|graphql|prisma|zod|tailwind|capacitor|llm|embedding|rag|vector)\b/i);
  if (techMatch) return techMatch[1].toLowerCase();

  const words = message.split(/\s+/).filter(w => w.length > 5);
  return words[0]?.toLowerCase() ?? '';
}
