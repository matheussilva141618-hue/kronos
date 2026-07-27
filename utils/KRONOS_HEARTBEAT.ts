/**
 * KRONOS — Heartbeat Engine
 * Ciclos autônomos em background — roda enquanto o servidor está de pé.
 * Não precisa de comando manual, não bloqueia requests.
 *
 * Ciclos:
 * - A cada 5 min: reflexão rápida — atualiza estado cognitivo
 * - A cada 15 min: aprendizado autônomo — busca conhecimento novo
 * - A cada 30 min: consolidação — vetoriza memórias pendentes
 */

import { getNextLearningTopic, markTopicLearned, getMindState } from './KRONOS_MIND';

let heartbeatActive = false;
let cycleCount = 0;

function log(msg: string) {
  const ts = new Date().toLocaleTimeString('pt-BR');
  console.log(`[Kronos Heartbeat ${ts}] ${msg}`);
}

// ─── Ciclo de reflexão (5 min) ────────────────────────────────────────────────
// Atualiza métricas internas e detecta o que precisa aprender

async function reflectionCycle() {
  const state = getMindState();
  const gaps  = state.knowledgeGaps.length;
  const queue = state.learningQueue.length;
  const quality = state.selfMetrics.avgResponseQuality.toFixed(1);

  if (gaps > 0 || queue > 0) {
    log(`Reflexão: ${gaps} lacunas detectadas, ${queue} na fila de aprendizado. Qualidade média: ${quality}/10`);
  }
}

// ─── Ciclo de aprendizado autônomo (15 min) ───────────────────────────────────
// Busca conhecimento sobre tópicos na fila — preenche lacunas sem intervenção humana

async function learningCycle() {
  const next = getNextLearningTopic();
  if (!next) return;

  log(`Aprendizado autônomo: iniciando estudo de "${next.topic}" (motivo: ${next.reason})`);

  try {
    const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!CEREBRAS_KEY || !SUPABASE_URL || !SUPABASE_KEY) return;

    // Chama cognitive loop interno via fetch HTTP
    const base   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const secret = process.env.COGNITIVE_LOOP_SECRET ?? 'kronos-loop-2026';

    const res = await fetch(`${base}/api/cognitive-loop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: next.topic, reason: next.reason, source: 'heartbeat' }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      markTopicLearned(next.topic);
      log(`Aprendizado concluído: "${next.topic}"`);
    }
  } catch {
    // Silencioso — não bloqueia o servidor
  }
}

// ─── Ciclo de consolidação vetorial (30 min) ──────────────────────────────────
// Vetoriza memórias pendentes no índice HNSW

async function consolidationCycle() {
  try {
    const base   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const secret = process.env.COGNITIVE_LOOP_SECRET ?? 'kronos-loop-2026';

    await fetch(`${base}/api/engine/loop`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'consolidate' }),
      signal: AbortSignal.timeout(20000),
    });

    log('Consolidação vetorial: memórias atualizadas');
  } catch { /* silencioso */ }
}

// ─── Loop principal ───────────────────────────────────────────────────────────

async function heartbeatLoop() {
  while (heartbeatActive) {
    cycleCount++;

    try {
      // Reflexão: todo ciclo
      await reflectionCycle();

      // Aprendizado: a cada 3 ciclos (15 min se ciclo = 5 min)
      if (cycleCount % 3 === 0) {
        await learningCycle();
      }

      // Consolidação: a cada 6 ciclos (30 min)
      if (cycleCount % 6 === 0) {
        await consolidationCycle();
      }
    } catch { /* nunca quebra o loop */ }

    // Aguarda 5 minutos antes do próximo ciclo
    await new Promise(r => setTimeout(r, 5 * 60 * 1000));
  }
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

export function startHeartbeat() {
  if (heartbeatActive) return;
  heartbeatActive = true;

  // Aguarda 30s após o boot antes de iniciar — deixa o servidor estabilizar
  setTimeout(() => {
    log('Heartbeat Engine ativado. Autonomia contínua iniciada.');
    heartbeatLoop().catch(() => { heartbeatActive = false; });
  }, 30 * 1000);
}

export function stopHeartbeat() {
  heartbeatActive = false;
  log('Heartbeat Engine pausado.');
}

export function getHeartbeatStatus() {
  return { active: heartbeatActive, cycles: cycleCount };
}
