/**
 * KRONOS — Neural Loop v2.0 (Chain-of-Thought com Auto-Crítica)
 *
 * Pipeline de raciocínio em 3 camadas obrigatórias:
 *   L1 — Análise de Intenção: o que realmente foi pedido vs. o que está escrito
 *   L2 — Auto-Crítica Preditiva: "o que pode estar errado na resposta que vou dar?"
 *   L3 — Calibração de Tom: postura + estilo ideal para ESTE usuário AGORA
 *
 * Quando o usuário corrige a IA, `recordCorrectionWeight()` atualiza os pesos
 * de diretriz no Supabase e invalida a entrada correspondente no índice HNSW.
 */

import Cerebras from '@cerebras/cerebras_cloud_sdk';

const apiKey      = process.env.CEREBRAS_API_KEY;
const FAST_MODEL  = 'gpt-oss-120b';
const CoT_TIMEOUT = 2000; // ms — falha silenciosa se exceder

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface NeuralThought {
  intent:          string;
  posture:         string;
  memoryHint:      string;
  toneGuide:       string;
  selfCritique:    string;
  coherenceCheck:  string;  // L3: validação de coerência antes de responder
  directiveWeight: number;
  skipThought:     boolean;
}

export interface DirectiveWeight {
  topic:       string;
  weight:      number;   // 0-1: 1 = diretriz absolutamente confiável
  corrections: number;   // número de correções neste tópico
  lastUpdated: string;
}

// ─── Cache de pesos de diretriz em memória ────────────────────────────────────
// Persiste no Supabase periodicamente, mas mantém warm cache em memória

const directiveWeights = new Map<string, DirectiveWeight>();

function getWeight(username: string, topic: string): number {
  const key = `${username}:${topic}`;
  return directiveWeights.get(key)?.weight ?? 1.0;
}

function decayWeight(username: string, topic: string, correction: string): void {
  const key     = `${username}:${topic}`;
  const current = directiveWeights.get(key) ?? { topic, weight: 1.0, corrections: 0, lastUpdated: '' };
  const newWeight = Math.max(0.2, current.weight * 0.85); // decay de 15% por correção
  directiveWeights.set(key, {
    topic,
    weight:      newWeight,
    corrections: current.corrections + 1,
    lastUpdated: new Date().toISOString(),
  });
  console.log(`[NeuralLoop] Decay directive "${topic}" → ${newWeight.toFixed(3)} (correção: "${correction.slice(0, 40)}")`);
}

// ─── Decide se vale rodar CoT ─────────────────────────────────────────────────

function shouldRunThought(message: string, intent: string, historyLen: number): boolean {
  if (message.length < 30 && historyLen < 2) return false;
  if (/^(oi|olá|ok|certo|sim|não|obrigado|valeu|blz|tá|ótimo)\b/i.test(message.trim())) return false;
  return ['create', 'analyze', 'teach', 'search', 'vision_ui', 'vision_error', 'question', 'converse'].includes(intent);
}

// ─── L1+L2+L3: Monólogo interno com auto-crítica ─────────────────────────────

export async function runNeuralThought(
  message:       string,
  intent:        string,
  vectorContext: string,
  userStyle:     string,
  historyLen:    number,
): Promise<NeuralThought> {

  if (!shouldRunThought(message, intent, historyLen)) {
    return { intent, posture: 'direto', memoryHint: '', toneGuide: '', selfCritique: '', coherenceCheck: '', directiveWeight: 1.0, skipThought: true };
  }

  // Determina peso de confiança para o intent atual
  const username = ''; // não temos username aqui — usa peso global
  const dWeight  = getWeight(username, intent);

  const thoughtPrompt = `Você é o núcleo cognitivo interno do Kronos. Execute o pipeline de raciocínio em silêncio:

MENSAGEM: "${message.slice(0, 400)}"
INTENÇÃO DETECTADA: ${intent}
CONTEXTO VETORIAL: ${vectorContext.slice(0, 500) || 'nenhum'}
ESTILO DO USUÁRIO: ${userStyle || 'não mapeado'}
PESO DE CONFIANÇA DA DIRETRIZ: ${dWeight.toFixed(2)} (1.0 = total confiança; < 0.5 = diretriz degradada por correções)

<thought>
CAMADA 1 — INTENÇÃO REAL:
Qual é o pedido real por trás da mensagem? O que o usuário NÃO disse mas claramente precisa?

CAMADA 2 — AUTO-CRÍTICA PREDITIVA:
Que tipo de resposta eu provavelmente ia dar que estaria ERRADA ou INCOMPLETA aqui?
Exemplos: resposta muito longa, genérica, código sem contexto, tom errado, assumiu algo incorreto.

CAMADA 3 — VALIDAÇÃO DE COERÊNCIA:
A resposta que vou dar é: (a) factualmente correta? (b) diretamente útil? (c) no tom certo?
Se algum ponto falhar, como corrijo antes de responder?

CAMADA 4 — CALIBRAÇÃO:
Qual postura e tom são ideais para este usuário, neste momento, com este histórico?
</thought>

Responda APENAS em JSON (sem a tag <thought>):
{
  "intentReal": "<intenção real, 1 frase objetiva>",
  "posture": "<técnico|analítico|direto|colaborativo|pedagógico|criativo>",
  "memoryHint": "<contexto vetorial mais relevante, max 90 chars>",
  "toneGuide": "<ajuste fino de tom, max 70 chars>",
  "selfCritique": "<principal armadilha a evitar nesta resposta, max 100 chars>",
  "coherenceCheck": "<confirmação de que a resposta será factual e útil, max 80 chars>",
  "directiveWeight": ${dWeight.toFixed(2)}
}`;

  try {
    if (!apiKey) return { skipThought: true, intent: 'converse', posture: 'direto', memoryHint: '', toneGuide: '', selfCritique: '', coherenceCheck: '', directiveWeight: 0 }

    const client = new Cerebras({ apiKey, maxRetries: 0, timeout: CoT_TIMEOUT });
    const res = await client.chat.completions.create({
      model: FAST_MODEL,
      messages: [{ role: 'user', content: thoughtPrompt }],
      stream: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as { choices: Array<{ message: { content: string } }> };

    const raw   = res.choices[0]?.message?.content ?? '{}';
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('JSON não encontrado');

    const parsed = JSON.parse(match[0]);
    return {
      intent:          parsed.intentReal      ?? intent,
      posture:         parsed.posture          ?? 'direto',
      memoryHint:      parsed.memoryHint       ?? '',
      toneGuide:       parsed.toneGuide        ?? '',
      selfCritique:    parsed.selfCritique     ?? '',
      coherenceCheck:  parsed.coherenceCheck   ?? '',
      directiveWeight: parsed.directiveWeight  ?? dWeight,
      skipThought:     false,
    };
  } catch {
    return { intent, posture: 'direto', memoryHint: '', toneGuide: '', selfCritique: '', coherenceCheck: '', directiveWeight: dWeight, skipThought: true };
  }
}

// ─── Formata diretiva para o system prompt ────────────────────────────────────

export function formatThoughtDirective(thought: NeuralThought): string {
  if (thought.skipThought) return '';
  const parts: string[] = [];

  if (thought.intent && thought.intent !== 'converse') {
    parts.push(`INTENÇÃO REAL: ${thought.intent}`);
  }
  if (thought.posture) {
    parts.push(`POSTURA: ${thought.posture}`);
  }
  if (thought.memoryHint) {
    parts.push(`MEMÓRIA RELEVANTE: ${thought.memoryHint}`);
  }
  if (thought.toneGuide) {
    parts.push(`TOM: ${thought.toneGuide}`);
  }
  if (thought.selfCritique) {
    parts.push(`AUTO-CRÍTICA — EVITE: ${thought.selfCritique}`);
  }
  if (thought.coherenceCheck) {
    parts.push(`COERÊNCIA VALIDADA: ${thought.coherenceCheck}`);
  }
  if (thought.directiveWeight < 0.7) {
    parts.push(`ATENÇÃO: diretriz com peso ${thought.directiveWeight.toFixed(2)} — aplique com cautela, histórico de correções neste tópico`);
  }

  return parts.length > 0
    ? `\n\n[CALIBRAÇÃO NEURAL v2 — APLIQUE ANTES DE RESPONDER]\n${parts.join('\n')}`
    : '';
}

// ─── Registra correção e atualiza pesos de diretriz ──────────────────────────
// Chamado automaticamente quando detectCorrection() retorna isCorrection=true

export async function recordCorrectionWeight(
  username:   string,
  topic:      string,
  correction: string,
  original:   string,
): Promise<void> {
  // 1. Decay imediato em memória
  decayWeight(username, topic, correction);

  // 2. Persiste no Supabase (non-blocking)
  try {
    const { createServiceClient } = await import('@/utils/supabase/service');
    const sb = createServiceClient();

    // Upsert na tabela de pesos de diretriz
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from('directive_weights').upsert({
      username,
      topic,
      weight:      directiveWeights.get(`${username}:${topic}`)?.weight ?? 0.85,
      corrections: (directiveWeights.get(`${username}:${topic}`)?.corrections ?? 1),
      last_correction: correction.slice(0, 500),
      last_original:   original.slice(0, 500),
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'username,topic', ignoreDuplicates: false });

    // Invalida entrada HNSW para forçar re-aprendizado
    const { updateSynapticWeight } = await import('@/utils/VECTOR_MEMORY');
    await updateSynapticWeight(username, correction, 2); // boost 2x na correção
  } catch { /* não bloqueia */ }
}

// ─── Carrega pesos de diretriz do Supabase (inicialização) ───────────────────

export async function loadDirectiveWeights(username: string): Promise<void> {
  try {
    const { createServiceClient } = await import('@/utils/supabase/service');
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from('directive_weights')
      .select('topic, weight, corrections, updated_at')
      .eq('username', username);

    for (const row of data ?? []) {
      directiveWeights.set(`${username}:${row.topic}`, {
        topic:       row.topic,
        weight:      row.weight,
        corrections: row.corrections,
        lastUpdated: row.updated_at,
      });
    }
  } catch { /* warm start sem dados — usa padrão 1.0 */ }
}

// ─── Atualiza peso sináptico na memória vetorial ──────────────────────────────

export async function updateSynapticWeight(
  username: string,
  content:  string,
  boost:    number = 1,
): Promise<void> {
  try {
    const { updateSynapticWeight: uvmUpdate } = await import('@/utils/VECTOR_MEMORY');
    await uvmUpdate(username, content, boost);
  } catch { /* não bloqueia */ }
}
