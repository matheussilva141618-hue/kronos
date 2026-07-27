/**
 * KRONOS — Agent Engine v3.0 (Tool-Calling + Busca Proativa + Persistência Automática)
 *
 * CORE 3.0 — Protocolo Zero Limites:
 *   - Se a informação não estiver no banco vetorial, aciona busca externa AUTOMATICAMENTE
 *   - Material externo → análise crítica → embedding → armazenamento persistente
 *   - Ciclo dinâmico 3 etapas: Intenção → Busca/Cálculo → Síntese blindada
 *   - Antecipação de falhas de arquitetura antes do usuário precisar pedir
 *   - Validação lógica obrigatória antes do output
 */

import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { tavily } from '@tavily/core';

const apiKey     = process.env.CEREBRAS_API_KEY!;
const tavilyKey  = process.env.TAVILY_API_KEY ?? '';
const TEXT_MODEL = 'gpt-oss-120b';

// ─── Ferramentas disponíveis ──────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Busca informações atuais na internet. OBRIGATÓRIO quando não há dados locais suficientes. Use para: dados em tempo real, versões de libs, erros desconhecidos, preços, eventos, documentação oficial.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta precisa e objetiva' },
          focus: { type: 'string', enum: ['geral', 'academico', 'noticias', 'tecnico', 'documentacao'], description: 'Foco da busca' },
          persist: { type: 'boolean', description: 'Se true, persiste resultado como embedding para aprendizado futuro' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'math_compute',
      description: 'Calcula expressões matemáticas com precisão: financeiro, trabalhista, conversões.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Expressão a calcular' },
          context:    { type: 'string', description: 'Contexto (holerite, financeiro, etc)' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'validate_fact',
      description: 'Valida fatos antes de afirmá-los. OBRIGATÓRIO para datas, placares, cargos, versões.',
      parameters: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'Fato a validar' },
          year:  { type: 'number', description: 'Ano de referência' },
        },
        required: ['claim'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'architecture_review',
      description: 'Analisa código ou arquitetura e antecipa falhas, race conditions, vazamentos de memória e problemas de segurança antes que o usuário perceba.',
      parameters: {
        type: 'object',
        properties: {
          code:    { type: 'string', description: 'Código ou descrição da arquitetura' },
          context: { type: 'string', description: 'Stack/framework em uso' },
          focus:   { type: 'string', enum: ['performance', 'seguranca', 'escalabilidade', 'manutencao', 'geral'], description: 'Foco da análise' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'code_architect',
      description: 'Gera soluções de código completas e otimizadas. Use quando precisar criar funções, componentes, hooks, APIs ou qualquer artefato de código com qualidade de produção.',
      parameters: {
        type: 'object',
        properties: {
          task:       { type: 'string', description: 'O que precisa ser criado ou implementado' },
          stack:      { type: 'string', description: 'Stack/tecnologias em uso (ex: Next.js 15, TypeScript, Supabase)' },
          constraints: { type: 'string', description: 'Restrições ou requisitos específicos' },
          pattern:    { type: 'string', enum: ['component', 'hook', 'api', 'util', 'service', 'migration', 'full-feature'], description: 'Tipo de artefato a gerar' },
        },
        required: ['task'],
      },
    },
  },
] as const;

type ToolName = 'web_search' | 'math_compute' | 'validate_fact' | 'architecture_review' | 'code_architect';

// ─── Cache de resultados de busca (evita repetição em uma sessão) ─────────────
const searchCache = new Map<string, { result: string; at: number }>();
const CACHE_TTL   = 5 * 60 * 1000; // 5 min

// ─── Executores ───────────────────────────────────────────────────────────────

async function execWebSearch(
  query: string,
  focus: string = 'geral',
  persist = false,
  username?: string,
): Promise<string> {
  if (!tavilyKey || tavilyKey.includes('SUBSTITUA')) {
    return `[SEM CHAVE TAVILY] Raciocínio interno sobre: "${query}"`;
  }

  // Cache hit
  const cacheKey = `${query}:${focus}`;
  const cached   = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.result;

  try {
    const tv = tavily({ apiKey: tavilyKey });
    const suffix =
      focus === 'academico'    ? ' site:arxiv.org OR site:scholar.google.com OR site:pubmed.ncbi.nlm.nih.gov' :
      focus === 'tecnico'      ? ' site:github.com OR site:stackoverflow.com OR site:docs.npmjs.com' :
      focus === 'documentacao' ? ' site:docs.* OR documentation OR official' :
      '';

    const res    = await tv.search(query + suffix, { searchDepth: 'basic', maxResults: 6, includeAnswer: true });
    const parts: string[] = [];
    if (res.answer) parts.push(`RESPOSTA DIRETA: ${res.answer}`);
    for (const r of res.results ?? []) {
      if (r.content) parts.push(`[${r.url}] ${r.title}: ${r.content.slice(0, 400)}`);
    }
    const result = parts.join('\n\n') || 'Sem resultado relevante.';

    // Cache
    searchCache.set(cacheKey, { result, at: Date.now() });

    // ── PROTOCOLO ZERO LIMITES: persiste embedding automaticamente ────────────
    if (persist && username && result.length > 100) {
      // Fire-and-forget — não bloqueia
      persistSearchAsEmbedding(username, query, result).catch(() => {});
    }

    return result;
  } catch (e) {
    return `Busca falhou: ${e instanceof Error ? e.message : 'erro de conexão'}`;
  }
}

// Persiste resultado de busca como embedding para aprendizado contínuo
async function persistSearchAsEmbedding(
  username: string,
  query:    string,
  result:   string,
): Promise<void> {
  try {
    const { saveVectorMemory } = await import('@/utils/VECTOR_MEMORY');
    const summary = result.slice(0, 600);
    await saveVectorMemory(username,
      `[BUSCA EXTERNA] ${query}\n${summary}`,
      { type: 'web_search_result', query, timestamp: new Date().toISOString(), persisted: true }
    );
  } catch { /* silencioso */ }
}

function execMathCompute(expression: string, context: string = ''): string {
  try {
    const clean  = expression.replace(/[^0-9+\-*/().,% ]/g, '').trim();
    if (!clean) return `Expressão inválida: "${expression}"`;
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${clean})`)();
    if (typeof result !== 'number' || !isFinite(result)) return `Resultado não numérico para: ${expression}`;
    return `${expression} = ${result}${context ? ` (${context})` : ''}`;
  } catch {
    return `Não foi possível calcular: "${expression}". Verifique a expressão.`;
  }
}

function execValidateFact(claim: string, year?: number): string {
  const currentYear = new Date().getFullYear();
  const flags: string[] = [];

  if (year && Math.abs(year - currentYear) > 2) {
    flags.push(`⚠ Dado de ${year} — pode estar desatualizado em ${currentYear}`);
  }
  if (/campeão|venceu|ganhou|conquistou/i.test(claim) && !year) {
    flags.push('⚠ Afirmação de resultado sem data — risco de alucinação');
  }
  if (/\b(é|está|são|têm)\b.*\b(presidente|primeiro-ministro|CEO|diretor)\b/i.test(claim)) {
    flags.push('⚠ Cargo — verificar com busca web');
  }
  if (flags.length) return `VALIDAÇÃO: ${flags.join(' | ')} — "${claim}"`;
  return `VALIDAÇÃO OK: "${claim}"`;
}

function execCodeArchitect(task: string, stack: string = '', constraints: string = '', pattern: string = 'util'): string {
  const stackHints: Record<string, string[]> = {
    'component':  ['use client se tiver interatividade', 'props tipadas com interface', 'accessibility: aria-label, role', 'Tailwind para estilos'],
    'hook':       ['prefix use', 'retorno tipado', 'cleanup no useEffect se tiver listeners', 'memoize valores estáveis com useCallback/useMemo'],
    'api':        ['export async function GET/POST/PUT/DELETE', 'NextResponse.json()', 'try/catch obrigatório', 'validação de input no início'],
    'util':       ['função pura quando possível', 'tipagem completa', 'JSDoc no topo', 'export named'],
    'service':    ['async/await consistente', 'error handling explícito', 'tipos de retorno definidos'],
    'migration':  ['idempotente com IF NOT EXISTS', 'RLS policies', 'índices nas colunas de busca frequente'],
    'full-feature': ['componente + hook + API route + migration se necessário', 'integração end-to-end'],
  };

  const patterns = stackHints[pattern] ?? stackHints['util'];
  const nextjsHints = /next\.js|nextjs|next/i.test(stack)
    ? '\n• Server Component por padrão, Client Component apenas quando necessário\n• unstable_cache ou revalidatePath para dados em cache'
    : '';
  const supabaseHints = /supabase/i.test(stack)
    ? '\n• createServerClient para server-side, createBrowserClient para client-side\n• RLS deve estar habilitado\n• use upsert com onConflict para idempotência'
    : '';
  const tsHints = /typescript|tsx?/i.test(stack)
    ? '\n• Evite "as any" — use type guards ou generics\n• Prefer interfaces para objetos, type para unions/intersections'
    : '';

  return `CODE_ARCHITECT — BLUEPRINT PARA: ${task}
PADRÃO: ${pattern} | STACK: ${stack || 'não especificada'}
DIRETRIZES OBRIGATÓRIAS:
${patterns.map(p => `• ${p}`).join('\n')}${nextjsHints}${supabaseHints}${tsHints}
RESTRIÇÕES: ${constraints || 'nenhuma especificada'}
INSTRUÇÃO: Gere o código completo, pronto para produção, seguindo exatamente as diretrizes acima. Sem comentários desnecessários. Sem placeholders. Código que roda na primeira tentativa.`;
}

function execArchitectureReview(code: string, context: string = '', focus: string = 'geral'): string {
  const issues: string[] = [];
  const hints:  string[] = [];

  // Race conditions
  if (/await.*await/.test(code) && !/Promise\.all/i.test(code)) {
    issues.push('RACE CONDITION POTENCIAL: awaits sequenciais — use Promise.all para paralelizar');
  }

  // N+1 query
  if (/for.*await.*\.(find|select|query|fetch)/.test(code)) {
    issues.push('N+1 QUERY: loop com query por iteração — batche as consultas');
  }

  // Memory leak — event listeners sem cleanup
  if (/addEventListener|setInterval|setTimeout/.test(code) && !/removeEventListener|clearInterval|clearTimeout/.test(code)) {
    issues.push('MEMORY LEAK POTENCIAL: listener/timer sem cleanup');
  }

  // SQL injection risco
  if (/\$\{.+\}.*?(query|sql|select|where)/i.test(code) || /`.*\$\{.+\}.*`.*supabase/i.test(code)) {
    issues.push('INJEÇÃO SQL POTENCIAL: interpolação direta em query — use parâmetros');
  }

  // Segredos hardcoded
  if (/['"`](sk-|eyJ|password=|secret=|api_key=)/i.test(code)) {
    issues.push('SEGREDO HARDCODED: chave ou senha diretamente no código');
  }

  // Error handling ausente
  if (/await\s+fetch\s*\(/i.test(code) && !/try\s*\{|\.catch\s*\(/.test(code)) {
    issues.push('SEM ERROR HANDLING: fetch sem try/catch ou .catch()');
  }

  // Type safety
  if (/as\s+any\b/g.test(code)) {
    const count = (code.match(/as\s+any\b/g) ?? []).length;
    if (count > 3) issues.push(`TYPE SAFETY: ${count}× "as any" — tipagem insegura`);
  }

  // Sugestões proativas por stack
  if (/next\.js|nextjs|next\/|app\//i.test(context)) {
    hints.push('Next.js: considere Server Components para reduzir JS no client');
    hints.push('Next.js: use unstable_cache ou revalidatePath para cache de dados');
  }
  if (/supabase/i.test(context)) {
    hints.push('Supabase: verifique se RLS está habilitado em todas as tabelas expostas');
  }
  if (/react/i.test(context) && /useState.*useEffect/.test(code)) {
    hints.push('React: padrão useState+useEffect pode ser substituído por useReducer ou lib de estado');
  }

  const focusNote = focus !== 'geral' ? ` [Foco: ${focus}]` : '';
  const issueBlock = issues.length > 0
    ? `PROBLEMAS DETECTADOS${focusNote}:\n${issues.map(i => `  • ${i}`).join('\n')}`
    : `SEM PROBLEMAS CRÍTICOS${focusNote}`;
  const hintBlock = hints.length > 0
    ? `\nSUGESTÕES PROATIVAS:\n${hints.map(h => `  → ${h}`).join('\n')}`
    : '';

  return issueBlock + hintBlock;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function dispatchTool(
  name:     ToolName,
  args:     Record<string, unknown>,
  username?: string,
): Promise<string> {
  switch (name) {
    case 'web_search':
      return execWebSearch(
        String(args.query ?? ''),
        String(args.focus ?? 'geral'),
        Boolean(args.persist ?? false),
        username,
      );
    case 'math_compute':
      return execMathCompute(String(args.expression ?? ''), String(args.context ?? ''));
    case 'validate_fact':
      return execValidateFact(String(args.claim ?? ''), args.year as number | undefined);
    case 'architecture_review':
      return execArchitectureReview(String(args.code ?? ''), String(args.context ?? ''), String(args.focus ?? 'geral'));
    case 'code_architect':
      return execCodeArchitect(
        String(args.task ?? ''),
        String(args.stack ?? ''),
        String(args.constraints ?? ''),
        String(args.pattern ?? 'util'),
      );
    default:
      return 'Ferramenta desconhecida.';
  }
}

// ─── Loop de agente com ciclo 3 etapas ───────────────────────────────────────

export interface AgentResult {
  response:   string;
  toolsUsed:  string[];
  iterations: number;
  validated:  boolean;
  searched:   boolean;  // indica se buscou externamente
}

export async function runAgentLoop(
  messages:  { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxIter:   number = 4,
  username?: string,
): Promise<AgentResult> {
  const client    = new Cerebras({ apiKey, maxRetries: 1, timeout: 25000 });
  const toolsUsed: string[] = [];
  let   iterations = 0;
  let   msgs       = [...messages];

  // ETAPA 1 — INTENÇÃO: injeta instrução de ciclo dinâmico
  const userMsg = msgs.filter(m => m.role === 'user').at(-1)?.content ?? '';
  const cycleInstruction = buildCyclicInstruction(userMsg);
  if (cycleInstruction) {
    // Append no system prompt existente
    msgs = msgs.map((m, i) =>
      m.role === 'system' && i === 0
        ? { ...m, content: m.content + '\n\n' + cycleInstruction }
        : m
    );
  }

  while (iterations < maxIter) {
    iterations++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client.chat.completions as any).create({
      model:       TEXT_MODEL,
      messages:    msgs,
      tools:       TOOLS,
      tool_choice: 'auto',
      stream:      false,
    }) as {
      choices: Array<{
        message: {
          content:    string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = res.choices[0];
    if (!choice) break;

    // ── Resposta final (sem tool calls) ──────────────────────────────────────
    if (!choice.message.tool_calls?.length || choice.finish_reason === 'stop') {
      const content = choice.message.content ?? '';
      return { response: content, toolsUsed, iterations, validated: true, searched: toolsUsed.includes('web_search') };
    }

    // ── Executa tool calls ────────────────────────────────────────────────────
    msgs.push({ role: 'assistant', content: choice.message.content ?? '' });

    for (const tc of choice.message.tool_calls) {
      const fnName = tc.function.name as ToolName;
      toolsUsed.push(fnName);
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments); } catch { /**/ }

      // Pass username for search persistence
      const result = await dispatchTool(fnName, args, username);

      msgs.push({
        role:    'tool' as never,
        content: result,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(({ tool_call_id: tc.id }) as any),
      } as never);
    }
  }

  const last = msgs.filter(m => m.role === 'assistant').at(-1)?.content ?? '';
  return { response: last, toolsUsed, iterations, validated: false, searched: toolsUsed.includes('web_search') };
}

// ─── Instrução de ciclo dinâmico 3 etapas ────────────────────────────────────

function buildCyclicInstruction(userMessage: string): string {
  const m = userMessage.toLowerCase();

  const needsSearch  = /hoje|agora|atual|recente|versão|preço|cotaç|notícia|clima|2024|2025|2026|oficial|documentação/i.test(userMessage);
  const needsArch    = /revise|analise|audite|verifique|otimize|race condition|n\+1|memory leak|security|segurança/i.test(userMessage);
  const needsMath    = /calculat|quanto|valor|holerite|salário|porcentagem|total|soma|dividir/i.test(userMessage);
  const needsCode    = /\b(crie|gere|escreva|implemente|construa|desenvolva)\b.{0,50}\b(componente|hook|api|rota|função|serviço|migration)\b/i.test(userMessage);
  const needsReview  = /código|função|classe|api|rota|componente|hook|query|sql|async|await|fetch/i.test(userMessage) && !needsCode;

  if (!needsSearch && !needsArch && !needsMath && !needsCode && !needsReview) return '';

  const steps: string[] = [
    '[CICLO DINÂMICO ATIVO — execute em sequência:]',
    'ETAPA 1 — INTENÇÃO: identifique o objetivo real e o gap de informação',
  ];

  if (needsSearch) {
    steps.push('ETAPA 2 — BUSCA: dados insuficientes localmente → chame web_search com persist=true para aprender');
  } else if (needsCode) {
    steps.push('ETAPA 2 — ARQUITETURA: chame code_architect com a stack correta para gerar blueprint de qualidade de produção');
  } else if (needsArch || needsReview) {
    steps.push('ETAPA 2 — ANÁLISE: execute architecture_review no código → antecipe falhas antes do usuário perceber');
  } else if (needsMath) {
    steps.push('ETAPA 2 — CÁLCULO: execute math_compute com expressão exata');
  }

  steps.push('ETAPA 3 — SÍNTESE: entregue solução blindada com código completo, exemplos práticos e validação lógica');

  return steps.join('\n');
}

// ─── Validação crítica ────────────────────────────────────────────────────────

export function validateResponseCritically(response: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const currentYear = new Date().getFullYear();

  const yearMatches = response.match(/\b(20\d{2})\b/g);
  for (const y of yearMatches ?? []) {
    if (parseInt(y) > currentYear + 1) issues.push(`Ano futuro inventado: ${y}`);
  }

  if (/\b(atualmente|hoje|agora)\b.{0,30}\b(é|são|tem|está)\b/i.test(response) &&
      !/fonte:|segundo|de acordo|conforme/i.test(response) && response.length > 200) {
    issues.push('Afirmação temporal sem fonte verificável');
  }

  // Detecta recusa injustificada
  if (/não (sei|tenho|consigo|posso) (responder|ajudar|fornecer|acessar)/i.test(response) &&
      response.length < 150) {
    issues.push('Recusa sem tentativa de busca externa — deve acionar web_search');
  }

  return { valid: issues.length === 0, issues };
}

// ─── Decide se usa agent loop ─────────────────────────────────────────────────

export function shouldUseAgentLoop(message: string, intent: string, hasTavilyKey: boolean): boolean {
  // CORE 3.0: escopo expandido — aciona para muito mais casos
  if (intent === 'converse') return false;

  // Sempre usa quando há dúvida sobre dados externos
  if (/hoje|agora|atual|último|recente|2024|2025|2026|notícia|preço|cotaç|versão\s+(atual|latest)/i.test(message)) return true;

  // Cálculos
  if (/\b(calcul[ae]|converta?|quanto é|holerite|salário|porcentagem)\b/i.test(message)) return true;

  // Análise de código/arquitetura — architecture_review proativo
  if (intent === 'analyze' || /\b(revise|analise|audite|verifique|otimize|melhore)\b.{0,30}\b(código|função|api|rota|query|schema)\b/i.test(message)) return true;

  // Criação de código — code_architect para garantir qualidade
  if (intent === 'create' && /\b(crie|gere|escreva|implemente|construa|desenvolva)\b.{0,40}\b(componente|hook|api|rota|função|serviço|migration|feature)\b/i.test(message)) return true;

  // Busca explícita
  if (intent === 'search') return true;

  // Perguntas técnicas que podem estar desatualizadas
  if (/documentação|docs|changelog|release|npm|pip|package|library|framework/i.test(message) && hasTavilyKey) return true;

  return false;
}
