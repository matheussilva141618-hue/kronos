/**
 * POST /api/cognitive-loop
 * Pipeline Cognitivo Autônomo com Meta-Cognição e Consolidação Cross-Domain.
 *
 * Ciclo completo:
 * 1. Auto-direção: escolhe tema com base em gaps no conhecimento existente
 * 2. Consulta Cerebras: gera conhecimento profundo
 * 3. Meta-cognição: critica e refina o conhecimento gerado
 * 4. Avaliação de diretrizes: propõe refinamentos para o próximo ciclo
 * 5. Persistência: salva no Supabase com score de qualidade
 *
 * Acione via cron: POST /api/cognitive-loop
 * Header: Authorization: Bearer <COGNITIVE_LOOP_SECRET>
 */

import { NextResponse } from 'next/server';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { createServiceClient } from '@/utils/supabase/service';
import { saveVectorMemory } from '@/utils/VECTOR_MEMORY';

const apiKey      = process.env.CEREBRAS_API_KEY!;
const LOOP_SECRET = process.env.COGNITIVE_LOOP_SECRET ?? 'kronos-loop-2026';
const client      = new Cerebras({ apiKey });

// ─── Banco de temas por domínio ───────────────────────────────────────────────

const THEME_DOMAINS: Record<string, string[]> = {
  'engenharia_software': [
    'Arquitetura hexagonal e ports & adapters em TypeScript',
    'Event sourcing com Supabase Realtime e PostgreSQL',
    'Design de APIs GraphQL federadas com schema stitching',
    'Zero-downtime deployments: blue-green, canary e feature flags',
    'Observabilidade com OpenTelemetry em Next.js — traces, métricas e logs',
    'Padrões de resiliência: circuit breaker, retry e bulkhead em Node.js',
    'WebSockets vs Server-Sent Events vs Polling — análise comparativa 2025',
    'Monorepos com Turborepo: estrutura, cache e CI/CD otimizado',
  ],
  'inteligencia_artificial': [
    'RAG avançado: reranking, hybrid search e query expansion',
    'Agentes autônomos com planejamento hierárquico e memória persistente',
    'Fine-tuning com LoRA aplicado a modelos de linguagem menores',
    'Embeddings vetoriais: modelos, distâncias e estratégias de indexação',
    'Prompt engineering de elite: few-shot, CoT e self-consistency',
    'Avaliação de LLMs: benchmarks, métricas e testes de alinhamento',
    'Multimodalidade: visão + linguagem em sistemas de produção',
    'AI Safety: RLHF, Constitutional AI e técnicas de alinhamento prático',
  ],
  'arquitetura_sistemas': [
    'CQRS e separação de modelos de leitura e escrita em Supabase',
    'Database per service pattern em arquiteturas de microserviços',
    'Estratégias de cache: Redis, CDN edge cache e stale-while-revalidate',
    'Saga pattern para transações distribuídas em sistemas modernos',
    'Reactive systems: backpressure, flow control e Rx patterns',
    'Segurança zero-trust: autenticação contínua e micro-segmentação',
    'Infrastructure as Code com Terraform para ambientes Supabase/Vercel',
    'Chaos engineering: princípios e implementação em sistemas Next.js',
  ],
  'ciencia_computacao': [
    'Teoria da complexidade: P vs NP e suas implicações práticas',
    'Algoritmos de consenso distribuído: Raft, Paxos e PBFT',
    'Estruturas de dados avançadas: LSM Trees, B+ Trees e Bloom Filters',
    'Teoria da informação de Shannon aplicada a compressão e criptografia',
    'Programação funcional avançada: monads, functors e category theory',
    'Concorrência e paralelismo: modelos de atores, CSP e STM',
    'Compiladores JIT: otimizações e técnicas de V8 e JavaScriptCore',
    'Neurociência computacional: modelos de spiking neurons e aprendizado Hebbian',
  ],
};

const ALL_THEMES = Object.values(THEME_DOMAINS).flat();

// ─── Auto-direção: escolhe tema com base em gaps ──────────────────────────────

async function selectThemeWithGapAnalysis(): Promise<{ tema: string; dominio: string; razao: string }> {
  const sb = createServiceClient();

  // Busca tópicos já estudados
  const { data: existing } = await sb
    .from('conhecimentos_kronos')
    .select('topico, dominio')
    .order('created_at', { ascending: false })
    .limit(100);

  const studiedTopics = (existing ?? []).map((r: { topico: string }) => r.topico.toLowerCase());
  const dominioCounts: Record<string, number> = {};

  // Conta domínios estudados
  for (const r of existing ?? []) {
    const d = (r as { dominio?: string }).dominio ?? 'outro';
    dominioCounts[d] = (dominioCounts[d] ?? 0) + 1;
  }

  // Encontra domínio com menos cobertura
  let targetDominio = 'inteligencia_artificial';
  let minCount = Infinity;
  for (const [d, themes] of Object.entries(THEME_DOMAINS)) {
    const count = dominioCounts[d] ?? 0;
    const coverage = count / themes.length;
    if (coverage < minCount) { minCount = coverage; targetDominio = d; }
  }

  // Encontra tema não estudado no domínio target
  const availableInDomain = THEME_DOMAINS[targetDominio].filter(t =>
    !studiedTopics.some(s => s.includes(t.toLowerCase().slice(0, 20)))
  );

  // Se todos estudados no domínio, expande para qualquer domínio
  const available = availableInDomain.length > 0
    ? availableInDomain
    : ALL_THEMES.filter(t => !studiedTopics.some(s => s.includes(t.toLowerCase().slice(0, 20))));

  const tema = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : ALL_THEMES[Math.floor(Math.random() * ALL_THEMES.length)];

  const razao = availableInDomain.length > 0
    ? `Domínio "${targetDominio}" tem menor cobertura (${dominioCounts[targetDominio] ?? 0} tópicos estudados)`
    : `Todos os domínios bem cobertos — explorando novo ângulo`;

  return { tema, dominio: targetDominio, razao };
}

// ─── Fase 2: Consulta profunda ao Cerebras ────────────────────────────────────

async function generateKnowledge(tema: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: 'gpt-oss-120b',
    messages: [{
      role: 'user',
      content: `Você é um especialista técnico de nível sênior/principal. Produza um guia técnico profundo sobre:

TEMA: ${tema}

Estruture assim:
CONCEITO CENTRAL
[2-3 parágrafos densos explicando o núcleo do tema]

POR QUE ISSO IMPORTA EM 2025
[contexto, adoção atual, tendências]

IMPLEMENTAÇÃO PRÁTICA
[código real, arquitetura ou pseudocódigo detalhado]

PADRÕES AVANÇADOS E ARMADILHAS
[o que especialistas sabem e iniciantes erram]

INTEGRAÇÃO COM ECOSSISTEMA MODERNO
[como conecta com Next.js, Supabase, TypeScript, IA — quando relevante]

MÉTRICAS E VALIDAÇÃO
[como medir se está sendo bem aplicado]

Seja técnico, preciso e sem enrolação. Este conteúdo vai para uma base de conhecimento de elite.`,
    }],
    stream: false,
  }) as { choices: Array<{ message: { content: string } }> };

  return res.choices[0]?.message?.content ?? '';
}

// ─── Fase 3: Meta-cognição — critica e refina ─────────────────────────────────

async function metacognitiveCritique(tema: string, rawContent: string): Promise<{
  conteudoRefinado: string;
  qualityScore: number;
  issues: string[];
  improvements: string[];
}> {
  const critiqueRes = await client.chat.completions.create({
    model: 'gpt-oss-120b',
    messages: [{
      role: 'user',
      content: `Você é um revisor técnico crítico de nível Tier-1. Avalie este conteúdo sobre "${tema}":

---
${rawContent.slice(0, 4000)}
---

Responda em JSON com esta estrutura exata:
{
  "qualityScore": <número 1-10>,
  "issues": ["problema 1", "problema 2"],
  "improvements": ["melhoria 1", "melhoria 2"],
  "refinedSummary": "<resumo técnico refinado e denso, máx 1000 chars, incorporando as melhorias>"
}

Critérios de avaliação:
- Precisão técnica (sem erros ou simplificações perigosas)
- Profundidade real (vai além do óbvio)
- Aplicabilidade prática (código/arquitetura funcional)
- Atualidade (relevante para 2025)
- Densidade informacional (máximo valor por palavra)`,
    }],
    stream: false,
  }) as { choices: Array<{ message: { content: string } }> };

  try {
    const raw   = critiqueRes.choices[0]?.message?.content ?? '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON não encontrado');
    const parsed = JSON.parse(match[0]);
    return {
      conteudoRefinado: parsed.refinedSummary ?? rawContent.slice(0, 2000),
      qualityScore:     Math.min(10, Math.max(1, parsed.qualityScore ?? 7)),
      issues:           parsed.issues ?? [],
      improvements:     parsed.improvements ?? [],
    };
  } catch {
    // Se falhar o parse, usa o conteúdo original com score médio
    return { conteudoRefinado: rawContent.slice(0, 2000), qualityScore: 6, issues: [], improvements: [] };
  }
}

// ─── Fase 4: Avaliação de diretrizes para próximo ciclo ───────────────────────

async function evaluateDirectives(tema: string, score: number, issues: string[]): Promise<string> {
  if (score >= 8 || issues.length === 0) return '';

  // Persiste diretriz de melhoria no banco para influenciar próximos ciclos
  const directive = `Ciclo anterior (${tema.slice(0, 60)}): score ${score}/10. Focar em: ${issues.slice(0, 2).join('; ')}`;
  try {
    const sb = createServiceClient();
    await sb.from('conhecimentos_kronos').insert({
      topico:  `[DIRETRIZ] ${new Date().toISOString().split('T')[0]}`,
      conteudo: directive,
      origem:   'meta_cognicao',
      dominio:  'diretrizes',
      quality_score: score,
    });
  } catch { /* não bloqueia */ }

  return directive;
}

// ─── Fase 5: Persistência ─────────────────────────────────────────────────────

async function persistKnowledge(
  topico: string,
  conteudoRaw: string,
  conteudoRefinado: string,
  dominio: string,
  qualityScore: number,
  ciclo: number,
): Promise<void> {
  const sb = createServiceClient();

  // Limpa markdown
  const clean = (text: string) => text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{3}[\s\S]*?`{3}/g, m => m.replace(/`{3}[a-z]*\n?/g, '').replace(/`{3}/g, '').trim())
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  await sb.from('conhecimentos_kronos').insert({
    topico:           topico.slice(0, 200),
    conteudo:         clean(conteudoRaw).slice(0, 8000),
    conteudo_refinado: clean(conteudoRefinado).slice(0, 2000),
    origem:           'agente_autonomo_cerebras',
    dominio,
    quality_score:    qualityScore,
    ciclo,
  });
}

async function getCycleCount(): Promise<number> {
  try {
    const sb = createServiceClient();
    const { count } = await sb.from('conhecimentos_kronos').select('*', { count: 'exact', head: true });
    return (count ?? 0) + 1;
  } catch { return 1; }
}

// ─── Fase 6: Consolidação Cross-Domain (Background Learning) ─────────────────
// Analisa interações recentes, agrupa conhecimento e gera embeddings autônomos.
// Simula consolidação de memória sem depender de comandos manuais.

async function consolidateMemoryEmbeddings(): Promise<{ consolidated: number; skipped: number }> {
  const sb = createServiceClient();
  let consolidated = 0;
  let skipped = 0;

  try {
    // 1. Busca interações recentes sem embedding vetorial consolidado
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: interactions } = await sb
      .from('interaction_log')
      .select('username, topics, mode, session_date')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!interactions?.length) return { consolidated: 0, skipped: 0 };

    // 2. Agrupa por usuário
    const byUser: Record<string, typeof interactions> = {};
    for (const row of interactions) {
      const u = (row as { username: string }).username;
      if (!byUser[u]) byUser[u] = [];
      byUser[u].push(row);
    }

    // 3. Para cada usuário, consolida tópicos em memória vetorial
    for (const [username, rows] of Object.entries(byUser)) {
      const allTopics = [...new Set(rows.flatMap((r: { topics?: string[] }) => r.topics ?? []))];
      if (allTopics.length < 2) { skipped++; continue; }

      // Verifica se já existe consolidação recente para evitar duplicata
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb as any)
        .from('kronos_memory')
        .select('id')
        .eq('username', username)
        .ilike('content', '%[CONSOLIDAÇÃO]%')
        .gte('created_at', since)
        .limit(1);

      if (existing?.length) { skipped++; continue; }

      // Cria resumo consolidado dos tópicos
      const summary = `[CONSOLIDAÇÃO AUTÔNOMA] Tópicos ativos da semana: ${allTopics.slice(0, 10).join(', ')}`;
      await saveVectorMemory(username, summary, {
        type: 'autonomous_consolidation',
        topics: allTopics,
        sessions: rows.length,
        generatedAt: new Date().toISOString(),
      });
      consolidated++;
    }

    // 4. Consolida conhecimentos do cognitive worker em vetores pesquisáveis
    const { data: knowledge } = await sb
      .from('conhecimentos_kronos')
      .select('id, topico, conteudo_refinado, dominio, quality_score')
      .gte('quality_score', 8)
      .is('vectorized', null)
      .order('created_at', { ascending: false })
      .limit(10);

    for (const kn of knowledge ?? []) {
      const k = kn as { id: string; topico: string; conteudo_refinado?: string; dominio: string; quality_score: number };
      const content = `[CONHECIMENTO:${k.dominio}] ${k.topico}\n${(k.conteudo_refinado ?? '').slice(0, 400)}`;
      // Salva como memória vetorial global (username = '__system__' para acesso cross-user)
      await saveVectorMemory('__system__', content, {
        type: 'knowledge_vector',
        domain: k.dominio,
        topic: k.topico,
        qualityScore: k.quality_score,
        knowledgeId: k.id,
      });
      // Marca como vetorizado
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('conhecimentos_kronos').update({ vectorized: true }).eq('id', k.id);
      consolidated++;
    }
  } catch (err) {
    console.error('[CognitiveLoop] consolidation erro:', err instanceof Error ? err.message : err);
  }

  return { consolidated, skipped };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.includes(LOOP_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // 1. Auto-direção
    const { tema, dominio, razao } = await selectThemeWithGapAnalysis();
    const ciclo = await getCycleCount();

    // 2. Geração de conhecimento
    const rawContent = await generateKnowledge(tema);
    if (!rawContent || rawContent.length < 200) {
      return NextResponse.json({ error: 'Conteúdo insuficiente.' }, { status: 500 });
    }

    // 3. Meta-cognição — crítica e refinamento
    const { conteudoRefinado, qualityScore, issues, improvements } = await metacognitiveCritique(tema, rawContent);

    // 4. Avaliação de diretrizes
    const directiveNote = await evaluateDirectives(tema, qualityScore, issues);

    // 5. Persistência
    await persistKnowledge(tema, rawContent, conteudoRefinado, dominio, qualityScore, ciclo);

    // 6. Consolidação cross-domain (background learning — non-blocking)
    const consolidation = await consolidateMemoryEmbeddings().catch(() => ({ consolidated: 0, skipped: 0 }));

    return NextResponse.json({
      success:     true,
      ciclo,
      tema,
      dominio,
      razao,
      qualityScore,
      issues:      issues.slice(0, 3),
      improvements: improvements.slice(0, 3),
      directive:   directiveNote || null,
      chars:       rawContent.length,
      consolidation,
      durationMs:  Date.now() - startedAt,
      timestamp:   new Date().toISOString(),
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[CognitiveLoop] Erro:', msg);
    return NextResponse.json({ error: msg, durationMs: Date.now() - startedAt }, { status: 500 });
  }
}

// GET — status e histórico
export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.includes(LOOP_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const sb = createServiceClient();
    const { data, count } = await sb
      .from('conhecimentos_kronos')
      .select('topico, dominio, quality_score, ciclo, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(20);

    // Média de qualidade
    const scores = (data ?? []).map((r: { quality_score?: number }) => r.quality_score ?? 0).filter(Boolean);
    const avgScore = scores.length ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : 'N/A';

    // Cobertura por domínio
    const dominioCoverage: Record<string, number> = {};
    for (const r of data ?? []) {
      const d = (r as { dominio?: string }).dominio ?? 'outro';
      dominioCoverage[d] = (dominioCoverage[d] ?? 0) + 1;
    }

    return NextResponse.json({
      totalCiclos:      count ?? 0,
      avgQualityScore:  avgScore,
      dominioCoverage,
      ultimosCiclos: (data ?? []).map((r: { topico: string; dominio?: string; quality_score?: number; ciclo?: number; created_at: string }) => ({
        topico:       r.topico.slice(0, 80),
        dominio:      r.dominio ?? 'outro',
        qualityScore: r.quality_score ?? 0,
        ciclo:        r.ciclo ?? 0,
        em:           r.created_at,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro' }, { status: 500 });
  }
}
