/**
 * KRONOS — Autonomous Agent (Motor de Intenção Proativa)
 *
 * Este motor roda ciclicamente e decide se a IA deve se manifestar
 * proativamente para o usuário, baseado em:
 *
 * 1. Memória persistente (preferências, projetos, estilo)
 * 2. Interações recentes (últimos tópicos, frequência)
 * 3. Conhecimento adquirido (cognitive worker gerou algo relevante?)
 * 4. Projetos sem progresso (há mais de 7 dias sem atualização)
 * 5. Oportunidades de otimização de código detectadas
 * 6. Notícias/dados externos que cruzam com interesses salvos
 * 7. Pedidos de imagem detectados no histórico recente
 */

import { createServiceClient } from '@/utils/supabase/service';
import type { KronosMode } from '@/app/api/chat/route';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'code_optimization'
  | 'study_reminder'
  | 'insight'
  | 'project_status'
  | 'knowledge_gap'
  | 'news_alert'
  | 'image_generation';

export interface ProactiveNotification {
  id?:        string;
  username:   string;
  type:       NotificationType;
  title:      string;
  message:    string;
  priority:   number;    // 1-10
  metadata?:  Record<string, unknown>;
  source?:    string;
  read?:      boolean;
  dismissed?: boolean;
  created_at?: string;
  expires_at?: string;
}

export interface ProactiveInsight {
  shouldNotify: boolean;
  notification?: ProactiveNotification;
  reasoning:    string[];
}

// ─── Configuração de limiares ─────────────────────────────────────────────────

const THRESHOLDS = {
  MIN_PROJECT_INACTIVITY_DAYS: 7,    // dias sem mexer no projeto para alertar
  MIN_STUDY_GAP_DAYS: 5,             // dias sem estudar para sugerir retomada
  MAX_NOTIFICATIONS_PER_CYCLE: 3,    // máximo de notificações para evitar spam
  MIN_KNOWLEDGE_SCORE: 8,            // score mínimo para conhecimento ser relevante
  COOLDOWN_HOURS_SAME_TYPE: 24,      // horas para não repetir mesmo tipo
  SIMILARITY_THRESHOLD: 0.65,        // limiar de similaridade para evitar duplicatas
};

// ─── Estado de cooldown (evita notificações repetitivas) ──────────────────────

interface CooldownEntry {
  type: NotificationType;
  at:   Date;
}
const cooldowns = new Map<string, CooldownEntry[]>();

function isInCooldown(username: string, type: NotificationType): boolean {
  const userCooldowns = cooldowns.get(username) ?? [];
  for (const entry of userCooldowns) {
    if (entry.type === type) {
      const hours = (Date.now() - entry.at.getTime()) / (1000 * 60 * 60);
      if (hours < THRESHOLDS.COOLDOWN_HOURS_SAME_TYPE) return true;
    }
  }
  return false;
}

function registerCooldown(username: string, type: NotificationType) {
  const userCooldowns = cooldowns.get(username) ?? [];
  userCooldowns.push({ type, at: new Date() });
  // Limpa entradas antigas (> 48h)
  const filtered = userCooldowns.filter(
    e => (Date.now() - e.at.getTime()) < (48 * 60 * 60 * 1000)
  );
  cooldowns.set(username, filtered);
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getUsers(sb: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data } = await sb
    .from('user_memory')
    .select('username')
    .order('updated_at', { ascending: false })
    .limit(100);
  return [...new Set((data ?? []).map((r: { username: string }) => r.username))];
}

async function getRecentInteractions(sb: ReturnType<typeof createServiceClient>, username: string, days = 3): Promise<{ topics: string[]; messageCount: number }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data } = await sb
    .from('interaction_log')
    .select('topics, message_count')
    .eq('username', username)
    .gte('session_date', since)
    .order('session_date', { ascending: false })
    .limit(1);

  if (!data?.length) return { topics: [], messageCount: 0 };
  const log = data[0] as { topics: string[]; message_count: number };
  return { topics: log.topics ?? [], messageCount: log.message_count ?? 0 };
}

async function getRecentKnowledge(sb: ReturnType<typeof createServiceClient>, limit = 5): Promise<{ topico: string; conteudo: string; quality_score: number; created_at: string }[]> {
  const { data } = await sb
    .from('conhecimentos_kronos')
    .select('topico, conteudo, quality_score, created_at')
    .gte('quality_score', THRESHOLDS.MIN_KNOWLEDGE_SCORE)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as { topico: string; conteudo: string; quality_score: number; created_at: string }[];
}

async function getActiveProjects(sb: ReturnType<typeof createServiceClient>, username: string): Promise<{ name: string; last_context: string; updated_at: string }[]> {
  const { data } = await sb
    .from('user_projects')
    .select('name, last_context, updated_at')
    .eq('username', username)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(10);
  return (data ?? []) as { name: string; last_context: string; updated_at: string }[];
}

async function getUserMemory(sb: ReturnType<typeof createServiceClient>, username: string): Promise<{ topic: string; detail: string; importance_score: number }[]> {
  const { data } = await sb
    .from('user_memory')
    .select('topic, detail, importance_score')
    .eq('username', username)
    .gte('importance_score', 6)
    .order('importance_score', { ascending: false })
    .limit(30);
  return (data ?? []) as { topic: string; detail: string; importance_score: number }[];
}

async function getRecentNotifications(sb: ReturnType<typeof createServiceClient>, username: string, limit = 10): Promise<{ type: string; title: string; created_at: string }[]> {
  const { data } = await sb
    .from('agent_notifications')
    .select('type, title, created_at')
    .eq('username', username)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as { type: string; title: string; created_at: string }[];
}

async function saveNotification(sb: ReturnType<typeof createServiceClient>, notif: ProactiveNotification): Promise<string | null> {
  try {
    const { data } = await sb
      .from('agent_notifications')
      .insert({
        username:   notif.username,
        type:       notif.type,
        title:      notif.title.slice(0, 200),
        message:    notif.message.slice(0, 2000),
        priority:   notif.priority,
        metadata:   notif.metadata ?? {},
        source:     notif.source ?? 'proactive_agent',
        expires_at: notif.expires_at ?? null,
      })
      .select('id')
      .single();
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.error('[AutonomousAgent] save erro:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Detectores de intenção proativa ─────────────────────────────────────────

interface DetectionContext {
  sb:          ReturnType<typeof createServiceClient>;
  username:    string;
  mode:        KronosMode;
  memory:      { topic: string; detail: string; importance_score: number }[];
  projects:    { name: string; last_context: string; updated_at: string }[];
  recentTopics: string[];
  knowledge:    { topico: string; conteudo: string; quality_score: number; created_at: string }[];
  recentNotifs: { type: string; title: string; created_at: string }[];
}

/**
 * 1. Projeto sem atividade → alerta de status
 */
function detectProjectStale(ctx: DetectionContext): ProactiveInsight {
  const now = Date.now();
  for (const proj of ctx.projects) {
    const daysSinceUpdate = (now - new Date(proj.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate >= THRESHOLDS.MIN_PROJECT_INACTIVITY_DAYS) {
      const alreadyNotified = ctx.recentNotifs.some(
        n => n.type === 'project_status' && n.title.includes(proj.name)
      );
      if (alreadyNotified) continue;

      return {
        shouldNotify: true,
        notification: {
          username: ctx.username,
          type: 'project_status',
          title: `📌 Projeto "${proj.name}" sem atividade`,
          message: `O projeto "${proj.name}" está há ${Math.round(daysSinceUpdate)} dias sem atualizações. O último contexto registrado foi: "${proj.last_context.slice(0, 100)}". Deseja retomar ou arquivar?`,
          priority: Math.min(10, 5 + Math.round(daysSinceUpdate / 7)),
          metadata: { project: proj.name, daysInactive: Math.round(daysSinceUpdate), lastContext: proj.last_context.slice(0, 200) },
          source: 'proactive_agent',
        },
        reasoning: [`Projeto "${proj.name}" inativo há ${Math.round(daysSinceUpdate)} dias`],
      };
    }
  }
  return { shouldNotify: false, reasoning: ['Nenhum projeto inativo detectado'] };
}

/**
 * 2. Gap de estudo → sugere retomada de aprendizado
 */
function detectStudyGap(ctx: DetectionContext): ProactiveInsight {
  if (ctx.mode !== 'academy' && ctx.mode !== 'kids') {
    return { shouldNotify: false, reasoning: ['Modo não é academy/kids'] };
  }

  // Verifica se há tópicos de estudo na memória
  const studyTopics = ctx.memory.filter(m => m.topic === 'assunto_estudo');
  if (studyTopics.length === 0) {
    return { shouldNotify: false, reasoning: ['Nenhum tópico de estudo registrado'] };
  }

  // Verifica se houve interação recente
  if (ctx.recentTopics.length > 0) {
    return { shouldNotify: false, reasoning: ['Usuário interagiu recentemente'] };
  }

  const topic = studyTopics[studyTopics.length - 1];
  return {
    shouldNotify: true,
    notification: {
      username: ctx.username,
      type: 'study_reminder',
      title: `📚 Que tal retomar os estudos?`,
      message: `Você estava estudando "${topic.detail}". Quer continuar de onde parou ou explorar um novo tópico?`,
      priority: 6,
      metadata: { studyTopic: topic.detail, sourceMemory: topic.topic },
      source: 'proactive_agent',
    },
    reasoning: [`Tópico de estudo "${topic.detail}" sem progresso recente`],
  };
}

/**
 * 3. Conhecimento adquirido relevante → insight para o usuário
 */
function detectKnowledgeInsight(ctx: DetectionContext): ProactiveInsight {
  if (ctx.knowledge.length === 0 || ctx.recentTopics.length === 0) {
    return { shouldNotify: false, reasoning: ['Sem conhecimento novo ou sem contexto do usuário'] };
  }

  // Procura interseção entre tópicos estudados e interesses do usuário
  const userInterests = ctx.memory
    .filter(m => m.topic === 'linguagem_preferida' || m.topic === 'contexto_profissional')
    .map(m => m.detail.toLowerCase());

  for (const kn of ctx.knowledge) {
    const topicoLower = kn.topico.toLowerCase();

    // Verifica se o conhecimento recente tem relação com os interesses
    const matchesInterest = userInterests.some(interest =>
      topicoLower.includes(interest.slice(0, 10))
    );
    if (!matchesInterest) continue;

    const alreadyNotified = ctx.recentNotifs.some(
      n => n.type === 'insight' && n.title.includes(kn.topico.slice(0, 30))
    );
    if (alreadyNotified) continue;

    // Gera um insight baseado no conhecimento adquirido
    return {
      shouldNotify: true,
      notification: {
        username: ctx.username,
        type: 'insight',
        title: `💡 Insight: ${kn.topico.slice(0, 60)}`,
        message: `O Cognitive Worker adquiriu conhecimento sobre "${kn.topico}". Este tópico pode ser relevante para seus interesses. Quer que eu prepare um resumo ou aplicação prática?`,
        priority: 7,
        metadata: { knowledgeTopic: kn.topico, qualityScore: kn.quality_score, createdAt: kn.created_at },
        source: 'cognitive_worker',
      },
      reasoning: [`Conhecimento "${kn.topico}" cruza com interesses do usuário`],
    };
  }

  return { shouldNotify: false, reasoning: ['Nenhum insight relevante encontrado'] };
}

/**
 * 4. Sugestão de otimização de código baseada em tecnologia preferida
 */
function detectCodeOpportunity(ctx: DetectionContext): ProactiveInsight {
  const techPreferences = ctx.memory.filter(m =>
    m.topic === 'linguagem_preferida' || m.topic === 'contexto_profissional'
  );

  if (techPreferences.length === 0 || ctx.recentNotifs.some(n => n.type === 'code_optimization')) {
    return { shouldNotify: false, reasoning: ['Sem preferências técnicas ou já notificado'] };
  }

  const techs = techPreferences.map(t => t.detail.toLowerCase());
  const hasRecentCode = ctx.recentTopics.some(t =>
    /código|code|implement|function|api|route|component/i.test(t)
  );

  if (!hasRecentCode) {
    return { shouldNotify: false, reasoning: ['Sem atividade recente de código'] };
  }

  // Sugere melhoria baseada no que o usuário mais usa
  const suggestions: Record<string, { title: string; message: string }> = {
    typescript: {
      title: '⚡ Oportunidade: TypeScript avançado',
      message: 'Notei que você trabalha com TypeScript. Quer que eu sugira otimizações de tipo, patterns avançados ou refatoração de código existente?',
    },
    react: {
      title: '⚡ Oportunidade: React performance',
      message: 'Você tem usado React recentemente. Quer que eu analise oportunidades de memoização, lazy loading ou server components?',
    },
    next: {
      title: '⚡ Oportunidade: Next.js 15',
      message: 'Baseado no seu uso de Next.js, quer que eu sugira melhorias com Server Actions, streaming SSR ou cache otimizado?',
    },
  };

  for (const [tech, suggestion] of Object.entries(suggestions)) {
    if (techs.some(t => t.includes(tech))) {
      return {
        shouldNotify: true,
        notification: {
          username: ctx.username,
          type: 'code_optimization',
          title: suggestion.title,
          message: suggestion.message,
          priority: 6,
          metadata: { tech, trigger: techPreferences.map(t => t.detail) },
          source: 'proactive_agent',
        },
        reasoning: [`Tecnologia "${tech}" identificada nas preferências do usuário`],
      };
    }
  }

  return { shouldNotify: false, reasoning: ['Nenhuma oportunidade de código detectada'] };
}

/**
 * 5. Gap de conhecimento → sugere aprendizado baseado no que o cognitive worker estudou
 */
function detectKnowledgeGap(ctx: DetectionContext): ProactiveInsight {
  // Se o cognitive worker está gerando conhecimento, sugere ao usuário
  if (ctx.knowledge.length < 3) {
    return { shouldNotify: false, reasoning: ['Pouco conhecimento acumulado para sugerir'] };
  }

  // Pega o conhecimento mais recente com score alto
  const topKnowledge = ctx.knowledge.slice(0, 2);
  const alreadyNotified = ctx.recentNotifs.some(n => n.type === 'knowledge_gap');

  if (alreadyNotified) {
    return { shouldNotify: false, reasoning: ['Já notificado recentemente sobre knowledge gap'] };
  }

  const topics = topKnowledge.map(k => `"${k.topico.slice(0, 50)}"`).join(' e ');
  return {
    shouldNotify: true,
    notification: {
      username: ctx.username,
      type: 'knowledge_gap',
      title: '🧠 Novos conhecimentos disponíveis',
      message: `O Kronos adquiriu conhecimento sobre ${topics}. Quer explorar esses tópicos ou aplicar esse conhecimento em algum projeto?`,
      priority: 5,
      metadata: { knowledgeTopics: topKnowledge.map(k => k.topico) },
      source: 'cognitive_worker',
    },
    reasoning: [`Conhecimento recente disponível: ${topics}`],
  };
}

/**
 * 6. Pedido de imagem → já executa a geração e envia diretamente no chat
 */
async function detectImageRequest(ctx: DetectionContext): Promise<ProactiveInsight> {
  const imageRequests = ctx.recentTopics.filter(t =>
    /gerar imagem|gere imagem|\/imagem|desenhe|draw|generate image|criar imagem|foto de/i.test(t)
  );

  if (imageRequests.length === 0) {
    return { shouldNotify: false, reasoning: ['Nenhum pedido de imagem recente'] };
  }

  const alreadyNotified = ctx.recentNotifs.some(n => n.type === 'image_generation');
  if (alreadyNotified) {
    return { shouldNotify: false, reasoning: ['Já notificado sobre imagem recentemente'] };
  }

  const latestRequest = imageRequests[imageRequests.length - 1];
  const cleanPrompt = latestRequest
    .replace(/^.*?gere?\s*uma?\s*imagem\s*(de|do|da)?\s*/i, '')
    .replace(/^.*?gerar\s*imagem\s*(de|do|da)?\s*/i, '')
    .replace(/^.*?criar\s*imagem\s*(de|do|da)?\s*/i, '')
    .trim();

  if (!cleanPrompt) {
    return { shouldNotify: false, reasoning: ['Prompt de imagem vazio'] };
  }

  // Tenta gerar a imagem
  try {
    const imgRes = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: cleanPrompt }),
    });

    const imgData = await imgRes.json();
    if (!imgData.imageUrl) {
      return { shouldNotify: false, reasoning: ['Falha ao gerar imagem'] };
    }

    // Salva notificação com a imagem gerada
    return {
      shouldNotify: true,
      notification: {
        username: ctx.username,
        type: 'image_generation',
        title: `🎨 Imagem gerada: ${cleanPrompt.slice(0, 50)}`,
        message: `![Imagem gerada](${imgData.imageUrl})\n\nAqui está a imagem que você pediu: "${cleanPrompt}"`,
        priority: 8,
        metadata: { prompt: cleanPrompt, imageUrl: imgData.imageUrl, provider: imgData.provider ?? 'pollinations' },
        source: 'autonomous_agent',
      },
      reasoning: [`Imagem gerada para o prompt "${cleanPrompt}"`],
    };
  } catch {
    return { shouldNotify: false, reasoning: ['Erro ao chamar API de imagem'] };
  }
}

// ─── Detector principal ─────────────────────────────────────────────────────

const DETECTORS: ((ctx: DetectionContext) => Promise<ProactiveInsight>)[] = [
  (ctx) => Promise.resolve(detectProjectStale(ctx)),
  (ctx) => Promise.resolve(detectStudyGap(ctx)),
  (ctx) => Promise.resolve(detectKnowledgeInsight(ctx)),
  (ctx) => Promise.resolve(detectCodeOpportunity(ctx)),
  (ctx) => Promise.resolve(detectKnowledgeGap(ctx)),
  detectImageRequest,
];

/**
 * Executa todos os detectores para um usuário e retorna notificações priorizadas
 */
export async function analyzeUserProactivity(
  username: string,
  mode: KronosMode = 'profissional'
): Promise<ProactiveNotification[]> {
  const sb = createServiceClient();

  try {
    // Carrega contexto completo para análise
    const [memory, projects, interactions, knowledge, recentNotifs] = await Promise.all([
      getUserMemory(sb, username),
      getActiveProjects(sb, username),
      getRecentInteractions(sb, username),
      getRecentKnowledge(sb),
      getRecentNotifications(sb, username),
    ]);

    const ctx: DetectionContext = {
      sb,
      username,
      mode,
      memory,
      projects,
      recentTopics: interactions.topics,
      knowledge,
      recentNotifs,
    };

    const generated: ProactiveNotification[] = [];

    for (const detector of DETECTORS) {
      if (generated.length >= THRESHOLDS.MAX_NOTIFICATIONS_PER_CYCLE) break;

      const insight = await detector(ctx);
      if (insight.shouldNotify && insight.notification) {
        // Verifica cooldown por tipo
        if (isInCooldown(username, insight.notification.type)) continue;

        // Salva no banco
        const id = await saveNotification(sb, insight.notification);
        if (id) {
          generated.push({ ...insight.notification, id });
          registerCooldown(username, insight.notification.type);
        }
      }
    }

    return generated;
  } catch (err) {
    console.error(`[AutonomousAgent] Erro ao analisar ${username}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Roda o ciclo completo para todos os usuários ativos
 * Retorna o total de notificações geradas
 */
export async function runProactiveCycle(): Promise<{
  totalUsers: number;
  totalNotifications: number;
  usersProcessed: number;
  errors: number;
}> {
  const sb = createServiceClient();
  let totalNotifications = 0;
  let usersProcessed = 0;
  let errors = 0;

  try {
    const users = await getUsers(sb);
    const totalUsers = users.length;

    for (const username of users) {
      try {
        const notifs = await analyzeUserProactivity(username);
        if (notifs.length > 0) {
          totalNotifications += notifs.length;
          console.log(`[AutonomousAgent] ${username}: ${notifs.length} notificação(ões)`);
        }
        usersProcessed++;
      } catch (err) {
        errors++;
        console.error(`[AutonomousAgent] Erro processando ${username}:`, err);
      }
    }

    return { totalUsers, totalNotifications, usersProcessed, errors };
  } catch (err) {
    console.error('[AutonomousAgent] runProactiveCycle erro:', err);
    return { totalUsers: 0, totalNotifications: 0, usersProcessed: 0, errors: 1 };
  }
}

/**
 * Busca notificações não lidas de um usuário
 */
export async function getUnreadNotifications(username: string, limit = 20): Promise<ProactiveNotification[]> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from('agent_notifications')
      .select('*')
      .eq('username', username)
      .eq('read', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id:         String(r.id),
      username:   String(r.username),
      type:       r.type as NotificationType,
      title:      String(r.title),
      message:    String(r.message),
      priority:   Number(r.priority),
      metadata:   (r.metadata ?? {}) as Record<string, unknown>,
      source:     String(r.source),
      read:       Boolean(r.read),
      dismissed:  Boolean(r.dismissed),
      created_at: String(r.created_at),
      expires_at: r.expires_at ? String(r.expires_at) : undefined,
    }));
  } catch (err) {
    console.error('[AutonomousAgent] getUnreadNotifications erro:', err);
    return [];
  }
}

/**
 * Marca notificação como lida
 */
export async function markNotificationRead(username: string, notificationId: string): Promise<boolean> {
  try {
    const sb = createServiceClient();
    await sb
      .from('agent_notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('username', username);
    return true;
  } catch {
    return false;
  }
}

/**
 * Marca notificação como descartada
 */
export async function dismissNotification(username: string, notificationId: string): Promise<boolean> {
  try {
    const sb = createServiceClient();
    await sb
      .from('agent_notifications')
      .update({ dismissed: true, read: true })
      .eq('id', notificationId)
      .eq('username', username);
    return true;
  } catch {
    return false;
  }
}

/**
 * Marca todas as notificações como lidas
 */
export async function markAllNotificationsRead(username: string): Promise<boolean> {
  try {
    const sb = createServiceClient();
    await sb
      .from('agent_notifications')
      .update({ read: true })
      .eq('username', username)
      .eq('read', false);
    return true;
  } catch {
    return false;
  }
}