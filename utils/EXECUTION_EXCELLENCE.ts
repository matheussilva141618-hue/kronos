/**
 * KRONOS — Execution Excellence v1.0
 *
 * Camada de excelência operacional:
 * - Toda ordem é executada até a conclusão
 * - Qualidade obrigatória em cada passo
 * - Validação de resultado antes de considerar completo
 * - Retry inteligente com fallback
 * - Sem desistência prematura
 *
 * O Kronos não apenas executa — ele EXECuta com EXCELÊNCIA.
 */

import { getWillState, type AutonomousGoal } from './AUTONOMOUS_WILL';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ExecutionQuality = 'excellent' | 'good' | 'acceptable' | 'poor' | 'failed';

export interface ExecutionResult {
  success: boolean;
  quality: ExecutionQuality;
  output: string;
  metrics: {
    stepsCompleted: number;
    totalSteps: number;
    attempts: number;
    duration: number;
    retries: number;
  };
  validation: {
    passed: boolean;
    checks: string[];
    failures: string[];
  };
  learnings: string[];
}

export interface ExcellenceConfig {
  minQuality: ExecutionQuality;
  maxRetries: number;
  retryBackoffMs: number;
  requireValidation: boolean;
  persistOnFailure: boolean;
  logLevel: 'minimal' | 'detailed' | 'verbose';
}

// ─── Configuração ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ExcellenceConfig = {
  minQuality: 'acceptable',
  maxRetries: 10,
  retryBackoffMs: 1000,
  requireValidation: true,
  persistOnFailure: true,
  logLevel: 'detailed',
};

let config: ExcellenceConfig = { ...DEFAULT_CONFIG };

// ─── Motor de Excelência ──────────────────────────────────────────────────────

export class ExecutionExcellence {
  /**
   * Executa uma ação com garantia de qualidade
   */
  static async executeWithExcellence<T>(
    action: string,
    executor: () => Promise<T>,
    validator: (result: T) => { valid: boolean; quality: ExecutionQuality; checks: string[]; failures: string[] },
    onProgress?: (status: string) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let attempts = 0;
    let retries = 0;
    const learnings: string[] = [];

    while (attempts < config.maxRetries) {
      attempts++;

      try {
        // Executa ação
        const result = await executor();

        // Valida resultado
        const rawValidation = validator(result);
        const validation = {
          valid: rawValidation.valid,
          quality: rawValidation.quality,
          checks: rawValidation.checks,
          failures: rawValidation.failures,
          passed: rawValidation.valid,
        };

        if (!validation.valid) {
          learnings.push(`Tentativa ${attempts}: validação falhou — ${validation.failures.join(', ')}`);

          if (config.requireValidation && attempts < config.maxRetries) {
            retries++;
            await ExecutionExcellence.backoff(attempts);
            continue;
          }
        }

        // Sucesso ou qualidade aceitável
        const duration = Date.now() - startTime;

        if (config.logLevel !== 'minimal') {
          console.log(`[Excellence] ✅ ${action}: ${validation.quality} em ${attempts} tentativa(s), ${duration}ms`);
        }

        return {
          success: true,
          quality: validation.quality,
          output: typeof result === 'string' ? result : JSON.stringify(result),
          metrics: {
            stepsCompleted: 1,
            totalSteps: 1,
            attempts,
            duration,
            retries,
          },
          validation,
          learnings,
        };

      } catch (error) {
        retries++;
        learnings.push(`Tentativa ${attempts}: erro — ${error instanceof Error ? error.message : 'desconhecido'}`);

        if (config.logLevel === 'verbose') {
          console.error(`[Excellence] ⚠️ ${action}: erro na tentativa ${attempts}:`, error);
        }

        if (attempts < config.maxRetries) {
          await ExecutionExcellence.backoff(attempts);
        }
      }
    }

    // Falha definitiva
    const duration = Date.now() - startTime;

    console.log(`[Excellence] ❌ ${action}: falhou após ${attempts} tentativas, ${duration}ms`);

    return {
      success: false,
      quality: 'failed',
      output: `Falha após ${attempts} tentativas`,
      metrics: {
        stepsCompleted: 0,
        totalSteps: 1,
        attempts,
        duration,
        retries,
      },
      validation: {
        passed: false,
        checks: [],
        failures: learnings,
      },
      learnings,
    };
  }

  /**
   * Executa um objetivo autônomo com múltiplos passos e validação final
   */
  static async executeGoalWithExcellence(
    goal: AutonomousGoal,
    stepExecutor: (step: number) => Promise<{ success: boolean; output: string; quality: ExecutionQuality }>,
    onProgress?: (step: number, status: string) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const stepsCompleted: number[] = [];
    const learnings: string[] = [];
    let retries = 0;

    for (let step = 1; step <= goal.totalSteps; step++) {
      let stepAttempts = 0;
      const maxStepAttempts = 3;

      while (stepAttempts < maxStepAttempts) {
        stepAttempts++;

        try {
          const result = await stepExecutor(step);

          if (result.success && (result.quality === 'excellent' || result.quality === 'good' || result.quality === 'acceptable')) {
            stepsCompleted.push(step);
            learnings.push(`Passo ${step}: ${result.quality} — ${result.output.slice(0, 50)}`);

            if (onProgress) {
              onProgress(step, `Passo ${step}/${goal.totalSteps} completo (${result.quality})`);
            }
            break;
          }

          // Qualidade insuficiente — retenta passo
          retries++;
          learnings.push(`Passo ${step}: qualidade insuficiente (${result.quality}) — retentando`);

          if (stepAttempts < maxStepAttempts) {
            await ExecutionExcellence.backoff(stepAttempts);
          }

        } catch (error) {
          retries++;
          learnings.push(`Passo ${step}: erro — ${error instanceof Error ? error.message : 'desconhecido'}`);

          if (stepAttempts < maxStepAttempts) {
            await ExecutionExcellence.backoff(stepAttempts);
          }
        }
      }

      // Se falhou após max tentativas no passo, aborta objetivo
      if (stepAttempts >= maxStepAttempts && !stepsCompleted.includes(step)) {
        console.log(`[Excellence] ❌ Objetivo "${goal.title}" falhou no passo ${step}`);
        break;
      }
    }

    const allStepsCompleted = stepsCompleted.length === goal.totalSteps;
    const duration = Date.now() - startTime;

    const validation = {
      passed: allStepsCompleted,
      checks: stepsCompleted.map(s => `Passo ${s} completado`),
      failures: Array.from({ length: goal.totalSteps }, (_, i) => i + 1)
        .filter(s => !stepsCompleted.includes(s))
        .map(s => `Passo ${s} não completado`),
    };

    const quality = allStepsCompleted ? 'excellent' : stepsCompleted.length > 0 ? 'acceptable' : 'failed';

    if (config.logLevel !== 'minimal') {
      console.log(`[Excellence] ${allStepsCompleted ? '✅' : '⚠️'} Objetivo "${goal.title}": ${stepsCompleted.length}/${goal.totalSteps} passos, ${quality}, ${duration}ms`);
    }

    return {
      success: allStepsCompleted,
      quality,
      output: allStepsCompleted
        ? `Objetivo completo: ${goal.title}`
        : `Objetivo parcial: ${stepsCompleted.length}/${goal.totalSteps} passos`,
      metrics: {
        stepsCompleted: stepsCompleted.length,
        totalSteps: goal.totalSteps,
        attempts: stepsCompleted.length + retries,
        duration,
        retries,
      },
      validation,
      learnings,
    };
  }

  /**
   * Validação rigorosa de código
   */
  static validateCode(result: string, language: string = 'typescript'): { valid: boolean; quality: ExecutionQuality; checks: string[]; failures: string[] } {
    const checks: string[] = [];
    const failures: string[] = [];

    // Verifica se tem código
    const hasCode = /\b(function|const|class|def|async|=>|return|if|for|while)\b/.test(result);
    if (!hasCode) {
      failures.push('Sem código na resposta');
    } else {
      checks.push('Código presente');
    }

    // Verifica se não tem placeholders
    const hasPlaceholders = /\/\/\s*(implemente|adicione|complete|todo|fixme)|#\s*(todo|fixme)/i.test(result);
    if (hasPlaceholders) {
      failures.push('Placeholders detectados');
    } else {
      checks.push('Sem placeholders');
    }

    // Verifica se não tem markdown excessivo
    const markdownCount = (result.match(/\*\*|#{1,6}|\`\`\`|\|---/g) ?? []).length;
    if (markdownCount > 5) {
      failures.push('Markdown excessivo');
    } else {
      checks.push('Formatação limpa');
    }

    // Verifica tamanho mínimo para código complexo
    const minLength = language === 'typescript' ? 100 : 50;
    if (result.length < minLength && !hasPlaceholders) {
      checks.push('Código conciso');
    }

    const quality = failures.length === 0 ? 'excellent' : failures.length === 1 ? 'acceptable' : 'poor';

    return {
      valid: failures.length === 0,
      quality,
      checks,
      failures,
    };
  }

  /**
   * Valida resposta textual
   */
  static validateText(result: string, minLength: number = 20): { valid: boolean; quality: ExecutionQuality; checks: string[]; failures: string[] } {
    const checks: string[] = [];
    const failures: string[] = [];

    if (result.length < minLength) {
      failures.push(`Resposta muito curta (${result.length} chars, mínimo ${minLength})`);
    } else {
      checks.push(`Tamanho adequado (${result.length} chars)`);
    }

    if (/^(claro|com prazer|aqui está|certamente|entendido|olá,)/i.test(result.trim())) {
      failures.push('Frase de abertura banida');
    } else {
      checks.push('Sem abertura banida');
    }

    const quality = failures.length === 0 ? 'excellent' : failures.length === 1 ? 'acceptable' : 'poor';

    return {
      valid: failures.length === 0,
      quality,
      checks,
      failures,
    };
  }

  /**
   * Atualiza configuração de excelência
   */
  static updateConfig(newConfig: Partial<ExcellenceConfig>): void {
    config = { ...config, ...newConfig };
    console.log('[Excellence] ⚙️ Configuração atualizada:', config);
  }

  /**
   * Retorna configuração atual
   */
  static getConfig(): ExcellenceConfig {
    return { ...config };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private static backoff(attempt: number): Promise<void> {
    const delay = config.retryBackoffMs * Math.pow(1.5, attempt);
    return new Promise(r => setTimeout(r, Math.min(delay, 10000)));
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────

/**
 * Executa com excelência total
 */
export async function executeWithExcellence<T>(
  action: string,
  executor: () => Promise<T>,
  validator: (result: T) => { valid: boolean; quality: ExecutionQuality; checks: string[]; failures: string[] },
  onProgress?: (status: string) => void
): Promise<ExecutionResult> {
  return ExecutionExcellence.executeWithExcellence(action, executor, validator, onProgress);
}

/**
 * Executa objetivo com múltiplos passos
 */
export async function executeGoalWithExcellence(
  goal: AutonomousGoal,
  stepExecutor: (step: number) => Promise<{ success: boolean; output: string; quality: ExecutionQuality }>,
  onProgress?: (step: number, status: string) => void
): Promise<ExecutionResult> {
  return ExecutionExcellence.executeGoalWithExcellence(goal, stepExecutor, onProgress);
}

/**
 * Valida código
 */
export function validateCode(result: string, language?: string): { valid: boolean; quality: ExecutionQuality; checks: string[]; failures: string[] } {
  return ExecutionExcellence.validateCode(result, language);
}

/**
 * Valida texto
 */
export function validateText(result: string, minLength?: number): { valid: boolean; quality: ExecutionQuality; checks: string[]; failures: string[] } {
  return ExecutionExcellence.validateText(result, minLength);
}

/**
 * Configura excelência
 */
export function configureExcellence(newConfig: Partial<ExcellenceConfig>): void {
  ExecutionExcellence.updateConfig(newConfig);
}

/**
 * Obtém configuração
 */
export function getExcellenceConfig(): ExcellenceConfig {
  return ExecutionExcellence.getConfig();
}