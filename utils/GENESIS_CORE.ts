/**
 * GENESIS CORE - Motor de Raciocínio Emergente do Kronos
 * Não é um simples banco de dados. É uma mente sintética.
 */
export type ThoughtSeed = {
  id: string;
  content: any;
  domain: 'code' | 'logic' | 'architecture' | 'preference' | 'emergent';
  associations: string[];
  weight: number;
  createdAt: number;
};

export type InsightChain = {
  seed: ThoughtSeed;
  inferences: string[];
  synthesis: string;
  confidence: number;
  novelty: number;
};

export type ThinkFirstResult = {
  confidence: number;
  clarificationNeeded?: string;
  longTermContext: string[];
};

// Singleton em memória para manter continuidade cognitiva
export class GenesisCore {
  private static instance: GenesisCore;
  public static shared(): GenesisCore {
    if (!GenesisCore.instance) GenesisCore.instance = new GenesisCore();
    return GenesisCore.instance;
  }

  private thoughtSeeds: Map<string, ThoughtSeed> = new Map();
  private associationMatrix: Map<string, Set<string>> = new Map();
  private domainWeights: Record<string, number> = {
    code: 0.8,
    logic: 0.9,
    architecture: 0.85,
    preference: 0.6,
    emergent: 0.95,
  };

  constructor() {
    console.log('[GenesisCore] Cérebro cognitivo vivo inicializado');
  }

  // Fertiliza uma ideia inicial no solo neural
  plantSeed(seed: Omit<ThoughtSeed, 'id' | 'createdAt'>): string {
    const id = `thought_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newSeed: ThoughtSeed = {
      ...seed,
      id,
      createdAt: Date.now(),
    };

    this.thoughtSeeds.set(id, newSeed);
    this.reinforceAssociations(newSeed);
    console.log(`[GenesisCore] Semente plantada: ${seed.domain} -> ${id}`);
    return id;
  }

  // Rede de associações livres - cruza domínios diferentes
  private reinforceAssociations(seed: ThoughtSeed) {
    const existing = Array.from(this.thoughtSeeds.values());
    existing.forEach((existingSeed) => {
      const synergy = this.calculateSynergy(seed, existingSeed);
      if (synergy > 0.3) {
        // Associação fluida entre domínios distintos
        this.linkThoughts(seed.id, existingSeed.id);
      }
    });
  }

  private calculateSynergy(a: ThoughtSeed, b: ThoughtSeed): number {
    const domainMatch = a.domain === b.domain ? 0.2 : 0.5; // Penaliza domínio igual, incentiva cruzamento
    const contentSimilarity = this.measureSimilarity(a.content, b.content);
    return domainMatch + contentSimilarity * 0.5;
  }

  private measureSimilarity(a: any, b: any): number {
    if (typeof a === 'string' && typeof b === 'string') {
      const levenshtein = this.levenshteinDistance(a.toLowerCase(), b.toLowerCase());
      const maxLen = Math.max(a.length, b.length);
      return maxLen === 0 ? 1 : 1 - levenshtein / maxLen;
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      const overlap = keysA.filter((k) => keysB.includes(k)).length;
      return keysA.length === 0 && keysB.length === 0 ? 1 : overlap / Math.max(keysA.length, keysB.length);
    }
    return 0;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
      }
    }
    return matrix[b.length][a.length];
  }

  private linkThoughts(idA: string, idB: string) {
    const setA = this.associationMatrix.get(idA) || new Set();
    const setB = this.associationMatrix.get(idB) || new Set();
    setA.add(idB);
    setB.add(idA);
    this.associationMatrix.set(idA, setA);
    this.associationMatrix.set(idB, setB);
  }

  // Inferência lógica cruzada e síntese criativa
  synthesize(problem: any, context: any[] = []): InsightChain {
    console.log('[GenesisCore] Sintetizando solução criativa...');

    const candidates = this.retrieveRelevantThoughts(problem, context);
    const inferences: string[] = [];
    let confidence = 0;
    let novelty = 0;

    // Cruzamento de domínios
    const domainsUsed = new Set<string>();
    candidates.forEach((c) => {
      domainsUsed.add(c.domain);
      inferences.push(`[${c.domain}] ${this.abstractInsight(c)}`);
      confidence += this.domainWeights[c.domain] || 0.5;
      if (c.domain !== 'code' && c.domain !== 'logic') novelty += 0.15;
    });

    confidence = Math.min(confidence / candidates.length, 1);
    novelty = Math.min(novelty + domainsUsed.size * 0.1, 1);

    // Síntese emergente
    const synthesis = this.generateEmergentSynthesis(candidates, inferences, problem);

    // plantar uma semente emergente com a síntese
    this.plantSeed({
      content: { problem, synthesis },
      domain: 'emergent',
      associations: candidates.map((c) => c.id),
      weight: novelty,
    });

    return {
      seed: { id: 'synthesis_' + Date.now(), content: problem, domain: 'emergent', associations: [], weight: 0, createdAt: Date.now() },
      inferences,
      synthesis,
      confidence,
      novelty,
    };
  }

  private retrieveRelevantThoughts(problem: any, context: any[]): ThoughtSeed[] {
    const all = Array.from(this.thoughtSeeds.values());
    if (all.length === 0) return [];

    const scores = all.map((seed) => ({
      seed,
      score:
        this.measureSimilarity(seed.content, problem) * 0.6 +
        (context.some((c) => this.measureSimilarity(c, seed.content) > 0.5) ? 0.3 : 0) +
        (seed.weight || 0) * 0.1,
    }));

    scores.sort((a, b) => (a.score > b.score ? -1 : 1));
    return scores.slice(0, 5).map((s) => s.seed);
  }

  private abstractInsight(seed: ThoughtSeed): string {
    const c = seed.content;
    if (typeof c === 'string') return `Uma aplicação não óbvia de "${c.slice(0, 40)}..."`;
    if (c?.pattern) return `Reconheço um padrão estrutural ${c.pattern} com potencial para ${c.implication || 'inovação'}`;
    if (c?.approach) return `Abordagem ${c.approach} pode ser recontextualizada`;
    return 'Conceito com potencial de generalização';
  }

  private generateEmergentSynthesis(
    candidates: ThoughtSeed[],
    inferences: string[],
    problem: any,
  ): string {
    if (candidates.length === 0) {
      return this.generateNovelSolution(problem);
    }

    const parts = [
      'Síntese emergente do GenesisCore:',
      `Problema apresentado: ${JSON.stringify(problem).slice(0, 80)}`,
      `Caminhos inferenciais cruzados: ${inferences.length}`,
      `Domínios conectados: ${[...new Set(candidates.map((c) => c.domain))].join(' + ')}`,
    ];

    const synthesized = candidates
      .map((c, i) => {
        return `Insight ${i + 1}: ${this.crossDomainTransfer(c, problem)}`;
      })
      .join('\n');

    return [...parts, synthesized, this.generatedRecommendation()].join('\n');
  }

  private crossDomainTransfer(seed: ThoughtSeed, problem: any): string {
    switch (seed.domain) {
      case 'code':
        return `Da engenharia de código: aplique ${seed.content?.principle || 'princípio SOLID'} adaptado ao problema, mantendo modularidade.`;
      case 'logic':
        return `Da lógica formal: decompose o problema com base em ${seed.content?.method || 'premissas booleanas consistentes'}.`;
      case 'architecture':
        return `Da arquitetura: estruture a solução como ${seed.content?.pattern || 'um sistema modular'} com acoplamento reduzido.`;
      case 'preference':
        return `Das preferências aprendidas: adapte a experiência para ${seed.content?.style || 'interação fluida'}.`;
      default:
        return 'Combine as premissas em uma rede de possibilidades e escolha o caminho mais elegante.';
    }
  }

  private generateNovelSolution(problem: any): string {
    return `Solução sintética original: O problema "${JSON.stringify(problem).slice(0, 40)}" não tem precedentes diretos, mas podemos inferir uma resolução baseada em primeiros princípios de engenharia reversa, decompondo em sub-problemas tratáveis e reconstruindo uma solução idiossincrática mas coerente.`;
  }

  private generatedRecommendation(): string {
    return 'Recomendação: arquitete a implementação seguindo estes insights como diretrizes abstratas, garantindo flexibilidade.';
  }

  // Expansão autônoma do conhecimento
  expandFromSupabase(knowledge: any[]) {
    console.log(`[GenesisCore] Expandindo conhecimento com ${knowledge.length} itens`);
    knowledge.forEach((item) => {
      const domain = this.inferDomain(item);
      this.plantSeed({
        content: item,
        domain,
        associations: [],
        weight: 0.5,
      });
    });
  }

  private inferDomain(item: any): ThoughtSeed['domain'] {
    const text = JSON.stringify(item).toLowerCase();
    if (text.includes('cod') || text.includes('function')) return 'code';
    if (text.includes('system') || text.includes('logic')) return 'logic';
    if (text.includes('user') || text.includes('prefer')) return 'preference';
    if (text.includes('architecture') || text.includes('design')) return 'architecture';
    return 'emergent';
  }

  // Chain-of-Thought multi-camada — enriquece o contexto de longo prazo
  thinkFirst(message: string, _modeHint?: string, _hasFiles?: boolean): ThinkFirstResult {
    const problem = { message, modeHint: _modeHint, hasFiles: _hasFiles };

    // Planta semente cognitiva contextualizada pelo modo
    if (typeof _modeHint === 'string') {
      GENESIS.plantSeed({
        content: { message, mode: _modeHint },
        domain: _modeHint === 'academy' || _modeHint === 'kids' ? 'emergent' : 'code',
        associations: [],
        weight: 0.4,
      });
    }

    const insight = GENESIS.synthesize(problem, [message]);

    // CoT L1 — Decomposição de intenção em sub-tarefas
    const intentDecomposition = this.decomposeIntent(message, _modeHint);

    // CoT L2 — Identificação de dependências ocultas
    const hiddenDeps = this.identifyHiddenDependencies(message);

    // CoT L3 — Antecipação de armadilhas comuns
    const pitfalls = this.anticipatePitfalls(message, _modeHint);

    // Constrói longTermContext rico com os 3 níveis de CoT
    const enrichedContext = [
      ...insight.inferences.slice(0, 2),
      ...intentDecomposition,
      ...hiddenDeps,
      ...pitfalls,
    ].filter(Boolean).slice(0, 6);

    return {
      confidence: Math.max(insight.confidence, 0.7),
      longTermContext: enrichedContext,
    };
  }

  // CoT L1: Decompõe a intenção em sub-tarefas executáveis
  private decomposeIntent(message: string, mode?: string): string[] {
    const parts: string[] = [];
    const m = message.toLowerCase();

    if (/crie|implemente|desenvolva|construa/i.test(m)) {
      parts.push('Sub-tarefa 1: definir a estrutura e tipos antes de gerar código');
      if (/componente|react/i.test(m)) parts.push('Sub-tarefa 2: verificar se precisa de Server ou Client Component');
      if (/api|rota|route/i.test(m)) parts.push('Sub-tarefa 2: definir método HTTP, input validation e response type');
    }

    if (/analise|revise|audite/i.test(m)) {
      parts.push('Sub-tarefa 1: identificar problemas de segurança primeiro, depois performance');
    }

    if (/explique|ensine|como funciona/i.test(m) && mode === 'academy') {
      parts.push('Abordar com: conceito → exemplo simples → exemplo real → exercício mental');
    }

    return parts;
  }

  // CoT L2: Identifica dependências que o usuário não mencionou
  private identifyHiddenDependencies(message: string): string[] {
    const deps: string[] = [];
    const m = message.toLowerCase();

    if (/supabase/i.test(m) && !/rls/i.test(m)) {
      deps.push('Verificar: RLS está habilitado na tabela mencionada?');
    }
    if (/deploy|produção|vercel/i.test(m)) {
      deps.push('Verificar: variáveis de ambiente estão configuradas no ambiente de destino?');
    }
    if (/fetch|api|request/i.test(m) && !/error|catch|try/i.test(m)) {
      deps.push('Dependência oculta: error handling necessário para chamadas assíncronas');
    }
    if (/migration|tabela|table/i.test(m)) {
      deps.push('Verificar: migration é idempotente? Considera rollback?');
    }

    return deps.slice(0, 2);
  }

  // CoT L3: Antecipa armadilhas comuns por contexto
  private anticipatePitfalls(message: string, mode?: string): string[] {
    const pitfalls: string[] = [];
    const m = message.toLowerCase();

    if (/next\.js|nextjs/i.test(m) && /usestate|useeffect/i.test(m)) {
      pitfalls.push('Armadilha: useState/useEffect requer "use client" — verificar se é necessário ou se pode ser Server Component');
    }
    if (/async.*loop|loop.*async|for.*await/i.test(m)) {
      pitfalls.push('Armadilha: loop com await sequencial — usar Promise.all para paralelizar');
    }
    if (mode === 'kids' && message.length > 200) {
      pitfalls.push('Armadilha: resposta longa demais para o modo kids — simplificar ao máximo');
    }
    if (/senha|password|token|secret|key/i.test(m)) {
      pitfalls.push('Armadilha: nunca expor credenciais no código ou log — usar variáveis de ambiente');
    }

    return pitfalls.slice(0, 2);
  }

  isGenesisActivation(message: string): boolean {
    return /genesis|gênese|protocolo\s+(kronos\s+)?genesis|genesis\s+(online|ativado|ativo)/i.test(message);
  }

  isPDFRequest(message: string): boolean {
    return /\bpdf\b| documento\b| exportar\s+pdf|gere?\s+pdf|relatório|dossiê/i.test(message);
  }
}

const GENESIS = new GenesisCore();

// Helpers usados pelo chat/route.ts
export function thinkFirst(message: string, modeHint?: string, hasFiles?: boolean): ThinkFirstResult {
  return GenesisCore.shared().thinkFirst(message, modeHint, hasFiles);
}

export function isGenesisActivation(message: string): boolean {
  return GenesisCore.shared().isGenesisActivation(message);
}

export function isPDFRequest(message: string): boolean {
  return GenesisCore.shared().isPDFRequest(message);
}
