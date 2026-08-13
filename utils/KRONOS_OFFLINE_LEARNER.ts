/**
 * KRONOS OFFLINE LEARNER — Persistência Local e Aprendizado Autônomo
 * 100% TypeScript puro. Zero APIs externas.
 *
 * Garante que cada ciclo de interação:
 * 1. Atualize o KRONOS_MIND
 * 2. Grave logs de evolução no sistema de arquivos local
 * 3. Mantenha autonomia total e funcionamento offline
 *
 * Integra com:
 * - memoria_evolutiva.json (cerebro_nativo.js)
 * - genesis_memoria.json (genesis_colonia.js)
 * - kronos_mind_state.json (estado cognitivo local)
 */

import fs from 'fs';
import path from 'path';
import { getMindState, saveMindState, detectKnowledgeGap, recordErrorPattern, updateUserModel } from '@/utils/KRONOS_MIND';
import { getEvolutionaryStatus, refreshEvolutionaryMemory } from '@/utils/KronosPureEvolutionaryEngine';

// ─── Caminhos de persistência local ───────────────────────────────────────────

const KRONOS_MIND_STATE_PATH = path.join(process.cwd(), 'kronos_mind_state.json');
const EVOLUTION_LOG_PATH     = path.join(process.cwd(), 'evolution_log.json');
const INTERACTION_LOG_PATH   = path.join(process.cwd(), 'interaction_log.json');

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface MindStatePersistence {
  username: string;
  state: Record<string, unknown>;
  updated_at: string;
}

export interface EvolutionLogEntry {
  timestamp: string;
  cycle: number;
  generation: number;
  bestFitness: number;
  nichosAtivos: string[];
  hallOfFameSize: number;
  genesisAlive: number;
  triggeredBy: string;
}

export interface InteractionLogEntry {
  timestamp: string;
  username: string;
  messagePreview: string;
  responsePreview: string;
  intent: string;
  mode: string;
  source: 'local_brain' | 'reasoner' | 'evolutionary' | 'llm';
  confidence: number;
  reviewScore: number;
}

// ─── Inicialização de arquivos ────────────────────────────────────────────────

function ensureFile(path: string, initial: any): void {
  try {
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, JSON.stringify(initial, null, 2));
    }
  } catch { /* ignore */ }
}

function initializeStorage(): void {
  ensureFile(KRONOS_MIND_STATE_PATH, {});
  ensureFile(EVOLUTION_LOG_PATH, { cycles: [] });
  ensureFile(INTERACTION_LOG_PATH, { interactions: [] });
}

// ─── KRONOS MIND — Persistência Local ─────────────────────────────────────────

export async function saveMindStateLocal(username: string): Promise<void> {
  try {
    const state = getMindState();
    const payload: MindStatePersistence = {
      username,
      state: state as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    };

    // Carrega estado existente
    let existing: Record<string, MindStatePersistence> = {};
    try {
      if (fs.existsSync(KRONOS_MIND_STATE_PATH)) {
        existing = JSON.parse(fs.readFileSync(KRONOS_MIND_STATE_PATH, 'utf8'));
      }
    } catch { /* ignore */ }

    // Atualiza entrada do usuário
    existing[username] = payload;

    // Persiste no disco
    fs.writeFileSync(KRONOS_MIND_STATE_PATH, JSON.stringify(existing, null, 2));
  } catch { /* silencioso — falha no disco não bloqueia fluxo */ }
}

export async function loadMindStateLocal(username: string): Promise<void> {
  try {
    if (!fs.existsSync(KRONOS_MIND_STATE_PATH)) return;

    const data = JSON.parse(fs.readFileSync(KRONOS_MIND_STATE_PATH, 'utf8'));
    const saved = data[username];
    if (saved?.state) {
      // Mescla estado salvo com o atual
      const current = getMindState();
      const merged = { ...current, ...saved.state, lastUpdated: Date.now() };
      // Reaplica o estado mesclado
      Object.assign(current, merged);
    }
  } catch { /* silencioso — usa estado padrão */ }
}

// ─── Evolution Log — Rastreia Ciclos ─────────────────────────────────────────

let evolutionCycleCounter = 0;

export function logEvolutionCycle(triggeredBy: string): void {
  try {
    evolutionCycleCounter++;

    // Atualiza memória evolutiva
    refreshEvolutionaryMemory();
    const status = getEvolutionaryStatus();

    const entry: EvolutionLogEntry = {
      timestamp: new Date().toISOString(),
      cycle: evolutionCycleCounter,
      generation: status.generation,
      bestFitness: status.bestFitness,
      nichosAtivos: status.nichosAtivos,
      hallOfFameSize: status.hallOfFameSize,
      genesisAlive: status.genesisAlive,
      triggeredBy,
    };

    // Carrega log existente
    let log: { cycles: EvolutionLogEntry[] } = { cycles: [] };
    try {
      if (fs.existsSync(EVOLUTION_LOG_PATH)) {
        log = JSON.parse(fs.readFileSync(EVOLUTION_LOG_PATH, 'utf8'));
      }
    } catch { /* ignore */ }

    // Adiciona nova entrada
    log.cycles.push(entry);
    log.cycles = log.cycles.slice(-100); // Mantém apenas últimas 100 entradas

    // Persiste
    fs.writeFileSync(EVOLUTION_LOG_PATH, JSON.stringify(log, null, 2));
  } catch { /* silencioso */ }
}

// ─── Interaction Log — Rastreia Aprendizado ────────────────────────────────────

export function logInteractionLocal(
  username: string,
  message: string,
  response: string,
  intent: string,
  mode: string,
  source: 'local_brain' | 'reasoner' | 'evolutionary' | 'llm',
  confidence: number,
  reviewScore: number
): void {
  try {
    const entry: InteractionLogEntry = {
      timestamp: new Date().toISOString(),
      username,
      messagePreview: message.slice(0, 100),
      responsePreview: response.slice(0, 100),
      intent,
      mode,
      source,
      confidence,
      reviewScore,
    };

    // Carrega log existente
    let log: { interactions: InteractionLogEntry[] } = { interactions: [] };
    try {
      if (fs.existsSync(INTERACTION_LOG_PATH)) {
        log = JSON.parse(fs.readFileSync(INTERACTION_LOG_PATH, 'utf8'));
      }
    } catch { /* ignore */ }

    // Adiciona nova entrada
    log.interactions.push(entry);
    log.interactions = log.interactions.slice(-200); // Mantém apenas últimas 200

    // Persiste
    fs.writeFileSync(INTERACTION_LOG_PATH, JSON.stringify(log, null, 2));
  } catch { /* silencioso */ }
}

// ─── Aprendizado Autônomo Offline ─────────────────────────────────────────────

export function triggerOfflineLearning(username: string, message: string, response: string, reviewScore: number): void {
  try {
    // 1. Atualiza modelo do usuário (em memória)
    updateUserModel(username, message, response, reviewScore);

    // 2. Detecta lacunas de conhecimento
    detectKnowledgeGap(message, reviewScore);

    // 3. Registra padrões de erro se necessário
    if (reviewScore < 6) {
      recordErrorPattern(message.slice(0, 100), response.slice(0, 200), 'Revisão necessária');
    }

    // 4. Salva estado cognitivo local
    saveMindStateLocal(username).catch(() => {});

    // 5. Log de interação
    logInteractionLocal(
      username,
      message,
      response,
      'unknown',
      'profissional',
      'llm',
      0,
      reviewScore
    );
  } catch { /* silencioso — aprendizado não bloqueia resposta */ }
}

// ─── Diagnóstico do Sistema Local ─────────────────────────────────────────────

export function getLocalSystemStatus(): {
  mindState: { exists: boolean; lastUpdate: string | null };
  evolutionLog: { exists: boolean; totalCycles: number };
  interactionLog: { exists: boolean; totalInteractions: number };
  evolutionaryEngine: ReturnType<typeof getEvolutionaryStatus>;
} {
  let mindExists = false;
  let mindLastUpdate: string | null = null;

  try {
    if (fs.existsSync(KRONOS_MIND_STATE_PATH)) {
      mindExists = true;
      const data = JSON.parse(fs.readFileSync(KRONOS_MIND_STATE_PATH, 'utf8'));
      const entries = Object.values(data) as any[];
      if (entries.length > 0) {
        mindLastUpdate = entries[0]?.updated_at ?? null;
      }
    }
  } catch { /* ignore */ }

  let evolutionTotal = 0;
  try {
    if (fs.existsSync(EVOLUTION_LOG_PATH)) {
      const data = JSON.parse(fs.readFileSync(EVOLUTION_LOG_PATH, 'utf8'));
      evolutionTotal = data.cycles?.length ?? 0;
    }
  } catch { /* ignore */ }

  let interactionTotal = 0;
  try {
    if (fs.existsSync(INTERACTION_LOG_PATH)) {
      const data = JSON.parse(fs.readFileSync(INTERACTION_LOG_PATH, 'utf8'));
      interactionTotal = data.interactions?.length ?? 0;
    }
  } catch { /* ignore */ }

  return {
    mindState: { exists: mindExists, lastUpdate: mindLastUpdate },
    evolutionLog: { exists: fs.existsSync(EVOLUTION_LOG_PATH), totalCycles: evolutionTotal },
    interactionLog: { exists: fs.existsSync(INTERACTION_LOG_PATH), totalInteractions: interactionTotal },
    evolutionaryEngine: getEvolutionaryStatus(),
  };
}

// ─── Inicialização ────────────────────────────────────────────────────────────

initializeStorage();

// Log de inicialização
console.log('[KronosOfflineLearner] Persistência local inicializada');
console.log(`  - Mind state: ${KRONOS_MIND_STATE_PATH}`);
console.log(`  - Evolution log: ${EVOLUTION_LOG_PATH}`);
console.log(`  - Interaction log: ${INTERACTION_LOG_PATH}`);