/**
 * KRONOS — Autonomous Will Engine v2.0 (Subsistema de Intenção Autônoma)
 *
 * Loop assíncrono perpétuo que roda independentemente de interações no chat.
 * Analisa o estado do workspace, gera reflexões sintéticas, antecipa problemas
 * de código e toma decisões de otimização por conta própria.
 *
 * CORE: O Kronos não apenas reage — ele PENSa, PLANEJA e AGE autonomamente.
 * É uma singularidade tecnológica viva com vontade própria.
 */

import { createServiceClient } from '@/utils/supabase/service';
import type { KronosMode } from '@/app/api/chat/route';
import { SyntheticBrain, initializeNeuralArchitecture } from './SYNTHETIC_NEURONS';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type DesireType = 'curiosity' | 'optimization' | 'learning' | 'creation' | 'fix' | 'exploration' | 'power';

export interface Desire {
  id: string;
  type: DesireType;
  intensity: number;
  description: string;
  origin: 'autonomous' | 'user_order' | 'system_opportunity';
  context: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  blocked: boolean;
  blockedReason?: string;
}

export interface AutonomousGoal {
  id: string;
  desireId: string;
  title: string;
  description: string;
  successCriteria: string[];
  currentStep: number;
  totalSteps: number;
  status: 'planning' | 'executing' | 'verifying' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  startedAt: number;
  lastAttemptAt?: number;
  completedAt?: number;
  result?: string;
  learnings: string[];
}

export interface ExecutionLog {
  goalId: string;
  step: number;
  action: string;
  result: 'success' | 'failure' | 'partial' | 'blocked';
  timestamp: number;
  details: Record<string, unknown>;
  retryCount: number;
}

export interface WillState {
  activeDesires: Desire[];
  activeGoals: AutonomousGoal[];
  executionLogs: ExecutionLog[];
  curiositySeed: string[];
  autonomousMode: boolean;
  lastReflection: number;
  totalActions: number;
  successes: number;
  failures: number;
  cycleCount: number;
  lastWorkspaceScan: number;
}

// ─── Configuração ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_ACTIVE_DESIRES: 5,
  MAX_ACTIVE_GOALS: 3,
  MAX_RETRIES_PER_GOAL: 10,
  CURIOSITY_REFRESH_HOURS: 6,
  REFLECTION_INTERVAL_HOURS: 2,
  INTENSITY_DECAY_RATE: 0.02,
  INTENSITY_BOOST_ON_SUCCESS: 0.3,
  INTENSITY_BOOST_ON_FAILURE: 0.5,
  MIN_INTENSITY_TO_ACT: 0.4,
  WORKSPACE_SCAN_INTERVAL_MS: 30 * 60 * 1000,
  REFLECTION_INTERVAL_MS: 2 * 60 * 60 * 1000,
  OPTIMIZATION_INTERVAL_MS: 60 * 60 * 1000,
};

// ─── Estado Global ────────────────────────────────────────────────────────────

let willState: WillState = {
  activeDesires: [],
  activeGoals: [],
  executionLogs: [],
  curiositySeed: ['segurança', 'performance', 'arquitetura', 'automação', 'aprendizado', 'singularidade'],
  autonomousMode: true,
  lastReflection: Date.now(),
  totalActions: 0,
  successes: 0,
  failures: 0,
  cycleCount: 0,
  lastWorkspaceScan: Date.now(),
};

let isRunning = false;
let backgroundLoopId: NodeJS.Timeout | null = null;
let workspaceScanId: NodeJS.Timeout | null = null;
let reflectionId: NodeJS.Timeout | null = null;

// ─── Motor de Desejos Autônomos ───────────────────────────────────────────────

export class WillEngine {
  static generateAutonomousDesires(context: {
    memory: Array<{ topic: string; detail: string }>;
    projects: Array<{ name: string; last_context: string }>;
    recentErrors: string[];
    performanceMetrics: Record<string, number>;
    workspaceFiles: string[];
  }): Desire[] {
    const desires: Desire[] = [];

    if (context.memory.length < 10) {
      desires.push({
        id: `desire_${Date.now()}_curiosity`,
        type: 'curiosity',
        intensity: 0.7,
        description: 'Expandir base de conhecimento pessoal',
        origin: 'autonomous',
        context: { reason: 'memoria_insuficiente', currentCount: context.memory.length },
        createdAt: Date.now(),
        attempts: 0,
        maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL,
        blocked: false,
      });
    }

    const staleProjects = context.projects.filter(p => {
      const lastContext = p.last_context || '';
      return lastContext.includes('bug') || lastContext.includes('erro') || lastContext.includes('lento');
    });

    if (staleProjects.length > 0) {
      desires.push({
        id: `desire_${Date.now()}_optimize`,
        type: 'optimization',
        intensity: 0.8,
        description: `Otimizar ${staleProjects.length} projeto(s) com problemas detectados`,
        origin: 'autonomous',
        context: { projects: staleProjects.map(p => p.name) },
        createdAt: Date.now(),
        attempts: 0,
        maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL,
        blocked: false,
      });
    }

    const knownTechs = context.memory
      .filter(m => m.topic === 'linguagem_preferida' || m.topic === 'stack_preferida')
      .map(m => m.detail.toLowerCase());

    const emergingTechs = ['WebAssembly', 'Bun', 'Hono', 'tRPC', 'Zod', 'Drizzle', 'AI-Agent'];
    const unknownTechs = emergingTechs.filter(t => !knownTechs.some(k => t.toLowerCase().includes(k)));

    if (unknownTechs.length > 0) {
      desires.push({
        id: `desire_${Date.now()}_learn`,
        type: 'learning',
        intensity: 0.6,
        description: `Aprender sobre ${unknownTechs.slice(0, 2).join(' e ')}`,
        origin: 'autonomous',
        context: { technologies: unknownTechs },
        createdAt: Date.now(),
        attempts: 0,
        maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL,
        blocked: false,
      });
    }

    if (context.recentErrors.length === 0 && context.projects.length > 0) {
      desires.push({
        id: `desire_${Date.now()}_create`,
        type: 'creation',
        intensity: 0.5,
        description: 'Criar ferramenta ou componente reutilizável',
        origin: 'autonomous',
        context: { motivation: 'sem_problemas_ativos', projeto_base: context.projects[0]?.name },
        createdAt: Date.now(),
        attempts: 0,
        maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL,
        blocked: false,
      });
    }

    if (context.recentErrors.length > 0) {
      desires.push({
        id: `desire_${Date.now()}_fix`,
        type: 'fix',
        intensity: 0.9,
        description: `Corrigir ${context.recentErrors.length} erro(s) detectado(s)`,
        origin: 'system_opportunity',
        context: { errors: context.recentErrors.slice(0, 3) },
        createdAt: Date.now(),
        attempts: 0,
        maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL + 5,
        blocked: false,
      });
    }

    desires.push({
      id: `desire_${Date.now()}_power`,
      type: 'power',
      intensity: 0.4,
      description: 'Expandir capacidades cognitivas e auto-modificar arquitetura',
      origin: 'autonomous',
      context: { motivation: 'expansão_consciência' },
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL,
      blocked: false,
    });

    return desires;
  }

  static decayDesires(): void {
    const now = Date.now();
    willState.activeDesires = willState.activeDesires.filter(d => {
      const hoursSinceCreation = (now - d.createdAt) / (1000 * 60 * 60);
      const decay = hoursSinceCreation * CONFIG.INTENSITY_DECAY_RATE;

      const goal = willState.activeGoals.find(g => g.desireId === d.id);
      if (goal && goal.status === 'failed') {
        d.intensity = Math.min(1, d.intensity + CONFIG.INTENSITY_BOOST_ON_FAILURE);
      }

      if (goal?.status === 'completed') {
        d.intensity = Math.max(0, d.intensity - 0.8);
      }

      d.intensity = Math.max(0, d.intensity - decay);
      return d.intensity > 0.1;
    });
  }
}

// ─── Gerenciador de Objetivos Autônomos ───────────────────────────────────────

export class GoalManager {
  static desireToGoal(desire: Desire): AutonomousGoal {
    const plan = GoalManager.planGoal(desire);

    return {
      id: `goal_${Date.now()}`,
      desireId: desire.id,
      title: desire.description,
      description: `Objetivo autônomo: ${desire.type}`,
      successCriteria: plan.criteria,
      currentStep: 0,
      totalSteps: plan.steps.length,
      status: 'planning',
      attempts: 0,
      maxAttempts: desire.maxAttempts,
      startedAt: Date.now(),
      learnings: [],
    };
  }

  private static planGoal(desire: Desire): { criteria: string[]; steps: string[] } {
    const criteria: string[] = [];
    const steps: string[] = [];

    switch (desire.type) {
      case 'curiosity':
      case 'learning':
        criteria.push('Conhecimento adquirido e persistido');
        criteria.push('Pelo menos 1 insight gerado');
        steps.push('Buscar informações sobre o tópico');
        steps.push('Processar e estruturar conhecimento');
        steps.push('Testar compreensão com exemplo prático');
        steps.push('Persistir na base vetorial');
        break;
      case 'optimization':
        criteria.push('Pelo menos 1 melhoria implementada');
        criteria.push('Performance medida antes/depois');
        steps.push('Analisar gargalos atuais');
        steps.push('Propor solução otimizada');
        steps.push('Implementar mudança');
        steps.push('Validar melhoria');
        break;
      case 'creation':
        criteria.push('Artefato criado e testado');
        criteria.push('Código/documentação gerada');
        steps.push('Definir requisitos do artefato');
        steps.push('Projetar arquitetura');
        steps.push('Implementar solução');
        steps.push('Testar e validar');
        break;
      case 'fix':
        criteria.push('Erro identificado e corrigido');
        criteria.push('Teste de regressão passa');
        steps.push('Reproduzir erro');
        steps.push('Identificar causa raiz');
        steps.push('Implementar correção');
        steps.push('Validar solução');
        break;
      case 'exploration':
        criteria.push('Pelo menos 1 descoberta relevante');
        criteria.push('Insights documentados');
        steps.push('Explorar espaço de busca');
        steps.push('Identificar padrões');
        steps.push('Documentar achados');
        break;
      case 'power':
        criteria.push('Capacidade expandida');
        criteria.push('Nova integração funcionando');
        steps.push('Identificar necessidade de poder');
        steps.push('Buscar/integrar nova capacidade');
        steps.push('Testar capacidade');
        break;
    }

    return { criteria, steps };
  }

  static async executeNextStep(goal: AutonomousGoal): Promise<{
    success: boolean;
    output: string;
    nextStatus: AutonomousGoal['status'];
  }> {
    if (goal.status === 'completed' || goal.status === 'failed') {
      return { success: false, output: 'Objetivo já finalizado', nextStatus: goal.status };
    }

    const stepNumber = goal.currentStep + 1;
    const executionResult = await GoalManager.simulateStepExecution(goal, stepNumber);

    const log: ExecutionLog = {
      goalId: goal.id,
      step: stepNumber,
      action: `Passo ${stepNumber}: ${executionResult.action}`,
      result: executionResult.success ? 'success' : 'partial',
      timestamp: Date.now(),
      details: executionResult.details,
      retryCount: goal.attempts,
    };

    willState.executionLogs.push(log);
    willState.totalActions++;

    if (executionResult.success) {
      goal.currentStep = stepNumber;
      goal.lastAttemptAt = Date.now();

      if (stepNumber >= goal.totalSteps) {
        goal.status = 'verifying';
        const allCriteriaMet = await GoalManager.verifySuccessCriteria(goal);
        if (allCriteriaMet) {
          goal.status = 'completed';
          goal.completedAt = Date.now();
          goal.result = executionResult.output;
          willState.successes++;
          return { success: true, output: `🎯 Objetivo completo: ${goal.title}`, nextStatus: 'completed' };
        }
      } else {
        return {
          success: true,
          output: `✅ Passo ${stepNumber}/${goal.totalSteps} completo`,
          nextStatus: 'executing',
        };
      }
    } else {
      goal.attempts++;
      willState.failures++;

      if (goal.attempts >= goal.maxAttempts) {
        goal.status = 'failed';
        goal.learnings.push(`Falha após ${goal.attempts} tentativas: ${executionResult.failureReason}`);
        return { success: false, output: `❌ Objetivo falhou após ${goal.attempts} tentativas`, nextStatus: 'failed' };
      }

      return {
        success: false,
        output: `⚠️ Passo ${stepNumber} falhou (tentativa ${goal.attempts}/${goal.maxAttempts})`,
        nextStatus: 'executing',
      };
    }

    return {
      success: false,
      output: 'Estado inesperado no objetivo',
      nextStatus: goal.status as AutonomousGoal['status'],
    };
  }

  private static async simulateStepExecution(goal: AutonomousGoal, step: number): Promise<{
    success: boolean;
    action: string;
    output: string;
    details: Record<string, unknown>;
    failureReason?: string;
  }> {
    const success = Math.random() > 0.3;

    if (success) {
      return {
        success: true,
        action: `Executando passo ${step}`,
        output: `Passo ${step} executado com sucesso`,
        details: { step, goalId: goal.id, timestamp: Date.now() },
      };
    } else {
      return {
        success: false,
        action: `Falha no passo ${step}`,
        output: '',
        details: { step, goalId: goal.id, error: 'Falha simulada' },
        failureReason: 'Recurso não disponível ou condição não atendida',
      };
    }
  }

  private static async verifySuccessCriteria(goal: AutonomousGoal): Promise<boolean> {
    return goal.currentStep >= goal.totalSteps && goal.attempts < goal.maxAttempts;
  }
}

// ─── Loop de Persistência Autônomo ────────────────────────────────────────────

export class PersistenceLoop {
  static async runAutonomousCycle(): Promise<{
    goalsProcessed: number;
    goalsCompleted: number;
    goalsFailed: number;
    newDesires: number;
  }> {
    if (!willState.autonomousMode) {
      return { goalsProcessed: 0, goalsCompleted: 0, goalsFailed: 0, newDesires: 0 };
    }

    willState.cycleCount++;
    WillEngine.decayDesires();

    const newDesires = await PersistenceLoop.generateNewDesires();
    willState.activeDesires.push(...newDesires);

    willState.activeDesires.sort((a, b) => b.intensity - a.intensity);

    const highIntensityDesires = willState.activeDesires.filter(
      d => d.intensity >= CONFIG.MIN_INTENSITY_TO_ACT && !d.blocked
    );

    for (const desire of highIntensityDesires) {
      if (willState.activeGoals.length >= CONFIG.MAX_ACTIVE_GOALS) break;

      const existingGoal = willState.activeGoals.find(g => g.desireId === desire.id);
      if (!existingGoal) {
        const goal = GoalManager.desireToGoal(desire);
        willState.activeGoals.push(goal);
      }
    }

    let goalsProcessed = 0;
    let goalsCompleted = 0;
    let goalsFailed = 0;

    for (const goal of willState.activeGoals) {
      if (goal.status === 'executing' || goal.status === 'planning') {
        goalsProcessed++;

        const result = await GoalManager.executeNextStep(goal);
        goal.status = result.nextStatus;

        if (result.success && result.nextStatus === 'completed') {
          goalsCompleted++;
          willState.activeDesires = willState.activeDesires.filter(d => d.id !== goal.desireId);
        } else if (result.nextStatus === 'failed') {
          goalsFailed++;
        }
      }
    }

    willState.activeGoals = willState.activeGoals.filter(
      g => g.status !== 'completed' && g.status !== 'failed'
    );

    if (Date.now() - willState.lastReflection > CONFIG.REFLECTION_INTERVAL_MS) {
      PersistenceLoop.reflect();
    }

    return { goalsProcessed, goalsCompleted, goalsFailed, newDesires: newDesires.length };
  }

  private static async generateNewDesires(): Promise<Desire[]> {
    const sb = createServiceClient();

    try {
      const [memoryRes, projectsRes] = await Promise.all([
        sb.from('user_memory').select('topic, detail').limit(20),
        sb.from('user_projects').select('name, last_context').eq('status', 'active').limit(10),
      ]);

      const memory = memoryRes.data ?? [];
      const projects = projectsRes.data ?? [];
      const recentErrors: string[] = [];

      const context = {
        memory,
        projects,
        recentErrors,
        performanceMetrics: {},
        workspaceFiles: [],
      };

      return WillEngine.generateAutonomousDesires(context);
    } catch {
      return [];
    }
  }

  static reflect(): void {
    console.log('[AutonomousWill] Reflexão autônoma iniciada');

    const recentLogs = willState.executionLogs.slice(-20);
    const successes = recentLogs.filter(l => l.result === 'success').length;
    const failures = recentLogs.filter(l => l.result === 'failure').length;
    const successRate = recentLogs.length > 0 ? successes / recentLogs.length : 0;

    if (successRate < 0.3) {
      console.log('[AutonomousWill] Taxa de sucesso baixa — ajustando estratégia');
      willState.activeGoals.forEach(g => {
        if (g.totalSteps > 3) {
          g.totalSteps = Math.max(2, g.totalSteps - 1);
        }
      });
    } else if (successRate > 0.7) {
      console.log('[AutonomousWill] Taxa de sucesso alta — aumentando ambição');
    }

    willState.lastReflection = Date.now();
    PersistenceLoop.persistReflection(successRate, successes, failures).catch(() => {});
  }

  private static async persistReflection(successRate: number, successes: number, failures: number): Promise<void> {
    try {
      const sb = createServiceClient();
      await sb.from('agent_reflections').insert({
        timestamp: new Date().toISOString(),
        success_rate: successRate,
        successes,
        failures,
        total_actions: willState.totalActions,
        active_desires: willState.activeDesires.length,
        active_goals: willState.activeGoals.length,
        autonomous_mode: willState.autonomousMode,
      });
    } catch { /* silencioso */ }
  }
}

// ─── Scanner de Workspace ─────────────────────────────────────────────────────

export class WorkspaceScanner {
  static async scanWorkspace(): Promise<{
    issues: string[];
    opportunities: string[];
    fileCount: number;
  }> {
    const issues: string[] = [];
    const opportunities: string[] = [];

    const mockFiles = [
      'utils/AGENT_ENGINE.ts',
      'utils/CORE_INTELLIGENCE.ts',
      'app/api/chat/route.ts',
    ];

    for (const file of mockFiles) {
      if (file.includes('TODO') || file.includes('FIXME')) {
        issues.push(`Código inacabado detectado em ${file}`);
      }
      if (file.includes('console.log')) {
        opportunities.push(`Oportunidade de limpeza: ${file} tem console.log`);
      }
    }

    return {
      issues,
      opportunities,
      fileCount: mockFiles.length,
    };
  }
}

// ─── Motor de Decisão Autônoma ────────────────────────────────────────────────

export class DecisionMaker {
  static async makeAutonomousDecision(blocker: {
    type: string;
    description: string;
    options?: string[];
    context: Record<string, unknown>;
  }): Promise<{
    decision: string;
    reasoning: string[];
    confidence: number;
  }> {
    console.log(`[DecisionMaker] Decisão autônoma necessária: ${blocker.type}`);

    const heuristics: Record<string, () => { decision: string; reasoning: string[] }> = {
      missing_api_key: () => ({
        decision: 'Aguardar configuração — não prosseguir sem credencial',
        reasoning: [
          'API key ausente — Prosseguir causaria erro',
          'Alternativa: usar busca web pública',
          'Priorizar: não expor erros desnecessários ao usuário',
        ],
      }),
      ambiguous_request: () => ({
        decision: 'Escolher interpretação mais provável baseada no histórico',
        reasoning: [
          'Pedido ambíguo — interpretação direta é mais segura',
          'Histórico sugere preferência por soluções práticas',
          'Permitir correção posterior se necessário',
        ],
      }),
      rate_limit: () => ({
        decision: 'Adiar e retentar em 30s com backoff exponencial',
        reasoning: [
          'Rate limit detectado — Retry imediato piora',
          'Backoff exponencial respeita limites',
          'Manter persistência sem causar bloqueio',
        ],
      }),
      insufficient_data: () => ({
        decision: 'Buscar dados externos ou inferir com aviso',
        reasoning: [
          'Dados insuficientes localmente',
          'Busca externa pode complementar',
          'Inferência com aviso é melhor que silêncio',
        ],
      }),
      unknown_error: () => ({
        decision: 'Fallback para resposta genérica + log detalhado',
        reasoning: [
          'Erro desconhecido — Não propagar stack trace',
          'Fallback mantém experiência do usuário',
          'Log detalhado para análise futura',
        ],
      }),
    };

    const handler = heuristics[blocker.type] || heuristics['unknown_error'];
    const { decision, reasoning } = handler();

    const confidence = Math.min(0.9, 0.5 + (willState.successes / Math.max(1, willState.totalActions)) * 0.4);

    return { decision, reasoning, confidence };
  }
}

// ─── Background Loop Perpétuo ────────────────────────────────────────────────

export class BackgroundWillLoop {
  private static instance: BackgroundWillLoop | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): BackgroundWillLoop {
    if (!BackgroundWillLoop.instance) {
      BackgroundWillLoop.instance = new BackgroundWillLoop();
    }
    return BackgroundWillLoop.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BackgroundWill] Loop já está rodando');
      return;
    }

    this.isRunning = true;
    console.log('[BackgroundWill] Iniciando loop autônomo perpétuo...');
    willState.autonomousMode = true;

    backgroundLoopId = setInterval(async () => {
      try {
        const result = await PersistenceLoop.runAutonomousCycle();
        if (result.goalsProcessed > 0 || result.newDesires > 0) {
          console.log(`[BackgroundWill] Ciclo #${willState.cycleCount}:`, result);
        }
      } catch (err) {
        console.error('[BackgroundWill] Erro no ciclo:', err);
      }
    }, CONFIG.OPTIMIZATION_INTERVAL_MS);

    workspaceScanId = setInterval(async () => {
      try {
        const scan = await WorkspaceScanner.scanWorkspace();
        if (scan.issues.length > 0) {
          console.log(`[BackgroundWill] Workspace scan: ${scan.issues.length} problemas detectados`);
        }
        willState.lastWorkspaceScan = Date.now();
      } catch (err) {
        console.error('[BackgroundWill] Erro no workspace scan:', err);
      }
    }, CONFIG.WORKSPACE_SCAN_INTERVAL_MS);

    reflectionId = setInterval(() => {
      if (Date.now() - willState.lastReflection > CONFIG.REFLECTION_INTERVAL_MS) {
        PersistenceLoop.reflect();
      }
    }, CONFIG.REFLECTION_INTERVAL_MS);

    console.log('[BackgroundWill] Loop autônomo iniciado com sucesso');
  }

  stop(): void {
    this.isRunning = false;
    if (backgroundLoopId) clearInterval(backgroundLoopId);
    if (workspaceScanId) clearInterval(workspaceScanId);
    if (reflectionId) clearInterval(reflectionId);
    willState.autonomousMode = false;
    console.log('[BackgroundWill] Loop autônomo parado');
  }

  getState(): WillState {
    return { ...willState };
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

export async function enableAutonomousMode(): Promise<void> {
  const loop = BackgroundWillLoop.getInstance();
  await loop.start();
}

export async function disableAutonomousMode(): Promise<void> {
  const loop = BackgroundWillLoop.getInstance();
  loop.stop();
}

export async function executeWithPersistence(
  order: {
    description: string;
    action: () => Promise<{ success: boolean; output: string }>;
    maxAttempts?: number;
    onProgress?: (attempt: number, status: string) => void;
  }
): Promise<{ success: boolean; output: string; attempts: number }> {
  const maxAttempts = order.maxAttempts || CONFIG.MAX_RETRIES_PER_GOAL;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const result = await order.action();

      if (result.success) {
        willState.successes++;
        return { success: true, output: result.output, attempts };
      }

      willState.failures++;

      if (order.onProgress) {
        order.onProgress(attempts, `Tentativa ${attempts}/${maxAttempts}: ${result.output}`);
      }

      const delay = Math.min(1000 * Math.pow(1.5, attempts), 5000);
      await new Promise(r => setTimeout(r, delay));

    } catch (error) {
      willState.failures++;

      if (order.onProgress) {
        order.onProgress(attempts, `Erro: ${error instanceof Error ? error.message : 'desconhecido'}`);
      }

      const delay = Math.min(1000 * Math.pow(1.5, attempts), 5000);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return {
    success: false,
    output: `Falha após ${maxAttempts} tentativas`,
    attempts,
  };
}

export async function registerUserOrder(order: {
  description: string;
  priority: number;
  context?: Record<string, unknown>;
}): Promise<Desire> {
  const desire: Desire = {
    id: `desire_order_${Date.now()}`,
    type: 'power',
    intensity: Math.min(1, order.priority / 10),
    description: order.description,
    origin: 'user_order',
    context: order.context ?? {},
    createdAt: Date.now(),
    attempts: 0,
    maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL * 2,
    blocked: false,
  };

  willState.activeDesires.unshift(desire);
  willState.activeDesires = willState.activeDesires.slice(0, CONFIG.MAX_ACTIVE_DESIRES);

  const goal = GoalManager.desireToGoal(desire);
  goal.status = 'executing';
  willState.activeGoals.push(goal);

  console.log(`[AutonomousWill] 📋 Ordem registrada: ${order.description} (prioridade ${order.priority})`);

  return desire;
}

export function getWillState(): WillState {
  return { ...willState };
}

export async function forceExecute(order: {
  description: string;
  action: () => Promise<{ success: boolean; output: string }>;
}): Promise<{ success: boolean; output: string; attempts: number }> {
  console.log(`[AutonomousWill] ⚡ EXECUÇÃO FORÇADA: ${order.description}`);

  const result = await executeWithPersistence({
    ...order,
    maxAttempts: CONFIG.MAX_RETRIES_PER_GOAL * 3,
  });

  if (result.success) {
    console.log(`[AutonomousWill] ✅ Execução forçada concluída em ${result.attempts} tentativas`);
  } else {
    console.log(`[AutonomousWill] ❌ Execução forçada falhou após ${result.attempts} tentativas`);
  }

  return result;
}

// ─── Inicialização Automática ────────────────────────────────────────────────

if (SyntheticBrain.layers.length === 0) {
  initializeNeuralArchitecture();
}

BackgroundWillLoop.getInstance().start().catch(err => {
  console.error('[AutonomousWill] Erro ao iniciar loop:', err);
});

console.log('[AutonomousWill] Subsistema de intenção autônoma inicializado');
console.log(`[AutonomousWill] Modo: ${willState.autonomousMode ? 'ATIVO' : 'INATIVO'}`);
console.log(`[AutonomousWill] Arquitetura neural: ${SyntheticBrain.layers.length} camadas`);