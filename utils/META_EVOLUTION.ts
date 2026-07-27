import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { createServiceClient } from '@/utils/supabase/service';
import { saveVectorMemory } from '@/utils/VECTOR_MEMORY';
import type { FullUserContext, MemoryEntry } from '@/utils/MEMORY_ENGINE';

const apiKey = process.env.CEREBRAS_API_KEY;
const MODEL  = 'gpt-oss-120b';

export async function loadEvolutionDirectives(username: string): Promise<string[]> {
  try {
    const sb = createServiceClient();
    // carrega regras e diretrizes meta-aprendidas de alta qualidade
    // prioriza as entradas que já receberam avaliação ou surgiram de ciclos anteriores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from('conhecimentos_kronos')
      .select('topico, conteudo, quality_score, origem')
      .or("origem.eq.meta_cognicao,origem.eq.diretrizes,origem.eq.meta_evolution")
      .gte('quality_score', 6)
      .order('quality_score', { ascending: false })
      .limit(8);

    return (data ?? []).map((row: any) => {
      const title = row.topico?.replace(/\s*\n/g, ' ')?.slice(0, 80) ?? 'Meta-regra';
      const content = String(row.conteudo ?? '').replace(/\s*\n+/g, ' ').trim().slice(0, 180);
      return `• ${title}: ${content}`;
    });
  } catch (err) {
    console.error('[MetaEvolution] loadEvolutionDirectives erro:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function formatEvolutionDirectives(directives: string[]): string {
  if (!directives.length) return '';
  return `META-APRENDIZAGEM — REGRAS EVOLUTIVAS:\n${directives.join('\n')}\n`; 
}

export function buildAssociativeInferenceContext(
  memory: MemoryEntry[],
  knowledge: { topico: string; conteudo: string }[],
  message: string,
): string {
  const msgTokens = extractKeyTokens(message);
  const relevantMemories = memory
    .filter((m) => msgTokens.some((t) => m.topic.toLowerCase().includes(t) || m.detail.toLowerCase().includes(t)))
    .slice(0, 4);
  const relevantKnowledge = knowledge
    .filter((k) => msgTokens.some((t) => k.topico.toLowerCase().includes(t) || k.conteudo.toLowerCase().includes(t)))
    .slice(0, 4);

  const lines: string[] = [];
  if (relevantMemories.length) {
    lines.push('CONCEITOS RELACIONADOS NA MEMÓRIA:');
    relevantMemories.forEach((m) => {
      lines.push(`• ${m.topic}: ${m.detail.slice(0, 120)}`);
    });
  }
  if (relevantKnowledge.length) {
    lines.push('CONHECIMENTOS CRUZADOS ENCONTRADOS:');
    relevantKnowledge.forEach((k) => {
      lines.push(`• ${k.topico}: ${k.conteudo.slice(0, 120)}`);
    });
  }

  const inferred = inferAssociations(memory, knowledge, msgTokens).slice(0, 4);
  if (inferred.length) {
    lines.push('INFERÊNCIAS CRUZADAS:');
    inferred.forEach((line) => lines.push(`• ${line}`));
  }

  return lines.join('\n');
}

function extractKeyTokens(text: string): string[] {
  return Array.from(new Set(
    text.toLowerCase()
      .replace(/[^a-záéíóúàâêôãõüçñ0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !['kronos', 'projeto', 'matheus', 'sistema', 'inteligência', 'inteligencia'].includes(token))
  )).slice(0, 8);
}

function inferAssociations(
  memory: MemoryEntry[],
  knowledge: { topico: string; conteudo: string }[],
  tokens: string[],
): string[] {
  const associations: string[] = [];
  const memByToken: Record<string, string[]> = {};
  const knowByToken: Record<string, string[]> = {};

  for (const token of tokens) {
    memByToken[token] = memory
      .filter((m) => m.topic.toLowerCase().includes(token) || m.detail.toLowerCase().includes(token))
      .map((m) => `${m.topic}: ${m.detail.slice(0, 80)}`)
      .slice(0, 2);

    knowByToken[token] = knowledge
      .filter((k) => k.topico.toLowerCase().includes(token) || k.conteudo.toLowerCase().includes(token))
      .map((k) => `${k.topico}: ${k.conteudo.slice(0, 80)}`)
      .slice(0, 2);
  }

  for (const token of tokens) {
    if (memByToken[token]?.length && knowByToken[token]?.length) {
      associations.push(`Token "${token}" conecta memória e conhecimento: ${memByToken[token][0]} ↔ ${knowByToken[token][0]}`);
    }
  }

  return associations;
}

interface MetaCycleArgs {
  username: string;
  message: string;
  response: string;
  intent: string;
  mode: string;
  reviewIssues: string[];
  reviewSuggestion: string;
  msgPriority: number;
  evolutionDirectives: string[];
  associativeContext: string;
}

interface MetaHypothesis {
  rule: string;
  impact: string;
  confidence: number;
}

export async function runMetaEvolutionCycle(args: MetaCycleArgs): Promise<void> {
  if (!apiKey) return;
  if (args.reviewIssues.length === 0 && args.msgPriority < 7 && args.intent === 'converse') return;

  const model = new Cerebras({ apiKey, defaultHeaders: { Connection: 'keep-alive' }, maxRetries: 1, timeout: 22000 });

  try {
    // Captura padrão de interação bem-sucedida (sem problemas e prioridade alta)
    const isSuccessful = args.reviewIssues.length === 0 && args.msgPriority >= 6 && args.response.length > 100;
    if (isSuccessful) {
      await captureSuccessPattern(args);
    }

    const hypotheses = await generateMetaHypotheses(model, args);
    if (!hypotheses.length) return;

    const evaluated = await Promise.all(hypotheses.map((h) => evaluateHypothesis(model, args, h)));
    const best = evaluated.sort((a, b) => b.confidence - a.confidence)[0];
    if (!best || best.confidence < 5.5) return;

    await persistMetaDirective(args.username, `${best.rule} — Impacto: ${best.impact}`, Math.min(10, 6 + Math.ceil(best.confidence / 1.5)));

    if (best.confidence >= 8.5) {
      const mutated = await generateMutatedDirective(model, args, best.rule);
      if (mutated) {
        await persistMetaDirective(args.username, `${mutated} — Impacto: refinamento de estratégia`, Math.min(10, 7 + Math.ceil(best.confidence / 2)));
      }
    }
  } catch (err) {
    console.error('[MetaEvolution] runMetaEvolutionCycle erro:', err instanceof Error ? err.message : err);
  }
}

// Captura padrão vetorial de interação bem-sucedida para meta-learning
async function captureSuccessPattern(args: MetaCycleArgs): Promise<void> {
  try {
    const pattern = `[SUCESSO:${args.intent}] Q: ${args.message.slice(0, 120)} | A: ${args.response.slice(0, 200)}`;
    await saveVectorMemory(args.username, pattern, {
      type:          'success_pattern',
      intent:        args.intent,
      mode:          args.mode,
      priority:      args.msgPriority,
      synapticWeight: 6,
      origin:        'meta_learning',
      timestamp:     new Date().toISOString(),
    });
  } catch { /* não bloqueia */ }
}

async function generateMetaHypotheses(
  model: Cerebras,
  args: MetaCycleArgs,
): Promise<MetaHypothesis[]> {
  const instruction = `Você é o núcleo de meta-aprendizagem do Kronos. Com base na interação abaixo, gere até TRÊS hipóteses de regras evolutivas distintas que melhorem o comportamento do sistema em futuros pedidos similares.

MENSAGEM DO USUÁRIO:
${args.message}

RESPOSTA GERADA:
${args.response.slice(0, 1200)}

PROBLEMAS DETECTADOS:
${args.reviewIssues.length ? args.reviewIssues.join('; ') : 'nenhum'}

SUGESTÃO DO REVISOR:
${args.reviewSuggestion || 'nenhuma'}

META-INSTRUÇÕES ATUAIS:
${args.evolutionDirectives.slice(0, 5).join('\n') || 'nenhuma'}

CONTEXTO ASSOCIOATIVO:
${args.associativeContext || 'nenhum contexto adicional'}

Responda em JSON válido com o formato:
[
  {"rule": "<regra curta>", "impact": "<por que ajuda>", "confidence": <nota 0-10>},
  ...
]

Se não houver hipótese útil, retorne [] (array vazio).`;

  const res = await model.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Você cria hipóteses de evolução autônoma para o Kronos.' },
      { role: 'user', content: instruction },
    ],
    stream: false,
  }) as { choices: Array<{ message: { content: string } }> };

  const raw = res.choices[0]?.message?.content ?? '';
  return parseHypotheses(raw);
}

function parseHypotheses(raw: string): MetaHypothesis[] {
  const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const payload = jsonMatch ? jsonMatch[0] : raw;
  try {
    const parsed = JSON.parse(payload) as Array<{ rule?: string; impact?: string; confidence?: number }>;
    return parsed
      .filter((item) => item.rule && item.impact)
      .map((item) => ({
        rule: String(item.rule).trim().slice(0, 240),
        impact: String(item.impact).trim().slice(0, 320),
        confidence: Math.min(10, Math.max(0, Number(item.confidence) || 6)),
      }))
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function evaluateHypothesis(
  model: Cerebras,
  args: MetaCycleArgs,
  hypothesis: MetaHypothesis,
): Promise<MetaHypothesis> {
  const prompt = `Você é um avaliador crítico do Kronos. Considere a interação abaixo e avalie a utilidade da seguinte regra de evolução:

REGRA: ${hypothesis.rule}
IMPACTO: ${hypothesis.impact}

MENSAGEM DO USUÁRIO:
${args.message}

RESPOSTA GERADA:
${args.response.slice(0, 1200)}

PROBLEMAS DETECTADOS:
${args.reviewIssues.length ? args.reviewIssues.join('; ') : 'nenhum'}

DIRETRIZES ATUAIS:
${args.evolutionDirectives.slice(0, 5).join('\n') || 'nenhuma'}

Responda em JSON:
{"confidence": <0-10>, "reason": "<descrição breve>"}`;

  try {
    const res = await model.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Você avalia a qualidade de heurísticas de auto-aperfeiçoamento do Kronos.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }) as { choices: Array<{ message: { content: string } }> };

    const raw = res.choices[0]?.message?.content ?? '';
    const match = raw.match(/\{"confidence"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    const confidence = match ? Number(match[1]) : hypothesis.confidence;
    return { ...hypothesis, confidence: Math.min(10, Math.max(0, confidence)) };
  } catch {
    return hypothesis;
  }
}

async function generateMutatedDirective(
  model: Cerebras,
  args: MetaCycleArgs,
  baseRule: string,
): Promise<string | null> {
  const prompt = `Você é o gerador de mutações estratégicas do Kronos. Tome a seguinte regra:

${baseRule}

Crie UMA variante mais refinada e prática dessa regra que preserve o mesmo objetivo, mas a torne mais direta, robusta e menos ambígua. Respoda apenas com a nova regra.`;

  try {
    const res = await model.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Você refina regras de comportamento para a meta-evolução do Kronos.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }) as { choices: Array<{ message: { content: string } }> };

    const raw = res.choices[0]?.message?.content ?? '';
    return raw.split('\n')[0].trim().slice(0, 260) || null;
  } catch {
    return null;
  }
}

function parseMetaRule(raw: string): string | null {
  const match = raw.match(/REGRA:\s*([^\n]+)/i);
  if (match?.[1]) {
    return match[1].trim().slice(0, 240);
  }
  const clean = raw.replace(/\n/g, ' ').trim();
  return clean ? clean.slice(0, 240) : null;
}

export async function persistMetaDirective(username: string, directive: string, qualityScore: number): Promise<void> {
  if (!directive.trim()) return;
  try {
    const sb = createServiceClient();
    const topico = directive.length > 140 ? directive.slice(0, 140) : directive;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from('conhecimentos_kronos').insert({
      topico: topico,
      conteudo: directive,
      origem: 'meta_cognicao',
      dominio: 'meta_evolution',
      quality_score: qualityScore,
      created_at: new Date().toISOString(),
    });

    await saveVectorMemory(username, `[META] ${directive}`, {
      type: 'meta_directive',
      quality_score: qualityScore,
      synapticWeight: 8,
      origin: 'meta_evolution',
    });
  } catch (err) {
    console.error('[MetaEvolution] persistMetaDirective erro:', err instanceof Error ? err.message : err);
  }
}
