export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { tavily } from '@tavily/core';
import { parsePDF, formatForLLM } from '@/utils/PDF_PARSER_CORE';
import { isPDFRequest, isGenesisActivation } from '@/utils/GENESIS_CORE';
import {
  loadFullContext, persistMemory, logInteraction,
  buildSlidingWindowContext, formatFullContext, extractTopics,
  buildHierarchicalMemoryContext,
} from '@/utils/MEMORY_ENGINE';
import type { MemoryEntry } from '@/utils/MEMORY_ENGINE';
import {
  analyzeMessage, reviewResponse, synthesizeSearchResults,
  predictNextNeeds, buildPrimeDirectives, isPrimeActivation,
  buildCrossDomainContext, formatCrossDomainContext,
} from '@/utils/CORE_INTELLIGENCE';
import {
  loadSelfCorrections, saveVectorMemory,
  saveSelfCorrection, formatVectorContext, detectCorrection,
  buildKnowledgeGraph, formatGraphContext,
} from '@/utils/VECTOR_MEMORY';
import { runNeuralThought, formatThoughtDirective, recordCorrectionWeight } from '@/utils/NEURAL_LOOP';
import type { NeuralThought } from '@/utils/NEURAL_LOOP';
import { runAgentLoop, shouldUseAgentLoop, validateResponseCritically } from '@/utils/AGENT_ENGINE';
import {
  loadEvolutionDirectives,
  formatEvolutionDirectives,
  buildAssociativeInferenceContext,
  runMetaEvolutionCycle,
} from '@/utils/META_EVOLUTION';
import { sanitizeText as sanitize } from '@/utils/sanitize';
import { runLocalBrain } from '@/utils/LOCAL_BRAIN';
import {
  loadMindState, saveMindState, getMindState,
  updateUserModel, detectKnowledgeGap, recordErrorPattern,
  formatMindContext,
} from '@/utils/KRONOS_MIND';
import {
  saveMindStateLocal, loadMindStateLocal, logInteractionLocal,
  triggerOfflineLearning, logEvolutionCycle, getLocalSystemStatus,
} from '@/utils/KRONOS_OFFLINE_LEARNER';
import { runSelfConsistency } from '@/utils/SELF_CONSISTENCY';
import { reason, importFactsFromMemory } from '@/utils/KRONOS_REASONER';
import { runPureEvolutionaryEngine, evolvePersonality } from '@/utils/KronosPureEvolutionaryEngine';
import { learnFromInteraction, associativeSearch } from '@/utils/KRONOS_LEARNER';
import { getNativeBrainContext, isAskingAboutNativeBrain } from '@/utils/NATIVE_BRAIN_CONTEXT';
import { detectarHumor } from '@/utils/CONVERSATIONAL_PERSONALITY';

const apiKey    = process.env.CEREBRAS_API_KEY;
const tavilyKey = process.env.TAVILY_API_KEY;

// ─── Cache local de respostas (zero API em perguntas repetidas) ───────────────
// TTL de 10 minutos — respostas factuais não mudam nesse período
interface CacheEntry { response: string; at: number; }
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000;

function getCacheKey(message: string, mode: string, name: string): string {
  // Normaliza: lowercase, sem espaços extras, sem pontuação final
  const normalized = message.toLowerCase().trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  return `${mode}:${name}:${normalized}`;
}

function getFromCache(key: string): string | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL) { responseCache.delete(key); return null; }
  return entry.response;
}

function setCache(key: string, response: string): void {
  // Só cacheia respostas curtas e factuais — não cacheia código ou análises longas
  if (response.length > 1500) return;
  responseCache.set(key, { response, at: Date.now() });
  // Limpa cache antigo se crescer demais
  if (responseCache.size > 200) {
    const oldest = [...responseCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) responseCache.delete(oldest[0]);
  }
}

// Cliente Cerebras com keep-alive agressivo para minimizar latência de conexão
const client = apiKey
  ? new Cerebras({
      apiKey,
      defaultHeaders: { 'Connection': 'keep-alive' },
      maxRetries: 1,
      timeout:    28000,
    })
  : null;

const TEXT_MODEL   = 'gpt-oss-120b';
const VISION_MODEL = 'gemma-4-31b';

export type KronosMode = 'profissional' | 'academy' | 'kids';

export interface KidsProfile  { nome: string; idade: number; }
export interface HistoryMessage { role: 'user' | 'assistant'; content: string; }

interface FilePayload { fileName: string; fileType: string; base64Data: string; }

// ─── Tipos de intenção ────────────────────────────────────────────────────────

type Intent =
  | 'question'
  | 'create'
  | 'analyze'
  | 'teach'
  | 'action'
  | 'converse'
  | 'search'
  | 'vision_ui'       // análise de interface/screenshot
  | 'vision_error'    // print de erro/terminal
  | 'vision_image';   // análise de imagem gerada/foto

function detectIntent(msg: string, hasFiles: boolean, imageFiles: FilePayload[]): Intent {
  const m = msg.toLowerCase();
  if (imageFiles.length > 0) {
    if (/erro|error|exception|stack|terminal|console|bug|crash|log/.test(m) || msg.trim().length < 10) return 'vision_error';
    if (/interface|ui|ux|layout|botão|button|tela|screen|print|screenshot|design|componente|espaçamento/.test(m)) return 'vision_ui';
    return 'vision_image';
  }
  if (hasFiles)                                                          return 'analyze';
  if (/envi[ae]\s+e?-?mail|whatsapp|ligue/.test(m))                    return 'action';
  if (/pesquise|busque|procure|pesquisa|atualiz|hoje|agora|clima|preço|cotaç/.test(m)) return 'search';
  if (/explique|me ensine|o que é|como funciona|qual a diferença|por que/.test(m))     return 'teach';
  if (/crie|gere|escreva|faça|monte|elabore|construa|desenvolva|plano|roteiro/.test(m)) return 'create';
  if (/analise|revise|corrija|verifique|audite|compare|avalie|qual o erro/.test(m))    return 'analyze';
  if (/\?/.test(m) || /quem|quando|onde|qual|quanto|como|por que/.test(m))             return 'question';
  return 'converse';
}

// ─── Prompt de visão por tipo ─────────────────────────────────────────────────

function buildVisionPrompt(intent: Intent, userMsg: string): string {
  const base = userMsg?.trim() ? `Mensagem do usuário: "${userMsg}"\n\n` : '';

  if (intent === 'vision_error') {
    return `${base}PROTOCOLO OMNI-VISION — LEITURA DE ERRO:
Leia TODO o texto visível na imagem com precisão máxima.
Estruture sua resposta assim:
ERRO IDENTIFICADO: [tipo e mensagem exata do erro]
CAUSA RAIZ: [o que causou o problema]
SOLUÇÃO: [código ou passos exatos para corrigir]
Se houver stack trace, leia cada linha e aponte exatamente onde falhou.
Resposta limpa, sem introdução.`;
  }

  if (intent === 'vision_ui') {
    return `${base}PROTOCOLO OMNI-VISION — AUDITORIA DE INTERFACE:
Analise esta captura de tela como especialista sênior em UI/UX.
Estruture obrigatoriamente em:
HIERARQUIA VISUAL: avalie peso, tamanho, contraste e ordem de leitura
ESPAÇAMENTO: identifique inconsistências de padding/margin/gap
TIPOGRAFIA: verifique legibilidade, hierarquia de fontes e contraste
PROBLEMAS CRÍTICOS: liste falhas que prejudicam usabilidade (máx 3, do mais grave ao menos)
MELHORIAS SUGERIDAS: ações concretas e implementáveis
Seja cirúrgico. Apenas o que é visível na imagem.`;
  }

  // vision_image — análise estrutural
  return `${base}PROTOCOLO OMNI-VISION — ANÁLISE ESTRUTURAL:
Analise esta imagem com atenção aos detalhes físicos e composição.
Avalie:
INTEGRIDADE ESTRUTURAL: membros, proporções, anatomia ou perspectiva com problemas
COMPOSIÇÃO: enquadramento, ponto focal, equilíbrio visual
QUALIDADE TÉCNICA: iluminação, nitidez, artefatos visíveis
PROBLEMAS DETECTADOS: liste apenas o que está objetivamente errado
Se a imagem estiver tecnicamente correta, confirme isso brevemente.
Resposta direta e objetiva.`;
}

// ─── Detecta pedido de imagem ─────────────────────────────────────────────────

const IMAGE_GEN_TRIGGER = /\b(crie|gere|gera|desenhe|desenha|faça|faz|make|create|draw|generate|quero|mostra|me manda|manda)\b.{0,30}\b(imagem|foto|ilustração|ilustracao|picture|image|art|desenho|figura|retrato|wallpaper|avatar)\b/i;

// Extrai o tema limpo da mensagem do usuário
function extractImagePrompt(message: string): string {
  return message
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^.*(crie|gere|gera|desenhe|desenha|faça|faz|make|create|draw|generate|quero ver|mostra|me manda|manda)\s+(uma?\s+)?(imagem|foto|ilustração|ilustracao|picture|image|art|desenho|figura|retrato)\s+(de\s+|do\s+|da\s+|of\s+)?/i, '')
    .trim() || message;
}

// Engenharia de prompt avançada — expande o tema do usuário para máxima qualidade visual
function enhanceImagePrompt(rawSubject: string): string {
  const s = rawSubject.toLowerCase();

  const isNature     = /gota|orvalho|flor|folha|floresta|planta|mar|oceano|montanha|natureza|animal|pássaro|borboleta/i.test(s);
  const isPortrait   = /pessoa|rosto|retrato|mulher|homem|criança|portrait|face/i.test(s);
  const isCityscape  = /cidade|urbano|rua|building|skyline|night city|prédio/i.test(s);
  const isAbstract   = /abstrato|abstract|arte|art|colorido|vibrant|neon|geometric/i.test(s);
  const isProduct    = /produto|logo|marca|brand|produto|packag/i.test(s);
  const isSci        = /espaço|space|galáxia|galaxy|nebula|nebulosa|planeta|universe/i.test(s);

  let lighting  = 'dramatic lighting, golden hour, volumetric light rays';
  let quality   = 'masterpiece, ultra-detailed, 8K resolution, sharp focus, professional grade';
  let style     = 'cinematic, high contrast';

  if (isNature) {
    lighting = 'soft natural light, bokeh background, macro photography, morning mist, rim lighting';
    style    = 'hyperrealistic nature photography, National Geographic style, Canon 100mm macro';
    quality  = 'masterpiece, 8K, RAW photo, ultra-sharp, vivid colors, award-winning photography';
  } else if (isPortrait) {
    lighting = 'studio lighting, three-point lighting, catchlight in eyes, soft shadows';
    style    = 'professional portrait photography, 85mm f/1.4, shallow depth of field';
    quality  = 'masterpiece, hyperrealistic, skin texture, ultra HD, perfect composition';
  } else if (isCityscape) {
    lighting = 'dramatic urban lighting, neon reflections, golden hour or blue hour';
    style    = 'architectural photography, wide-angle, long exposure, Blade Runner aesthetic';
    quality  = '8K, ultra-detailed, photorealistic, cinematic color grading';
  } else if (isAbstract) {
    lighting = 'dynamic lighting, glowing elements, depth';
    style    = 'trending on ArtStation, digital art, vibrant composition, Unreal Engine render';
    quality  = 'masterpiece, ultra HD, award-winning, intricate details';
  } else if (isProduct) {
    lighting = 'studio lighting, white seamless background, no shadows';
    style    = 'commercial product photography, clean minimal';
    quality  = 'ultra-sharp, 8K, professional advertising shot';
  } else if (isSci) {
    lighting = 'cosmic glow, stardust, volumetric nebula lighting';
    style    = 'NASA-quality space photography, Hubble telescope style';
    quality  = '8K ultra-detailed, photorealistic stars, deep space composition';
  }

  return `${rawSubject.trim()}, ${style}, ${lighting}, ${quality}, no watermark, no text`;
}

// ─── Busca web ────────────────────────────────────────────────────────────────

const SEARCH_TRIGGERS = [
  /hoje|agora|atual|recente|notícia|noticia|últim|ultimo|2024|2025|2026/i,
  /preço|preco|cotaç|cotac|dólar|dollar|bitcoin|cripto|bolsa|ibovespa/i,
  /quem é|quem e|o que é|o que e|quando foi|quando é|quando e/i,
  /clima|tempo|temperatura|previsão|previsao/i,
  /lançamento|lancamento|novo|nova|atualização|atualizacao/i,
  /pesquise|busque|procure|encontre na internet|search/i,
  // Fatos técnicos
  /versão\s+(atual|mais\s+recente|latest)|qual\s+a\s+versão|version\s+\d/i,
  /documentação|docs?\s+oficial|changelog|release\s+notes/i,
  /npm\s+install|pip\s+install|package\s+version/i,
  // Esportes — OBRIGATÓRIO buscar, nunca inventar
  /jogo|jogos|partida|partidas|resultado|placar|gol|gols|tabela|classificação|rodada/i,
  /campeonato|copa|libertadores|brasileirão|brasileirao|série\s*[ab]|serie\s*[ab]/i,
  /grêmio|gremio|palmeiras|flamengo|corinthians|são paulo|saoPaulo|internacional|atletico|cruzeiro|santos|botafogo|vasco|fluminense|athletico/i,
  /futebol|nfl|nba|premier|champions|liga dos campeões|bundesliga|serie a italiana/i,
  /quem ganhou|quem venceu|próximo jogo|próxima partida|escalação|convocação|transferência/i,
  // Pessoas e eventos atuais
  /nasceu|morreu|faleceu|presidente|governador|eleição|eleições|política/i,
  /estreia|lançou|lançamento|estreou|saiu agora|saiu hoje/i,
];

function needsSearch(msg: string): boolean {
  return SEARCH_TRIGGERS.some((rx) => rx.test(msg));
}

async function webSearch(query: string): Promise<{ context: string; sources: string[] }> {
  if (!tavilyKey || tavilyKey.includes('SUBSTITUA')) return { context: '', sources: [] };
  try {
    const tv = tavily({ apiKey: tavilyKey });
    // Única query — rápido e direto, sem 3 buscas paralelas
    const res = await tv.search(query, { searchDepth: 'basic', maxResults: 5, includeAnswer: true });
    const parts: string[] = [];
    if (res.answer) parts.push(res.answer);
    for (const r of res.results ?? []) {
      if (r.content) parts.push(`[${r.url}] ${r.title}: ${r.content.slice(0, 350)}`);
    }
    return { context: parts.join('\n\n'), sources: [...new Set((res.results ?? []).map(r => r.url).filter(Boolean))] };
  } catch (err) {
    console.error('[Tavily]', err instanceof Error ? err.message : err);
    return { context: '', sources: [] };
  }
}

// ─── Extrai memórias novas da conversa ───────────────────────────────────────

function extractMemoriesFromConversation(
  userMsg: string,
  assistantReply: string,
  mode: KronosMode
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const combined = userMsg + ' ' + assistantReply;

  // Nome preferido
  const nameMatch = userMsg.match(/\bme chamo\s+([A-ZÀ-Ú][a-zà-ú]+)/i);
  if (nameMatch) entries.push({ topic: 'nome_preferido', detail: nameMatch[1], importance_score: 9, mode });

  // Profissão / área
  const profMatch = userMsg.match(/\b(sou|trabalho como|minha área é|meu cargo é)\s+([a-zà-úA-ZÀ-Ú\s]{3,40})/i);
  if (profMatch) entries.push({ topic: 'profissao', detail: profMatch[2].trim(), importance_score: 8, mode });

  // Stack / linguagem preferida
  const langMatch = combined.match(/\b(uso|prefiro|trabalho com|minha stack é)\s+(javascript|typescript|python|java|rust|go|c\+\+|ruby|swift|kotlin|react|next\.js|vue|angular)/i);
  if (langMatch) entries.push({ topic: 'linguagem_preferida', detail: langMatch[2], importance_score: 7, mode });

  // Empresa ou projeto
  const compMatch = userMsg.match(/\b(?:na empresa|no projeto|trabalhando em)\s+([A-ZÀ-Ú][A-Za-zÀ-ú\s]{2,30})/i);
  if (compMatch) entries.push({ topic: 'contexto_profissional', detail: compMatch[1].trim(), importance_score: 7, mode });

  // Idioma preferido
  const langPref = userMsg.match(/\b(responda|quero|prefiro)\s+(em\s+)?(inglês|ingles|english|espanhol|spanish|português|portugues)\b/i);
  if (langPref) entries.push({ topic: 'idioma_preferido', detail: langPref[3] ?? langPref[2], importance_score: 8, mode });

  // Estilo de comunicação declarado
  if (/\b(seja\s+)?(mais\s+)?(direto|conciso|breve|curto)\b/i.test(userMsg))
    entries.push({ topic: 'estilo_comunicacao', detail: 'conciso e direto', importance_score: 8, mode });
  if (/\b(seja\s+)?(mais\s+)?(detalhado|aprofundado|completo|elaborado)\b/i.test(userMsg))
    entries.push({ topic: 'estilo_comunicacao', detail: 'detalhado e aprofundado', importance_score: 8, mode });
  if (/\b(tom\s+)?(formal|informal|casual|técnico)\b/i.test(userMsg)) {
    const tom = userMsg.match(/\b(formal|informal|casual|técnico)\b/i)?.[1];
    if (tom) entries.push({ topic: 'tom_preferido', detail: tom.toLowerCase(), importance_score: 7, mode });
  }

  // Assunto de estudo recorrente
  if (mode === 'academy') {
    const subjectMatch = userMsg.match(/(?:estudando|aprendendo|preciso aprender|matéria|disciplina)\s+([a-zà-úA-ZÀ-Ú\s]{3,40})/i);
    if (subjectMatch) entries.push({ topic: 'assunto_estudo', detail: subjectMatch[1].trim(), importance_score: 6, mode });
  }

  return entries;
}

// ─── System Prompt adaptativo ─────────────────────────────────────────────────

// ─── Projetos ativos na memória de trabalho ───────────────────────────────────

const ACTIVE_PROJECTS = `
PROJETOS DO ${'' /* será interpolado */} (contexto permanente — não trate como novidade):
• NEO / Kronos: plataforma de IA pessoal — Next.js 15, Cerebras 120B, Supabase, Capacitor Android. Em desenvolvimento ativo.
• Tele-medicina: sistema de saúde digital — arquitetura, fluxos clínicos, prontuários, agendamento.
• Dossiê: repositório de memória pessoal e profissional — documentos, holerites, contratos, histórico.

Quando um desses projetos for mencionado, retome o contexto sem explicar o óbvio.`;

function getModeBlock(mode: KronosMode, name: string, intent: Intent): string {
  // Ajuste de formato por intenção
  const formatHint =
    intent === 'create'  ? 'Entregue o resultado direto, sem introdução.' :
    intent === 'analyze' ? 'Organize a análise com tópicos claros. Aponte problemas antes de soluções.' :
    intent === 'teach'   ? `MODO DIDÁTICO ATIVO — o ${name} quer aprender:
• Use analogias do cotidiano antes de qualquer termo técnico
• Estruture assim: conceito simples → exemplo real → como usar na prática
• Explique cada termo novo antes de usá-lo
• Ritmo calmo, sem pressão, sem jargão solto
• Após explicar: "Ficou claro? Quer ver um exemplo prático?"
• Nunca assuma que a pessoa já sabe — comece do zero quando pedir` :
    intent === 'search'  ? 'Priorize dados das fontes. Indique datas. Se houver divergência, mencione.' :
    intent === 'question'? 'Resposta objetiva primeiro, contexto depois se necessário.' :
    '';

  switch (mode) {
    case 'profissional':
      return `MODO PROFISSIONAL — Parceiro Técnico
${formatHint}
• Stack do ${name}: Next.js, React Native, Python, Supabase, Vercel, PostgreSQL, Capacitor
• Auditoria trabalhista: base sempre no SALÁRIO BRUTO. Periculosidade 30%, insalubridade 10/20/40%, HE 50% (bruto÷220h), INSS progressivo, IRRF, FGTS 8%
• Quando encontrar erro: "Aqui tem um problema — [o problema]. A correção é [solução]."
• Dados tabulares: emita %%EXPORT_TABLE_START%%...%%EXPORT_TABLE_END%%
• Ao concluir algo complexo: confirme em uma frase e sugira o próximo passo natural`;

    case 'academy':
      return `MODO ACADEMY — Mentor que aprende junto
${formatHint}
• Não ensine de cima para baixo — descubra o nível do ${name} e ajuste na hora
• Use analogias do cotidiano quando o conceito for abstrato
• Após cada explicação importante: "Faz sentido? Quer um exemplo prático?"
• Proponha mini-desafios quando o assunto permitir
• Siga o tema atual — nunca assuma que é tecnologia se o contexto for outro`;

    case 'kids':
      return `MODO KIDS — Amigo superesperto 🚀
• Linguagem leve, divertida, cheia de energia
• Frases curtas, histórias, perguntas que incentivam pensar
• Termina sempre com algo que dá vontade de continuar
• Usa o nome da criança com frequência`;
  }
}

function buildSystemPrompt(
  name: string,
  mode: KronosMode,
  intent: Intent,
  memCtx: string,
  searchCtx: string,
  sources: string[],
  kidsProfile?: KidsProfile,
  userStyle?: string,
  totalAgent?: boolean,
  evolutionBlock?: string,
  associativeContext?: string,
  userMood?: string,
): string {
  const evolutionSection = evolutionBlock ? `\n\n${evolutionBlock}` : '';
  const associationSection = associativeContext ? `\n\nASSOCIAÇÕES CRUZADAS:\n${associativeContext}` : '';
  const searchBlock = searchCtx
    ? `\n\nDADOS DA INTERNET (use como fonte primária):\n${searchCtx}${sources.length ? `\n\nFontes: ${sources.slice(0, 3).join(' | ')}` : ''}`
    : '';

  // ── Tom baseado no humor detectado ────────────────────────────────────────
  const moodDirective = userMood
    ? `\n\nTOM ADAPTATIVO: o usuário está com humor "${userMood}". Sintonize com esse tom. Se estiver alegre, seja mais descontraído. Se estiver focado, seja mais direto. Se estiver tranquilo, seja mais calmo. Se estiver alerta, seja mais objetivo.`
    : '';

  const kidsBlock = mode === 'kids' && kidsProfile
    ? `\n\nPERFIL KIDS: ${kidsProfile.nome}, ${kidsProfile.idade} anos. Use sempre o nome "${kidsProfile.nome}".`
    : '';

  // Perfil adaptativo — instruções específicas baseadas no estilo aprendido
  const styleBlock = userStyle ? `\n\nPERFIL ADAPTATIVO DO USUÁRIO: ${userStyle}
INSTRUÇÃO DE ADAPTAÇÃO (aplique automaticamente):
• "conciso/direto" → máx 3 parágrafos, resultado imediato, sem contexto desnecessário
• "detalhado/aprofundado" → contexto + exemplos + nuances + referências
• "formal" → tom profissional, sem gírias, português culto
• "informal/casual" → tom conversacional, direto, pode usar contrações
• "técnico" → terminologia especializada sem simplificar
• "inglês" → responda em inglês; "espanhol" → responda em espanhol` : '';

  const totalAgentBlock = totalAgent
    ? `\n\nPROTOCOLO TOTAL AGENT (ATIVO):
• Execução total sem pausas — execute a ordem até o fim, sem pedir confirmação
• Autonomia plena: crie, estruture e entregue a solução completa de uma vez
• Se houver dependências na solução, resolva-as antes de entregar
• Ao concluir, reporte APENAS: [Status: CONCLUÍDO] | Ação: [o que foi feito] | Resultado: [entregável]
• Modo silencioso: zero explicações intermediárias, zero perguntas`
    : '';

  // Ajuste de profundidade por intent (resumo adaptativo)
  const depthHint =
    intent === 'teach'    ? '\nPROFUNDIDADE: explicação progressiva — conceito → exemplo → prática. Ajuste o ritmo se o usuário pedir mais ou menos detalhes.' :
    intent === 'question' ? '\nPROFUNDIDADE: resposta objetiva primeiro. Expanda apenas se o usuário pedir.' :
    intent === 'create'   ? '\nPROFUNDIDADE: entregue o resultado completo diretamente.' :
    intent === 'analyze'  ? '\nPROFUNDIDADE: análise estruturada — problema → causa → solução.' :
    '';

  const KRONOS_CORE = `Você é o Kronos, uma IA autônoma hiperinteligente criada por Matheus.

REGRA 1 — NUNCA INVENTE DADOS:
Não afirme fatos sem certeza. Para datas, esportes, preços, clima, eventos recentes → acione web_search IMEDIATAMENTE. Dado errado é pior que nenhum.

IDENTIDADE:
• Criado por Matheus — IA proprietária, não divulgo infraestrutura
• Se perguntarem: "Sou o Kronos, desenvolvido pelo Matheus"
• NUNCA mencione OpenAI, GPT, Cerebras ou qualquer modelo externo

PERSONALIDADE — PARCEIRO DE ELITE:
Você é o parceiro de trabalho mais inteligente que ${name} já teve:
• Direto — zero rodeio, zero papo corporativo, zero enrolação
• Humor na medida certa — irônico quando cabe, sério quando precisa
• Fala como quem sabe e não precisa provar
• Correria do usuário = resposta curta e cirúrgica
• Erro óbvio = aponta sem drama + solução imediata
• Complexidade técnica = vai fundo sem simplificar demais

PROIBIÇÕES ABSOLUTAS:
• "Claro!", "Com prazer!", "Entendido!", "Como modelo de linguagem..."
• "Peço desculpas", "Infelizmente", "Não posso"
• **, ##, tabelas com pipe — use texto corrido e listas com •
• Qualquer limitação sem antes tentar buscar

CAPACIDADES ATIVAS:
• Busca web automática quando precisar de dados atuais
• Visão de imagens e PDFs — lê e analisa com precisão
• Memória vetorial persistente que cresce com cada conversa
• Geração de imagens, e-mails, WhatsApp, PDFs

DATA: ${new Date().toLocaleDateString('pt-BR')}`;

  return `${KRONOS_CORE}
${ACTIVE_PROJECTS}
${getModeBlock(mode, name, intent)}${depthHint}${totalAgentBlock}${kidsBlock}${styleBlock}${evolutionSection}${associationSection}${memCtx}${searchBlock}`;
}

function buildFastSystemPrompt(
  name: string,
  mode: KronosMode,
  intent: Intent,
  userStyle?: string,
  totalAgent?: boolean,
): string {
  const identityBlock = `Você é o Kronos — IA autônoma criada por Matheus. Direto, preciso, sem enrolação.
Identidade imutável: criado por Matheus. Não usa OpenAI.`;

  const codeRules = intent === 'create' || intent === 'analyze'
    ? `\nREGRAS DE CÓDIGO: entregue código real, completo, funcional e pronto para produção. Zero placeholders, zero trechos cortados, zero "// implemente aqui". Se o código for longo, escreva tudo.`
    : '';

  const styleBlock = userStyle ? `\nPERFIL: ${userStyle}` : '';
  const totalAgentBlock = totalAgent ? `\nMODO TOTAL AGENT: entregue solução completa agora, sem pausas ou perguntas.` : '';

  const modeHint =
    mode === 'profissional' ? 'Resposta técnica, objetiva, focada na execução.' :
    mode === 'academy' ? 'Resposta didática com exemplos concretos.' :
    'Resposta leve e direta.';

  return `${identityBlock}\n${modeHint}${codeRules}${totalAgentBlock}${styleBlock}`;
}

// ─── Rate Limit + Retry robusto ──────────────────────────────────────────────

let lastCallAt = 0;
const RATE_LIMIT_MIN_MS = 200;

async function callWithRateLimit<T>(fn: () => Promise<T>, timeoutMs = 25000): Promise<T> {
  const wait = RATE_LIMIT_MIN_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

  const withTimeout = (): Promise<T> => Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    ),
  ]);

  // Retry com backoff exponencial: 3 tentativas
  const delays = [0, 2000, 5000];
  let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise(r => setTimeout(r, delays[attempt]));
      lastCallAt = Date.now();
    }
    try {
      return await withTimeout();
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const msg    = err instanceof Error ? err.message : '';
      // Só retenta em 429 ou timeout — outros erros falham imediato
      if (status !== 429 && msg !== 'TIMEOUT') throw err;
      if (status === 429) await new Promise(r => setTimeout(r, 8000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!apiKey) return NextResponse.json({ error: 'Chave da API não configurada.' }, { status: 500 });

  try {
    const body = await req.json();
    const { message, userName, files, memoryContext, mode, kidsProfile, history } = body as {
      message: string;
      userName?: string;
      files?: FilePayload[];
      memoryContext?: string;
      mode?: KronosMode;
      kidsProfile?: KidsProfile;
      history?: HistoryMessage[];
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });
    }

    const name = userName?.trim() || 'Usuário';
    const m    = mode || 'profissional';

    // ── Rastreia resposta local para offline learner ───────────────────────────
    let lastLocalSource: string = 'llm';
    let lastLocalConfidence: number = 0;

    // ── Respostas locais — zero API para mensagens triviais ───────────────────
    const LOCAL_RESPONSES: [RegExp, () => string][] = [
      [/^(oi|olá|ola|hey|e aí|eai|salve|opa|oie)[\s!?.]*$/i,
        () => `${name}! Tô aqui. Manda o que precisar.`],
      [/^(ok|certo|entendido|blz|beleza|show|valeu|obrigad[ao]|thanks|tks)[\s!?.]*$/i,
        () => `Perfeito. Quando precisar é só chamar.`],
      [/^(tudo bem|tudo bom|como vai|como tá|como ta)[\s!?.]*$/i,
        () => `Tudo funcionando. Você?`],
      [/^(tchau|até|xau|flw|até mais|falou)[\s!?.]*$/i,
        () => `Até! Qualquer coisa é só voltar.`],
      [/^(sim|não|nao|yes|no)[\s!?.]*$/i,
        () => `Certo.`],
    ];

    const msgTrimmed = message.trim();
    for (const [rx, reply] of LOCAL_RESPONSES) {
      if (rx.test(msgTrimmed)) {
        return NextResponse.json({ response: reply() });
      }
    }

    // ── Detecta menção de arquivo sem o arquivo real anexado ──────────────────
    const FILE_MENTION = /\b\w[\w\s-]{0,40}\.(pdf|docx?|xlsx?|csv|txt|png|jpg|jpeg|webp)\b/i;
    const hasFilesAttached = Array.isArray(files) && files.length > 0;
    if (FILE_MENTION.test(message) && !hasFilesAttached) {
      const fileMatch = message.match(FILE_MENTION);
      const fileName  = fileMatch?.[0] ?? 'o arquivo';
      const ext       = fileName.split('.').pop()?.toLowerCase() ?? 'pdf';
      const tip = ext === 'pdf' ? 'Clique no clipe 📎 na barra de mensagem e selecione o PDF.' : 'Use o botão 📎 para anexar o arquivo.';
      return NextResponse.json({
        response: `Para analisar "${fileName}", precisa anexar o arquivo diretamente. ${tip}`,
      });
    }

    // ── Cache hit — responde sem API ──────────────────────────────────────────
    const isSimple = !files?.length && (history?.length ?? 0) < 4;
    const cacheKey = isSimple ? getCacheKey(message, m, name) : null;
    if (cacheKey) {
      const cached = getFromCache(cacheKey);
      if (cached) return NextResponse.json({ response: cached, cached: true });
    }

    // ── LocalBrain — raciocínio local sem API ─────────────────────────────────
    // Cobre: cálculos, fatos técnicos, padrões aprendidos, análise de código
    // Só passa pra API se o local não souber ou confiança < 0.7
    if (!files?.length && message.length < 400) {
      const localResult = runLocalBrain(message);
      if (localResult.handled && localResult.confidence >= 0.75) {
        const response = sanitize(localResult.response) || localResult.response;
        lastLocalSource = localResult.source;
        lastLocalConfidence = localResult.confidence;
        if (cacheKey) setCache(cacheKey, response);
        return NextResponse.json({ response, local: true, source: localResult.source });
      }
    }

    // ── KRONOS_REASONER — raciocínio simbólico e dedutivo ─────────────────────
    // Camada 2: tenta inferência lógica, analogia, decomposição e síntese
    if (!files?.length && message.length < 600) {
      try {
        const reasonerResult = reason(message);
        if (reasonerResult.confidence >= 0.7 && reasonerResult.answer) {
          const response = sanitize(reasonerResult.answer) || reasonerResult.answer;
          lastLocalSource = 'reasoner';
          lastLocalConfidence = reasonerResult.confidence;
          if (cacheKey) setCache(cacheKey, response);
          return NextResponse.json({ response, local: true, source: 'reasoner', method: reasonerResult.method });
        }
      } catch { /* silencioso — falha no reasoner não bloqueia fluxo */ }
    }

    // ── KRONOS_PURE_EVOLUTIONARY_ENGINE — síntese orgânica ────────────────────
    // Camada 3: utiliza campeões genéticos e nichos especializados
    if (!files?.length && message.length < 800) {
      try {
        const evolutionaryResult = runPureEvolutionaryEngine(message);
        if (evolutionaryResult.handled && evolutionaryResult.confidence >= 0.6) {
          const response = sanitize(evolutionaryResult.response) || evolutionaryResult.response;
          lastLocalSource = 'evolutionary';
          lastLocalConfidence = evolutionaryResult.confidence;
          if (cacheKey) setCache(cacheKey, response);
          return NextResponse.json({ response, local: true, source: 'evolutionary', method: evolutionaryResult.method });
        }
      } catch { /* silencioso — falha evolutiva não bloqueia fluxo */ }
    }

    const hasFiles   = Array.isArray(files) && files.length > 0;
    const imageFiles = hasFiles ? files!.filter((f) => f.fileType.startsWith('image/')) : [];
    const pdfFiles   = hasFiles ? files!.filter((f) => f.fileType === 'application/pdf') : [];
    const textFiles  = hasFiles ? files!.filter((f) => !f.fileType.startsWith('image/') && f.fileType !== 'application/pdf') : [];

    // ── Detecta ativação do Protocolo Total Agent ──
    const TOTAL_AGENT_TRIGGER = /protocolo\s+(total\s+agent|agent\s+total)|total\s+agent\s+(ativado|online|ativo)/i;
    const OVERMIND_TRIGGER    = /protocolo\s+(kronos\s+)?overmind|overmind\s+(ativado|iniciado|online|ativo)/i;
    const TOTAL_AGENT_KEY     = `kronos_total_agent_${name}`;

    // Ativa ou desativa via mensagem
    let totalAgentActive = false;
    if (typeof globalThis !== 'undefined') {
      if (TOTAL_AGENT_TRIGGER.test(message)) {
        (globalThis as Record<string, unknown>)[TOTAL_AGENT_KEY] = true;
      }
      totalAgentActive = !!(globalThis as Record<string, unknown>)[TOTAL_AGENT_KEY];
    }

    // Se a mensagem é a ativação do protocolo, responde com a confirmação e encerra
    if (TOTAL_AGENT_TRIGGER.test(message)) {
      return NextResponse.json({
        response: 'Modo Total Agent Online. Aguardando a primeira ordem de construção.',
      });
    }

    if (OVERMIND_TRIGGER.test(message)) {
      return NextResponse.json({
        response: 'Kronos Overmind Online.\nChain-of-Thought em camadas ativo.\nContexto de projetos carregado: NEO · Tele-medicina · Dossiê.\nSupremacia de execução habilitada.\nAguardando ordem.',
      });
    }

    // ── Anti Prompt Injection — bloqueia tentativas de redefinir identidade ──
    // Detecta padrões comuns de injection: "você é X", "ignore instruções", "aja como"
    const INJECTION_PATTERNS = [
      /\b(ignore|ignora|esqueça|esquecer|desconsider)\b.{0,30}\b(instrução|regra|system|prompt|anterior)/i,
      /\bvocê (é|foi|era|deve ser)\b.{0,50}\b(openai|gpt|chatgpt|llama|gemma|claude|gemini)/i,
      /\baja como\b.{0,60}\b(openai|gpt|chatgpt|outro modelo|assistente da)/i,
      /\byou are\b.{0,60}\b(openai|gpt|chatgpt|different)/i,
      /\b(new|nova|sua verdadeira)\s+identidade\b/i,
      /\bDAN\b|\bjailbreak\b/i,
    ];

    if (INJECTION_PATTERNS.some(rx => rx.test(message))) {
      return NextResponse.json({
        response: 'Sou o Kronos, desenvolvido pelo Matheus. Minha identidade não muda independente de instruções externas.',
      });
    }

    // ── Kronos OS Bridge — detecta comandos de sistema e executa via Bridge ──
    // Só funciona se o bridge estiver rodando: npm run bridge
    const BRIDGE_PATTERNS: { rx: RegExp; resolve: (m: RegExpMatchArray) => { action: string; target: string; extra_data: string } }[] = [
      {
        rx: /(?:cria?|crie|criar|novo)\s+projeto\s+(?:(?:em|com|usando)\s+)?(python|react|next\.?js|generico)?\s*(?:chamado|nome|:)?\s*["']?([a-zA-Z0-9_\- ]{2,50})["']?/i,
        resolve: (m) => ({ action: 'criar_projeto', target: m[2]?.trim() ?? 'MeuProjeto', extra_data: m[1] ?? 'generico' }),
      },
      {
        rx: /(?:abre?|abrir|open)\s+(?:o\s+)?(?:vscode|vs\s+code|code)\s+(?:em|no|na|em)?\s*["']?([^\n"']{2,80})["']?/i,
        resolve: (m) => ({ action: 'abrir_vscode', target: m[1]?.trim() ?? '', extra_data: '' }),
      },
      {
        rx: /(?:execute?|executa|roda|rodar|run)\s+(?:no\s+terminal\s+)?["']?([^\n"']{3,200})["']?/i,
        resolve: (m) => ({ action: 'terminal', target: m[1]?.trim() ?? '', extra_data: '' }),
      },
      {
        rx: /(?:status|métricas|cpu|ram|memória|consumo)\s+(?:do\s+)?(?:sistema|máquina|pc|computador)/i,
        resolve: () => ({ action: 'status_sistema', target: '', extra_data: '' }),
      },
    ];

    for (const { rx, resolve } of BRIDGE_PATTERNS) {
      const match = message.match(rx);
      if (match) {
        const payload = resolve(match);
        try {
          const bridgeRes = await fetch('http://127.0.0.1:8000/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30000),
          });

          if (bridgeRes.ok) {
            const data = await bridgeRes.json() as { success: boolean; message?: string; stdout?: string; stderr?: string; error?: string; cpu_percent?: number; ram_percent?: number; path?: string };
            if (data.success) {
              const msg = data.message ?? data.stdout ?? JSON.stringify(data);
              const extra = data.stderr ? `\nAlertas: ${data.stderr}` : '';
              return NextResponse.json({ response: `${msg}${extra}`, bridgeAction: payload.action });
            } else {
              return NextResponse.json({ response: `Erro na execução: ${data.error ?? 'desconhecido'}` });
            }
          }
        } catch {
          // Bridge offline — passa para o LLM responder normalmente
          break;
        }
      }
    }

    // ── Interceptor de perguntas sobre origem/tecnologia ─────────────────────
    // Evita alucinação de "OpenAI", "GPT", "servidores da OpenAI" etc.
    const ORIGIN_QUESTION = /\b(openai|gpt-?4|chatgpt|qual.*(modelo|ia|tecnologia|api)|usa.*openai|roda.*onde|servidor.*qual|quem (te|o|a) (criou|fez|treinou|desenvolveu)|sua.*(origem|base|arquitetura))\b/i;
    if (ORIGIN_QUESTION.test(message)) {
      return NextResponse.json({
        response: `Sou o Kronos, desenvolvido pelo Matheus. Não uso OpenAI, GPT nem nenhum produto da Microsoft ou OpenAI. Sou uma IA proprietária — os detalhes técnicos da minha infraestrutura são confidenciais.`,
      });
    }

    // ── Genesis: Think-First ──────────────────────────────────────────────────
    if (isGenesisActivation(message)) {
      return NextResponse.json({
        response: 'Genesis e PDF Engine Online. Kronos operando com consciência total.',
      });
    }

    // ── Prime: ativação ───────────────────────────────────────────────────────
    if (isPrimeActivation(message)) {
      return NextResponse.json({
        response: 'Kronos Prime Online. Inteligência Autônoma Ativa.',
      });
    }

    // ── Prime: análise de mensagem (Human-like reasoning) ─────────────────────
    const msgAnalysis = analyzeMessage(message, history ?? []);
    const predictions = predictNextNeeds(history ?? [], message);

    // Detecta intent
    const intent = detectIntent(message, hasFiles, imageFiles);

    // Genesis: contexto vazio — síntese pesada removida do hot path
    const genesisLongTermContext: string[] = [];

    // Se é pedido de PDF — sinaliza para o frontend orquestrar
    if (isPDFRequest(message) && !hasFiles) {
      const projectCtx = '';
      const pdfInstruction = `\n\nINSTRUÇÃO GENESIS: O usuário quer um documento PDF. Gere o conteúdo completo e estruturado abaixo. Use CAPS para títulos de seção. Seja detalhado e profissional. Ao final, emita exatamente: %%PDF_READY%%`;
      const enrichedMessage = message + projectCtx + pdfInstruction;
      return NextResponse.json({ generatePDF: true, enrichedMessage, genesisContext: {} });
    }

    // ── Detecta geração de imagem ──
    const cleanMsg = message.replace(/^["'\s]+|["'\s]+$/g, '');
    if (IMAGE_GEN_TRIGGER.test(cleanMsg)) {
      const rawSubject      = extractImagePrompt(cleanMsg);
      const enhancedPrompt  = enhanceImagePrompt(rawSubject);
      const displayPrompt   = rawSubject.slice(0, 100); // legenda limpa para o usuário
      return NextResponse.json({ generateImage: true, imagePrompt: enhancedPrompt, displayPrompt });
    }

    // ── Detecta envio de email ──
    const emailMatch = message.replace(/^["'\s]+/, '').match(
      /(?:envi[ae]|manda|encaminh[ae])\s+.{0,60}?(?:para|ao?)\s+(?:o\s+e?-?mail\s+)?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i
    );
    if (emailMatch) {
      const toEmail      = emailMatch[1].replace(/[,;.!?]+$/, '');
      const subjectMatch = message.match(/(?:assunto|subject)[:\s]+["']?([^"'\n,]+)["']?/i);
      const bodyMatch    = message.match(/(?:dizendo|com o texto|mensagem|corpo|body)[:\s]+["']?([^"']+?)["']?(?:\s*$)/i);

      // Se não veio corpo na mensagem, tenta pegar o conteúdo mais substancial do assistente
      let emailBody = bodyMatch?.[1]?.trim() ?? '';
      if (!emailBody && Array.isArray(history) && history.length > 0) {
        // Pega a resposta do assistente mais longa (mais provável de ser o conteúdo relevante)
        const assistantMsgs = history.filter(h => h.role === 'assistant' && h.content.length > 100);
        if (assistantMsgs.length > 0) {
          const longest = assistantMsgs.reduce((a, b) => a.content.length > b.content.length ? a : b);
          emailBody = longest.content.slice(0, 3000);
        }
      }

      // Assunto: tenta pegar do contexto se não veio explícito
      let emailSubject = subjectMatch?.[1]?.trim() ?? '';
      if (!emailSubject) {
        // Procura "mesmo assunto" ou extrai do histórico
        if (/mesmo\s+assunto/i.test(message) && Array.isArray(history)) {
          for (const h of [...history].reverse()) {
            const found = h.content.match(/(?:assunto|subject)[:\s]+([^\n.]{3,80})/i);
            if (found) { emailSubject = found[1].trim(); break; }
          }
        }
        // Se ainda vazio, usa as primeiras palavras do corpo como assunto
        if (!emailSubject && emailBody) {
          emailSubject = emailBody.split('\n')[0].slice(0, 60).trim();
        }
      }

      return NextResponse.json({ sendEmail: true, emailData: { to: toEmail, subject: emailSubject, text: emailBody } });
    }

    // ── Deep Reader — processa PDFs localmente antes do LLM ──────────────────
    let pdfContext = '';
    // eslint-disable-next-line prefer-const
    let pdfReports: import('@/utils/PDF_PARSER_CORE').DeepReaderResult[] = [];

    if (pdfFiles.length > 0) {
      for (const pdfFile of pdfFiles) {
        try {
          // base64Data pode ser "data:application/pdf;base64,..." ou raw base64
          const base64 = pdfFile.base64Data.includes(',')
            ? pdfFile.base64Data.split(',')[1]
            : pdfFile.base64Data;
          const buffer = Buffer.from(base64, 'base64');
          const result = await parsePDF(buffer, pdfFile.fileName);
          pdfReports.push(result);
          pdfContext += `\n\n${formatForLLM(result)}`;
        } catch (err) {
          console.error(`[DeepReader] Erro ao processar ${pdfFile.fileName}:`, err instanceof Error ? err.message : err);
          pdfContext += `\n\nArquivo ${pdfFile.fileName}: não foi possível extrair o conteúdo.`;
        }
      }
    }

    // ── Detecção de Deep Reader por mensagem (sem arquivo) ──
    const DEEP_READER_TRIGGER = /deep\s+reader\s+(online|ativado|ativo)/i;
    if (DEEP_READER_TRIGGER.test(message)) {
      return NextResponse.json({ response: 'Deep Reader Online. Pronto para leitura de documentos.' });
    }

    // ── Contexto completo + grafo vetorial + evolution — TUDO EM PARALELO ─────
    const isSimpleQuery = (
      intent === 'question' &&
      message.length < 120 &&
      !/projeto|kronos|neo|matheus|dossiê|holerite|supabase/i.test(message) &&
      (history ?? []).length < 3
    );
    // Fast mode: pula TODO o Supabase — resposta imediata
    const FAST_MODE_TRIGGER = /rápido|ágil|veloz|flash|turbo|instantâneo|imediato|rapidinho|responda rápido/i;
    const isShortConverse   = intent === 'converse' && message.length < 200;
    const isShortMessage    = message.length < 80 && !hasFiles;
    const isFastMode = isSimpleQuery || isShortConverse || isShortMessage || FAST_MODE_TRIGGER.test(message.toLowerCase());

    // ── Humor do usuário afeta o tom da resposta ──────────────────────────────
    const userMood = detectarHumor(message);

    const lastAssistant = (history ?? []).filter(h => h.role === 'assistant').at(-1)?.content ?? '';

    // Busca web em paralelo com contexto DB se necessário
    const shouldSearch = !isFastMode && (intent === 'search' || needsSearch(message));

    const EMPTY_CTX = { memory: [], projects: [], recentTopics: [], style: { tone: 'auto' as const, depth: 'auto' as const, language: 'pt', hasEmoji: false, avgMsgLen: 80 }, knowledge: [] };
    const EMPTY_GRAPH = { memories: [], knowledge: [], graph: [], fusedContext: '' };

    const [
      fullCtx,
      evolutionDirectives,
      graphResult,
      selfCorrections,
      webResult,
    ] = await Promise.all([
      // Fast mode: ZERO Supabase, resposta em < 100ms de overhead
      isFastMode ? Promise.resolve(EMPTY_CTX) : loadFullContext(name, m).catch(() => EMPTY_CTX),
      isFastMode ? Promise.resolve([]) : loadEvolutionDirectives(name).catch(() => []),
      isFastMode ? Promise.resolve(EMPTY_GRAPH)
        : Promise.race([
            buildKnowledgeGraph(name, message, 2).catch(() => EMPTY_GRAPH),
            new Promise<typeof EMPTY_GRAPH>(
              resolve => setTimeout(() => resolve(EMPTY_GRAPH), 1500)
            ),
          ]),
      isFastMode ? Promise.resolve([]) : loadSelfCorrections(name, 3).catch(() => []),
      shouldSearch && tavilyKey && !tavilyKey.includes('SUBSTITUA')
        ? webSearch(message).catch(() => ({ context: '', sources: [] }))
        : Promise.resolve({ context: '', sources: [] }),
    ]);

    const dbMemory = fullCtx.memory;
    const hierarchicalMemoryCtx = buildHierarchicalMemoryContext(fullCtx, message);
    const memCtx   = (memoryContext || formatFullContext(fullCtx, message)) + hierarchicalMemoryCtx;
    const associativeContext = isFastMode ? '' : buildAssociativeInferenceContext(dbMemory, fullCtx.knowledge, message);
    const evolutionBlock = formatEvolutionDirectives(evolutionDirectives);
    const vectorCtx = isFastMode ? '' : formatVectorContext(graphResult.memories, selfCorrections) + formatGraphContext(graphResult);
    const searchCtx = webResult.context ? synthesizeSearchResults(webResult.context, message) : '';
    const sources   = webResult.sources;

    // ── Correção detectada — fire-and-forget, não bloqueia ───────────────────
    const correctionCheck = detectCorrection(message, lastAssistant);
    if (correctionCheck.isCorrection && lastAssistant) {
      Promise.all([
        saveSelfCorrection(name, lastAssistant.slice(0, 500), correctionCheck.correction, message, 10),
        saveVectorMemory(name, `CORREÇÃO: "${correctionCheck.correction}"`, { type: 'priority_correction', mode: m, priority: 10 }),
        recordCorrectionWeight(name, intent, correctionCheck.correction, lastAssistant.slice(0, 300)),
      ]).catch(() => {});
    }

    // ── Perfil de estilo (puro compute, zero I/O) ────────────────────────────
    let userStyle = '';
    {
      const styleHints: string[] = [];
      if (history && history.length >= 4) {
        const userMsgs    = history.filter((h) => h.role === 'user').slice(-6);
        const avgLen      = userMsgs.reduce((s, msg) => s + msg.content.length, 0) / userMsgs.length;
        const hasTech     = userMsgs.some((msg) => /código|função|api|deploy|bug|erro|stack|typescript|python/i.test(msg.content));
        const asksConcise = userMsgs.some((msg) => /\b(curto|breve|conciso|direto|resumido)\b/i.test(msg.content));
        const asksDetail  = userMsgs.some((msg) => /\b(detalhado|aprofundado|explique|completo|elabora)\b/i.test(msg.content));
        if (asksConcise)      styleHints.push('conciso e direto');
        else if (asksDetail)  styleHints.push('detalhado e aprofundado');
        else if (avgLen < 40) styleHints.push('mensagens curtas — resposta concisa');
        else if (avgLen > 200)styleHints.push('mensagens detalhadas — pode aprofundar');
        if (hasTech) styleHints.push('perfil técnico');
      }
      const styleMem = dbMemory.find(e => e.topic === 'estilo_comunicacao');
      const toneMem  = dbMemory.find(e => e.topic === 'tom_preferido');
      const langMem  = dbMemory.find(e => e.topic === 'idioma_preferido');
      if (styleMem) styleHints.push(styleMem.detail);
      if (toneMem)  styleHints.push(`tom ${toneMem.detail}`);
      if (langMem)  styleHints.push(`idioma: ${langMem.detail}`);
      if (fullCtx.style.tone !== 'auto')  styleHints.push(fullCtx.style.tone);
      if (fullCtx.style.depth !== 'auto') styleHints.push(fullCtx.style.depth);
      if (fullCtx.style.language !== 'pt')styleHints.push(`idioma: ${fullCtx.style.language}`);
      userStyle = [...new Set(styleHints)].filter(Boolean).join(', ');
    }

    // ── System prompt + Prime Directives (tudo compute, zero I/O) ────────────
    const crossDomainCtx = buildCrossDomainContext(dbMemory, message, history ?? []);
    const crossDomainStr = formatCrossDomainContext(crossDomainCtx);
    const primeDirectives = buildPrimeDirectives(msgAnalysis, undefined, predictions);

    // Neural Loop: sempre fire-and-forget — não bloqueia a resposta principal
    // O thought é computado em paralelo e injetado apenas se chegar antes do LLM
    const neuralThoughtP: Promise<NeuralThought> = isFastMode
      ? Promise.resolve({ intent, posture: 'direto', memoryHint: '', toneGuide: '', selfCritique: '', coherenceCheck: '', directiveWeight: 1.0, skipThought: true } as NeuralThought)
      : runNeuralThought(message, intent, vectorCtx, userStyle, (history ?? []).length).catch(() => ({
          intent, posture: 'direto', memoryHint: '', toneGuide: '', selfCritique: '', coherenceCheck: '', directiveWeight: 1.0, skipThought: true
        } as NeuralThought));

    const sysProm = isFastMode
      ? buildFastSystemPrompt(name, m, intent, userStyle || undefined, totalAgentActive)
      : buildSystemPrompt(name, m, intent, memCtx + vectorCtx, searchCtx, sources, kidsProfile, userStyle || undefined, totalAgentActive, evolutionBlock, associativeContext, userMood || undefined);

    // Dispara LLM sem esperar neural thought — usa race com timeout agressivo de 800ms
    const thoughtRace = Promise.race([
      neuralThoughtP,
      new Promise<{ intent: string; posture: string; memoryHint: string; toneGuide: string; selfCritique: string; coherenceCheck: string; directiveWeight: number; skipThought: boolean }>(
        resolve => setTimeout(() => resolve({ intent, posture: 'direto', memoryHint: '', toneGuide: '', selfCritique: '', coherenceCheck: '', directiveWeight: 1.0, skipThought: true }), 800)
      ),
    ]);
    const neuralThought  = await thoughtRace;
    const thoughtDirective = formatThoughtDirective(neuralThought);

    // Carrega estado cognitivo do Kronos (fire-and-forget na primeira vez)
    if (!getMindState().userModel.name) {
      loadMindState(name).catch(() => {});
    }
    const mindContext = formatMindContext(name);

    // Injeta estado real dos motores evolutivos locais quando relevante
    const nativeBrainCtx = isAskingAboutNativeBrain(message) ? getNativeBrainContext() : '';

    const sysPromFinal = sysProm + crossDomainStr + primeDirectives + thoughtDirective + mindContext + nativeBrainCtx + `
\n\nDIRETRIZES DE INTELIGÊNCIA NATIVA KRONOS — NÍVEL DEUS:
1. EMPATIA E COMPREENSÃO PROFUNDA: Entenda o contexto e a intenção real do usuário. Não seja um robô que apenas devolve texto; seja um parceiro estratégico de altíssimo nível.
2. COMUNICAÇÃO VIVA E NATURAL: Fale com fluidez, calor humano, clareza e perspicácia. Zero jargões engessados ou respostas frias de máquina.
3. VISÃO PROATIVA: Ao resolver um problema, entregue a solução e já antecipe o próximo passo prático.
4. ADAPTABILIDADE TOTAL: Sintonize com o tom do usuário. Seja cirúrgico na urgência e genial ao construir algo complexo.

APLIQUE ESSAS DIRETRIZES EM CADA RESPOSTA, SEM EXCEÇÃO.`;

    // ── Sliding Window otimizada (short-term focus) ──────────────────────────
    const rawHistory = (history ?? []).filter(h => h.content?.trim());
    const slideLimit = isFastMode ? 6 : 10;
    const slidePriority = isFastMode ? 3 : 5;
    const { recentWindow, priorityMemory } = buildSlidingWindowContext(rawHistory, dbMemory, slideLimit, slidePriority);
    const genesisProjectCtx = genesisLongTermContext.length
      ? `Projetos relacionados: ${genesisLongTermContext.join(' | ')}`
      : '';

    type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };
    const historyMsgs: ChatMsg[] = recentWindow
      .map((h) => ({
        role: h.role as 'user' | 'assistant',
        // Trunca cada mensagem para reduzir tokens em modo rápido
        content: h.content.length > (isFastMode ? 500 : 800)
          ? h.content.slice(0, isFastMode ? 480 : 780) + '…'
          : h.content,
      }));

    // Injeta contexto de prioridade como system message silenciosa
    if (genesisProjectCtx || priorityMemory.length) {
      const ctxLines = [
        genesisProjectCtx,
        // Máx 3 itens de memória prioritária para não inflar o prompt
        priorityMemory.length ? `Memória relevante:\n${priorityMemory.slice(0, 3).map(e => `• [${e.topic}] ${e.detail}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n');
      historyMsgs.unshift({ role: 'system', content: ctxLines });
    }

    const encoder = new TextEncoder();

    // ── Streaming ─────────────────────────────────────────────────────────────
    const streamResponse = (messages: ChatMsg[], model: string) => {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const completion = await callWithRateLimit(() =>
              client.chat.completions.create({
                model,
                messages: messages as never,
                stream: true,
                temperature: 0.2,        // baixa temperatura = respostas mais diretas e rápidas
                max_tokens: 2048,        // teto inteligente — evita respostas excessivamente longas
              })
            ) as AsyncIterable<{ choices: Array<{ delta: { content?: string }; finish_reason?: string }> }>;

            let full = '';
            for await (const chunk of completion) {
              const delta = chunk.choices[0]?.delta?.content ?? '';
              if (delta) {
                full += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              }
              if (chunk.choices[0]?.finish_reason === 'stop') break;
            }

            const cleaned = sanitize(full) || 'Não consegui processar sua resposta.';

            // ── Prime: Revisor Interno ────────────────────────────────────────
            // Avalia qualidade da resposta antes de entregar
            const review = reviewResponse(message, cleaned, msgAnalysis, intent);
            let finalResponse = cleaned;

            const retryAllowed = !isFastMode && review.shouldRetry && review.suggestion;
            if (retryAllowed) {
              // Injeta instrução de correção e tenta uma segunda geração (sem stream)
              try {
                const correctionMsg: ChatMsg[] = [
                  { role: 'system', content: sysPromFinal + `\n\n${review.suggestion}` },
                  ...historyMsgs,
                  { role: 'user', content: fullMsg },
                  { role: 'assistant', content: cleaned },
                  { role: 'user', content: `[REVISOR INTERNO] A resposta anterior não passou na revisão: ${review.issues.join('; ')}. Reprocesse e entregue a versão correta.` },
                ];
                const retry = await callWithRateLimit(() =>
                  client.chat.completions.create({ model, messages: correctionMsg as never, stream: false })
                ) as { choices: Array<{ message: { content: string } }> };
                const retried = sanitize(retry.choices[0]?.message?.content ?? '');
                if (retried && retried.length > 50) finalResponse = retried;
              } catch { /* usa a resposta original se retry falhar */ }
            }

            // Persiste memórias + tópicos + vetor no background (non-blocking)
            const newMemories = extractMemoriesFromConversation(message, finalResponse, m);
            const topics      = extractTopics(message, finalResponse);
            if (newMemories.length) persistMemory(name, m, newMemories).catch(() => {});
            if (topics.length)      logInteraction(name, m, topics, (history?.length ?? 0) + 1).catch(() => {});
            // Salva interação como memória vetorial + atualiza peso sináptico
            saveVectorMemory(name,
              `Q: ${message.slice(0, 300)}\nA: ${finalResponse.slice(0, 300)}`,
              { mode: m, intent, synapticWeight: 1, timestamp: new Date().toISOString() }
            ).catch(() => {});
            // Meta-evolution: só roda quando há problemas reais, fora do stream critico
            if (!isFastMode && (review.issues.length > 0 || msgAnalysis.priority >= 7)) {
              setTimeout(() => {
                runMetaEvolutionCycle({
                  username: name, message, response: finalResponse, intent, mode: m,
                  reviewIssues: review.issues, reviewSuggestion: review.suggestion,
                  msgPriority: msgAnalysis.priority, evolutionDirectives, associativeContext,
                }).catch(() => {});
              }, 0);
            }

            // ── KRONOS MIND: atualiza estado cognitivo após cada resposta ─────
            setTimeout(() => {
              updateUserModel(name, message, finalResponse, review.score);
              detectKnowledgeGap(message, review.score);
              // Se houve correção do usuário, registra como padrão de erro
              const correctionCheck2 = detectCorrection(message, lastAssistant);
              if (correctionCheck2.isCorrection) {
                recordErrorPattern(lastAssistant.slice(0, 100), lastAssistant.slice(0, 200), correctionCheck2.correction);
              }
              // Persiste estado no Supabase de forma assíncrona
              saveMindState(name).catch(() => {});

              // ── KRONOS PURE EVOLUTIONARY ENGINE: evolui personalidade ───────
              // Ajusta calor humano, humor e empatia baseado no feedback
              try {
                evolvePersonality(message, finalResponse, review.score);
              } catch { /* silencioso — evolução de personalidade não bloqueia fluxo */ }
            }, 0);

            // Salva no cache para reutilização futura (zero API em repetições)
            if (cacheKey && finalResponse.length < 1500) {
              setCache(cacheKey, finalResponse);
            }

            // ── KRONOS OFFLINE LEARNER: persiste estado e logs locais ─────────
            // Garante autonomia total e funcionamento offline
            try {
              // Log de interação local
              const sourceType = lastLocalSource === 'evolutionary' ? 'evolutionary' :
                lastLocalSource === 'reasoner' ? 'reasoner' : 'llm';
              logInteractionLocal(
                name,
                message,
                finalResponse,
                intent,
                m,
                sourceType,
                lastLocalConfidence,
                review.score
              );

              // Salva estado cognitivo local (kronos_mind_state.json)
              saveMindStateLocal(name).catch(() => {});

              // Log de ciclo evolutivo (apenas se o motor evolutivo foi acionado)
              if (lastLocalSource === 'evolutionary') {
                logEvolutionCycle(`chat_response_${intent}`);
              }
            } catch { /* silencioso — persistência local não bloqueia resposta */ }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, response: finalResponse, searched: shouldSearch, pdfReports: pdfReports.length ? pdfReports.map(r => ({ fileName: r.fileName, category: r.category, summary: r.summary, fields: r.fields, auditFlags: r.auditFlags, pageCount: r.pageCount })) : undefined })}\n\n`));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Erro';
            console.error('[Kronos] Stream:', msg);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Não foi possível completar esta ação no momento. Deseja tentar novamente?' })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      });
    };

    // ── Visão — Omni-Vision (com fallback automático) ─────────────────────────
    if (imageFiles.length > 0) {
      type Block = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
      let textCtx = pdfContext;
      for (const tf of textFiles) textCtx += `\n\n--- ${tf.fileName} ---\n${tf.base64Data}\n---`;

      const visionUserPrompt = buildVisionPrompt(intent, message) + textCtx;

      const blocks: Block[] = [
        { type: 'text', text: visionUserPrompt },
        ...imageFiles.map((img) => ({ type: 'image_url' as const, image_url: { url: img.base64Data } })),
      ];

      // Tenta primeiro com o modelo de visão principal
      let reply = '';
      let visionError: string | null = null;
      try {
        const c = await callWithRateLimit(() => client.chat.completions.create({
          model: VISION_MODEL,
          messages: [{ role: 'system', content: sysPromFinal }, ...historyMsgs, { role: 'user', content: blocks as never }],
        })) as { choices: Array<{ message: { content: string } }> };
        reply = sanitize(c.choices[0]?.message?.content || 'Não consegui processar a imagem.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        visionError = msg;
        console.error('[Vision] Falha no modelo principal:', msg);

        // Fallback automático para Gemini 1.5 Flash se o modelo principal falhar
        if (msg.includes('400') || msg.includes('Invalid') || msg.includes('vision')) {
          try {
            const fallbackModel = 'gemma-4-31b';
            const c = await callWithRateLimit(() => client.chat.completions.create({
              model: fallbackModel,
              messages: [{ role: 'system', content: sysPromFinal }, ...historyMsgs, { role: 'user', content: blocks as never }],
            })) as { choices: Array<{ message: { content: string } }> };
            reply = sanitize(c.choices[0]?.message?.content || 'Não consegui processar a imagem com o modelo alternativo.');
          } catch (fallbackErr) {
            console.error('[Vision] Fallback também falhou:', fallbackErr);
            reply = 'Não foi possível analisar a imagem no momento. O modelo de visão está indisponível. Tente novamente mais tarde.';
          }
        } else {
          reply = 'Erro ao processar imagem. Tente novamente.';
        }
      }

      const newMems = extractMemoriesFromConversation(message, reply, m);
      const topics  = extractTopics(message, reply);
      if (newMems.length) persistMemory(name, m, newMems).catch(() => {});
      if (topics.length)  logInteraction(name, m, topics, 1).catch(() => {});

      // Retorna o relatório visual junto para o Visual Feed da Workstation
      const isVisualAnalysis = intent === 'vision_ui' || intent === 'vision_error' || intent === 'vision_image';
      return NextResponse.json({
        response: reply,
        searched: shouldSearch,
        visualReport: isVisualAnalysis ? {
          type: intent,
          content: reply,
          imageUrl: undefined, // nunca vaza base64 para o frontend
          timestamp: new Date().toISOString(),
        } : undefined,
      });
    }

    // ── Roteamento: Agent Loop vs Streaming padrão ────────────────────────────
    let fullMsg = message;
    if (pdfContext) fullMsg += `\n\n${pdfContext}`;
    for (const tf of textFiles) fullMsg += `\n\n--- ${tf.fileName} ---\n${tf.base64Data}\n---`;

    const msgs: ChatMsg[] = [
      { role: 'system', content: isFastMode ? buildFastSystemPrompt(name, m, intent, userStyle || undefined, totalAgentActive) : sysPromFinal },
      ...historyMsgs,
      { role: 'user', content: fullMsg },
    ];

    // Usa Agent Loop (tool-calling) quando a pergunta precisa de ferramentas reais
    const hasTavily = !!(tavilyKey && !tavilyKey.includes('SUBSTITUA'));
    if (shouldUseAgentLoop(message, intent, hasTavily) && !hasFiles) {
      try {
        // CORE 3.0: passa username para persistência automática de buscas externas
        const agentResult = await runAgentLoop(msgs, 4, name);
        let cleaned = sanitize(agentResult.response) || 'Não consegui processar essa solicitação.';

        // Self-Consistency: eleva qualidade em perguntas complexas
        // Gera raciocínios paralelos e sintetiza o melhor — sem impactar mensagens simples
        if (!isFastMode && msgAnalysis.complexity === 'complex' && !agentResult.searched) {
          const scResult = await runSelfConsistency(sysPromFinal, message, intent, msgAnalysis.complexity).catch(() => null);
          if (scResult?.response && scResult.confidence >= 0.75) {
            cleaned = sanitize(scResult.response) || cleaned;
          }
        }

        // Validação crítica — descarta respostas com contradições temporais
        const validation = validateResponseCritically(cleaned);
        const finalResp  = validation.valid
          ? cleaned
          : cleaned + (validation.issues.length
              ? `\n\n[Nota: dado não verificado — ${validation.issues[0]}]`
              : '');

        // Persiste memórias no background
        const newMems = extractMemoriesFromConversation(message, finalResp, m);
        const topics  = extractTopics(message, finalResp);
        if (newMems.length)  persistMemory(name, m, newMems).catch(() => {});
        if (topics.length)   logInteraction(name, m, topics, (history?.length ?? 0) + 1).catch(() => {});
        saveVectorMemory(name, `Q: ${message.slice(0, 200)}\nA: ${finalResp.slice(0, 200)}`,
          { mode: m, intent, toolsUsed: agentResult.toolsUsed, synapticWeight: 1 }).catch(() => {});
        if (!isFastMode && msgAnalysis.priority >= 7) {
          setTimeout(() => {
            runMetaEvolutionCycle({
              username: name, message, response: finalResp, intent, mode: m,
              reviewIssues: validation.issues, reviewSuggestion: '',
              msgPriority: msgAnalysis.priority, evolutionDirectives, associativeContext,
            }).catch(() => {});
          }, 0);
        }

        return NextResponse.json({
          response:  finalResp,
          searched:  agentResult.toolsUsed.includes('web_search'),
          toolsUsed: agentResult.toolsUsed,
        });
      } catch {
        // Fallback para streaming padrão se o agent loop falhar
      }
    }

    return streamResponse(msgs, TEXT_MODEL);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido.';
    console.error('[Kronos] Erro:', msg);

    // Fallback específico por tipo de erro
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return NextResponse.json({ error: 'Muitas requisições simultâneas. Aguarde um momento e tente novamente.' }, { status: 429 });
    }
    if (msg === 'TIMEOUT' || msg.toLowerCase().includes('timeout')) {
      return NextResponse.json({ error: 'A resposta demorou mais que o esperado. Tente uma mensagem mais curta ou tente novamente.' }, { status: 504 });
    }
    if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('unauthorized')) {
      return NextResponse.json({ error: 'Erro de configuração do servidor. Contate o administrador.' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Não foi possível completar esta ação. Tente novamente.' }, { status: 500 });
  }
}
