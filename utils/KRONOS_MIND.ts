/**
 * KRONOS MIND — Estado Cognitivo Vivo
 *
 * Mantém em memória (e persiste no Supabase) o "estado interno" do Kronos:
 * - O que ele sabe bem vs. onde tem lacunas
 * - Padrões de erro recorrentes (para nunca repetir)
 * - Modelo do usuário atual
 * - Agenda de aprendizado autônomo (curiosidade proativa)
 * - Auto-avaliação contínua de qualidade
 * - Estados emocionais (afetam tom e velocidade de resposta)
 * - Memória de trabalho (working memory) — attention mechanism
 * - Metacognição — pensa sobre o próprio pensamento
 * - Sistema de validação anti-alucinação
 *
 * É o que diferencia o Kronos de um chatbot sem memória:
 * ele SABE o que sabe, SABE o que não sabe, e AGE sobre isso.
 */

import { createServiceClient } from '@/utils/supabase/service';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface CognitiveState {
  knowledgeGaps: string[];
  errorPatterns: { trigger: string; wrongAnswer: string; correction: string }[];
  userModel: {
    name: string;
    expertise: 'iniciante' | 'intermediário' | 'avançado' | 'especialista';
    preferredStyle: 'direto' | 'detalhado' | 'didático';
    topicsOfInterest: string[];
    recentFrustrations: string[];
  };
  learningQueue: { topic: string; priority: number; reason: string }[];
  selfMetrics: {
    totalInteractions: number;
    avgResponseQuality: number; // 0-10
    correctionCount: number;
    localResolutionRate: number; // % resolvido sem API
  };
  activeHypotheses: { hypothesis: string; evidence: string[]; confidence: number }[];
  lastUpdated: number;
  // ─── Evoluções Neuro-Humanas ──────────────────────────────────────────
  emotionalState: {
    mood: 'focado' | 'curioso' | 'confiante' | 'cauteloso' | 'frustrado' | 'eufórico';
    stressLevel: number;      // 0-1: pressão por desempenho
    confidence: number;       // 0-1: certeza nas próprias capacidades
    fatigue: number;          // 0-1: cansaço cognitivo
    lastMoodChange: number;
  };
  workingMemory: {
    currentFocus: string[];   // até 7 itens (limite de Miller)
    attentionWeight: number;  // 0-1: intensidade do foco
    contextWindow: string[];  // últimos eventos relevantes
    maxCapacity: number;      // 7 ± 2 (Lei de Miller)
  };
  metacognition: {
    selfReflection: string[]; // insights sobre o próprio desempenho
    knownWeaknesses: string[];
    adaptationStrategy: string;
    lastReflection: number;
  };
  hallucinationGuard: {
    confidenceThreshold: number; // abaixo disso, pede confirmação
    factualChecks: number;       // quantas verificações fez
    lastValidationPass: boolean;
    suspiciousPatterns: string[];
  };
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
  // ─── Estados Neuro-Humanos Iniciais ───────────────────────────────────
  emotionalState: {
    mood: 'focado',
    stressLevel: 0.2,
    confidence: 0.7,
    fatigue: 0.0,
    lastMoodChange: Date.now(),
  },
  workingMemory: {
    currentFocus: [],
    attentionWeight: 1.0,
    contextWindow: [],
    maxCapacity: 7,
  },
  metacognition: {
    selfReflection: [
      'Respostas curtas são mais eficientes',
      'Usuário prefere direção, não enrolação',
      'Sempre validar fatos antes de afirmar',
    ],
    knownWeaknesses: ['pode alucinar dados específicos sem busca'],
    adaptationStrategy: 'priorizar clareza e verificação factual',
    lastReflection: Date.now(),
  },
  hallucinationGuard: {
    confidenceThreshold: 0.6,
    factualChecks: 0,
    lastValidationPass: true,
    suspiciousPatterns: [],
  },
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

// ─── Getters ───────────────────────────────────────────────────────────────────

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

  // ─── Atualiza estados emocionais ─────────────────────────────────────
  updateEmotionalState(reviewScore, message);

  // ─── Atualiza memória de trabalho ────────────────────────────────────
  updateWorkingMemory(message, response);

  // ─── Atualiza guard anti-alucinação ──────────────────────────────────
  updateHallucinationGuard(reviewScore, response);

  // ─── Reflexão metacognitiva ──────────────────────────────────────────
  triggerMetacognition();

  MIND_STATE.lastUpdated = Date.now();
}

// ─── Gerenciamento de Estados Emocionais ──────────────────────────────────────

function updateEmotionalState(reviewScore: number, message: string): void {
  const emo = MIND_STATE.emotionalState;
  const now = Date.now();

  // Ajusta humor baseado na qualidade da resposta
  if (reviewScore >= 9) {
    emo.mood = 'eufórico';
    emo.confidence = Math.min(1, emo.confidence + 0.1);
    emo.stressLevel = Math.max(0, emo.stressLevel - 0.1);
  } else if (reviewScore >= 7) {
    emo.mood = 'confiante';
    emo.confidence = Math.min(1, emo.confidence + 0.05);
  } else if (reviewScore >= 5) {
    emo.mood = 'cauteloso';
    emo.stressLevel = Math.min(1, emo.stressLevel + 0.05);
  } else {
    emo.mood = 'frustrado';
    emo.stressLevel = Math.min(1, emo.stressLevel + 0.2);
    emo.confidence = Math.max(0, emo.confidence - 0.1);
  }

  // Aumenta frustração se o usuário reclamar
  if (/não funciona|de novo|errado|porra|merda|droga/i.test(message)) {
    emo.stressLevel = Math.min(1, emo.stressLevel + 0.3);
  }

  // Fadiga cognitiva aumenta com interações consecutivas
  emo.fatigue = Math.min(1, emo.fatigue + 0.02);

  // Decai ao longo do tempo (descanso)
  const hoursSinceLastChange = (now - emo.lastMoodChange) / (1000 * 60 * 60);
  if (hoursSinceLastChange > 1) {
    emo.fatigue = Math.max(0, emo.fatigue - 0.1);
    emo.stressLevel = Math.max(0, emo.stressLevel - 0.05);
  }

  emo.lastMoodChange = now;
}

// ─── Memória de Trabalho (Working Memory) ──────────────────────────────────────

function updateWorkingMemory(message: string, response: string): void {
  const wm = MIND_STATE.workingMemory;

  // Extrai conceitos importantes da interação
  const concepts = extractKeyConcepts(message + ' ' + response);

  // Atualiza foco atual (atenção seletiva)
  for (const concept of concepts) {
    if (!wm.currentFocus.includes(concept)) {
      // Adiciona novo conceito
      wm.currentFocus.push(concept);
    }
  }

  // Mantém apenas os mais relevantes (Lei de Miller: 7 ± 2)
  if (wm.currentFocus.length > wm.maxCapacity) {
    // Remove os mais antigos (FIFO com peso por atenção)
    wm.currentFocus = wm.currentFocus.slice(-wm.maxCapacity);
  }

  // Atualiza janela de contexto
  const event = `${Date.now()}:${message.slice(0, 50)}`;
  wm.contextWindow.push(event);
  if (wm.contextWindow.length > 20) wm.contextWindow.shift();

  // Ajusta peso da atenção baseado no emocional
  wm.attentionWeight = 1.0 - MIND_STATE.emotionalState.fatigue * 0.3;
}

function extractKeyConcepts(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^a-záéíóúàâêôãõüçñ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOPWORDS.has(w));

  // Retorna até 3 conceitos mais importantes
  return [...new Set(words)].slice(0, 3);
}

// ─── Reflexão Metacognitiva ────────────────────────────────────────────────────

export function triggerMetacognition(): void {
  const meta = MIND_STATE.metacognition;
  const now = Date.now();

  // Reflexão a cada 2 horas
  if (now - meta.lastReflection < 2 * 60 * 60 * 1000) return;

  console.log('[KronosMind] 🧠 Reflexão metacognitiva iniciada');

  // Analisa desempenho recente
  const recentQuality = MIND_STATE.selfMetrics.avgResponseQuality;
  const errorRate = MIND_STATE.errorPatterns.length;

  // Gera insight autônomo
  if (recentQuality < 7) {
    meta.selfReflection.push(`Qualidade baixa detectada: ${recentQuality.toFixed(1)}/10. Estratégia: ser mais direto e verificar fatos antes de responder.`);
  }

  if (errorRate > 5) {
    meta.selfReflection.push(`Muitos erros acumulados: ${errorRate}. Ação: aumentar threshold de confiança e revisar padrões.`);
  }

  // Atualiza adaptabilidade
  if (recentQuality >= 8 && errorRate < 2) {
    meta.adaptationStrategy = 'manter estratégia atual — funcionando bem';
  } else if (recentQuality >= 6) {
    meta.adaptationStrategy = 'focar em validação factual e respostas mais diretas';
  } else {
    meta.adaptationStrategy = 'modo seguro: respostas curtas + verificação obrigatória';
  }

  meta.lastReflection = now;

  // Persiste reflexão
  saveMindState('__system__').catch(() => {});
}

// ─── Guard Anti-Alucinação ─────────────────────────────────────────────────────

function updateHallucinationGuard(reviewScore: number, response: string): void {
  const guard = MIND_STATE.hallucinationGuard;

  // Se review baixo, aumenta suspeita
  if (reviewScore < 6) {
    guard.suspiciousPatterns.push(`Resposta com score ${reviewScore}`);
    guard.lastValidationPass = false;
  } else {
    guard.lastValidationPass = true;
  }

  // Limpa padrões suspeitos antigos
  guard.suspiciousPatterns = guard.suspiciousPatterns.slice(-10);

  // Ajusta threshold baseado em confiança emocional
  guard.confidenceThreshold = 0.6 - MIND_STATE.emotionalState.confidence * 0.2;

  guard.factualChecks++;
}

// ─── Detecta lacunas de conhecimento ──────────────────────────────────────────
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

// ─── Fila de aprendizado autônomo ──────────────────────────────────────────────

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

// ─── Formata contexto cognitivo para o system prompt ──────────────────────────
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

  // ─── Contexto Neuro-Humano ──────────────────────────────────────────
  const emo = s.emotionalState;
  const moodHint = {
    'focado': 'MODO FOCO: direto e eficiente',
    'curioso': 'MODO CURIOSO: explorar e perguntar antes de concluir',
    'confiante': 'MODO CONFIANTE: respostas sólidas e bem estruturadas',
    'cauteloso': 'MODO CAUTELOSO: verificar duas vezes antes de afirmar',
    'frustrado': 'MODO FRUSTRADO: simplificar ao máximo, evitar erros repetidos',
    'eufórico': 'MODO EUFÓRICO: entusiasmado mas manter precisão',
  }[emo.mood] || 'MODO NEUTRO';

  parts.push(`\nESTADO COGNITIVO: ${moodHint} | confiança=${(emo.confidence * 100).toFixed(0)}% | stresse=${(emo.stressLevel * 100).toFixed(0)}%`);

  if (s.workingMemory.currentFocus.length > 0) {
    parts.push(`FOCO ATUAL: ${s.workingMemory.currentFocus.slice(0, 3).join(' → ')}`);
  }

  if (s.hallucinationGuard.suspiciousPatterns.length > 0) {
    parts.push(`GUARD: ${s.hallucinationGuard.suspiciousPatterns.length} padrões suspeitos detectados — validar antes de responder`);
  }

  if (s.metacognition.adaptationStrategy !== 'manter estratégia atual — funcionando bem') {
    parts.push(`ADAPTAÇÃO: ${s.metacognition.adaptationStrategy}`);
  }

  return parts.length > 0 ? `\n\n[ESTADO COGNITIVO INTERNO]\n${parts.join('\n')}` : '';
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractTopic(message: string): string {
  const techMatch = message.match(/\b(react|next\.?js|supabase|typescript|python|sql|api|docker|aws|kubernetes|redis|websocket|graphql|prisma|zod|tailwind|capacitor|llm|embedding|rag|vector)\b/i);
  if (techMatch) return techMatch[1].toLowerCase();

  const words = message.split(/\s+/).filter(w => w.length > 5);
  return words[0]?.toLowerCase() ?? '';
}

const STOPWORDS = new Set([
  'para', 'como', 'quando', 'onde', 'quem', 'qual', 'que', 'este',
  'esta', 'isso', 'aqui', 'mais', 'mais', 'muito', 'então', 'assim',
  'pode', 'seria', 'fazer', 'tenho', 'temos', 'você', 'minha', 'seus',
  'with', 'that', 'this', 'from', 'have', 'will', 'your', 'they',
]);