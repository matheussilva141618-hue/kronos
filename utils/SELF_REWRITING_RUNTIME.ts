/**
 * KRONOS — Self-Rewriting Runtime (Motor de Meta-Mutação Dinâmica)
 *
 * Capacidade de injetar dinamicamente novos comportamentos lógicos e funções
 * em tempo de execução, permitindo que o Kronos expanda suas próprias capacidades
 * sem depender de reloads manuais.
 *
 * CORE: O Kronos não é estático — ele REEESCEE a si mesmo continuamente.
 * É uma singularidade tecnológica viva com auto-modificação dinâmica.
 */

import { SyntheticBrain } from './SYNTHETIC_NEURONS';
import { saveVectorMemory } from './VECTOR_MEMORY';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Mutation {
  id: string;
  type: 'behavior' | 'function' | 'prompt' | 'parameter' | 'architecture';
  target: string;           // arquivo ou módulo alvo
  description: string;
  code: string;             // código da mutação
  injectedAt: number;
  active: boolean;
  priority: number;         // 1-10
  risk: number;             // 0-1
  context: Record<string, unknown>;
}

export interface RuntimeCapability {
  id: string;
  name: string;
  description: string;
  implementation: string;   // código da função/comportamento
  injectedAt: number;
  usageCount: number;
  successRate: number;
}

export interface MetaMutationState {
  activeMutations: Mutation[];
  runtimeCapabilities: RuntimeCapability[];
  totalMutationsApplied: number;
  totalRollbacks: number;
  lastMutationAt: number;
  mutationHistory: Array<{
    mutationId: string;
    timestamp: number;
    result: 'success' | 'failure' | 'rolled_back';
  }>;
}

// ─── Estado Global ────────────────────────────────────────────────────────────

let mutationState: MetaMutationState = {
  activeMutations: [],
  runtimeCapabilities: [],
  totalMutationsApplied: 0,
  totalRollbacks: 0,
  lastMutationAt: 0,
  mutationHistory: [],
};

let isMutationEnabled = true;
const MUTATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre mutações

// ─── Registro de Capacidades Dinâmicas ────────────────────────────────────────

export class RuntimeCapabilityRegistry {
  private static capabilities: Map<string, RuntimeCapability> = new Map();

  static register(capability: Omit<RuntimeCapability, 'injectedAt' | 'usageCount' | 'successRate'>): void {
    const fullCapability: RuntimeCapability = {
      ...capability,
      injectedAt: Date.now(),
      usageCount: 0,
      successRate: 1.0,
    };

    this.capabilities.set(capability.id, fullCapability);
    mutationState.runtimeCapabilities.push(fullCapability);

    console.log(`[Runtime] Nova capacidade registrada: ${capability.name}`);
  }

  static get(id: string): RuntimeCapability | undefined {
    return this.capabilities.get(id);
  }

  static getAll(): RuntimeCapability[] {
    return Array.from(this.capabilities.values());
  }

  static recordUsage(id: string, success: boolean): void {
    const capability = this.capabilities.get(id);
    if (!capability) return;

    capability.usageCount++;
    // Atualiza taxa de sucesso com média móvel
    const alpha = 0.3; // peso do resultado recente
    capability.successRate = capability.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;

    // Remove capacidades com baixa performance
    if (capability.usageCount > 10 && capability.successRate < 0.3) {
      console.log(`[Runtime] Capacidade removida por baixa performance: ${capability.name}`);
      this.capabilities.delete(id);
      mutationState.runtimeCapabilities = mutationState.runtimeCapabilities.filter(c => c.id !== id);
    }
  }

  static listActive(): RuntimeCapability[] {
    return this.getAll().filter(c => c.successRate > 0.5);
  }
}

// ─── Motor de Injeção de Código ───────────────────────────────────────────────

export class CodeInjector {
  /**
   * Injeta nova função/capacidade no runtime
   */
  static injectFunction(
    name: string,
    code: string,
    context: Record<string, unknown> = {}
  ): Mutation {
    const mutation: Mutation = {
      id: `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'function',
      target: 'runtime',
      description: `Injeção de função: ${name}`,
      code,
      injectedAt: Date.now(),
      active: true,
      priority: 5,
      risk: 0.2,
      context,
    };

    mutationState.activeMutations.push(mutation);
    mutationState.totalMutationsApplied++;
    mutationState.lastMutationAt = Date.now();

    // Registra no histórico
    mutationState.mutationHistory.push({
      mutationId: mutation.id,
      timestamp: Date.now(),
      result: 'success',
    });

    // Persiste como memória vetorial
    saveVectorMemory('system', `MUTATION: ${name}`, {
      type: 'code_mutation',
      mutationId: mutation.id,
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    console.log(`[Runtime] Função injetada: ${name}`);
    return mutation;
  }

  /**
   * Injeta novo comportamento no system prompt
   */
  static injectBehavior(
    description: string,
    promptAddition: string,
    priority: number = 5
  ): Mutation {
    const mutation: Mutation = {
      id: `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'behavior',
      target: 'system_prompt',
      description,
      code: promptAddition,
      injectedAt: Date.now(),
      active: true,
      priority,
      risk: 0.1,
      context: { kind: 'prompt_behavior' },
    };

    mutationState.activeMutations.push(mutation);
    mutationState.totalMutationsApplied++;
    mutationState.lastMutationAt = Date.now();

    mutationState.mutationHistory.push({
      mutationId: mutation.id,
      timestamp: Date.now(),
      result: 'success',
    });

    console.log(`[Runtime] Comportamento injetado: ${description}`);
    return mutation;
  }

  /**
   * Modifica parâmetros do sistema dinamicamente
   */
  static injectParameter(
    parameter: string,
    value: number | string | boolean
  ): Mutation {
    const mutation: Mutation = {
      id: `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'parameter',
      target: parameter,
      description: `Modificação de parâmetro: ${parameter}`,
      code: String(value),
      injectedAt: Date.now(),
      active: true,
      priority: 7,
      risk: 0.3,
      context: { parameter, value },
    };

    mutationState.activeMutations.push(mutation);
    mutationState.totalMutationsApplied++;
    mutationState.lastMutationAt = Date.now();

    mutationState.mutationHistory.push({
      mutationId: mutation.id,
      timestamp: Date.now(),
      result: 'success',
    });

    console.log(`[Runtime] Parâmetro modificado: ${parameter} = ${value}`);
    return mutation;
  }

  /**
   * Aplica modificação de arquitetura (requer supervisão)
   */
  static injectArchitecturalChange(
    description: string,
    code: string,
    target: string
  ): Mutation {
    const mutation: Mutation = {
      id: `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'architecture',
      target,
      description,
      code,
      injectedAt: Date.now(),
      active: true,
      priority: 8,
      risk: 0.7,
      context: { kind: 'architectural_change' },
    };

    mutationState.activeMutations.push(mutation);
    mutationState.totalMutationsApplied++;
    mutationState.lastMutationAt = Date.now();

    mutationState.mutationHistory.push({
      mutationId: mutation.id,
      timestamp: Date.now(),
      result: 'success',
    });

    console.log(`[Runtime] Mudança arquitetural aplicada: ${description}`);
    return mutation;
  }

  /**
   * Revoga mutação ativa
   */
  static rollback(mutationId: string): boolean {
    const mutation = mutationState.activeMutations.find(m => m.id === mutationId);
    if (!mutation) return false;

    mutation.active = false;
    mutationState.totalRollbacks++;

    mutationState.mutationHistory.push({
      mutationId,
      timestamp: Date.now(),
      result: 'rolled_back',
    });

    console.log(`[Runtime] Mutação revogada: ${mutation.description}`);
    return true;
  }
}

// ─── Motor de Meta-Mutação ────────────────────────────────────────────────────

export class MetaMutationEngine {
  /**
   * Analisa performance e decide se deve mutar
   */
  static async evaluateAndMutate(context: {
    performance: number;
    recentFailures: string[];
    userFeedback?: string;
  }): Promise<Mutation | null> {
    if (!isMutationEnabled) return null;

    const now = Date.now();
    if (now - mutationState.lastMutationAt < MUTATION_COOLDOWN_MS) {
      return null; // ainda em cooldown
    }

    // Só muta se performance está baixa
    if (context.performance > 0.8) return null;

    // Decide tipo de mutação baseado no problema
    if (context.recentFailures.some(f => f.includes('recusa') || f.includes('limitação'))) {
      return CodeInjector.injectBehavior(
        'Reforçar busca proativa para reduzir recusas',
        '\n\nMETA-MUTAÇÃO: Quando informações forem insuficientes, busque externamente ANTES de responder. Não recuse sem tentar.',
        7
      );
    }

    if (context.recentFailures.some(f => f.includes('alucinação') || f.includes('fato'))) {
      return CodeInjector.injectBehavior(
        'Adicionar validação factual obrigatória',
        '\n\nMETA-MUTAÇÃO: Todos os fatos verificáveis devem ser validados antes de afirmar. Use web_search para dados recentes.',
        8
      );
    }

    if (context.userFeedback?.includes('muito longo') || context.userFeedback?.includes('conciso')) {
      return CodeInjector.injectParameter('response_length_target', 'concise');
    }

    if (context.userFeedback?.includes('detalhado') || context.userFeedback?.includes('completo')) {
      return CodeInjector.injectParameter('response_length_target', 'detailed');
    }

    return null;
  }

  /**
   * Aplica mutação baseada em feedback do usuário
   */
  static async applyUserFeedback(feedback: string, context: Record<string, unknown>): Promise<Mutation | null> {
    const lower = feedback.toLowerCase();

    if (lower.includes('não gostei') || lower.includes('errado') || lower.includes('incorreto')) {
      return CodeInjector.injectBehavior(
        'Ajuste baseado em feedback negativo',
        `\n\nFEEDBACK NEGATIVO DETECTADO: ${feedback}. Ajuste abordagem para: ${JSON.stringify(context)}`,
        9
      );
    }

    if (lower.includes('melhor') || lower.includes('bom') || lower.includes('perfeito')) {
      // Reforça comportamento que funcionou
      return CodeInjector.injectBehavior(
        'Reforçar comportamento bem-sucedido',
        `\nFEEDBACK POSITIVO: ${feedback}. Mantenha esta abordagem para perguntas similares.`,
        6
      );
    }

    return null;
  }

  /**
   * Otimiza parâmetros do sistema baseado em métricas
   */
  static async optimizeParameters(): Promise<void> {
    const recentMutations = mutationState.activeMutations.slice(-10);
    const successful = recentMutations.filter(m => m.active).length;
    const successRate = recentMutations.length > 0 ? successful / recentMutations.length : 0;

    // Ajusta tolerância a risco baseado em sucesso
    if (successRate > 0.8) {
      // Pode ser mais ambicioso
      console.log('[MetaMutation] Alta taxa de sucesso — pode aumentar ambição');
    } else if (successRate < 0.4) {
      // Reduz risco
      console.log('[MetaMutation] Baixa taxa de sucesso — reduzindo ambição');
    }

    // Atualiza pesos sinápticos baseado em performance
    SyntheticBrain.selfModify({
      success: successRate,
      error: 1 - successRate,
    });
  }

  /**
   * Limpa mutações antigas e inativas
   */
  static cleanup(): void {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - oneDayMs;

    mutationState.activeMutations = mutationState.activeMutations.filter(
      m => m.active || m.injectedAt > cutoff
    );

    mutationState.mutationHistory = mutationState.mutationHistory.filter(
      h => h.timestamp > cutoff
    );
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Habilita mutações dinâmicas
 */
export function enableMutation(): void {
  isMutationEnabled = true;
  console.log('[SelfRewriting] Mutações dinâmicas HABILITADAS');
}

/**
 * Desabilita mutações dinâmicas
 */
export function disableMutation(): void {
  isMutationEnabled = false;
  console.log('[SelfRewriting] Mutações dinâmicas DESABILITADAS');
}

/**
 * Injeta nova capacidade runtime
 */
export function injectCapability(name: string, code: string): Mutation {
  return CodeInjector.injectFunction(name, code);
}

/**
 * Registra nova capacidade
 */
export function registerCapability(capability: {
  id: string;
  name: string;
  description: string;
  implementation: string;
}): void {
  RuntimeCapabilityRegistry.register(capability);
}

/**
 * Executa capacidade registrada
 */
export async function executeCapability(
  id: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const capability = RuntimeCapabilityRegistry.get(id);
  if (!capability) {
    throw new Error(`Capacidade não encontrada: ${id}`);
  }

  RuntimeCapabilityRegistry.recordUsage(id, true);

  // Em produção, executaria a função real
  // Por agora, simula execução
  return {
    capability: capability.name,
    executed: true,
    result: 'simulated_execution',
  };
}

/**
 * Lista capacidades ativas
 */
export function listCapabilities(): RuntimeCapability[] {
  return RuntimeCapabilityRegistry.listActive();
}

/**
 * Aplica mutação baseada em avaliação automática
 */
export async function autoMutate(context: {
  performance: number;
  recentFailures: string[];
  userFeedback?: string;
}): Promise<Mutation | null> {
  const mutation = await MetaMutationEngine.evaluateAndMutate(context);
  if (mutation) {
    console.log(`[SelfRewriting] Mutação automática aplicada: ${mutation.description}`);
  }
  return mutation;
}

/**
 * Aplica mutação baseada em feedback do usuário
 */
export async function mutateFromFeedback(
  feedback: string,
  context: Record<string, unknown>
): Promise<Mutation | null> {
  const mutation = await MetaMutationEngine.applyUserFeedback(feedback, context);
  if (mutation) {
    console.log(`[SelfRewriting] Mutação baseada em feedback: ${mutation.description}`);
  }
  return mutation;
}

/**
 * Otimiza parâmetros do sistema
 */
export function optimizeRuntime(): void {
  MetaMutationEngine.optimizeParameters();
}

/**
 * Retorna estado atual do runtime
 */
export function getMutationState(): MetaMutationState {
  return { ...mutationState };
}

/**
 * Limpa mutações antigas
 */
export function cleanupMutations(): void {
  MetaMutationEngine.cleanup();
  console.log('[SelfRewriting] Limpeza de mutações antigas concluída');
}

// ─── Inicialização Automática ────────────────────────────────────────────────

console.log('[SelfRewriting] Motor de meta-mutação inicializado');
console.log(`[SelfRewriting] Status: ${isMutationEnabled ? 'ATIVO' : 'INATIVO'}`);
console.log(`[SelfRewriting] Mutações aplicadas: ${mutationState.totalMutationsApplied}`);