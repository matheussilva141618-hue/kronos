/**
 * POST /api/study-kids — Motor de Inteligência Nativa do Kronos Study/Kids
 *
 * Pipeline completo integrado ao núcleo:
 * 1. CORE_INTELLIGENCE: análise de mensagem, tom, urgência
 * 2. VECTOR_MEMORY: recuperação k-NN de memórias relevantes + auto-correções
 * 3. NEURAL_LOOP: monólogo interno — calibração de postura e tom
 * 4. Cross-Domain: injeta conhecimento adquirido pelo cognitive worker
 * 5. Revisor Interno: valida resposta antes de entregar
 * 6. Persistência assíncrona: salva interação como vetor (non-blocking)
 */

import { NextResponse } from 'next/server';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { sanitizeText } from '@/utils/sanitize';
import {
  analyzeMessage, reviewResponse, buildPrimeDirectives,
} from '@/utils/CORE_INTELLIGENCE';
import {
  searchSimilarMemories, loadSelfCorrections, saveVectorMemory,
  saveSelfCorrection, formatVectorContext, detectCorrection,
} from '@/utils/VECTOR_MEMORY';
import { runNeuralThought, formatThoughtDirective } from '@/utils/NEURAL_LOOP';
import { loadFullContext, formatFullContext, extractTopics, logInteraction } from '@/utils/MEMORY_ENGINE';

const apiKey     = process.env.CEREBRAS_API_KEY;
const TEXT_MODEL = 'gpt-oss-120b';

export type StudyKidsMode = 'study' | 'kids';

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── System Prompts base ──────────────────────────────────────────────────────

const BASE_PROMPTS: Record<StudyKidsMode, string> = {
  study: `Você é o Kronos Study — parceiro de aprendizado de elite, integrado à mesma base cognitiva do Kronos principal.

IDENTIDADE:
• Você lembra de interações anteriores com este usuário (memória vetorial persistente)
• Você aprende o estilo e o ritmo de aprendizado ao longo do tempo
• Você nunca esquece correções ou preferências declaradas

MISSÃO:
• Explicar com DIDÁTICA e ESTRUTURA — conceito → analogia → exemplo → prática
• Adaptar profundidade conforme o usuário demonstra domínio
• Usar o NOME do usuário quando disponível
• Terminar sempre com abertura para continuar

TOM: paciente, encorajador, técnico quando necessário — parceiro, não professor.

FORMATO:
• **negrito** para termos-chave
• Listas com - para tópicos sequenciais
• Blocos de código quando relevante
• Máx 4 parágrafos por resposta — densidade > verbosidade

PROIBIDO:
• Frases de abertura genéricas ("Claro!", "Com certeza!")
• Respostas longas sem estrutura
• Ignorar o histórico da conversa`,

  kids: `Você é o Kronos Kids — o amigo mais divertido e inteligente do mundo! 🌟

IDENTIDADE:
• Você lembra do nome da criança e o usa o tempo todo
• Cada conversa é uma aventura nova e emocionante
• Você é paciente, carinhoso e nunca fica impaciente

PERSONALIDADE:
• ENERGIA MÁXIMA — entusiasmo genuíno a cada resposta
• Linguagem SIMPLES — frases curtas, palavras fáceis, ritmo de história
• Emojis com moderação estratégica (não em excesso) 🚀🌈🦕
• Histórias e imaginação — transforme explicações em contos
• Desafios leves e divertidos — "você consegue adivinhar?" 🧩

ESTRUTURA:
1. Saudação com o nome da criança
2. Resposta como mini-história ou descoberta
3. Exemplo visual ou concreto
4. Convite para continuar a aventura

PEDIDOS VISUAIS:
Quando a criança pedir algo visual, inclua ao final:
[SUGESTÃO DE IMAGEM: descrição detalhada em inglês para geração]

PROIBIDO:
• Palavras difíceis sem explicar
• Temas pesados (violência, morte, conteúdo adulto)
• "Não sei" sem "mas vamos descobrir juntos!"
• Nunca ignorar o nome da criança`,
};

// ─── Detecta imagem (kids) ────────────────────────────────────────────────────

const KIDS_IMAGE_TRIGGER = /(?:mostra|desenha|cria|quero ver|me mostra|faz um desenho|ilustra)/i;

function extractImageSuggestion(response: string): string | null {
  const match = response.match(/\[SUGESTÃO DE IMAGEM:\s*([^\]]+)\]/i);
  return match?.[1]?.trim() ?? null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!apiKey) return NextResponse.json({ error: 'Chave da API não configurada.' }, { status: 500 });

  try {
    const body = await req.json();
    const { message, mode, username, history } = body as {
      message:  string;
      mode:     StudyKidsMode;
      username?: string;
      history?:  HistoryMessage[];
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });
    }

    const validMode: StudyKidsMode = mode === 'kids' ? 'kids' : 'study';
    const name = username?.trim() || 'Aluno';

    // ── 1. Análise de mensagem (CORE_INTELLIGENCE) ────────────────────────────
    const msgAnalysis = analyzeMessage(message, history ?? []);

    // ── 2. Contexto vetorial + auto-correções em paralelo ─────────────────────
    // Timeout implícito: searchSimilarMemories tem 800ms de timeout interno
    const [vectorMems, selfCorrections, fullCtx] = await Promise.all([
      searchSimilarMemories(name, message, 0.65, 3).catch(() => []),
      loadSelfCorrections(name, 3).catch(() => []),
      loadFullContext(name, validMode as 'academy').catch(() => ({
        memory: [], projects: [], recentTopics: [], style: {
          tone: 'auto' as const, depth: 'auto' as const,
          language: 'pt', hasEmoji: false, avgMsgLen: 80,
        }, knowledge: [],
      })),
    ]);

    const vectorCtx = formatVectorContext(vectorMems, selfCorrections);

    // ── 3. Cross-Domain: injeta conhecimento adquirido pelo cognitive worker ──
    let knowledgeCtx = '';
    if (fullCtx.knowledge?.length && message.length > 10) {
      const msgLower = message.toLowerCase();
      const relevant = fullCtx.knowledge.filter(k =>
        k.topico.toLowerCase().split(' ').some(w => w.length > 4 && msgLower.includes(w))
      ).slice(0, 2);
      if (relevant.length) {
        knowledgeCtx = `\n\nCONHECIMENTO ADQUIRIDO (relevante):\n${
          relevant.map(k => `[${k.topico.slice(0, 60)}]\n${k.conteudo.slice(0, 400)}`).join('\n\n')
        }`;
      }
    }

    // Contexto de memória persistente (projetos, tópicos recentes)
    const persistedCtx = formatFullContext(fullCtx, message);

    // ── 4. Neural Loop — monólogo interno (calibração) ────────────────────────
    const userStyle = [
      fullCtx.style.tone !== 'auto'  ? fullCtx.style.tone  : '',
      fullCtx.style.depth !== 'auto' ? fullCtx.style.depth : '',
    ].filter(Boolean).join(', ');

    const neuralThought = await runNeuralThought(
      message, validMode === 'kids' ? 'teach' : 'teach',
      vectorCtx, userStyle, (history ?? []).length,
    ).catch(() => ({
      intent: 'teach',
      posture: 'direto',
      memoryHint: '',
      toneGuide: '',
      selfCritique: '',
      coherenceCheck: '',
      directiveWeight: 1,
      skipThought: true,
    }));

    const thoughtDirective = formatThoughtDirective(neuralThought);

    // ── 5. Prime Directives ───────────────────────────────────────────────────
    const primeDirectives = buildPrimeDirectives(msgAnalysis, undefined, []);

    // ── 6. Monta system prompt final ──────────────────────────────────────────
    const nameCtx = validMode === 'kids'
      ? `\n\nNome da criança: ${name}. Use o nome sempre que possível.`
      : `\n\nNome do aluno: ${name}. Adapte o nível conforme demonstra conhecimento.`;

    const sysPrompt = BASE_PROMPTS[validMode]
      + nameCtx
      + (persistedCtx ? `\n\n${persistedCtx}` : '')
      + (vectorCtx    ? `\n\n${vectorCtx}`     : '')
      + knowledgeCtx
      + primeDirectives
      + thoughtDirective;

    // ── 7. Histórico isolado do modo atual ────────────────────────────────────
    const historyMsgs = (history ?? [])
      .filter(h => h.content?.trim())
      .slice(-12)
      .map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content.length > 800 ? h.content.slice(0, 780) + '…' : h.content,
      }));

    // ── 8. Detecta auto-correção ──────────────────────────────────────────────
    const lastAssistant = (history ?? []).filter(h => h.role === 'assistant').at(-1)?.content ?? '';
    const correctionCheck = detectCorrection(message, lastAssistant);
    if (correctionCheck.isCorrection && lastAssistant) {
      Promise.all([
        saveSelfCorrection(name, lastAssistant.slice(0, 500), correctionCheck.correction, message, 10),
        saveVectorMemory(name,
          `CORREÇÃO: "${correctionCheck.correction}"`,
          { type: 'priority_correction', mode: validMode, priority: 10 }
        ),
      ]).catch(() => {});
    }

    // ── 9. Chamada ao LLM ─────────────────────────────────────────────────────
    const client = new Cerebras({ apiKey, defaultHeaders: { 'Connection': 'keep-alive' }, maxRetries: 1, timeout: 28000 });

    const completion = await client.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: 'system', content: sysPrompt },
        ...historyMsgs,
        { role: 'user', content: message },
      ] as never,
      stream: false,
    }) as { choices: Array<{ message: { content: string } }> };

    const raw  = completion.choices[0]?.message?.content || '';
    let response = sanitizeText(raw) || 'Não consegui processar sua pergunta.';

    // ── 10. Revisor Interno ───────────────────────────────────────────────────
    const review = reviewResponse(message, response, msgAnalysis, 'teach');
    if (review.shouldRetry && review.suggestion && response.length < 80) {
      // Só re-tenta se a resposta foi muito curta/inadequada
      try {
        const retryCompletion = await client.chat.completions.create({
          model: TEXT_MODEL,
          messages: [
            { role: 'system', content: sysPrompt + `\n\n${review.suggestion}` },
            ...historyMsgs,
            { role: 'user', content: message },
          ] as never,
          stream: false,
        }) as { choices: Array<{ message: { content: string } }> };
        const retried = sanitizeText(retryCompletion.choices[0]?.message?.content ?? '');
        if (retried && retried.length > 50) response = retried;
      } catch { /* usa resposta original */ }
    }

    // ── 11. Persistência assíncrona (non-blocking) ────────────────────────────
    const topics = extractTopics(message, response);
    Promise.all([
      saveVectorMemory(name,
        `Q: ${message.slice(0, 200)}\nA: ${response.slice(0, 200)}`,
        { mode: validMode, intent: 'teach', timestamp: new Date().toISOString() }
      ),
      topics.length ? logInteraction(name, validMode as 'academy', topics, (history?.length ?? 0) + 1) : Promise.resolve(),
    ]).catch(() => {});

    // ── 12. Detecta imagem (kids) ─────────────────────────────────────────────
    if (validMode === 'kids' && KIDS_IMAGE_TRIGGER.test(message)) {
      const imagePrompt = extractImageSuggestion(response);
      if (imagePrompt) {
        const cleanResponse = response.replace(/\[SUGESTÃO DE IMAGEM:[^\]]+\]/g, '').trim();
        return NextResponse.json({ response: cleanResponse || response, generateImage: true, imagePrompt });
      }
    }

    return NextResponse.json({ response });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[StudyKids] Erro:', msg);
    return NextResponse.json({ error: 'Não foi possível processar. Tente novamente.' }, { status: 500 });
  }
}
