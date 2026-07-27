/**
 * KRONOS — Memory Engine
 * Memória persistente consolidada: preferências, projetos, interações e feedback.
 * Sliding window por relevância para contexto de curto prazo otimizado.
 */

import { createServiceClient } from '@/utils/supabase/service';
import type { KronosMode } from '@/app/api/chat/route';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  topic:            string;
  detail:           string;
  importance_score: number;
  mode:             string;
  category?:        string;
  access_count?:    number;
  last_accessed_at?: string;
  source?:          string;
}

export interface UserProject {
  name:         string;
  description:  string;
  stack:        string[];
  status:       'active' | 'paused' | 'done';
  last_context: string;
  updated_at:   string;
}

export interface SessionLog {
  topics:        string[];
  summary:       string;
  message_count: number;
  session_date:  string;
}

export interface FullUserContext {
  memory:       MemoryEntry[];
  projects:     UserProject[];
  recentTopics: string[];          // últimos 30 dias
  style:        UserStyleProfile;
  knowledge:    { topico: string; conteudo: string }[];
}

export interface UserStyleProfile {
  tone:      'formal' | 'informal' | 'technical' | 'casual' | 'auto';
  depth:     'concise' | 'detailed' | 'auto';
  language:  string;               // 'pt', 'en', 'es', etc.
  hasEmoji:  boolean;
  avgMsgLen: number;
}

export type MemoryLayer = 'episodic' | 'procedural' | 'semantic';

export function assignMemoryLayer(entry: MemoryEntry): MemoryLayer {
  const detail = entry.detail.toLowerCase();
  const topic  = entry.topic.toLowerCase();

  if (entry.category?.includes('procedural') || /fluxo|processo|rotina|passo a passo|workflow|pipeline|procedimento|script/.test(detail)) {
    return 'procedural';
  }

  if (/projeto|contexto|session|interação|dossiê|agenda|histórico|relatório|diário/.test(topic + ' ' + detail)) {
    return 'episodic';
  }

  return 'semantic';
}

export function pruneRedundantMemory(entries: MemoryEntry[]): MemoryEntry[] {
  const byKey = new Map<string, MemoryEntry>();

  for (const entry of entries) {
    const key = `${entry.topic}:${entry.detail.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...entry });
      continue;
    }

    existing.importance_score = Math.max(existing.importance_score, entry.importance_score);
    existing.access_count = (existing.access_count ?? 0) + (entry.access_count ?? 0);
    existing.last_accessed_at = existing.last_accessed_at || entry.last_accessed_at;
  }

  return Array.from(byKey.values()).sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0));
}

export function buildHierarchicalMemoryContext(ctx: FullUserContext, currentMsg?: string): string {
  if (!ctx.memory.length) return '';

  const layers: Record<MemoryLayer, MemoryEntry[]> = {
    episodic: [], procedural: [], semantic: [],
  };

  for (const entry of ctx.memory) {
    layers[assignMemoryLayer(entry)].push(entry);
  }

  const renderLayer = (title: string, items: MemoryEntry[]) => {
    if (!items.length) return '';
    return `${title}:
${items.slice(0, 4).map((entry) => `• [${entry.topic}] ${entry.detail.slice(0, 120)}`).join('\n')}`;
  };

  const relevant = currentMsg
    ? ctx.memory.filter((entry) =>
        currentMsg.toLowerCase().includes(entry.topic.toLowerCase()) ||
        currentMsg.toLowerCase().includes(entry.detail.toLowerCase())
      ).slice(0, 3)
    : [];

  const parts = [
    'MEMÓRIA HIERÁRQUICA MULTINÍVEL — SWARM DE CONTEXTO:'.concat(),
    renderLayer('EPISÓDICA (experiências recentes e decisões já tomadas)', layers.episodic),
    renderLayer('PROCEDURAL (rotinas, processos e heurísticas operacionais)', layers.procedural),
    renderLayer('SEMÂNTICA (regras, preferências e aprendizados duradouros)', layers.semantic),
  ].filter(Boolean);

  if (relevant.length) {
    parts.push(`MEMÓRIA RELEVANTE PARA ESTE PEDIDO:
${relevant.map((entry) => `• [${entry.topic}] ${entry.detail.slice(0, 120)}`).join('\n')}`);
  }

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

// ─── Sliding Window de Contexto ───────────────────────────────────────────────
// Simula atenção seletiva: mantém os N tópicos mais recentes + top K por importância

export function buildSlidingWindowContext(
  history:     { role: string; content: string }[],
  memoryItems: MemoryEntry[],
  windowSize   = 10,
  topK         = 8
): { recentWindow: { role: string; content: string }[]; priorityMemory: MemoryEntry[] } {
  // Últimas N mensagens (short-term focus)
  const recentWindow = history.slice(-windowSize);

  // Tópicos mencionados nas últimas mensagens para boost de relevância
  const recentText = recentWindow.map(m => m.content).join(' ').toLowerCase();
  const boosted    = memoryItems.map(m => ({
    ...m,
    // Boost se o tópico aparece na janela recente
    score: m.importance_score + (recentText.includes(m.topic.toLowerCase()) ? 2 : 0),
  }));

  // Top K por score ajustado
  const priorityMemory = boosted
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score: _s, ...m }) => m); // remove campo temporário

  return { recentWindow, priorityMemory };
}

// ─── Carga completa do contexto do usuário ────────────────────────────────────

export async function loadFullContext(username: string, mode: KronosMode): Promise<FullUserContext> {
  try {
    const sb = createServiceClient();

    const [memRes, projRes, logRes, knowledgeRes] = await Promise.allSettled([
      // Memória com todos os campos
      sb.from('user_memory')
        .select('topic, detail, importance_score, mode, category, access_count, source')
        .eq('username', username)
        .order('importance_score', { ascending: false })
        .limit(40),

      // Projetos ativos
      sb.from('user_projects')
        .select('name, description, stack, status, last_context, updated_at')
        .eq('username', username)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(5),

      // Logs de interação dos últimos 30 dias
      sb.from('interaction_log')
        .select('topics, session_date')
        .eq('username', username)
        .gte('session_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('session_date', { ascending: false })
        .limit(10),

      // Conhecimentos adquiridos pelo agente autônomo (últimos 20)
      sb.from('conhecimentos_kronos')
        .select('topico, conteudo')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const rawMemory = memRes.status   === 'fulfilled' ? (memRes.value.data   ?? []) as MemoryEntry[] : [];
    const memory   = pruneRedundantMemory(rawMemory);
    const projects = projRes.status  === 'fulfilled' ? (projRes.value.data  ?? []) as UserProject[] : [];
    const logs     = logRes.status   === 'fulfilled' ? (logRes.value.data   ?? []) as SessionLog[]  : [];
    const knowledge = knowledgeRes.status === 'fulfilled' ? (knowledgeRes.value.data ?? []) as { topico: string; conteudo: string }[] : [];

    // Extrai tópicos recentes únicos
    const recentTopics = [...new Set(logs.flatMap(l => l.topics ?? []))].slice(0, 15);

    // Monta perfil de estilo a partir da memória
    const style = buildStyleProfile(memory);

    return { memory, projects, recentTopics, style, knowledge };
  } catch {
    return { memory: [], projects: [], recentTopics: [], style: defaultStyle(), knowledge: [] };
  }
}

// ─── Perfil de estilo ─────────────────────────────────────────────────────────

function defaultStyle(): UserStyleProfile {
  return { tone: 'auto', depth: 'auto', language: 'pt', hasEmoji: false, avgMsgLen: 80 };
}

function buildStyleProfile(memory: MemoryEntry[]): UserStyleProfile {
  const style = defaultStyle();
  for (const m of memory) {
    if (m.topic === 'estilo_comunicacao') {
      if (/conciso|direto|breve/i.test(m.detail)) style.depth = 'concise';
      if (/detalhado|aprofundado/i.test(m.detail)) style.depth = 'detailed';
    }
    if (m.topic === 'tom_preferido') {
      if (/formal/i.test(m.detail))      style.tone = 'formal';
      if (/informal|casual/i.test(m.detail)) style.tone = 'casual';
      if (/técnico|tecnico/i.test(m.detail)) style.tone = 'technical';
    }
    if (m.topic === 'idioma_preferido') {
      if (/inglês|english/i.test(m.detail)) style.language = 'en';
      if (/espanhol|spanish/i.test(m.detail)) style.language = 'es';
    }
  }
  return style;
}

// ─── Upsert de memória com categoria ─────────────────────────────────────────

export async function persistMemory(
  username: string,
  mode:     KronosMode,
  entries:  MemoryEntry[]
): Promise<void> {
  if (!entries.length) return;
  try {
    const sb = createServiceClient();
    await sb.from('user_memory').upsert(
      entries.map(e => ({
        username,
        mode,
        topic:            e.topic,
        detail:           e.detail,
        importance_score: e.importance_score,
        category:         e.category ?? 'preference',
        source:           e.source   ?? 'auto',
        updated_at:       new Date().toISOString(),
      })),
      { onConflict: 'username,mode,topic', ignoreDuplicates: false }
    );
  } catch (err) {
    console.error('[MemoryEngine] persist erro:', err instanceof Error ? err.message : err);
  }
}

// ─── Registra sessão de interação ─────────────────────────────────────────────

export async function logInteraction(
  username:     string,
  mode:         KronosMode,
  topics:       string[],
  messageCount: number
): Promise<void> {
  if (!topics.length) return;
  try {
    const sb   = createServiceClient();
    const date = new Date().toISOString().split('T')[0];
    await sb.from('interaction_log').upsert(
      { username, mode, session_date: date, topics: [...new Set(topics)], message_count: messageCount },
      { onConflict: 'username,mode,session_date', ignoreDuplicates: false }
    );
  } catch { /* não bloqueia */ }
}

// ─── Salva feedback do usuário ─────────────────────────────────────────────────

export async function saveFeedback(
  username:    string,
  rating:      number,
  context:     string,
  correction?: string
): Promise<void> {
  try {
    const sb   = createServiceClient();
    const hash = Buffer.from(context.slice(0, 100)).toString('base64').slice(0, 32);
    await sb.from('user_feedback').upsert(
      { username, message_hash: hash, rating, context: context.slice(0, 500), correction },
      { onConflict: 'username,message_hash', ignoreDuplicates: false }
    );
  } catch { /* não bloqueia */ }
}

// ─── Upsert de projeto ────────────────────────────────────────────────────────

export async function upsertProject(
  username:    string,
  name:        string,
  description: string,
  stack?:      string[],
  lastContext?: string
): Promise<void> {
  try {
    const sb = createServiceClient();
    await sb.from('user_projects').upsert(
      { username, name, description, stack: stack ?? [], last_context: lastContext ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'username,name', ignoreDuplicates: false }
    );
  } catch { /* não bloqueia */ }
}

// ─── Formata contexto completo para o LLM ────────────────────────────────────

export function formatFullContext(ctx: FullUserContext, currentMsg?: string): string {
  const parts: string[] = [];

  if (ctx.memory.length) {
    const lines = ctx.memory.slice(0, 18).map(m => `• [${m.topic}] ${m.detail}`).join('\n');
    parts.push(`MEMÓRIA PERSISTENTE:\n${lines}`);
  }

  if (ctx.projects.length) {
    const pLines = ctx.projects.map(p =>
      `• ${p.name}: ${p.description}${p.stack?.length ? ` (${p.stack.join(', ')})` : ''}${p.last_context ? ` — ${p.last_context.slice(0, 80)}` : ''}`
    ).join('\n');
    parts.push(`PROJETOS ATIVOS:\n${pLines}`);
  }

  if (ctx.recentTopics.length) {
    parts.push(`TÓPICOS RECENTES (30 dias): ${ctx.recentTopics.slice(0, 10).join(', ')}`);
  }

  // Injeta conhecimento adquirido pelo agente autônomo quando relevante
  if (ctx.knowledge?.length && currentMsg) {
    const msgLower = currentMsg.toLowerCase();
    const relevant = ctx.knowledge.filter(k =>
      k.topico.toLowerCase().split(' ').some(word =>
        word.length > 4 && msgLower.includes(word)
      )
    ).slice(0, 2);

    if (relevant.length > 0) {
      const kLines = relevant.map(k =>
        `[${k.topico.slice(0, 60)}]\n${k.conteudo.slice(0, 500)}`
      ).join('\n\n');
      parts.push(`CONHECIMENTO ADQUIRIDO (relevante para esta conversa):\n${kLines}`);
    }
  }

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

// ─── Extrai tópicos da mensagem ───────────────────────────────────────────────

export function extractTopics(userMsg: string, assistantReply: string): string[] {
  const text   = userMsg + ' ' + assistantReply;
  const topics: string[] = [];

  // Linguagens / frameworks
  const techs = text.match(/\b(react|next\.js|nextjs|typescript|javascript|python|supabase|vercel|node|docker|postgres|sql|api|rest|graphql|tailwind|android|capacitor)\b/gi);
  if (techs) topics.push(...[...new Set(techs.map(t => t.toLowerCase()))]);

  // Nomes de projetos conhecidos
  if (/neo|kronos/i.test(text))         topics.push('projeto-neo');
  if (/telemedicina|saúde/i.test(text)) topics.push('projeto-telemedicina');
  if (/dossiê|dossie/i.test(text))      topics.push('dossie');

  // Verbos de ação principais
  if (/\b(código|programar|implementar|desenvolver|criar)\b/i.test(text)) topics.push('desenvolvimento');
  if (/\b(estudar|aprender|explicar|entender)\b/i.test(text))             topics.push('aprendizado');
  if (/\b(e-mail|email|whatsapp|enviar)\b/i.test(text))                   topics.push('comunicação');

  return [...new Set(topics)].slice(0, 8);
}
