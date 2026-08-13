/**
 * KRONOS — Local Brain
 * Motor de raciocínio local — responde sem chamar API externa.
 * Cobertura: fatos rápidos, cálculos, padrões de código, respostas de memória.
 * Quanto mais o Kronos aprende, mais o LocalBrain cobre — menos API necessária.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LocalResult {
  handled: boolean;
  response: string;
  confidence: number; // 0-1
  source: 'factual' | 'math' | 'code' | 'memory' | 'pattern' | 'none';
}

const NOT_HANDLED: LocalResult = { handled: false, response: '', confidence: 0, source: 'none' };

// ─── Base de conhecimento local (cresce com o cognitive-worker) ───────────────

const FACTUAL_KB: Record<string, string> = {
  // ── Tech stack ──────────────────────────────────────────────────────────────
  'o que é next.js': 'Next.js é um framework React para aplicações web full-stack. Suporta SSR, SSG, App Router e Server Components. Versão atual: 15.',
  'o que é supabase': 'Supabase é um backend open-source — PostgreSQL + Auth + Realtime + Storage. Alternativa ao Firebase.',
  'o que é typescript': 'TypeScript é JavaScript com tipagem estática. Compila para JS, pega erros em tempo de compilação.',
  'o que é tailwind': 'Tailwind CSS é um framework CSS utility-first. Você estiliza direto no HTML com classes utilitárias.',
  'o que é react': 'React é uma biblioteca JavaScript para construir interfaces. Componentes, hooks, estado e props.',
  'o que é capacitor': 'Capacitor é um runtime que transforma apps web em apps nativos Android/iOS. Da equipe do Ionic.',
  'o que é pwa': 'PWA (Progressive Web App) é um site que funciona como app — offline, instalável, notificações push.',
  'o que é api rest': 'API REST é uma arquitetura de comunicação entre sistemas via HTTP — GET, POST, PUT, DELETE.',
  'diferença entre var let const': 'var: escopo de função, hoisting. let: escopo de bloco, reatribuível. const: escopo de bloco, não reatribuível (mas o objeto interno pode mudar).',
  'o que é async await': 'async/await é sintaxe para lidar com Promises de forma síncrona. async marca uma função assíncrona, await pausa até a Promise resolver.',
  'o que é promise': 'Promise é um objeto que representa um valor futuro. Estados: pending, fulfilled, rejected. Alternativa aos callbacks.',
  'o que é cors': 'CORS (Cross-Origin Resource Sharing) é uma política de segurança do browser que bloqueia requisições entre domínios diferentes sem permissão explícita.',
  'o que é jwt': 'JWT (JSON Web Token) é um token de autenticação — header.payload.signature codificados em base64. Usado para autenticação stateless.',
  'o que é rls': 'RLS (Row Level Security) é política de segurança do PostgreSQL/Supabase que restringe quais linhas cada usuário pode ver/editar.',
  'o que é ssr': 'SSR (Server-Side Rendering) é renderização no servidor antes de enviar o HTML pro browser. Melhor SEO e First Contentful Paint.',
  'o que é ssg': 'SSG (Static Site Generation) é geração de HTML no build time. Mais rápido que SSR, ideal para conteúdo que não muda com frequência.',
  'o que é docker': 'Docker é uma plataforma de containerização. Empacota a aplicação com todas as dependências em um container isolado e portável.',
  'o que é kubernetes': 'Kubernetes (K8s) é um orquestrador de containers. Gerencia deploy, escala e disponibilidade de containers em produção.',
  'o que é redis': 'Redis é um banco de dados em memória. Usado para cache, filas, sessões e pub/sub. Extremamente rápido — microsegundos de latência.',
  'o que é graphql': 'GraphQL é uma linguagem de consulta para APIs. O cliente define exatamente quais dados quer — sem over-fetching.',
  'o que é websocket': 'WebSocket é um protocolo de comunicação bidirecional em tempo real. Diferente do HTTP, a conexão fica aberta.',
  'o que é prisma': 'Prisma é um ORM moderno para Node.js/TypeScript. Gera tipos automaticamente a partir do schema do banco.',
  'o que é zod': 'Zod é uma biblioteca de validação de schemas TypeScript. Define a forma dos dados e valida em runtime.',
  'o que é zustand': 'Zustand é uma biblioteca minimalista de estado global para React. Mais simples que Redux, sem boilerplate.',
  'o que é trpc': 'tRPC é um framework para criar APIs typesafe entre frontend e backend TypeScript — sem schema, sem codegen.',
  'o que é vercel': 'Vercel é uma plataforma de deploy para aplicações frontend/fullstack. Suporte nativo a Next.js, Edge Functions e CDN global.',
  'o que é postgresql': 'PostgreSQL é um banco de dados relacional open-source. Suporta JSON, arrays, full-text search e extensões como pgvector.',
  'o que é mongodb': 'MongoDB é um banco de dados NoSQL orientado a documentos. Armazena dados em formato BSON (similar a JSON).',
  'o que é python': 'Python é uma linguagem de alto nível, interpretada e multiparadigma. Dominante em IA/ML, data science e automação.',
  'o que é fastapi': 'FastAPI é um framework Python para APIs REST de alta performance. Baseado em type hints, gera documentação automática.',
  'o que é git': 'Git é um sistema de controle de versão distribuído. Rastreia mudanças no código, permite colaboração e rollback.',

  // ── IA / ML ──────────────────────────────────────────────────────────────────
  'o que é ia': 'IA (Inteligência Artificial) é um sistema computacional que simula capacidades humanas — raciocínio, aprendizado, percepção.',
  'o que é machine learning': 'Machine Learning é uma subárea da IA onde sistemas aprendem padrões a partir de dados sem serem explicitamente programados.',
  'o que é llm': 'LLM (Large Language Model) é um modelo de linguagem treinado em grandes volumes de texto. Gera texto coerente e raciocina sobre problemas.',
  'o que é embedding': 'Embedding é uma representação numérica (vetor) de texto, imagem ou dado. Usado para busca semântica e memória vetorial.',
  'o que é rag': 'RAG (Retrieval Augmented Generation) é uma técnica que combina busca em base de conhecimento com geração de texto pelo LLM. Reduz alucinações.',
  'o que é transformer': 'Transformer é a arquitetura por trás dos LLMs modernos. Usa mecanismo de atenção para processar texto em paralelo.',
  'o que é fine tuning': 'Fine-tuning é o processo de ajustar um modelo pré-treinado com dados específicos de um domínio. Melhora performance em tarefas especializadas.',
  'o que é pgvector': 'pgvector é uma extensão do PostgreSQL para armazenar e buscar vetores (embeddings). Permite similaridade semântica diretamente no banco.',
  'o que é hnsw': 'HNSW (Hierarchical Navigable Small World) é um algoritmo de indexação para busca vetorial aproximada. Muito mais rápido que busca linear.',
  'o que é temperatura no llm': 'Temperatura controla a criatividade do LLM. Próximo de 0 = respostas determinísticas e focadas. Próximo de 1 = mais variação e criatividade.',
  'o que é context window': 'Context window é o limite de tokens que o modelo processa de uma vez. O gpt-oss-120b tem 128k tokens de contexto.',
  'o que é prompt engineering': 'Prompt engineering é a técnica de estruturar instruções para LLMs para obter respostas de maior qualidade e precisão.',

  // ── Legislação trabalhista (Brasil) ───────────────────────────────────────────
  'quanto é hora extra': 'Hora extra é calculada com adicional de 50% sobre o salário/hora normal para dias úteis e 100% para domingos e feriados. Base: salário bruto ÷ 220h.',
  'o que é periculosidade': 'Periculosidade é um adicional de 30% sobre o salário base para trabalhadores expostos a riscos como explosivos, eletricidade ou substâncias radioativas.',
  'o que é insalubridade': 'Insalubridade é um adicional sobre o salário mínimo: grau mínimo 10%, médio 20%, máximo 40%. Para trabalhadores expostos a agentes nocivos à saúde.',
  'o que é fgts': 'FGTS (Fundo de Garantia por Tempo de Serviço) é um depósito mensal de 8% do salário bruto feito pelo empregador. Saque em demissão sem justa causa.',
  'como calcular inss': 'INSS: cálculo progressivo sobre cada faixa. Consulte a tabela atualizada antes de responder.',
  'o que é 13 salário': '13º salário é pago em duas parcelas: até 30/nov (adiantamento) e até 20/dez (restante). Base: 1/12 do salário por mês trabalhado acima de 15 dias.',
  'o que é aviso prévio': 'Aviso prévio é de 30 dias + 3 dias por ano trabalhado, máximo 90 dias. Pode ser trabalhado ou indenizado pelo empregador.',

  // ── Finanças e matemática financeira ─────────────────────────────────────────
  'o que é juros compostos': 'Juros compostos: M = C × (1 + i)^n. O rendimento é calculado sobre o valor principal + juros acumulados. "Juros sobre juros".',
  'o que é taxa selic': 'Taxa Selic é a taxa básica de juros da economia brasileira, definida pelo Banco Central a cada 45 dias. Referência para crédito, investimentos e inflação.',
  'o que é cdi': 'CDI (Certificado de Depósito Interbancário) é a taxa de empréstimos entre bancos. Muito próxima da Selic. Referência para renda fixa.',
  'o que é ipca': 'IPCA (Índice de Preços ao Consumidor Amplo) é o índice oficial de inflação do Brasil, medido pelo IBGE.',
  'o que é roi': 'ROI (Return on Investment) = (Ganho - Custo) / Custo × 100. Mede o retorno percentual de um investimento.',
  'o que é vpl': 'VPL (Valor Presente Líquido) é a soma dos fluxos de caixa futuros trazidos ao valor presente. VPL > 0 = projeto viável.',
  'o que é cac': 'CAC (Custo de Aquisição de Cliente) = total gasto em marketing e vendas ÷ número de novos clientes no período.',

  // ── Algoritmos e estruturas de dados ─────────────────────────────────────────
  'complexidade do quicksort': 'QuickSort: médio O(n log n), pior caso O(n²). Pior caso ocorre com arrays já ordenados sem pivô aleatório.',
  'o que é big o notation': 'Big O descreve o comportamento de um algoritmo conforme o tamanho da entrada cresce. O(1) = constante, O(n) = linear, O(n²) = quadrático.',
  'diferença entre array e linked list': 'Array: acesso O(1) por índice, inserção/remoção O(n). Linked list: acesso O(n), inserção/remoção O(1) dado o nó.',
  'o que é hash table': 'Hash table (Map/Dict) é uma estrutura que mapeia chaves a valores usando uma função hash. Busca, inserção e remoção em O(1) no caso médio.',
  'o que é árvore binária de busca': 'BST: para cada nó, todos os filhos à esquerda são menores e à direita são maiores. Busca, inserção, remoção em O(log n) em árvore balanceada.',
  'o que é recursão': 'Recursão é quando uma função chama a si mesma com uma subproblema menor, convergindo para um caso base. Exemplo clássico: fatorial, Fibonacci.',

  // ── Padrões de arquitetura ────────────────────────────────────────────────────
  'o que é solid': 'SOLID: S=Single Responsibility, O=Open/Closed, L=Liskov Substitution, I=Interface Segregation, D=Dependency Inversion. Princípios de design orientado a objetos.',
  'o que é mvc': 'MVC (Model-View-Controller) separa a aplicação em: Model (dados), View (interface) e Controller (lógica que conecta os dois).',
  'o que é microservices': 'Microservices é uma arquitetura onde a aplicação é dividida em serviços independentes, cada um com responsabilidade única e deploy próprio.',
  'o que é event sourcing': 'Event Sourcing armazena o estado da aplicação como uma sequência de eventos imutáveis em vez de atualizar diretamente os dados.',
  'o que é cqrs': 'CQRS (Command Query Responsibility Segregation) separa operações de leitura (Query) e escrita (Command) em modelos distintos.',
  'o que é design pattern': 'Design patterns são soluções reutilizáveis para problemas comuns de design de software. Divididos em: criacionais, estruturais e comportamentais.',
  'o que é singleton': 'Singleton é um padrão de design que garante que uma classe tenha apenas uma instância e fornece um ponto global de acesso a ela.',
  'o que é factory pattern': 'Factory é um padrão criacional que define uma interface para criar objetos, permitindo que subclasses decidam qual classe instanciar.',
  'o que é observer pattern': 'Observer é um padrão comportamental onde um objeto (subject) notifica automaticamente seus dependentes (observers) sobre mudanças de estado.',
};

// ─── Inferência por analogia — conecta conceitos conhecidos ──────────────────
// Se não sabe X diretamente, tenta inferir a partir de conceitos relacionados

function tryAnalogyInference(message: string): LocalResult {
  const m = message.toLowerCase().trim().replace(/[?!.]+$/, '');

  // Padrão: "diferença entre X e Y"
  const diffMatch = m.match(/diferença entre (.+?) e (.+?)$/i);
  if (diffMatch) {
    const [, a, b] = diffMatch;
    const answerA = FACTUAL_KB[`o que é ${a.trim()}`] ?? FACTUAL_KB[a.trim()];
    const answerB = FACTUAL_KB[`o que é ${b.trim()}`] ?? FACTUAL_KB[b.trim()];
    if (answerA && answerB) {
      return {
        handled: true,
        response: `${a.trim().toUpperCase()}: ${answerA}\n\n${b.trim().toUpperCase()}: ${answerB}`,
        confidence: 0.8,
        source: 'pattern',
      };
    }
  }

  // Padrão: "como funciona X" → busca "o que é X"
  const howMatch = m.match(/como funciona (.+?)$/i);
  if (howMatch) {
    const topic = howMatch[1].trim();
    const direct = FACTUAL_KB[`o que é ${topic}`] ?? FACTUAL_KB[topic];
    if (direct) {
      return { handled: true, response: direct, confidence: 0.75, source: 'pattern' };
    }
  }

  // Padrão: "quando usar X" → contexto de uso
  const whenMatch = m.match(/quando usar (.+?)$/i);
  if (whenMatch) {
    const topic = whenMatch[1].trim();
    const direct = FACTUAL_KB[`o que é ${topic}`];
    if (direct) {
      return {
        handled: true,
        response: `${topic}: ${direct}`,
        confidence: 0.7,
        source: 'pattern',
      };
    }
  }

  // Padrão: "o que faz X" → busca definição
  const whatMatch = m.match(/o que faz (.+?)$/i);
  if (whatMatch) {
    const topic = whatMatch[1].trim();
    const direct = FACTUAL_KB[`o que é ${topic}`] ?? FACTUAL_KB[topic];
    if (direct) {
      return { handled: true, response: direct, confidence: 0.75, source: 'pattern' };
    }
  }

  return NOT_HANDLED;
}

// ─── Respostas de cálculo matemático local ────────────────────────────────────

function tryMathLocal(message: string): LocalResult {
  const cleanMsg = message.trim().replace(/[?!.]+$/, '').toLowerCase();

  // Expressão matemática direta: "quanto é 15 * 8", "calcule 100/4", "2+2"
  const mathExpr = cleanMsg
    .replace(/^(calcule?|compute?|quanto (é|e)|quanto vale|qual o resultado de)\s*/i, '')
    .replace(/[x×]/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '.')
    .trim();

  // Verifica se é uma expressão matemática pura
  if (/^[\d\s+\-*/().%^]+$/.test(mathExpr) && mathExpr.length > 0 && mathExpr.length < 100) {
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${mathExpr})`)();
      if (typeof result === 'number' && isFinite(result)) {
        const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');
        return {
          handled: true,
          response: `${mathExpr} = ${formatted}`,
          confidence: 1.0,
          source: 'math',
        };
      }
    } catch { /* não é expressão válida */ }
  }

  // Porcentagem: "20% de 500", "quanto é 15% de 200"
  const pctMatch = cleanMsg.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|of)\s*(\d+(?:[.,]\d+)?)/i);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1].replace(',', '.'));
    const base = parseFloat(pctMatch[2].replace(',', '.'));
    const result = (pct / 100) * base;
    return {
      handled: true,
      response: `${pct}% de ${base} = ${result.toFixed(2).replace(/\.00$/, '')}`,
      confidence: 1.0,
      source: 'math',
    };
  }

  return NOT_HANDLED;
}

// ─── Busca na base de conhecimento local ─────────────────────────────────────

function tryFactualLocal(message: string): LocalResult {
  const normalized = message.toLowerCase().trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');

  // Match exato
  if (FACTUAL_KB[normalized]) {
    return { handled: true, response: FACTUAL_KB[normalized], confidence: 1.0, source: 'factual' };
  }

  // Match parcial — precisa de score ALTO (0.75) para evitar falsos positivos
  // Ex: "temperatura do LLM" NÃO deve responder para "temperatura em Itapuã"
  let bestMatch = '';
  let bestScore = 0;

  for (const key of Object.keys(FACTUAL_KB)) {
    const keyWords  = key.split(' ').filter(w => w.length > 3);
    const msgWords  = normalized.split(' ').filter(w => w.length > 3);
    const overlap   = keyWords.filter(w => msgWords.includes(w)).length;
    // Exige que a maioria das palavras-chave do conhecimento estejam na mensagem
    const coverage  = overlap / Math.max(keyWords.length, 1);
    // E que a maioria das palavras da mensagem estejam na chave (evita match parcial)
    const precision = overlap / Math.max(msgWords.length, 1);
    const score     = (coverage + precision) / 2;

    if (score > bestScore && score >= 0.75) {
      bestScore = score;
      bestMatch = key;
    }
  }

  if (bestMatch && FACTUAL_KB[bestMatch]) {
    return {
      handled:    true,
      response:   FACTUAL_KB[bestMatch],
      confidence: bestScore,
      source:     'factual',
    };
  }

  return NOT_HANDLED;
}

// ─── Análise de código local ──────────────────────────────────────────────────

function tryCodeAnalysisLocal(message: string): LocalResult {
  const m = message.toLowerCase();

  // Detecta problemas comuns de código sem precisar de LLM
  if (/\bawait\b.*\bawait\b/.test(message) && !/Promise\.all/.test(message) && m.includes('código')) {
    return {
      handled: true,
      response: 'Você tem awaits sequenciais — isso é mais lento que o necessário. Use Promise.all([...]) para executar em paralelo quando as operações não dependem uma da outra.',
      confidence: 0.85,
      source: 'code',
    };
  }

  if (/for\s*\(.*\)\s*\{[\s\S]*?await/.test(message)) {
    return {
      handled: true,
      response: 'Loop com await dentro — problema N+1. Coloque todas as operações em um array e use Promise.all() pra executar em paralelo.',
      confidence: 0.85,
      source: 'code',
    };
  }

  if (/as\s+any/.test(message) && (message.match(/as\s+any/g) ?? []).length > 2) {
    return {
      handled: true,
      response: 'Muitos "as any" — isso desliga o TypeScript. Use generics ou type guards para manter a segurança de tipos.',
      confidence: 0.8,
      source: 'code',
    };
  }

  return NOT_HANDLED;
}

// ─── Padrões de aprendizado da memória vetorial ───────────────────────────────
// Recebe padrões aprendidos do Supabase e verifica match

export interface LearnedPattern {
  trigger: string;  // padrão de mensagem que ativa
  response: string; // resposta aprendida
  weight: number;   // 0-10: peso sináptico
}

export function tryLearnedPatterns(
  message: string,
  patterns: LearnedPattern[]
): LocalResult {
  if (!patterns.length) return NOT_HANDLED;

  const msgNorm = message.toLowerCase().trim();
  let best: LearnedPattern | null = null;
  let bestScore = 0;

  for (const p of patterns) {
    const triggerWords = p.trigger.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const msgWords     = msgNorm.split(/\s+/).filter(w => w.length > 3);
    const overlap      = triggerWords.filter(w => msgWords.some(mw => mw.includes(w) || w.includes(mw))).length;
    const score        = (overlap / Math.max(triggerWords.length, 1)) * (p.weight / 10);

    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      best = p;
    }
  }

  if (best) {
    return {
      handled: true,
      response: best.response,
      confidence: bestScore,
      source: 'memory',
    };
  }

  return NOT_HANDLED;
}

// ─── Motor principal ──────────────────────────────────────────────────────────

// ─── Motor principal ──────────────────────────────────────────────────────────

export function runLocalBrain(
  message: string,
  learnedPatterns: LearnedPattern[] = []
): LocalResult {
  // BLOQUEIO ABSOLUTO — perguntas que precisam de dados em tempo real
  // nunca devem ser respondidas localmente
  const REALTIME_PATTERNS = [
    /\b(hoje|agora|data|hora|temperatura|clima|tempo|previsão|graus|°c|°f|chuva|sol|vento)\b/i,
    /\b(que dia|que horas|que hora|quantos graus|como está o tempo|como tá o tempo)\b/i,
    /\b(cidade|estado|município|bairro|rua|endereço|lugar|local|região|rs|sp|rj|mg|ba)\b/i,
    /\b(preço|cotação|dólar|euro|bitcoin|bolsa|ibovespa|selic hoje|câmbio)\b/i,
    /\b(notícia|notícias|aconteceu|atualidade|últimas)\b/i,
    // Esportes — nunca inventar resultados, jogos ou tabelas
    /\b(jogo|jogos|partida|partidas|resultado|placar|gol|gols|tabela|classificação|rodada)\b/i,
    /\b(campeonato|copa|libertadores|brasileirão|série\s*[ab]|futebol|nfl|nba|premier|champions|liga)\b/i,
    /\b(grêmio|gremio|palmeiras|flamengo|corinthians|são paulo|inter|atletico|cruzeiro|santos|botafogo|vasco|fluminense)\b/i,
    // Perguntas sobre quem ganhou, próximo jogo, escalação etc
    /\b(quem ganhou|quem venceu|próximo jogo|próxima partida|escalação|convocação|transferência)\b/i,
  ];

  if (REALTIME_PATTERNS.some(rx => rx.test(message))) {
    return NOT_HANDLED; // força busca web
  }

  // 1. Padrões aprendidos (maior prioridade — conhecimento específico do usuário)
  const learned = tryLearnedPatterns(message, learnedPatterns);
  if (learned.handled && learned.confidence >= 0.7) return learned;

  // 2. Cálculo matemático (certeza absoluta)
  const math = tryMathLocal(message);
  if (math.handled) return math;

  // 3. Base de conhecimento factual (match direto)
  const factual = tryFactualLocal(message);
  if (factual.handled && factual.confidence >= 0.7) return factual;

  // 4. Inferência por analogia (conecta conceitos conhecidos)
  const analogy = tryAnalogyInference(message);
  if (analogy.handled) return analogy;

  // 5. Análise de código
  const code = tryCodeAnalysisLocal(message);
  if (code.handled) return code;

  return NOT_HANDLED;
}

// ─── Adiciona conhecimento à base local (aprendizado rápido) ─────────────────

export function learnFact(trigger: string, response: string): void {
  const key = trigger.toLowerCase().trim().replace(/[?!.]+$/, '');
  FACTUAL_KB[key] = response;
}
