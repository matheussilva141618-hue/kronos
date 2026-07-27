/**
 * KRONOS — Self-Consistency Engine
 *
 * Técnica de elite usada nos melhores sistemas de IA:
 * Para problemas complexos, gera N raciocínios independentes
 * e sintetiza o melhor — elimina alucinações, eleva precisão.
 *
 * Pesquisa Google Brain (2022): self-consistency melhora performance
 * em 10-20% em raciocínio matemático e lógico vs. greedy decoding.
 *
 * Usado APENAS em intents complexos (analyze, create, question profunda)
 * pra não adicionar latência desnecessária.
 */

import Cerebras from '@cerebras/cerebras_cloud_sdk';

const apiKey = process.env.CEREBRAS_API_KEY;
const MODEL  = 'gpt-oss-120b';

export interface ConsistencyResult {
  response:    string;
  confidence:  number; // 0-1
  consensus:   boolean;
  paths:       number; // quantos raciocínios foram gerados
}

// Gera N raciocínios independentes com temperaturas variadas
async function generatePaths(
  systemPrompt: string,
  userMessage:  string,
  n:            number,
  timeoutMs:    number,
): Promise<string[]> {
  if (!apiKey) return [];

  const client = new Cerebras({ apiKey, maxRetries: 0, timeout: timeoutMs });
  const temperatures = n === 2 ? [0.1, 0.4] : [0.1, 0.3, 0.5];

  const promises = temperatures.slice(0, n).map(temp =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: temp,
      max_tokens:  1200,
      stream:      false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).then((r: any) => r.choices[0]?.message?.content ?? '').catch(() => '')
  );

  const results = await Promise.all(promises);
  return results.filter(r => r.length > 20);
}

// Mede similaridade semântica simples entre duas strings (word overlap)
function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// Encontra o raciocínio com maior consenso entre os N caminhos
function findConsensusPath(paths: string[]): { best: string; confidence: number; consensus: boolean } {
  if (paths.length === 1) return { best: paths[0], confidence: 0.6, consensus: false };
  if (paths.length === 0) return { best: '', confidence: 0, consensus: false };

  // Calcula score de similaridade de cada caminho com todos os outros
  const scores = paths.map((path, i) => {
    const others = paths.filter((_, j) => j !== i);
    const avgSim = others.reduce((sum, other) => sum + similarity(path, other), 0) / others.length;
    return { path, score: avgSim };
  });

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const consensus = best.score >= 0.35; // 35% de sobreposição = consenso

  return {
    best:       best.path,
    confidence: Math.min(0.95, 0.5 + best.score),
    consensus,
  };
}

// Sintetiza múltiplos raciocínios em uma resposta final coesa
async function synthesizePaths(
  paths:        string[],
  userMessage:  string,
  timeoutMs:    number,
): Promise<string> {
  if (paths.length <= 1) return paths[0] ?? '';
  if (!apiKey) return paths[0];

  const client = new Cerebras({ apiKey, maxRetries: 0, timeout: timeoutMs });

  const prompt = `Você tem ${paths.length} raciocínios diferentes sobre a mesma pergunta. Sintetize o melhor, mais preciso e mais completo, eliminando contradições e mantendo o que é consistente entre eles.

PERGUNTA ORIGINAL: ${userMessage.slice(0, 300)}

${paths.map((p, i) => `RACIOCÍNIO ${i + 1}:\n${p.slice(0, 600)}`).join('\n\n---\n\n')}

SÍNTESE FINAL (direta, sem introdução, sem mencionar os raciocínios anteriores):`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client.chat.completions as any).create({
      model:       MODEL,
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens:  1500,
      stream:      false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as { choices: Array<{ message: { content: string } }> };

    return res.choices[0]?.message?.content ?? paths[0];
  } catch {
    return findConsensusPath(paths).best;
  }
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export async function runSelfConsistency(
  systemPrompt: string,
  userMessage:  string,
  intent:       string,
  complexity:   'simple' | 'moderate' | 'complex',
): Promise<ConsistencyResult | null> {
  // Só usa em casos que realmente valem o custo de latência extra
  const shouldUse =
    complexity === 'complex' &&
    ['analyze', 'create', 'question', 'teach'].includes(intent) &&
    userMessage.length > 100;

  if (!shouldUse) return null;

  const timeoutMs = 12000; // 12s por caminho
  const n = complexity === 'complex' ? 2 : 1; // máximo 2 caminhos pra não explodir latência

  const paths = await generatePaths(systemPrompt, userMessage, n, timeoutMs);
  if (paths.length === 0) return null;

  if (paths.length === 1) {
    return { response: paths[0], confidence: 0.7, consensus: false, paths: 1 };
  }

  const { best, confidence, consensus } = findConsensusPath(paths);

  // Se há bom consenso, usa o melhor caminho direto
  if (consensus && confidence >= 0.7) {
    return { response: best, confidence, consensus, paths: paths.length };
  }

  // Se divergência, sintetiza
  const synthesized = await synthesizePaths(paths, userMessage, 15000);
  return {
    response:   synthesized || best,
    confidence: 0.85,
    consensus:  true,
    paths:      paths.length,
  };
}
