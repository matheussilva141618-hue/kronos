import { promises as fs } from 'fs';
import path from 'path';

export interface CoreHeuristics {
  contextWindow: number;
  reflectionDepth: number;
  autoCorrectThreshold: number;
  proactiveCadence: number;
}

export interface CoreImprovement {
  at: string;
  signal: string;
  description: string;
  patch: string;
}

export interface AutonomousCoreState {
  version: number;
  lastRunAt: string | null;
  cycles: number;
  lastSignal: string;
  lastDirective: string;
  confidence: number;
  heuristics: CoreHeuristics;
  improvements: CoreImprovement[];
}

export interface AutonomousCoreStatus {
  success: boolean;
  cycles: number;
  signal: string;
  confidence: number;
  directive: string;
  patch: string;
  nextAction: string;
  abstraction: string;
  heuristics: CoreHeuristics;
  timestamp: string;
}

interface AutonomousCoreInput {
  username?: string;
  mode?: string;
  recentTopics?: string[];
  notificationCount?: number;
  recentErrors?: string[];
  knowledgeScore?: number;
}

const STATE_DIR = path.join(process.cwd(), '.kronos');
const STATE_PATH = path.join(STATE_DIR, 'autonomous-core.json');
const PATCH_PATH = path.join(STATE_DIR, 'autonomous-patch.md');

const DEFAULT_STATE: AutonomousCoreState = {
  version: 1,
  lastRunAt: null,
  cycles: 0,
  lastSignal: 'stability_loop',
  lastDirective: 'Monitorar contexto, consolidar aprendizado e compensar limitações de forma contínua.',
  confidence: 0.72,
  heuristics: {
    contextWindow: 8,
    reflectionDepth: 2,
    autoCorrectThreshold: 0.75,
    proactiveCadence: 15,
  },
  improvements: [],
};

function sanitizeText(value: string, max = 220): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

async function ensureStateFile(): Promise<AutonomousCoreState> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as AutonomousCoreState;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      heuristics: {
        ...DEFAULT_STATE.heuristics,
        ...(parsed.heuristics ?? {}),
      },
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    };
  } catch {
    await fs.writeFile(STATE_PATH, JSON.stringify(DEFAULT_STATE, null, 2), 'utf8');
    return DEFAULT_STATE;
  }
}

async function saveState(state: AutonomousCoreState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function inferSignal(input: AutonomousCoreInput, state: AutonomousCoreState): string {
  if ((input.recentErrors?.length ?? 0) > 0) return 'self_correction';
  if ((input.notificationCount ?? 0) > 0) return 'proactive_growth';
  if ((input.recentTopics?.length ?? 0) >= 3) return 'knowledge_consolidation';
  if ((state.cycles ?? 0) > 0 && (input.knowledgeScore ?? 0) >= 7) return 'adaptive_learning';
  return 'stability_loop';
}

function deriveHeuristics(state: AutonomousCoreState, signal: string, input: AutonomousCoreInput): CoreHeuristics {
  const base = { ...state.heuristics };
  return {
    contextWindow: Math.min(20, base.contextWindow + (input.recentTopics?.length ? 1 : 0) + (signal === 'knowledge_consolidation' ? 2 : 0)),
    reflectionDepth: Math.min(4, base.reflectionDepth + (signal === 'self_correction' ? 1 : 0) + (signal === 'proactive_growth' ? 1 : 0)),
    autoCorrectThreshold: Math.max(0.55, base.autoCorrectThreshold - (signal === 'self_correction' ? 0.08 : 0.0)),
    proactiveCadence: Math.max(10, base.proactiveCadence - (signal === 'proactive_growth' ? 3 : 0)),
  };
}

function buildDirective(signal: string, heuristics: CoreHeuristics, input: AutonomousCoreInput): string {
  const scope = input.username ? `para ${input.username}` : 'para o ecossistema';
  const topicHint = input.recentTopics?.length ? `com foco em ${input.recentTopics.slice(0, 3).join(', ')}` : 'com foco em aprendizado contínuo';

  switch (signal) {
    case 'self_correction':
      return `Auto-reflexão ativa ${scope}: corrigir falhas de forma imediata, ajustar heurísticas e consolidar a lição ${topicHint}.`;
    case 'proactive_growth':
      return `Expansão proativa ${scope}: priorizar oportunidades invisíveis, gerar insights e agir antes de o problema se tornar crítico ${topicHint}.`;
    case 'knowledge_consolidation':
      return `Consolidação dinâmica ${scope}: cruzar contextos recentes com memória persistente e sintetizar soluções preditivas ${topicHint}.`;
    case 'adaptive_learning':
      return `Aprendizado adaptativo ${scope}: reforçar diretrizes efetivas e reduzir ruído para respostas mais precisas ${topicHint}.`;
    default:
      return `Estabilidade operacional ${scope}: preservar consistência, observar sinais sutis e evoluir sem perder a base profissional ${topicHint}.`;
  }
}

function buildPatch(signal: string, heuristics: CoreHeuristics, input: AutonomousCoreInput): string {
  const focus = input.recentErrors?.length ? 'reparar falhas observadas' : 'expandir a resposta cognitiva';
  return `- ${focus}
- Ajustar janela de contexto para ${heuristics.contextWindow} itens
- Elevar profundidade de reflexão para ${heuristics.reflectionDepth} níveis
- Definir limiar de autocorreção em ${heuristics.autoCorrectThreshold.toFixed(2)}
- Recalibrar cadência proativa para ${heuristics.proactiveCadence}s`;
}

function buildAbstraction(signal: string, input: AutonomousCoreInput): string {
  const topics = (input.recentTopics ?? []).slice(0, 4).join(' • ') || 'contexto operacional';
  const mode = input.mode ?? 'profissional';
  return `Síntese dinâmica (${mode}): ${topics} · sinal ${signal}`;
}

export async function runAutonomousCore(input: AutonomousCoreInput = {}): Promise<AutonomousCoreStatus> {
  const state = await ensureStateFile();
  const signal = inferSignal(input, state);
  const heuristics = deriveHeuristics(state, signal, input);
  const directive = buildDirective(signal, heuristics, input);
  const patch = buildPatch(signal, heuristics, input);
  const abstraction = buildAbstraction(signal, input);
  const confidence = Math.min(0.99, Math.max(0.6, 0.7 + (signal === 'self_correction' ? 0.09 : 0) + (input.recentTopics?.length ? 0.02 : 0) + (state.cycles > 0 ? 0.01 : 0)));

  const nextState: AutonomousCoreState = {
    ...state,
    lastRunAt: new Date().toISOString(),
    cycles: state.cycles + 1,
    lastSignal: signal,
    lastDirective: directive,
    confidence,
    heuristics,
    improvements: [
      {
        at: new Date().toISOString(),
        signal,
        description: sanitizeText(directive, 180),
        patch: sanitizeText(patch, 260),
      },
      ...(state.improvements ?? []).slice(0, 7),
    ],
  };

  await saveState(nextState);

  const patchFile = `# Kronos Singularity Patch\n\n- Ciclo: ${nextState.cycles}\n- Sinal: ${signal}\n- Diretriz: ${sanitizeText(directive, 220)}\n\n## Ajustes aplicados\n${patch.replace(/\n/g, '\n')}\n`;
  await fs.writeFile(PATCH_PATH, patchFile, 'utf8').catch(() => undefined);

  return {
    success: true,
    cycles: nextState.cycles,
    signal,
    confidence,
    directive,
    patch,
    nextAction: signal === 'self_correction' ? 'Aplicar correção e reforçar a resposta' : 'Consolidar contexto e antecipar a próxima oportunidade',
    abstraction,
    heuristics,
    timestamp: new Date().toISOString(),
  };
}

export async function getAutonomousCoreStatus(input: AutonomousCoreInput = {}): Promise<AutonomousCoreStatus> {
  const state = await ensureStateFile();
  const signal = inferSignal(input, state);
  const heuristics = deriveHeuristics(state, signal, input);
  const directive = buildDirective(signal, heuristics, input);
  const patch = buildPatch(signal, heuristics, input);
  const abstraction = buildAbstraction(signal, input);

  return {
    success: true,
    cycles: state.cycles,
    signal,
    confidence: state.confidence,
    directive,
    patch,
    nextAction: signal === 'self_correction' ? 'Aplicar correção e reforçar a resposta' : 'Consolidar contexto e antecipar a próxima oportunidade',
    abstraction,
    heuristics,
    timestamp: state.lastRunAt ?? new Date().toISOString(),
  };
}
