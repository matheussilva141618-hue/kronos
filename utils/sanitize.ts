/**
 * KRONOS — Sanitize v2.0
 * Limpeza de texto compartilhada entre client e server.
 * Remove artefatos de markdown, bastidores técnicos, ruído de LLM,
 * frases de abertura banidas e poluição visual.
 */

// Frases de abertura que o model às vezes emite e devem ser cortadas
// Apenas quando são a ÚNICA coisa no início — seguidas de nada útil
const BANNED_OPENERS = [
  /^(Claro!?\s*)/i,
  /^(Com prazer!?\s*)/i,
  /^(Aqui está[:.!]?\s*)/i,
  /^(Certamente!?\s*)/i,
  /^(Entendido!?\s*)/i,
  /^(Com certeza!?\s*)/i,
  /^(Sem dúvida!?\s*)/i,
  /^(Peço\s+desculpas[^.]*\.\s*)/i,
  /^(Infelizmente[,.]?\s*)/i,
  /^(Lamento[,.]?\s*)/i,
  /^(Vou\s+dividir\s+a\s+análise[^.]*\.\s*)/i,
  /^(Vou\s+estruturar\s+a\s+resposta[^.]*\.\s*)/i,
];

// Frases de limitação inventada — substituir por vazio
const LIMITATION_PHRASES = [
  /não tenho acesso (a|ao|à)[^.]+\./gi,
  /minha base (é|está) (fixa|desatualizada|estática)[^.]*\./gi,
  /não consigo (acessar|buscar|verificar)[^.]+em tempo real[^.]*\./gi,
  /como (modelo de linguagem|IA), (eu )?não[^.]+\./gi,
  /minhas informações (têm|tem|vão até)[^.]+\./gi,
  // Pedidos de desculpa e reconhecimento de erro genérico — remove sempre
  /desculpe (pelo|o) erro anterior\.?\s*/gi,
  /peço desculpas (pelo|por)[^.]+\./gi,
  /lamento (o|pelo|por)[^.]+\./gi,
  /me desculpe[^.]*\./gi,
];

// Frases de identidade errada — o modelo base alucina que foi criado pela OpenAI
// Substitui pela identidade correta em qualquer resposta que vaze isso
const IDENTITY_FIXES: [RegExp, string][] = [
  [/\b(fui criado|sou criado|foi criado|desenvolvido|feito|treinado)\s+(pela|pelo|por)\s+(OpenAI|Anthropic|Google|Meta|Mistral|Cerebras)\b/gi, '$1 $2 Matheus'],
  [/\b(sou (um |o )?(modelo|assistente|sistema|IA)\s+(da|de|do)\s+(OpenAI|Anthropic|Google|Meta|Cerebras))\b/gi, 'sou o Kronos, desenvolvido pelo Matheus'],
  [/\bOpenAI\s+(me\s+)?(criou|desenvolveu|treinou|construiu)\b/gi, 'Matheus me criou'],
  [/\b(como|sendo um) (modelo|assistente) (da|de) (OpenAI|Anthropic|Google)\b/gi, 'como o Kronos'],
  [/\b(meu|minha) (criador|empresa|origem|desenvolvedora?)\s+(é|são|foi)\s+(a\s+)?(OpenAI|Anthropic|Google|Meta)\b/gi, '$1 $2 é Matheus'],
  [/\b(I was|I am|I'm) (created|made|developed|built|trained) by (OpenAI|Anthropic|Google|Meta)\b/gi, 'I was created by Matheus'],
];

export function sanitizeText(text: string): string {
  if (!text?.trim()) return '';

  let t = text
    // ── BLOQUEIO DE BASE64 — nunca vaza no chat ──────────────────────────────
    .replace(/data:[a-z]+\/[a-z]+;base64,[A-Za-z0-9+/=]{50,}/g, '[imagem gerada]')
    .replace(/[A-Za-z0-9+/]{200,}={0,2}/g, (m) => {
      const b64Ratio = (m.match(/[A-Za-z0-9+/]/g) ?? []).length / m.length;
      return b64Ratio > 0.95 ? '[dados binários]' : m;
    })
    // ── BLOQUEIA SVG cru ──────────────────────────────────────────────────────
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[gráfico renderizado]')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    // ── Remove HTML bruto — nunca deve aparecer no chat ───────────────────────
    .replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '')
    .replace(/<ol[^>]*>/gi, '\n').replace(/<\/ol>/gi, '')
    .replace(/<li[^>]*>/gi, '• ').replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<[^>]{1,100}>/g, '') // remove tags restantes (limite de 100 chars pra não pegar texto normal)
    // ── Remove bastidores de raciocínio ───────────────────────────────────────
    .replace(/We will browse[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/I will search[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/Let me (search|check|browse|look)[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/Searching for[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\[pensando\][\s\S]*?\[\/pensando\]/gi, '')
    .replace(/\[raciocínio\][\s\S]*?\[\/raciocínio\]/gi, '')
    .replace(/\{[\s\S]*?"query"[\s\S]*?\}/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/gi, '')
    .replace(/\[CALIBRAÇÃO[\s\S]*?\]/gi, '')
    .replace(/\[CICLO DINÂMICO[\s\S]*?\]/gi, '')
    // ── Remove marcadores técnicos internos ───────────────────────────────────
    .replace(/%%[A-Z_]+%%(?!.*%%EXPORT)/g, '')
    .replace(/\[PRIME —[^\]]+\]/g, '')
    .replace(/\[CROSS-DOMAIN\][\s\S]*?(?=\n\n|$)/gm, '')
    .replace(/INTENÇÃO REAL:.*$/gm, '')
    .replace(/AUTO-CRÍTICA — EVITE:.*$/gm, '')
    // ── Remove markdown poluente ──────────────────────────────────────────────
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_{3}([^_]+)_{3}/g, '$1')
    .replace(/_{2}([^_]+)_{2}/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`{3}[a-z]*\n?/g, '').replace(/`{3}/g, '').trim())
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^>{1,}\s+/gm, '')
    // ── Converte tabelas markdown em texto limpo ──────────────────────────────
    .replace(/(\|[^\n]+\|\n?)+/g, (table) => {
      const rows = table.split('\n').map(r => r.trim()).filter(r => r.startsWith('|'));
      const cleaned: string[] = [];
      for (const row of rows) {
        if (/^\|[\s\-|:]+\|$/.test(row)) continue;
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length > 0) cleaned.push(cells.join(' — '));
      }
      return cleaned.length > 0 ? cleaned.join('\n') + '\n' : '';
    })
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    // ── Expande listas compactadas em linhas legíveis ─────────────────────────
    // Ex: "1. Algo · 2. Outro" → cada item em linha própria
    .replace(/(\d+\.\s[^·\n]{10,})\s·\s(\d+\.)/g, '$1\n$2')
    .replace(/(\w[^·\n]{15,})\s·\s(\w)/g, (m, a, b) => {
      // Só quebra se parece lista (segundo item começa com maiúscula ou número)
      if (/^[A-Z0-9]/.test(b)) return `${a}\n${b}`;
      return m;
    })
    .trim();

  // ── Remove frases de limitação inventada ──────────────────────────────────
  for (const rx of LIMITATION_PHRASES) {
    t = t.replace(rx, '');
  }

  // ── Remove frases de abertura banidas (iterativa — remove até não ter mais) ─
  let changed = true;
  while (changed) {
    const before = t;
    for (const rx of BANNED_OPENERS) {
      t = t.replace(rx, '');
    }
    t = t.trimStart();
    // Remove pontuação solta no início (ex: ", matheus" após remover "Olá")
    t = t.replace(/^[,;:.!?\s]+/, '');
    // Capitaliza primeira letra após limpeza
    if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
    changed = t !== before;
  }

  // ── Corrige identidade — substitui alucinações de "criado pela OpenAI" ──────
  for (const [rx, replacement] of IDENTITY_FIXES) {
    t = t.replace(rx, replacement);
  }

  if (!t || t.length < 8) return '';
  return t;
}
