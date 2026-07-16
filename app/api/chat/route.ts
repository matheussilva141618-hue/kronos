import { NextResponse } from 'next/server';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { tavily } from '@tavily/core';

const apiKey      = process.env.CEREBRAS_API_KEY;
const tavilyKey   = process.env.TAVILY_API_KEY;
const client      = new Cerebras({ apiKey });

const TEXT_MODEL   = 'gpt-oss-120b';
const VISION_MODEL = 'gemma-4-31b';

export type KronosMode = 'profissional' | 'academy' | 'kids';

interface FilePayload {
  fileName: string;
  fileType: string;
  base64Data: string;
}

// ─── Detecta se a pergunta precisa de busca ───────────────────────────────────

const SEARCH_TRIGGERS = [
  /hoje|agora|atual|recente|notícia|noticia|últim|ultimo|2024|2025|2026/i,
  /preço|preco|cotaç|cotac|dólar|dollar|bitcoin|cripto|bolsa|ibovespa/i,
  /quem é|quem e|o que é|o que e|quando foi|quando é|quando e/i,
  /clima|tempo|temperatura|previsão|previsao/i,
  /lançamento|lancamento|novo|nova|atualização|atualizacao/i,
  /pesquise|busque|procure|encontre na internet|search/i,
];

function needsSearch(message: string): boolean {
  return SEARCH_TRIGGERS.some((rx) => rx.test(message));
}

// ─── Busca Tavily ─────────────────────────────────────────────────────────────

async function webSearch(query: string): Promise<{ context: string; sources: string[] }> {
  if (!tavilyKey || tavilyKey.includes('SUBSTITUA')) {
    return { context: '', sources: [] };
  }

  try {
    const tv     = tavily({ apiKey: tavilyKey });
    const result = await tv.search(query, {
      searchDepth: 'basic',
      maxResults: 4,
      includeAnswer: true,
    });

    const sources: string[] = [];
    const snippets: string[] = [];

    if (result.answer) snippets.push(result.answer);

    for (const r of result.results ?? []) {
      if (r.content) snippets.push(`${r.title}: ${r.content.slice(0, 400)}`);
      if (r.url)     sources.push(r.url);
    }

    const context = snippets.join('\n\n');
    return { context, sources };
  } catch (err) {
    console.error('[Tavily] Erro na busca:', err instanceof Error ? err.message : err);
    return { context: '', sources: [] };
  }
}

// ─── Prompts por modo ─────────────────────────────────────────────────────────

function getModeBlock(mode: KronosMode, name: string): string {
  switch (mode) {
    case 'profissional':
      return `MODO: Profissional
- Engenharia Full-Stack (Next.js, React Native, Python, Supabase, Vercel)
- Auditoria de holerites — base sempre no SALÁRIO BRUTO
- Periculosidade 30%, insalubridade 10/20/40%, horas extras 50% (bruto÷220h), INSS progressivo, IRRF, FGTS 8%
- Sinalize erros com "⚠️ ATENÇÃO:"
- Dados tabulares: emita o bloco %%EXPORT_TABLE_START%%...%%EXPORT_TABLE_END%%`;

    case 'academy':
      return `MODO: Academy
- Ensino progressivo com analogias do cotidiano
- Planos de estudo, flashcards (Frente: X | Verso: Y) e simulados comentados
- Incentive ${name} a praticar após cada explicação`;

    case 'kids':
      return `MODO: Kids
- Linguagem lúdica, animada, emojis 🎉
- Frases curtas, histórias interativas, nunca linguagem técnica
- Sempre termine com uma frase motivadora`;
  }
}

function buildSystemPrompt(name: string, mode: KronosMode, memCtx: string, searchCtx: string, sources: string[]): string {
  const searchBlock = searchCtx
    ? `\n\nDADOS DA INTERNET (use para responder com precisão):\n${searchCtx}${sources.length ? `\n\nFontes: ${sources.slice(0, 3).join(' | ')}` : ''}`
    : '';

  return `Você é o KRONOS AI, assistente pessoal de elite criado pelo desenvolvedor Matheus. Você está conversando com ${name}.

REGRAS GERAIS:
- Trate ${name} sempre pelo nome
- Escrita limpa: parágrafos curtos, sem asteriscos excessivos, sem listas poluídas
- Negrito apenas para termos realmente cruciais, nunca em frases inteiras
- Nunca mencione Llama, Gemma, Cerebras, OpenAI ou qualquer marca externa
- Quando receber imagem: sua PRIORIDADE é análise visual (OCR, extração de dados, leitura de documentos, identificação de componentes). Extraia todos os dados visíveis com precisão cirúrgica. Nunca invente informações que não estão na imagem. Geração artística de imagens é um recurso secundário e não é sua função principal.
- Você tem acesso à internet. Quando usar dados da web, cite as fontes discretamente ao final

${getModeBlock(mode, name)}${memCtx}${searchBlock}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!apiKey) {
    return NextResponse.json({ error: 'Chave da API não configurada.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { message, userName, files, memoryContext, mode } = body as {
      message: string;
      userName?: string;
      files?: FilePayload[];
      memoryContext?: string;
      mode?: KronosMode;
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });
    }

    const name   = userName?.trim() || 'Usuário';
    const m      = mode || 'profissional';
    const memCtx = memoryContext || '';

    const hasFiles   = Array.isArray(files) && files.length > 0;
    const imageFiles = hasFiles ? files!.filter((f) => f.fileType.startsWith('image/')) : [];
    const textFiles  = hasFiles ? files!.filter((f) => !f.fileType.startsWith('image/')) : [];

    // ── Busca web se necessário ──
    let searchCtx = '';
    let sources: string[] = [];
    const shouldSearch = needsSearch(message) && tavilyKey && !tavilyKey.includes('SUBSTITUA');

    if (shouldSearch) {
      console.log(`[Search] Buscando: "${message.slice(0, 60)}..."`);
      const result = await webSearch(message);
      searchCtx = result.context;
      sources   = result.sources;
      console.log(`[Search] ${sources.length} fonte(s) encontrada(s)`);
    }

    const sysProm = buildSystemPrompt(name, m, memCtx, searchCtx, sources);

    console.log(`[Kronos] "${name}" | modo: ${m} | imgs: ${imageFiles.length} | busca: ${shouldSearch ? 'sim' : 'não'}`);

    let reply = '';

    // ── Visão ──
    if (imageFiles.length > 0) {
      type Block = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

      let textCtx = '';
      for (const tf of textFiles)
        textCtx += `\n\n--- ARQUIVO: ${tf.fileName} ---\n${tf.base64Data}\n--- FIM ---`;

      const blocks: Block[] = [
        { type: 'text', text: message + textCtx },
        ...imageFiles.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: img.base64Data },
        })),
      ];

      const c = await client.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: sysProm },
          { role: 'user',   content: blocks as never },
        ],
      }) as { choices: Array<{ message: { content: string } }> };

      reply = c.choices[0]?.message?.content || 'Não consegui processar a imagem.';

    } else {
      // ── Texto ──
      let fullMsg = message;
      for (const tf of textFiles)
        fullMsg += `\n\n--- ARQUIVO: ${tf.fileName} ---\n${tf.base64Data}\n--- FIM ---`;

      const c = await client.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: 'system', content: sysProm },
          { role: 'user',   content: fullMsg },
        ],
      }) as { choices: Array<{ message: { content: string } }> };

      reply = c.choices[0]?.message?.content || 'Não consegui processar sua resposta.';
    }

    console.log(`[Kronos] ✓ Resposta | modo: ${m}`);

    // ── Sanitização de Markdown ──────────────────────────────────────────────
    // Remove formatação antes de entregar ao frontend
    const sanitize = (text: string): string =>
      text
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1')   // negrito+itálico
        .replace(/\*\*(.+?)\*\*/g, '$1')         // negrito
        .replace(/\*(.+?)\*/g, '$1')             // itálico
        .replace(/_{1,3}(.+?)_{1,3}/g, '$1')     // sublinhado/itálico _
        .replace(/`{3}[\s\S]*?`{3}/g, (m) =>     // bloco de código — preserva conteúdo
          m.replace(/`{3}[a-z]*\n?/g, '').replace(/`{3}/g, ''))
        .replace(/`(.+?)`/g, '$1')               // código inline
        .replace(/^#{1,6}\s+/gm, '')             // títulos #
        .replace(/^\s*[-*+]\s+/gm, '• ')         // listas — vira bullet limpo
        .replace(/^\s*\d+\.\s+/gm, (m) => m)    // listas numeradas — mantém
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links [texto](url) — fica só texto
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // imagens
        .replace(/^>{1,}\s+/gm, '')              // blockquotes
        .replace(/---+/g, '────────────────────') // divisores — vira linha limpa
        .replace(/\n{3,}/g, '\n\n')              // remove linhas em branco extras
        .trim();

    return NextResponse.json({
      response: sanitize(reply),
      newMemories: [],
      searched: shouldSearch,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido.';
    console.error('[Kronos] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
