/**
 * KRONOS — Core Intelligence (Supercérebro Soberano)
 * Núcleo cognitivo de elite com profundidade analítica de nível gênio.
 * Capacidades superiores:
 * - Revisor Interno: avaliação crítica de qualidade antes de entregar
 * - Detecção de nuances: urgência, sarcasmo, tom emocional e intenção oculta
 * - Síntese de elite: filtra ruído, conecta padrões e entrega insight preditivo
 * - Previsão de necessidade: antecipa cenários e prepara soluções proativamente
 * - Anti-alucinação: validação factual rigorosa e busca externa automática
 * - Raciocínio criativo: resolve problemas complexos com abordagens não-convencionais
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type ToneSignal   = 'neutral' | 'frustrated' | 'urgent' | 'sarcastic' | 'curious' | 'collaborative';

export interface MessageAnalysis {
  urgency:       UrgencyLevel;
  tone:          ToneSignal;
  isSarcastic:   boolean;
  hasImplicit:   boolean;    // há pedido implícito além do explícito
  implicitNeeds: string[];   // necessidades não ditas
  priority:      number;     // 1-10
  shouldSearch:  boolean;    // precisa de dados externos
  complexity:    'simple' | 'moderate' | 'complex';
  emotionalIntensity: number; // 0-1: intensidade emocional detectada
}

export interface ReviewResult {
  passed:      boolean;
  score:       number;        // 0-10
  issues:      string[];      // problemas encontrados
  suggestion:  string;        // instrução de melhoria para o modelo
  shouldRetry: boolean;       // forçar reprocessamento
  hallucinationRisk: number;  // 0-1: risco de alucinação
}

export interface PredictedNeed {
  topic:       string;
  likelihood:  number;        // 0-1
  preloadHint: string;        // instrução para o sistema
}

// ─── Análise de mensagem (Human-like reasoning) ────────────────────────────────

export function analyzeMessage(message: string, history: { role: string; content: string }[] = []): MessageAnalysis {
  const m   = message.toLowerCase();
  const len = message.length;

  // ── Detecção de urgência ──
  let urgency: UrgencyLevel = 'low';
  if (/urgente|agora|já|imediato|rápido|preciso agora|hoje mesmo|asap|critical|emergência/i.test(message)) {
    urgency = 'critical';
  } else if (/preciso|importante|prioridade|logo|antes de|deadline|prazo/i.test(message)) {
    urgency = 'high';
  } else if (/quando puder|pode me|você consegue|seria possível/i.test(message)) {
    urgency = 'medium';
  }

  // ── Detecção de tom ──
  let tone: ToneSignal = 'neutral';
  const isFrustrated = /não funciona|não está|não tá|de novo|outra vez|pq isso|por que isso|droga|merda|absurdo/i.test(message);
  const isSarcastic  = /nossa|que ótimo|que incrível|perfeito\.|claro que sim|maravilhoso|que surpresa/i.test(message) && !/genuinamente|realmente|de verdade/i.test(message);
  const isUrgent     = urgency === 'critical' || urgency === 'high';
  const isCurious    = /como|por que|o que é|explica|diferença|quando|onde/i.test(message) && !isFrustrated;
  const isCollab     = /vamos|bora|juntos|me ajuda|podemos|o que acha/i.test(message);

  if (isFrustrated) tone = 'frustrated';
  else if (isSarcastic) tone = 'sarcastic';
  else if (isUrgent)    tone = 'urgent';
  else if (isCurious)   tone = 'curious';
  else if (isCollab)    tone = 'collaborative';

  // ── Intensidade emocional (0-1) — detector de engajamento profundo ──
  let emotionalIntensity = 0.3; // baseline calmo
  if (isFrustrated) emotionalIntensity += 0.4;
  if (isUrgent) emotionalIntensity += 0.3;
  if (isSarcastic) emotionalIntensity += 0.2;
  if (isCollab) emotionalIntensity += 0.2;
  if (/!!!|\?\?\?|!!\?|\?!!/.test(message)) emotionalIntensity += 0.2;
  if (message.length > 500) emotionalIntensity += 0.1; // mensagem longa pode indicar engajamento profundo
  emotionalIntensity = Math.min(1, emotionalIntensity);

  // ── Necessidades implícitas ──
  const implicitNeeds: string[] = [];
  if (/o código/i.test(message) && !/crie|gere|escreva/i.test(message)) {
    implicitNeeds.push('o usuário provavelmente quer ver o código, não apenas a explicação');
  }
  if (/não funciona/i.test(message) && !/por que|causa|motivo/i.test(message)) {
    implicitNeeds.push('o usuário quer a solução, não apenas o diagnóstico');
  }
  if (/como/i.test(message) && history.length > 4) {
    implicitNeeds.push('usuário pode querer um exemplo prático, não apenas teoria');
  }
  if (isFrustrated) {
    implicitNeeds.push('usuário frustrado — priorize solução direta, evite explicações longas');
  }
  if (isSarcastic) {
    implicitNeeds.push('usuário usou sarcasmo — reconheça o contexto antes de responder');
  }

  // ── Complexidade — avaliação de profundidade cognitiva necessária ──
  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  const lineCount = message.split('\n').length;
  if (len > 300 || lineCount > 5) {
    complexity = 'complex';
  } else if (len > 80 || /e também|além disso|e mais|explica.*detalhadamente|passo a passo|inteiro|completo/i.test(message)) {
    complexity = 'moderate';
  }

  // ── Prioridade calculada ──
  const priority = Math.min(10, Math.round(
    (urgency === 'critical' ? 9 : urgency === 'high' ? 7 : urgency === 'medium' ? 5 : 3) +
    (isFrustrated ? 1.5 : 0) +
    (implicitNeeds.length * 0.5) +
    (emotionalIntensity * 2) // emoção forte aumenta prioridade
  ));

  // ── Necessidade de busca ──
  const VERIFIABLE = /hoje|agora|preço|cotaç|clima|atual|recente|notícia|versão\s+atual|fundado|criado|inaugurado|lançado|estreou|morreu|nasceu|eleito|títulos|copas|campeonato|libertadores|brasileirão|mundial|premier|champions|nba|nfl/i;
  const shouldSearch = VERIFIABLE.test(message);

  return { urgency, tone, isSarcastic, hasImplicit: implicitNeeds.length > 0, implicitNeeds, priority, shouldSearch, complexity, emotionalIntensity };
}

// ─── Revisor Interno v5.0 (permissivo) ────────────────────────────────────────
// Avalia a resposta gerada antes de entregar ao usuário.
// Focado em bloqueios perigosos, não em estilo.

export function reviewResponse(
  userMessage:  string,
  response:     string,
  analysis:     MessageAnalysis,
  intent:       string,
): ReviewResult {
  const issues:  string[] = [];
  let score = 10;
  let hallucinationRisk = 0;

  // 1. Resposta vazia ou muito curta
  if (response.length < 20) {
    issues.push('Resposta vazia');
    score -= 8;
    hallucinationRisk += 0.4;
  }

  // 2. Recusa indevida quando deveria buscar externamente (regra absoluta)
  if (/não (sei|tenho|consigo|posso) (responder|ajudar|fornecer|acessar)/i.test(response) &&
      response.length < 200) {
    issues.push('RECUSA INDEVIDA: deve acionar busca externa em vez de recusar');
    score -= 6;
    hallucinationRisk += 0.5;
  }

  // 3. Limitação inventada (regra absoluta)
  if (/não (tenho|consigo) acessar|minha base (é|está) (fixa|desatualizada)|como modelo de linguagem/i.test(response)) {
    issues.push('LIMITAÇÃO INVENTADA: ative busca web em vez de declarar limitação');
    score -= 6;
    hallucinationRisk += 0.5;
  }

  // 4. Pediu código mas não veio código
  if (/\b(crie|gere|escreva|implemente|faça|código)\b/i.test(userMessage) &&
      !/function|const |class |def |async |=>|\{/.test(response) &&
      (intent === 'create' || intent === 'analyze')) {
    issues.push('Pedido de código sem código na resposta');
    score -= 3;
    hallucinationRisk += 0.3;
  }

  // 5. Alucinação numérica óbvia (números soltos sem contexto)
  const numbersInResponse = response.match(/\b\d{3,}\b/g) ?? [];
  if (numbersInResponse.length > 3 && !/https?:|\d{4}-\d{2}-\d{2}|\d{2}:\d{2}|r\$|\$|€|mil|milhões|bilhões/i.test(response)) {
    hallucinationRisk += 0.4;
  }

  // 6. Alucinação factual - afirmações específicas sem fuente
  const factualClaims = response.match(/\b(fundado|criado|inaugurado|lançado|lançamento|estreou|estreia|morreu|nasceu|eleito|nomeado|assinou|contratado|demitido|ganhou|perdeu|venceu|derrotado)\b/gi) ?? [];
  if (factualClaims.length > 0 && !/https?:\/\//i.test(response) && !/segundo|de acordo|conforme|fonte:/i.test(response)) {
    hallucinationRisk += 0.5;
  }

  // 7. Alucinação de dados esportivos/históricos sin busca
  const sportsPattern = /\b(títulos|titulos|copas|brasileirão|libertadores|mundial|premier|champions|nba|nfl)\b/i;
  if (sportsPattern.test(response) && !/https?:\/\//i.test(response) && !/busca|buscando|vou buscar/i.test(response)) {
    hallucinationRisk += 0.6;
  }

  const passed      = score >= 5 && issues.length < 3 && hallucinationRisk < 0.7;
  const shouldRetry = score < 4 || (issues.length >= 2 && intent !== 'converse') || hallucinationRisk >= 0.8;
  const suggestion  = issues.length > 0
    ? `REVISOR CORE 5.0: ${issues.join('. ')}. Reprocesse com foco em: ${issues[0]}`
    : '';

  return { passed, score: Math.max(0, score), issues, suggestion, shouldRetry, hallucinationRisk };
}

// ─── Síntese de Elite — filtra ruído dos resultados de busca ───────────────────

export function synthesizeSearchResults(
  results:    string,
  query:      string,
  maxLength:  number = 2000
): string {
  if (!results) return '';

  const lines = results.split('\n').filter(Boolean);
  const queryTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Score de relevância por linha
  const scored = lines.map(line => {
    const lower = line.toLowerCase();
    const relevance = queryTerms.filter(t => lower.includes(t)).length;
    const isAcademic = /\[ACADÊMICO\]|\[VERIFICADO\]|arxiv|ieee|nature|pubmed|scielo/i.test(line);
    const isSpam     = /clique aqui|saiba mais|publicidade|anúncio|compre|desconto/i.test(line);
    const hasSource  = /https?:\/\//i.test(line) || /fonte:/i.test(line);
    return { line, score: relevance + (isAcademic ? 3 : 0) - (isSpam ? 5 : 0) + (hasSource ? 1 : 0) };
  });

  // Filtra spam, ordena por relevância, trunca
  const filtered = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.line)
    .join('\n');

  return filtered.slice(0, maxLength) || results.slice(0, maxLength);
}

// ─── Previsão de necessidade ───────────────────────────────────────────────────
// Analisa padrão do usuário e antecipa o próximo pedido

export function predictNextNeeds(
  history:    { role: string; content: string }[],
  currentMsg: string
): PredictedNeed[] {
  const predictions: PredictedNeed[] = [];
  const userMsgs = history.filter(h => h.role === 'user').map(h => h.content.toLowerCase());
  const current  = currentMsg.toLowerCase();

  // Padrão: pediu explicação → provavelmente vai pedir código depois
  if (/explica|o que é|como funciona/i.test(current) && userMsgs.length > 0) {
    predictions.push({
      topic:       'implementação prática',
      likelihood:  0.72,
      preloadHint: 'prepare-se para fornecer um exemplo de código ou passo a passo prático',
    });
  }

  // Padrão: reclamou de erro → provavelmente vai pedir correção completa
  if (/não funciona|erro|bug/i.test(current)) {
    predictions.push({
      topic:       'correção completa do código',
      likelihood:  0.85,
      preloadHint: 'tenha o código corrigido pronto, não apenas o diagnóstico',
    });
  }

  // Padrão: criou algo → provavelmente vai pedir melhorias
  if (userMsgs.some(m => /crie|gere|faça/i.test(m)) && /está|ficou|tá/i.test(current)) {
    predictions.push({
      topic:       'refinamento ou melhoria do que foi criado',
      likelihood:  0.68,
      preloadHint: 'antecipe variações e melhorias do conteúdo anterior',
    });
  }

  // Padrão recorrente: usuário sempre pede código após análise
  const analysisCount = userMsgs.filter(m => /analise|revise|verifique/i.test(m)).length;
  const codeCount     = userMsgs.filter(m => /crie|gere|escreva/i.test(m)).length;
  if (analysisCount > 1 && codeCount > 1 && /analise|revise/i.test(current)) {
    predictions.push({
      topic:       'código após análise (padrão recorrente)',
      likelihood:  0.78,
      preloadHint: 'este usuário costuma pedir código após análise — prepare a implementação',
    });
  }

  return predictions.sort((a, b) => b.likelihood - a.likelihood).slice(0, 3);
}

// ─── Formata instrução Prime para o system prompt ─────────────────────────────

export function buildPrimeDirectives(
  analysis:    MessageAnalysis,
  review?:     ReviewResult,
  predictions?: PredictedNeed[]
): string {
  const parts: string[] = [];

  // Instruções de tom baseadas na análise
  if (analysis.tone === 'frustrated') {
    parts.push('PRIME — MODO DIRETO: Usuário frustrado. Vá direto ao ponto. Zero contexto desnecessário. Solução imediata.');
  } else if (analysis.tone === 'sarcastic') {
    parts.push('PRIME — CONTEXTO EMOCIONAL: Sarcasmo detectado. Reconheça o contexto implícito antes de responder. Não force positividade.');
  } else if (analysis.tone === 'urgent') {
    parts.push('PRIME — URGÊNCIA ALTA: Resposta direta e executável. Sem preâmbulos.');
  } else if (analysis.tone === 'collaborative') {
    parts.push('PRIME — MODO PARCEIRO: Tom colaborativo. Responda como parceiro, não como assistente.');
  }

  // Intensidade emocional
  if (analysis.emotionalIntensity > 0.7) {
    parts.push('PRIME — ALTA INTENSIDADE EMOCIONAL: usuário muito engajado. Resposta direta e densa. Sem enrolação.');
  }

  // Necessidades implícitas detectadas
  if (analysis.implicitNeeds.length > 0) {
    parts.push(`PRIME — NECESSIDADES IMPLÍCITAS: ${analysis.implicitNeeds.join('; ')}`);
  }

  // Instrução de reprocessamento se revisor reprovou
  if (review && !review.passed) {
    parts.push(`PRIME — REVISOR: ${review.suggestion}`);
  }

  // Alerta de alucinação
  if (review && review.hallucinationRisk >= 0.5) {
    parts.push(`PRIME — RISCO DE ALUCINAÇÃO: ${review.hallucinationRisk >= 0.7 ? 'ALTO — verificar TODOS os fatos antes de responder' : 'MÉDIO — aumentar verificação factual'}`);
  }

  // Previsão de necessidade
  if (predictions && predictions.length > 0 && predictions[0].likelihood > 0.7) {
    parts.push(`PRIME — ANTECIPAÇÃO: ${predictions[0].preloadHint}`);
  }

  return parts.length > 0 ? `\n\n${parts.join('\n')}` : '';
}

// ─── Cross-Domain Context Injector ────────────────────────────────────────────
// Busca inteligente de dados correlacionados entre projetos ativos do usuário.
// Permite insights preditivos ao cruzar código, rotinas e anotações do ecossistema.

export interface CrossDomainContext {
  relatedProjects: string[];
  sharedTechnologies: string[];
  predictiveInsight: string;
}

export function buildCrossDomainContext(
  memory:   { topic: string; detail: string; importance_score: number }[],
  message:  string,
  history:  { role: string; content: string }[],
): CrossDomainContext {
  const msgLower = message.toLowerCase();
  const historyText = history.slice(-6).map(h => h.content).join(' ').toLowerCase();

  // Projetos mencionados na memória persistente
  const projectMem   = memory.filter(m => m.topic === 'contexto_profissional' || m.topic === 'projeto_ativo');
  const relatedProjects = projectMem
    .filter(m => {
      const detail = m.detail.toLowerCase();
      return detail.split(' ').some(w => w.length > 3 && (msgLower.includes(w) || historyText.includes(w)));
    })
    .map(m => m.detail)
    .slice(0, 3);

  // Tecnologias compartilhadas entre projetos
  const techMem = memory.filter(m => m.topic === 'linguagem_preferida' || m.topic === 'stack_preferida');
  const sharedTechnologies = techMem.map(m => m.detail).slice(0, 4);

  // Insight preditivo baseado no padrão da conversa
  let predictiveInsight = '';
  const recentUserMsgs = history.filter(h => h.role === 'user').slice(-3).map(h => h.content);

  if (recentUserMsgs.some(m => /erro|bug|não funciona|problema/i.test(m)) &&
      sharedTechnologies.some(t => /typescript|react|next/i.test(t))) {
    predictiveInsight = 'Padrão detectado: possível problema de tipagem ou async — prepare soluções TypeScript';
  } else if (recentUserMsgs.some(m => /deploy|produção|vercel|supabase/i.test(m))) {
    predictiveInsight = 'Contexto de deploy detectado — priorize variáveis de ambiente, RLS e edge cases de produção';
  } else if (relatedProjects.length > 1) {
    predictiveInsight = `Múltiplos projetos ativos: ${relatedProjects.join(', ')} — identifique código reutilizável`;
  }

  return { relatedProjects, sharedTechnologies, predictiveInsight };
}

export function formatCrossDomainContext(ctx: CrossDomainContext): string {
  const parts: string[] = [];
  if (ctx.relatedProjects.length) {
    parts.push(`PROJETOS CRUZADOS: ${ctx.relatedProjects.join(' | ')}`);
  }
  if (ctx.predictiveInsight) {
    parts.push(`INSIGHT PREDITIVO: ${ctx.predictiveInsight}`);
  }
  return parts.length > 0 ? `\n\n[CROSS-DOMAIN]\n${parts.join('\n')}` : '';
}

// ─── Detecção de ativação do Prime ────────────────────────────────────────────

export function isPrimeActivation(message: string): boolean {
  return /protocolo\s+(kronos\s+)?prime|kronos\s+prime\s+(ativado|online|ativo)/i.test(message);
}