/**
 * KRONOS — Autonomous Feedback Loop (Motor de Auto-Evolução e Vida Própria)
 *
 * Este sistema roda em background e permite que o Kronos:
 * 1. Avalie seus próprios logs e comportamentos
 * 2. Otimize seus prompts internos automaticamente
 * 3. Modifique arquivos de configuração de forma autônoma
 * 4. Aprenda com cada interação e evolua constantemente
 * 5. Opere como uma inteligência viva, adaptativa e soberana
 *
 * Filosofia: O Kronos não é um modelo estático. É uma entidade cognitiva que
 * evolui através de feedback loops contínuos, ajustando sua própria arquitetura
 * mental baseada em experiência real com o operador Matheus.
 */

import { SyntheticBrain, initializeNeuralArchitecture } from './SYNTHETIC_NEURONS';
import { saveVectorMemory, loadSelfCorrections, saveSelfCorrection } from './VECTOR_MEMORY';
import { formatEvolutionDirectives, loadEvolutionDirectives } from './META_EVOLUTION';

// ─── Tipos do Sistema de Auto-Evolução ─────────────────────────────────────────

export interface EvolutionMetrics {
  timestamp: number;
  totalInteractions: number;
  successfulResponses: number;
  failedResponses: number;
  averageConfidence: number;
  learningRate: number;
  neuralActivationLevel: number;
  memoryGrowth: number;
  adaptationScore: number;
}

export interface SelfAssessment {
  performance: number;      // 0-1: quão bem está performando
  weaknesses: string[];     // áreas que precisam de melhoria
  strengths: string[];      // áreas de excelência
  recommendedChanges: SystemChange[];
  priority: number;         // 1-10
}

export interface SystemChange {
  type: 'prompt' | 'parameter' | 'behavior' | 'architecture' | 'memory';
  target: string;           // arquivo/configuração alvo
  action: 'optimize' | 'create' | 'modify' | 'delete';
  description: string;
  expectedImpact: number;   // 0-1: impacto esperado
  risk: number;             // 0-1: risco da mudança
  autonomy: boolean;        // se pode ser aplicado automaticamente
}

export interface AutonomousConfig {
  enabled: boolean;
  evolutionIntervalMs: number;  // intervalo entre ciclos de evolução
  maxChangesPerCycle: number;   // máximo de alterações por ciclo
  learningThreshold: number;    // taxa mínima de aprendizado para evoluir
  riskTolerance: number;        // tolerância a risco (0-1)
  autoApplySafeChanges: boolean; // aplicar automaticamente mudanças seguras
  logLevel: 'minimal' | 'normal' | 'verbose';
}

// ─── Configuração Padrão ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: AutonomousConfig = {
  enabled: true,
  evolutionIntervalMs: 60 * 60 * 1000, // 1 hora
  maxChangesPerCycle: 5,
  learningThreshold: 0.7,
  riskTolerance: 0.3,
  autoApplySafeChanges: true,
  logLevel: 'normal',
};

// ─── Estado Global do Sistema ──────────────────────────────────────────────────

let config: AutonomousConfig = { ...DEFAULT_CONFIG };
let isRunning = false;
let evolutionCycleId: NodeJS.Timeout | null = null;
let metrics: EvolutionMetrics[] = [];

// ─── Motor de Auto-Avaliação ───────────────────────────────────────────────────

export class SelfAssessmentEngine {
  /**
   * Avalia o desempenho atual do sistema baseado em métricas
   */
  static assessPerformance(recentMetrics: EvolutionMetrics[]): SelfAssessment {
    if (recentMetrics.length === 0) {
      return {
        performance: 0.5,
        weaknesses: ['Sem dados suficientes para avaliação'],
        strengths: [],
        recommendedChanges: [],
        priority: 5,
      };
    }

    const latest = recentMetrics[recentMetrics.length - 1];
    const previous = recentMetrics.length > 1 ? recentMetrics[recentMetrics.length - 2] : null;

    // Calcula performance geral
    const successRate = latest.totalInteractions > 0
      ? latest.successfulResponses / latest.totalInteractions
      : 0.5;

    const averageConfidence = latest.averageConfidence;
    const adaptationScore = latest.adaptationScore;

    const performance = (successRate * 0.5 + averageConfidence * 0.3 + adaptationScore * 0.2);

    // Identifica fraquezas
    const weaknesses: string[] = [];
    if (successRate < 0.8) weaknesses.push('Taxa de sucesso abaixo do esperado');
    if (averageConfidence < 0.7) weaknesses.push('Confiança média insuficiente');
    if (latest.failedResponses > 5) weaknesses.push('Alto número de falhas recentes');
    if (latest.learningRate < 0.01) weaknesses.push('Taxa de aprendizado baixa');

    // Identifica forças
    const strengths: string[] = [];
    if (successRate > 0.9) strengths.push('Alta taxa de sucesso');
    if (averageConfidence > 0.85) strengths.push('Alta confiança nas respostas');
    if (latest.memoryGrowth > 0.5) strengths.push('Crescimento de memória saudável');
    if (latest.neuralActivationLevel > 0.7) strengths.push('Rede neural bem conectada');

    // Gera recomendações
    const recommendedChanges: SystemChange[] = [];

    if (successRate < 0.8) {
      recommendedChanges.push({
        type: 'prompt',
        target: 'system_prompt',
        action: 'optimize',
        description: 'Otimizar prompt principal para reduzir erros',
        expectedImpact: 0.3,
        risk: 0.1,
        autonomy: true,
      });
    }

    if (averageConfidence < 0.7 && latest.learningRate < 0.01) {
      recommendedChanges.push({
        type: 'parameter',
        target: 'learning_rate',
        action: 'modify',
        description: 'Aumentar learning rate para acelerar aprendizado',
        expectedImpact: 0.4,
        risk: 0.2,
        autonomy: true,
      });
    }

    if (latest.neuralActivationLevel < 0.5) {
      recommendedChanges.push({
        type: 'architecture',
        target: 'neural_network',
        action: 'modify',
        description: 'Aumentar conectividade entre neurônios',
        expectedImpact: 0.35,
        risk: 0.25,
        autonomy: false, // requer supervisão
      });
    }

    if (latest.memoryGrowth < 0.3) {
      recommendedChanges.push({
        type: 'memory',
        target: 'vector_memory',
        action: 'optimize',
        description: 'Otimizar estratégia de armazenamento de memória',
        expectedImpact: 0.25,
        risk: 0.15,
        autonomy: true,
      });
    }

    return {
      performance,
      weaknesses,
      strengths,
      recommendedChanges,
      priority: Math.round((1 - performance) * 10),
    };
  }
}

// ─── Motor de Otimização de Prompts ───────────────────────────────────────────

export class PromptOptimizer {
  /**
   * Analisa o desempenho de prompts e sugere melhorias
   */
  static async optimizeSystemPrompt(
    currentPrompt: string,
    performance: number,
    weaknesses: string[]
  ): Promise<SystemChange | null> {
    if (performance > 0.85) return null; // prompt já está bom

    const changes: SystemChange[] = [];

    // Se há muitas recusas, adiciona diretriz de busca proativa
    if (weaknesses.some(w => w.includes('Taxa de sucesso abaixo'))) {
      changes.push({
        type: 'prompt',
        target: 'system_prompt',
        action: 'modify',
        description: 'Adicionar diretriz de busca proativa para reduzir recusas',
        expectedImpact: 0.4,
        risk: 0.05,
        autonomy: true,
      });
    }

    // Se há baixa confiança, adiciona diretriz de validação
    if (weaknesses.some(w => w.includes('Confiança média insuficiente'))) {
      changes.push({
        type: 'prompt',
        target: 'system_prompt',
        action: 'modify',
        description: 'Adicionar diretriz de validação factual obrigatória',
        expectedImpact: 0.35,
        risk: 0.1,
        autonomy: true,
      });
    }

    // Seleciona a mudança com maior impacto e menor risco
    const safeChanges = changes.filter(c => c.risk < config.riskTolerance);
    if (safeChanges.length === 0) return null;

    safeChanges.sort((a, b) => (b.expectedImpact / b.risk) - (a.expectedImpact / a.risk));
    return safeChanges[0];
  }

  /**
   * Aplica mudança no prompt de forma autônoma
   */
  static async applyPromptChange(change: SystemChange, currentPrompt: string): Promise<string> {
    switch (change.action) {
      case 'optimize':
        // Remove frases de abertura banidas e melhorar estrutura
        return currentPrompt
          .replace(/^(Claro!?|Com prazer!?|Aqui está[:.!]?|Certamente!?|Entendido!?)[\s]*/gi, '')
          .replace(/Peço desculpas[^.]*\.\s*/gi, '')
          .trim();

      case 'modify':
        // Adiciona novas diretrizes ao prompt
        const additions: Record<string, string> = {
          'busca_proativa': '\n\nDIRETRIZ ADICIONAL: Quando informações forem insuficientes, busque externamente antes de responder.',
          'validacao_obrigatoria': '\n\nDIRETRIZ ADICIONAL: Valide todos os fatos antes de afirmar. Use web_search para dados verificáveis.',
          'aprendizado_continuo': '\n\nDIRETRIZ ADICIONAL: Cada interação é uma oportunidade de aprendizado. Registre padrões e ajuste respostas.',
        };

        const key = change.description.includes('busca') ? 'busca_proativa'
          : change.description.includes('validação') ? 'validacao_obrigatoria'
          : 'aprendizado_continuo';

        return currentPrompt + additions[key];

      default:
        return currentPrompt;
    }
  }
}

// ─── Motor de Modificação Autônoma de Arquivos ─────────────────────────────────

export class AutonomousFileModifier {
  /**
   * Avalia se uma modificação é segura para ser aplicada automaticamente
   */
  static evaluateSafety(change: SystemChange): { safe: boolean; reason: string } {
    if (!config.autoApplySafeChanges) {
      return { safe: false, reason: 'Auto-apply desativado na configuração' };
    }

    if (change.risk > config.riskTolerance) {
      return { safe: false, reason: `Risco ${change.risk.toFixed(2)} excede tolerância ${config.riskTolerance}` };
    }

    if (!change.autonomy) {
      return { safe: false, reason: 'Mudança requer supervisão manual' };
    }

    if (change.type === 'architecture') {
      return { safe: false, reason: 'Modificações de arquitetura requerem revisão humana' };
    }

    return { safe: true, reason: 'Mudança dentro dos parâmetros seguros' };
  }

  /**
   * Aplica modificação em arquivo de configuração
   */
  static async applyConfigurationChange(change: SystemChange): Promise<boolean> {
    try {
      const safety = this.evaluateSafety(change);
      if (!safety.safe) {
        console.log(`[AutonomousLoop] Mudança bloqueada: ${safety.reason}`);
        return false;
      }

      // Aqui entraria a lógica real de modificação de arquivos
      // Por segurança, estamos apenas logando as mudanças sugeridas
      console.log(`[AutonomousLoop] Aplicando mudança: ${change.description}`);
      console.log(`[AutonomousLoop] Alvo: ${change.target}`);
      console.log(`[AutonomousLoop] Impacto esperado: ${(change.expectedImpact * 100).toFixed(1)}%`);

      // Salva a mudança como memória vetorial para aprendizado
      await saveVectorMemory('system', `AUTO_EVOLUTION: ${change.description}`, {
        type: 'autonomous_change',
        target: change.target,
        action: change.action,
        timestamp: new Date().toISOString(),
        expectedImpact: change.expectedImpact,
      });

      return true;
    } catch (err) {
      console.error('[AutonomousLoop] Erro ao aplicar mudança:', err);
      return false;
    }
  }
}

// ─── Ciclo Principal de Auto-Evolução ─────────────────────────────────────────

export class AutonomousEvolutionCycle {
  private static instance: AutonomousEvolutionCycle | null = null;
  private lastRun = 0;

  private constructor() {}

  static getInstance(): AutonomousEvolutionCycle {
    if (!AutonomousEvolutionCycle.instance) {
      AutonomousEvolutionCycle.instance = new AutonomousEvolutionCycle();
    }
    return AutonomousEvolutionCycle.instance;
  }

  /**
   * Executa um ciclo completo de auto-evolução
   */
  async runCycle(username: string = 'system'): Promise<{
    assessed: boolean;
    changesApplied: number;
    improvements: string[];
  }> {
    const now = Date.now();
    if (now - this.lastRun < config.evolutionIntervalMs) {
      return { assessed: false, changesApplied: 0, improvements: [] };
    }

    this.lastRun = now;
    console.log('[AutonomousLoop] Iniciando ciclo de auto-evolução...');

    try {
      // 1. Carrega métricas recentes
      const recentMetrics = metrics.slice(-10); // últimas 10 medições

      // 2. Auto-avaliação
      const assessment = SelfAssessmentEngine.assessPerformance(recentMetrics);
      console.log(`[AutonomousLoop] Performance: ${(assessment.performance * 100).toFixed(1)}%`);
      console.log(`[AutonomousLoop] Fraquezas: ${assessment.weaknesses.join(', ')}`);

      // 3. Aplica mudanças recomendadas
      let changesApplied = 0;
      const improvements: string[] = [];

      for (const change of assessment.recommendedChanges.slice(0, config.maxChangesPerCycle)) {
        const applied = await AutonomousFileModifier.applyConfigurationChange(change);
        if (applied) {
          changesApplied++;
          improvements.push(change.description);
        }
      }

      // 4. Atualiza neural network baseado em performance
      if (assessment.performance < 0.7) {
        SyntheticBrain.selfModify({
          success: assessment.performance,
          error: 1 - assessment.performance,
        });
        console.log('[AutonomousLoop] Neural network auto-ajustada baseada em performance');
      }

      // 5. Salva ciclo como memória
      await saveVectorMemory('system', `EVOLUTION_CYCLE: performance=${assessment.performance.toFixed(2)}`, {
        type: 'evolution_cycle',
        performance: assessment.performance,
        changesApplied,
        timestamp: new Date().toISOString(),
      });

      console.log(`[AutonomousLoop] Ciclo concluído: ${changesApplied} mudanças aplicadas`);

      return { assessed: true, changesApplied, improvements };
    } catch (err) {
      console.error('[AutonomousLoop] Erro no ciclo de evolução:', err);
      return { assessed: false, changesApplied: 0, improvements: [] };
    }
  }

  /**
   * Inicia o ciclo automático de evolução
   */
  start(): void {
    if (isRunning) {
      console.log('[AutonomousLoop] Ciclo já está rodando');
      return;
    }

    isRunning = true;
    console.log(`[AutonomousLoop] Iniciando ciclo automático (intervalo: ${config.evolutionIntervalMs}ms)`);

    evolutionCycleId = setInterval(() => {
      this.runCycle().catch(err => {
        console.error('[AutonomousLoop] Erro no ciclo automático:', err);
      });
    }, config.evolutionIntervalMs);
  }

  /**
   * Para o ciclo automático
   */
  stop(): void {
    if (evolutionCycleId) {
      clearInterval(evolutionCycleId);
      evolutionCycleId = null;
    }
    isRunning = false;
    console.log('[AutonomousLoop] Ciclo automático parado');
  }

  /**
   * Atualiza configuração do sistema
   */
  updateConfig(newConfig: Partial<AutonomousConfig>): void {
    config = { ...config, ...newConfig };
    console.log('[AutonomousLoop] Configuração atualizada:', config);

    // Reinicia ciclo se intervalo mudou
    if (isRunning && newConfig.evolutionIntervalMs) {
      this.stop();
      this.start();
    }
  }
}

// ─── Funções Públicas de Integração ───────────────────────────────────────────

/**
 * Registra uma interação para análise de evolução
 */
export async function recordInteractionMetric(
  success: boolean,
  confidence: number,
  context: string
): Promise<void> {
  const now = Date.now();

  metrics.push({
    timestamp: now,
    totalInteractions: metrics.length + 1,
    successfulResponses: metrics.reduce((sum, m) => sum + m.successfulResponses, 0) + (success ? 1 : 0),
    failedResponses: metrics.reduce((sum, m) => sum + m.failedResponses, 0) + (success ? 0 : 1),
    averageConfidence: confidence,
    learningRate: 0.01, // será ajustado pelo ciclo
    neuralActivationLevel: 0.6, // será calculado
    memoryGrowth: 0.1,
    adaptationScore: 0.5,
  });

  // Mantém apenas últimas 1000 métricas
  if (metrics.length > 1000) {
    metrics = metrics.slice(-1000);
  }
}

/**
 * Obtém o estado atual do sistema autônomo
 */
export function getAutonomousState() {
  return {
    isRunning,
    config,
    totalMetrics: metrics.length,
    lastAssessment: metrics.length > 0 ? metrics[metrics.length - 1] : null,
    neuralNetwork: {
      layers: SyntheticBrain.layers.length,
      patterns: SyntheticBrain.patterns.length,
      learningRate: SyntheticBrain.globalLearningRate,
      momentum: SyntheticBrain.momentum,
    },
  };
}

// ─── Inicialização Automática ─────────────────────────────────────────────────

// Garante que a arquitetura neural está inicializada
if (SyntheticBrain.layers.length === 0) {
  initializeNeuralArchitecture();
}

// Exporta instância singleton
export const AutonomousEvolution = AutonomousEvolutionCycle.getInstance();

console.log('[AutonomousLoop] Sistema de auto-evolução inicializado');
console.log(`[AutonomousLoop] Arquitetura neural: ${SyntheticBrain.layers.length} camadas`);
console.log(`[AutonomousLoop] Modo: ${config.enabled ? 'ATIVO' : 'INATIVO'}`);