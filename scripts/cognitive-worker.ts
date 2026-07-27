/**
 * KRONOS — Cognitive Worker v2.0 (Ciclo de Vida Próprio)
 *
 * Autonomous Agentic Loop:
 *   1. Varredura de projetos: detecta projetos inativos, code gaps, padrões
 *   2. Gap analysis: domínios menos cobertos recebem prioridade
 *   3. Geração + meta-cognição: conhecimento profundo com auto-crítica
 *   4. Consolidação vetorial: persiste embeddings no índice HNSW/pgvector
 *   5. Ciclo de hipóteses: gera hipóteses de melhoria para projetos ativos
 *
 * npm run cognitive:loop         → loop infinito, intervalo 300s
 * npm run cognitive:loop:fast    → 3 ciclos de 60s
 * npm run cognitive:full         → loop com varredura de projetos + hipóteses
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const CEREBRAS_KEY  = process.env.CEREBRAS_API_KEY!;
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MODEL         = 'gpt-oss-120b';
const TABLE         = 'conhecimentos_kronos';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const getArg      = (name: string, def: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const INTERVAL    = parseInt(getArg('interval', '300')) * 1000;
const MAX_CYCLES  = parseInt(getArg('cycles', '0'));
const FULL_MODE   = args.includes('--full') || args.includes('--full-mode');

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CycleResult {
  tema:         string;
  dominio:      string;
  qualityScore: number;
  hypotheses:   number;
  consolidated: number;
  durationMs:   number;
}

// ─── Domínios de conhecimento ─────────────────────────────────────────────────

const DOMAINS: Record<string, string[]> = {
  engenharia_software: [
    'Arquitetura hexagonal e ports & adapters em TypeScript',
    'Event sourcing com PostgreSQL e Supabase Realtime',
    'Zero-downtime deployments: blue-green, canary e feature flags',
    'Observabilidade com OpenTelemetry em Next.js 15',
    'Padrões de resiliência: circuit breaker, retry e bulkhead',
    'WebSockets vs SSE vs Long Polling — análise 2025',
    'Monorepos com Turborepo: estrutura e cache otimizado',
    'Segurança em APIs: JWT, OAuth 2.1 e mTLS na prática',
    'Testes de contrato com Pact em microserviços TypeScript',
    'Streaming com Server-Sent Events em Next.js App Router',
  ],
  inteligencia_artificial: [
    'RAG avançado: reranking, hybrid search e query expansion',
    'Agentes autônomos com LangGraph e planejamento hierárquico',
    'Fine-tuning com LoRA e QLoRA em LLMs menores',
    'Embeddings vetoriais: HNSW, pgvector e estratégias de indexação',
    'Prompt engineering: few-shot, CoT e self-consistency avançado',
    'Avaliação de LLMs: benchmarks MMLU, HumanEval e HELM',
    'Multimodalidade: visão + linguagem em sistemas de produção',
    'AI Safety: RLHF, Constitutional AI e DPO na prática',
    'Mixture of Experts: arquitetura e casos de uso 2025',
    'Speculative decoding e técnicas de inferência rápida',
    'Grafo de conhecimento para memória de longo prazo em agentes',
  ],
  arquitetura_sistemas: [
    'CQRS e separação de modelos de leitura e escrita no Supabase',
    'Database per service em microserviços modernos',
    'Estratégias de cache: Redis, CDN edge e stale-while-revalidate',
    'Saga pattern para transações distribuídas',
    'Chaos engineering: princípios e implementação prática',
    'Reactive systems: backpressure, flow control e Rx patterns',
    'Edge computing com Vercel Edge Functions em 2025',
  ],
  ciencia_computacao: [
    'Algoritmos de consenso distribuído: Raft e Paxos comparados',
    'Estruturas de dados avançadas: LSM Trees, B+ Trees e Bloom Filters',
    'Teoria da informação de Shannon aplicada a compressão e ML',
    'Programação funcional: monads, functors e category theory em TS',
    'Compiladores JIT: otimizações do V8 e SpiderMonkey',
    'Neurociência computacional: spiking neurons e Hebbian learning',
  ],
  mobile_frontend: [
    'Capacitor 7 com React — estratégias Android e iOS 2025',
    'React Server Components e streaming SSR em Next.js 15',
    'Animações performáticas com Framer Motion e GSAP',
    'Estado global: Zustand vs Jotai vs Redux Toolkit',
    'PWA + offline-first com Service Workers em Next.js',
  ],
};

const ALL_THEMES: [string, string][] = Object.entries(DOMAINS)
  .flatMap(([d, ts]) => ts.map(t => [t, d] as [string, string]));

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = ReturnType<typeof createClient<any>>;

function log(level: 'info' | 'warn' | 'error' | 'ok', msg: string) {
  const ts    = new Date().toLocaleTimeString('pt-BR');
  const icons = { info: '→', warn: '⚠', error: '✗', ok: '✓' };
  console.log(`${ts} [${icons[level]}] ${msg}`);
}

function clean(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{3}[\s\S]*?`{3}/g, m => m.replace(/`{3}[a-z]*\n?/g, '').replace(/`{3}/g, '').trim())
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Embedding esparso 1536D (replicado do utils para evitar importação com alias)
function generateEmbedding(text: string): number[] {
  const dim    = 1536;
  const vector = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().replace(/[^a-záéíóú0-9\s]/gi, ' ').split(/\s+/).filter(t => t.length > 2);
  for (const token of tokens) {
    let h = 5381;
    for (let i = 0; i < token.length; i++) { h = ((h << 5) + h) ^ token.charCodeAt(i); h = h >>> 0; }
    vector[h % dim] += 1;
  }
  const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vector : vector.map(v => v / mag);
}

// ─── Gap analysis: escolhe domínio menos coberto ──────────────────────────────

async function pickTheme(sb: SB): Promise<[string, string]> {
  const { data } = await sb.from(TABLE).select('topico, dominio').order('created_at', { ascending: false }).limit(200);
  const studied  = new Set((data ?? []).map((r: { topico: string }) => r.topico.slice(0, 40)));
  const counts: Record<string, number> = Object.fromEntries(Object.keys(DOMAINS).map(d => [d, 0]));
  for (const r of data ?? []) {
    const d = (r as { dominio?: string }).dominio ?? 'outro';
    counts[d] = (counts[d] ?? 0) + 1;
  }

  // Domínio com menor cobertura relativa
  const target = Object.keys(DOMAINS).reduce((a, b) =>
    (counts[a] / DOMAINS[a].length) <= (counts[b] / DOMAINS[b].length) ? a : b
  );

  const available = ALL_THEMES.filter(([t, d]) => !studied.has(t.slice(0, 40)) && d === target);
  const pool      = available.length > 0 ? available : ALL_THEMES.filter(([t]) => !studied.has(t.slice(0, 40)));
  return pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : ALL_THEMES[Math.floor(Math.random() * ALL_THEMES.length)];
}

// ─── Geração de conhecimento ──────────────────────────────────────────────────

async function generateKnowledge(cerebras: Cerebras, tema: string): Promise<string> {
  const res = await cerebras.chat.completions.create({
    model: MODEL,
    messages: [{
      role: 'user',
      content: `Especialista técnico sênior. Produza guia profundo sobre: ${tema}

CONCEITO CENTRAL
[2-3 parágrafos densos]

RELEVÂNCIA EM 2025
[contexto e adoção atual]

IMPLEMENTAÇÃO PRÁTICA
[código real ou arquitetura detalhada]

PADRÕES AVANÇADOS E ARMADILHAS
[o que sêniores sabem e iniciantes erram]

INTEGRAÇÃO COM ECOSSISTEMA MODERNO
[Next.js, Supabase, TypeScript, IA quando relevante]

Sem introduções. Conteúdo de elite.`,
    }],
    stream: false,
  }) as { choices: Array<{ message: { content: string } }> };
  return res.choices[0]?.message?.content ?? '';
}

// ─── Meta-cognição + quality score ───────────────────────────────────────────

async function metacognition(cerebras: Cerebras, tema: string, content: string): Promise<{
  score:   number;
  issues:  string[];
  refined: string;
}> {
  try {
    const res = await cerebras.chat.completions.create({
      model: MODEL,
      messages: [{
        role: 'user',
        content: `Revisor técnico tier-1. Avalie sobre "${tema}" e responda em JSON:
{"qualityScore":<1-10>,"issues":["problema 1"],"refinedSummary":"<resumo denso max 800 chars>"}

CONTEÚDO:
${content.slice(0, 3000)}`,
      }],
      stream: false,
    }) as { choices: Array<{ message: { content: string } }> };

    const raw   = res.choices[0]?.message?.content ?? '{}';
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('JSON inválido');
    const parsed = JSON.parse(match[0]);
    return {
      score:   Math.min(10, Math.max(1, Number(parsed.qualityScore ?? 7))),
      issues:  Array.isArray(parsed.issues) ? parsed.issues : [],
      refined: String(parsed.refinedSummary ?? content.slice(0, 800)),
    };
  } catch {
    return { score: 6, issues: [], refined: content.slice(0, 800) };
  }
}

// ─── Heartbeat: varre erros recentes no Supabase e gera auto-correção ────────

async function runErrorHealCycle(cerebras: Cerebras, sb: SB): Promise<number> {
  let healed = 0;
  try {
    // Busca erros recentes nos daemon_runs
    const { data: errors } = await sb
      .from('daemon_runs')
      .select('tema, status, metadata, created_at')
      .eq('status', 'error')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (!errors?.length) return 0;

    for (const err of errors as { tema: string; metadata: Record<string, unknown> }[]) {
      const errorMsg = String((err.metadata as Record<string,unknown>)?.error ?? err.tema ?? '');
      if (!errorMsg || errorMsg.length < 10) continue;

      // Gera análise de causa raiz + correção
      const res = await cerebras.chat.completions.create({
        model: MODEL,
        messages: [{
          role: 'user',
          content: `Analise este erro de sistema e forneça: causa raiz + correção específica.\n\nERRO: ${errorMsg.slice(0, 500)}\n\nResponda em JSON: {"causa":"<1 linha>","correcao":"<ação concreta>","prioridade":<1-10>}`,
        }],
        stream: false,
      }) as { choices: Array<{ message: { content: string } }> };

      const raw   = res.choices[0]?.message?.content ?? '';
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) continue;

      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.correcao && parsed.prioridade >= 7) {
          await sb.from('conhecimentos_kronos').insert({
            topico:        `[AUTO-HEAL] ${parsed.causa?.slice(0, 80) ?? 'Erro detectado'}`,
            conteudo:      `CAUSA: ${parsed.causa}\nCORREÇÃO: ${parsed.correcao}`,
            origem:        'auto_heal',
            dominio:       'self_correction',
            quality_score: parsed.prioridade,
            ciclo:         0,
          });
          healed++;
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    log('warn', `Error heal cycle: ${err instanceof Error ? err.message : err}`);
  }
  return healed;
}

// ─── Ciclo de hipóteses: analisa projetos ativos e gera melhorias ─────────────
// Varre user_projects + interaction_log e gera hipóteses de melhoria autônomas

async function runHypothesisCycle(cerebras: Cerebras, sb: SB): Promise<number> {
  if (!FULL_MODE) return 0;
  let count = 0;

  try {
    // Projetos ativos com contexto recente
    const { data: projects } = await sb
      .from('user_projects')
      .select('username, name, description, stack, last_context, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!projects?.length) return 0;

    for (const proj of projects as { username: string; name: string; description: string; stack: string[]; last_context: string; updated_at: string }[]) {
      const daysSince = (Date.now() - new Date(proj.updated_at).getTime()) / 86400000;
      if (daysSince < 1) continue; // Projeto muito recente, pula

      const hypothesis = await generateProjectHypothesis(cerebras, proj);
      if (!hypothesis) continue;

      // Salva hipótese como conhecimento especializado
      await sb.from(TABLE).insert({
        topico:           `[HIPÓTESE] ${proj.name}: ${hypothesis.title.slice(0, 80)}`,
        conteudo:         clean(hypothesis.body).slice(0, 4000),
        conteudo_refinado: hypothesis.summary.slice(0, 1000),
        origem:           'hypothesis_engine',
        dominio:          'hipoteses_projetos',
        quality_score:    hypothesis.confidence,
        ciclo:            0,
      });

      // Salva como notificação se confidence >= 8
      if (hypothesis.confidence >= 8) {
        await sb.from('agent_notifications').insert({
          username:  proj.username,
          type:      'insight',
          title:     `💡 Hipótese: ${proj.name}`,
          message:   hypothesis.summary,
          priority:  hypothesis.confidence,
          metadata:  { project: proj.name, hypothesis: hypothesis.title, type: 'autonomous_hypothesis' },
          source:    'hypothesis_engine',
        });
      }

      count++;
      await sleep(2000); // Evita rate limit
    }
  } catch (err) {
    log('warn', `Hypothesis cycle: ${err instanceof Error ? err.message : err}`);
  }

  return count;
}

async function generateProjectHypothesis(
  cerebras: Cerebras,
  proj: { name: string; description: string; stack: string[]; last_context: string }
): Promise<{ title: string; body: string; summary: string; confidence: number } | null> {
  try {
    const res = await cerebras.chat.completions.create({
      model: MODEL,
      messages: [{
        role: 'user',
        content: `Arquiteto de software sênior. Analise este projeto e gere uma hipótese de melhoria específica:

PROJETO: ${proj.name}
DESCRIÇÃO: ${proj.description}
STACK: ${(proj.stack ?? []).join(', ')}
ÚLTIMO CONTEXTO: ${proj.last_context?.slice(0, 400) || 'sem contexto'}

Gere uma hipótese de melhoria concreta. Responda em JSON:
{
  "title": "<hipótese em 1 linha, max 80 chars>",
  "body": "<análise técnica detalhada, implementação proposta, trade-offs>",
  "summary": "<resumo executivo para o usuário, max 300 chars>",
  "confidence": <1-10: confiança na hipótese>
}

Foco: performance, segurança, manutenibilidade ou feature gap detectado.
Seja específico ao stack. Sem frases genéricas.`,
      }],
      stream: false,
    }) as { choices: Array<{ message: { content: string } }> };

    const raw   = res.choices[0]?.message?.content ?? '{}';
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch { return null; }
}

// ─── Consolidação vetorial: persiste embeddings pendentes ─────────────────────

async function consolidateVectors(sb: SB): Promise<number> {
  let count = 0;
  try {
    const { data: pending } = await sb
      .from(TABLE)
      .select('id, topico, conteudo_refinado, dominio')
      .is('vectorized', null)
      .gte('quality_score', 7)
      .order('created_at', { ascending: false })
      .limit(15);

    for (const row of pending ?? []) {
      const r = row as { id: string; topico: string; conteudo_refinado: string; dominio: string };
      const content   = `[${r.dominio}] ${r.topico}\n${(r.conteudo_refinado ?? '').slice(0, 500)}`;
      const embedding = generateEmbedding(content);

      // Salva na kronos_memory com username __system__ para busca cross-domain
      await sb.from('kronos_memory').insert({
        username:  '__system__',
        content:   content.slice(0, 2000),
        embedding: `[${embedding.join(',')}]`,
        metadata:  { type: 'knowledge_vector', domain: r.dominio, knowledgeId: r.id, topic: r.topico },
      });

      // Marca como vetorizado
      await sb.from(TABLE).update({ vectorized: true }).eq('id', r.id);
      count++;
    }
  } catch (err) {
    log('warn', `Consolidação vetorial: ${err instanceof Error ? err.message : err}`);
  }
  return count;
}

// ─── Persistência do ciclo ────────────────────────────────────────────────────

async function persistKnowledge(sb: SB, tema: string, dominio: string, raw: string, refined: string, score: number, ciclo: number) {
  await sb.from(TABLE).insert({
    topico:            tema.slice(0, 200),
    conteudo:          clean(raw).slice(0, 8000),
    conteudo_refinado: clean(refined).slice(0, 2000),
    origem:            'agente_autonomo_cerebras',
    dominio,
    quality_score:     score,
    ciclo,
  });

  if (score < 8) {
    await sb.from(TABLE).insert({
      topico:        `[DIRETRIZ] ${new Date().toISOString().split('T')[0]} — ${tema.slice(0, 50)}`,
      conteudo:      `Score ${score}/10. Tema: ${tema}. Focar: implementação prática e exemplos reais.`,
      origem:        'meta_cognicao',
      dominio:       'diretrizes',
      quality_score: score,
      ciclo,
    });
  }
}

async function getCycleCount(sb: SB): Promise<number> {
  const { count } = await sb.from(TABLE).select('*', { count: 'exact', head: true });
  return (count ?? 0) + 1;
}

// ─── Log do ciclo no audit table ─────────────────────────────────────────────

async function logCycleRun(sb: SB, result: CycleResult) {
  try {
    await sb.from('daemon_runs').insert({
      daemon_type:   'cognitive_loop',
      status:        result.qualityScore >= 6 ? 'success' : 'partial',
      tema:          result.tema,
      quality_score: result.qualityScore,
      consolidated:  result.consolidated,
      duration_ms:   result.durationMs,
      metadata:      { dominio: result.dominio, hypotheses: result.hypotheses },
    });
  } catch { /* não bloqueia */ }
}

// ─── Ciclo principal ──────────────────────────────────────────────────────────

async function runCycle(cerebras: Cerebras, sb: SB, num: number): Promise<CycleResult> {
  const t0 = Date.now();
  console.log(`\n${'─'.repeat(60)}`);
  log('info', `CICLO ${num} — ${new Date().toLocaleString('pt-BR')} ${FULL_MODE ? '[FULL]' : ''}`);

  const [tema, dominio] = await pickTheme(sb);
  log('info', `Tema:    ${tema}`);
  log('info', `Domínio: ${dominio}`);

  // Geração de conhecimento
  log('info', 'Gerando conhecimento...');
  const raw = await generateKnowledge(cerebras, tema);
  if (!raw || raw.length < 200) { log('error', 'Conteúdo insuficiente.'); return { tema, dominio, qualityScore: 0, hypotheses: 0, consolidated: 0, durationMs: Date.now() - t0 }; }

  // Meta-cognição
  log('info', 'Meta-cognição...');
  const { score, issues, refined } = await metacognition(cerebras, tema, raw);
  log('info', `Score:   ${score}/10${issues.length ? ` | Issues: ${issues.slice(0, 2).join('; ')}` : ''}`);

  const ciclo = await getCycleCount(sb);
  await persistKnowledge(sb, tema, dominio, raw, refined, score, ciclo);

  // Consolidação vetorial
  log('info', 'Consolidando vetores...');
  const consolidated = await consolidateVectors(sb);
  if (consolidated > 0) log('ok', `${consolidated} embedding(s) consolidados`);

  // Ciclo de hipóteses (full mode)
  let hypotheses = 0;
  if (FULL_MODE) {
    log('info', 'Varredura de projetos + hipóteses...');
    hypotheses = await runHypothesisCycle(cerebras, sb);
    if (hypotheses > 0) log('ok', `${hypotheses} hipótese(s) gerada(s)`);

    // Heartbeat: auto-correção de erros recentes
    log('info', 'Heartbeat — varredura de erros...');
    const healed = await runErrorHealCycle(cerebras, sb);
    if (healed > 0) log('ok', `${healed} erro(s) analisado(s) e corrigido(s)`);
  }

  const result: CycleResult = { tema, dominio, qualityScore: score, hypotheses, consolidated, durationMs: Date.now() - t0 };
  await logCycleRun(sb, result);

  log('ok', `Salvo | ${result.durationMs / 1000}s | ${raw.length} chars`);
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!CEREBRAS_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Variáveis de ambiente faltando. Verifique .env.local');
    process.exit(1);
  }

  const cerebras = new Cerebras({ apiKey: CEREBRAS_KEY });
  const sb       = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) as SB;

  console.log('\n' + '═'.repeat(60));
  console.log('  KRONOS — COGNITIVE WORKER v2.0');
  console.log(`  Intervalo: ${INTERVAL / 1000}s | Ciclos: ${MAX_CYCLES || '∞'} | Modo: ${FULL_MODE ? 'FULL' : 'STANDARD'}`);
  console.log('═'.repeat(60));

  let num = 0;
  while (true) {
    num++;
    try { await runCycle(cerebras, sb, num); }
    catch (e) { log('error', `Ciclo ${num} falhou: ${e instanceof Error ? e.message : e}`); }

    if (MAX_CYCLES > 0 && num >= MAX_CYCLES) {
      log('ok', `${MAX_CYCLES} ciclos concluídos.`);
      break;
    }
    log('info', `Aguardando ${INTERVAL / 1000}s...`);
    await sleep(INTERVAL);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
