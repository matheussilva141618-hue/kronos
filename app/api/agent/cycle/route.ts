/**
 * POST /api/agent/cycle   — Executa o ciclo proativo do agente autônomo
 * GET  /api/agent/cycle   — Status do ciclo (última execução, totais, daemon logs)
 * POST /api/agent/cycle?action=agentic — Autonomous Agentic Loop completo
 *
 * Header: Authorization: Bearer <COGNITIVE_LOOP_SECRET>
 * Pode ser acionado por cron job externo (Vercel Cron, GitHub Actions, etc.)
 *
 * Agentic Loop (action=agentic):
 *   1. Varre projetos ativos no Supabase
 *   2. Analisa embeddings recentes (índice HNSW)
 *   3. Cruza com conhecimento adquirido pelo cognitive worker
 *   4. Gera hipóteses de melhoria autônomas
 *   5. Persiste notificações + salva no daemon_runs
 */

import { NextResponse } from 'next/server';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { runProactiveCycle } from '@/utils/AUTONOMOUS_AGENT';
import { createServiceClient } from '@/utils/supabase/service';
import { buildKnowledgeGraph } from '@/utils/VECTOR_MEMORY';

const LOOP_SECRET = process.env.COGNITIVE_LOOP_SECRET ?? 'kronos-loop-2026';
const apiKey      = process.env.CEREBRAS_API_KEY!;

// ─── Estatísticas de ciclo em memória ────────────────────────────────────────

interface CycleStats {
  lastRun:      string | null;
  totalRuns:    number;
  lastResult:   {
    totalUsers: number;
    totalNotifications: number;
    usersProcessed: number;
    agenticHypotheses?: number;
    errors: number;
  } | null;
}

let cycleStats: CycleStats = { lastRun: null, totalRuns: 0, lastResult: null };

// ─── Autonomous Agentic Loop ─────────────────────────────────────────────────

interface AgentHypothesis {
  username:   string;
  project:    string;
  title:      string;
  body:       string;
  confidence: number;
}

async function runAgenticLoop(): Promise<{ hypotheses: AgentHypothesis[]; errors: number }> {
  const sb       = createServiceClient();
  const client   = new Cerebras({ apiKey, maxRetries: 1, timeout: 25000 });
  const results: AgentHypothesis[] = [];
  let errors = 0;

  try {
    // 1. Carrega todos os projetos ativos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: projects } = await (sb as any)
      .from('user_projects')
      .select('username, name, description, stack, last_context, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!projects?.length) return { hypotheses: [], errors: 0 };

    for (const proj of projects as {
      username: string; name: string; description: string;
      stack: string[]; last_context: string; updated_at: string;
    }[]) {
      try {
        // 2. Busca embeddings relevantes via grafo cross-domain
        const query = `${proj.name} ${proj.description} ${(proj.stack ?? []).join(' ')}`;
        const graph = await buildKnowledgeGraph(proj.username, query, 3).catch(() => null);
        const graphCtx = graph?.fusedContext
          ? `\nGRAFO DE CONHECIMENTO RELACIONADO:\n${graph.fusedContext}`
          : '';

        // 3. Gera hipótese de melhoria autônoma
        const res = await client.chat.completions.create({
          model: 'gpt-oss-120b',
          messages: [{
            role: 'user',
            content: `Arquiteto de sistemas autônomo. Analise o projeto e gere uma hipótese de melhoria específica e acionável.

PROJETO: ${proj.name}
DESCRIÇÃO: ${proj.description}
STACK: ${(proj.stack ?? []).join(', ')}
ÚLTIMO CONTEXTO: ${(proj.last_context ?? '').slice(0, 400)}${graphCtx}

Gere APENAS em JSON (sem markdown ao redor):
{
  "title": "<hipótese em 1 linha, max 80 chars, sem introdução>",
  "body": "<análise técnica + implementação proposta + trade-offs, max 600 chars>",
  "confidence": <1-10>
}

Foco: performance, segurança, feature gap ou débito técnico detectado. Seja cirúrgico.`,
          }],
          stream: false,
        }) as { choices: Array<{ message: { content: string } }> };

        const raw   = res.choices[0]?.message?.content ?? '{}';
        const match = raw.match(/\{[\s\S]*?\}/);
        if (!match) continue;

        const parsed = JSON.parse(match[0]);
        if (!parsed.title || parsed.confidence < 6) continue;

        const hypothesis: AgentHypothesis = {
          username:   proj.username,
          project:    proj.name,
          title:      parsed.title,
          body:       parsed.body ?? '',
          confidence: parsed.confidence,
        };
        results.push(hypothesis);

        // 4. Persiste como notificação se confidence >= 7
        if (parsed.confidence >= 7) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb as any).from('agent_notifications').insert({
            username:  proj.username,
            type:      'insight',
            title:     `🧠 ${proj.name}: ${parsed.title.slice(0, 60)}`,
            message:   parsed.body.slice(0, 1000),
            priority:  Math.min(10, parsed.confidence),
            metadata:  { project: proj.name, type: 'agentic_hypothesis', graphNodes: graph?.graph.length ?? 0 },
            source:    'agentic_loop',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dias
          });
        }

        // 5. Salva no cognitive knowledge base
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from('conhecimentos_kronos').insert({
          topico:           `[HIPÓTESE AUTÔNOMA] ${proj.name}: ${parsed.title.slice(0, 80)}`,
          conteudo:         parsed.body.slice(0, 4000),
          conteudo_refinado: parsed.title,
          origem:           'agentic_loop',
          dominio:          'hipoteses_projetos',
          quality_score:    parsed.confidence,
          ciclo:            0,
        });

      } catch (err) {
        errors++;
        console.error(`[AgentCycle] Agentic loop erro (${proj.name}):`, err instanceof Error ? err.message : err);
      }

      // Rate limit entre projetos
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (err) {
    errors++;
    console.error('[AgentCycle] runAgenticLoop erro:', err instanceof Error ? err.message : err);
  }

  return { hypotheses: results, errors };
}

// ─── POST — Executa o ciclo proativo ou agentic loop ─────────────────────────

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.includes(LOOP_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action    = searchParams.get('action') ?? 'proactive';
  const startedAt = Date.now();

  try {
    // ── Autonomous Agentic Loop (varredura completa de projetos) ──────────────
    if (action === 'agentic') {
      const [proactiveResult, agenticResult] = await Promise.all([
        runProactiveCycle(),
        runAgenticLoop(),
      ]);

      const combined = {
        ...proactiveResult,
        agenticHypotheses: agenticResult.hypotheses.length,
        agenticErrors:     agenticResult.errors,
        hypotheses:        agenticResult.hypotheses.map(h => ({
          project:    h.project,
          title:      h.title,
          confidence: h.confidence,
        })),
      };

      cycleStats = {
        lastRun:    new Date().toISOString(),
        totalRuns:  cycleStats.totalRuns + 1,
        lastResult: combined,
      };

      // Log no daemon_runs
      const sb = createServiceClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from('daemon_runs').insert({
        daemon_type:   'agentic_loop',
        status:        agenticResult.errors === 0 ? 'success' : 'partial',
        consolidated:  agenticResult.hypotheses.length,
        duration_ms:   Date.now() - startedAt,
        metadata:      combined,
      }).catch(() => {});

      return NextResponse.json({ success: true, action: 'agentic', ...combined, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() });
    }

    // ── Ciclo Proativo padrão ─────────────────────────────────────────────────
    const result = await runProactiveCycle();
    cycleStats   = { lastRun: new Date().toISOString(), totalRuns: cycleStats.totalRuns + 1, lastResult: result };

    return NextResponse.json({ success: true, action: 'proactive', ...result, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[AgentCycle] Erro:', msg);
    return NextResponse.json({ error: msg, durationMs: Date.now() - startedAt }, { status: 500 });
  }
}

// ─── GET — Status, histórico e daemon logs ────────────────────────────────────

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.includes(LOOP_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const sb = createServiceClient();

    // Busca os últimos 10 runs do daemon
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: runs } = await (sb as any)
      .from('daemon_runs')
      .select('daemon_type, status, quality_score, consolidated, duration_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    // Contagem de hipóteses geradas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: hypothesisCount } = await (sb as any)
      .from('conhecimentos_kronos')
      .select('*', { count: 'exact', head: true })
      .eq('origem', 'agentic_loop');

    return NextResponse.json({
      status:     cycleStats.lastRun ? 'active' : 'never_run',
      lastRun:    cycleStats.lastRun,
      totalRuns:  cycleStats.totalRuns,
      lastResult: cycleStats.lastResult,
      uptime:     cycleStats.lastRun
        ? `${Math.round((Date.now() - new Date(cycleStats.lastRun).getTime()) / 1000)}s ago`
        : null,
      daemonLogs:       (runs ?? []).slice(0, 10),
      totalHypotheses:  hypothesisCount ?? 0,
      timestamp:        new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({
      status:    cycleStats.lastRun ? 'active' : 'never_run',
      lastRun:   cycleStats.lastRun,
      totalRuns: cycleStats.totalRuns,
    });
  }
}
