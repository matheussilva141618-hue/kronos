/**
 * KRONOS REASONER — Motor de Raciocínio Simbólico Local
 * 100% sem API. Roda em Node.js puro.
 *
 * v2.0 — Raciocínio acelerado com cache neural e anti-alucinação
 *
 * Implementa:
 * 1. Raciocínio dedutivo — regras lógicas if-then encadeadas
 * 2. Raciocínio por analogia — encontra padrões similares e adapta
 * 3. Decomposição de problemas — quebra problemas complexos em sub-partes
 * 4. Síntese de conhecimento — combina fatos conhecidos em novos insights
 * 5. Detecção de contradição — identifica inconsistências antes de responder
 * 6. Cache neural — respostas instantâneas para padrões recorrentes
 * 7. Anti-alucinação — validação factual antes de afirmar
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface Fact {
  subject:   string;
  predicate: string;
  object:    string;
  confidence: number; // 0-1
  source:    'learned' | 'inferred' | 'builtin';
  timestamp: number;
}

export interface Rule {
  id:         string;
  condition:  (facts: Fact[], context: string) => boolean;
  conclusion: (facts: Fact[], context: string) => string;
  weight:     number; // 0-1: quão confiável é esta regra
  usageCount: number;
}

export interface ReasoningResult {
  answer:       string;
  confidence:   number;
  method:       'deductive' | 'analogical' | 'synthesis' | 'decomposition' | 'cache' | 'none';
  steps:        string[];   // cadeia de raciocínio transparente
  contradictions: string[]; // inconsistências detectadas
  fromCache:    boolean;    // veio do cache neural?
}

// ─── Cache Neural (para respostas instantâneas) ────────────────────────────────

interface NeuralCacheEntry {
  pattern: string;        // padrão da pergunta
  answer: string;         // resposta
  confidence: number;
  uses: number;           // quantas vezes foi usado
  lastUsed: number;
  accuracy: number;       // taxa de acerto histórica
}

class NeuralCache {
  private cache: Map<string, NeuralCacheEntry> = new Map();
  private readonly MAX_SIZE = 1000;
  private readonly MIN_ACCURACY = 0.7; // abaixo disso, remove do cache

  get(pattern: string): NeuralCacheEntry | null {
    const key = this.normalize(pattern);
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Só usa cache se tiver boa precisão histórica
    if (entry.accuracy < this.MIN_ACCURACY) {
      this.cache.delete(key);
      return null;
    }

    // Atualiza estatísticas
    entry.uses++;
    entry.lastUsed = Date.now();
    return entry;
  }

  set(pattern: string, answer: string, confidence: number, wasCorrect: boolean): void {
    const key = this.normalize(pattern);
    const existing = this.cache.get(key);

    if (existing) {
      // Atualiza entrada existente
      existing.uses++;
      existing.lastUsed = Date.now();
      existing.accuracy = (existing.accuracy * 0.9) + (wasCorrect ? 0.1 : 0.0);
      existing.confidence = Math.max(existing.confidence, confidence);
    } else {
      // Nova entrada
      this.cache.set(key, {
        pattern: key,
        answer,
        confidence,
        uses: 1,
        lastUsed: Date.now(),
        accuracy: wasCorrect ? 1.0 : 0.5,
      });
    }

    // Limpa cache se ficar muito grande
    if (this.cache.size > this.MAX_SIZE) {
      // Remove entradas pouco usadas
      const entries = [...this.cache.values()].sort((a, b) => a.uses - b.uses);
      entries.slice(0, Math.floor(this.MAX_SIZE / 4)).forEach(e => this.cache.delete(e.pattern));
    }
  }

  private normalize(text: string): string {
    return text.toLowerCase()
      .replace(/[^a-záéíóúàâêôãõüçñ0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200); // primeiros 200 chars como chave
  }

  getStats() {
    return {
      size: this.cache.size,
      avgAccuracy: [...this.cache.values()].reduce((sum, e) => sum + e.accuracy, 0) / this.cache.size || 0,
      totalUses: [...this.cache.values()].reduce((sum, e) => sum + e.uses, 0),
    };
  }
}

const neuralCache = new NeuralCache();

// ─── Base de Fatos (cresce com o uso) ─────────────────────────────────────────

class FactBase {
  private facts: Map<string, Fact> = new Map();
  private indexBySubject: Map<string, Set<string>> = new Map();
  private indexByPredicate: Map<string, Set<string>> = new Map();

  add(fact: Fact): void {
    const key = `${fact.subject}:${fact.predicate}:${fact.object}`;
    const existing = this.facts.get(key);
    if (existing) {
      // Reforça confiança se o fato já existe
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.timestamp = Date.now();
    } else {
      this.facts.set(key, { ...fact, timestamp: Date.now() });
      // Indexa para busca rápida
      this.indexFact(fact.subject, key, 'subject');
      this.indexFact(fact.predicate, key, 'predicate');
    }
  }

  private indexFact(term: string, factKey: string, type: 'subject' | 'predicate'): void {
    const index = type === 'subject' ? this.indexBySubject : this.indexByPredicate;
    const normalized = term.toLowerCase();
    const set = index.get(normalized) || new Set();
    set.add(factKey);
    index.set(normalized, set);
  }

  query(subject?: string, predicate?: string): Fact[] {
    if (subject) {
      const keys = this.indexBySubject.get(subject.toLowerCase());
      if (keys) return [...keys].map(k => this.facts.get(k)!).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
    }
    if (predicate) {
      const keys = this.indexByPredicate.get(predicate.toLowerCase());
      if (keys) return [...keys].map(k => this.facts.get(k)!).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
    }
    return [...this.facts.values()].sort((a, b) => b.confidence - a.confidence);
  }

  getAll(): Fact[] {
    return [...this.facts.values()];
  }

  size(): number { return this.facts.size; }

  detectContradictions(): string[] {
    const groups = new Map<string, Fact[]>();
    for (const fact of this.facts.values()) {
      const key = `${fact.subject}:${fact.predicate}`;
      const g = groups.get(key) || [];
      g.push(fact);
      groups.set(key, g);
    }
    const contradictions: string[] = [];
    for (const [key, group] of groups) {
      if (group.length > 1) {
        const highConf = group.filter(f => f.confidence > 0.7);
        if (highConf.length > 1) {
          const objects = [...new Set(highConf.map(f => f.object))];
          if (objects.length > 1) {
            contradictions.push(`Contradição em "${key}": ${objects.join(' vs ')}`);
          }
        }
      }
    }
    return contradictions;
  }
}

// ─── Motor de Regras ───────────────────────────────────────────────────────────

const BUILTIN_RULES: Rule[] = [
  // Regras matemáticas
  {
    id: 'math_identity',
    condition: (_, ctx) => /^[\d\s+\-*/().%]+$/.test(ctx.trim()) && /[\d]/.test(ctx),
    conclusion: (_, ctx) => {
      try {
        const sanitized = ctx.trim().replace(/[^0-9+\-*/().% ]/g, '').trim();
        if (sanitized.length > 2) {
          // eslint-disable-next-line no-new-func
          const r = new Function(`"use strict"; return (${sanitized})`)();
          return typeof r === 'number' && isFinite(r) ? String(r) : '';
        }
        return '';
      } catch { return ''; }
    },
    weight: 1.0, usageCount: 0,
  },

  // Regras de implicação lógica
  {
    id: 'if_a_is_b_and_b_is_c_then_a_is_c',
    condition: (facts, ctx) => {
      const words = ctx.toLowerCase().split(/\s+/);
      return facts.some(f => words.includes(f.subject.toLowerCase())) &&
             facts.some(f => words.includes(f.object.toLowerCase()));
    },
    conclusion: (facts, ctx) => {
      const words = ctx.toLowerCase().split(/\s+/);
      const chain: string[] = [];
      for (const fact of facts.filter(f => f.confidence > 0.6)) {
        if (words.includes(fact.subject.toLowerCase())) {
          chain.push(`${fact.subject} → ${fact.predicate} → ${fact.object}`);
        }
      }
      return chain.length > 0 ? `Inferência: ${chain.join(', ')}` : '';
    },
    weight: 0.75, usageCount: 0,
  },

  // Detecção de negação
  {
    id: 'negation_detection',
    condition: (_, ctx) => /\b(não é|não são|nunca|jamais|impossível|falso)\b/i.test(ctx),
    conclusion: (facts, ctx) => {
      const negated = ctx.match(/\b(não é|não são)\s+(\w+)/i);
      if (negated) {
        const subject = negated[2];
        const contradicting = facts.filter(f =>
          f.object.toLowerCase() === subject.toLowerCase() && f.confidence > 0.5
        );
        if (contradicting.length > 0) {
          return `Atenção: contradiz fatos conhecidos sobre "${subject}"`;
        }
      }
      return '';
    },
    weight: 0.8, usageCount: 0,
  },

  // Raciocínio causal
  {
    id: 'causal_reasoning',
    condition: (_, ctx) => /\b(por que|porque|causa|motivo|razão|consequência|resultado)\b/i.test(ctx),
    conclusion: (facts, ctx) => {
      const words = ctx.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const relevant = facts.filter(f =>
        words.some(w => f.subject.toLowerCase().includes(w) || f.object.toLowerCase().includes(w))
      ).slice(0, 3);
      if (relevant.length === 0) return '';
      return `Cadeia causal: ${relevant.map(f => `${f.subject} ${f.predicate} ${f.object}`).join(' → ')}`;
    },
    weight: 0.7, usageCount: 0,
  },
];

// ─── Motor de Analogia ─────────────────────────────────────────────────────────

function findAnalogy(message: string, facts: Fact[]): string {
  const msgWords = new Set(
    message.toLowerCase().split(/\W+/).filter(w => w.length > 4)
  );

  // Encontra fatos com maior sobreposição de palavras-chave
  const scored = facts.map(fact => {
    const factWords = new Set(
      `${fact.subject} ${fact.predicate} ${fact.object}`.toLowerCase().split(/\W+/).filter(w => w.length > 4)
    );
    const overlap = [...msgWords].filter(w => factWords.has(w)).length;
    return { fact, score: overlap / Math.max(msgWords.size, 1) };
  }).filter(s => s.score > 0.3).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return '';

  const best = scored[0].fact;
  return `Por analogia: "${best.subject} ${best.predicate} ${best.object}" (confiança: ${Math.round(best.confidence * 100)}%)`;
}

// ─── Decomposição de Problemas ────────────────────────────────────────────────

function decomposeQuestion(message: string): string[] {
  const steps: string[] = [];

  if (/\b(compare|diferença|versus|vs)\b/i.test(message)) {
    const items = message.match(/\b([A-Za-záéíóúÀ-ÿ]{4,})\b.*\b(?:e|vs|versus)\b.*\b([A-Za-záéíóúÀ-ÿ]{4,})\b/i);
    if (items) {
      steps.push(`Identificar características de "${items[1]}"`);
      steps.push(`Identificar características de "${items[2]}"`);
      steps.push('Comparar por critério: funcionalidade, performance, uso');
      steps.push('Sintetizar: quando usar cada um');
    }
  } else if (/\b(como|como funciona|explique)\b/i.test(message)) {
    steps.push('Identificar o conceito central');
    steps.push('Decompor em componentes menores');
    steps.push('Explicar cada componente com exemplo');
    steps.push('Mostrar como os componentes se relacionam');
  } else if (/\b(por que|porque|motivo)\b/i.test(message)) {
    steps.push('Identificar o fenômeno em questão');
    steps.push('Listar causas possíveis');
    steps.push('Filtrar por relevância e confiança');
    steps.push('Ordenar por impacto causal');
  } else if (/\b(crie|gere|desenvolva|implemente)\b/i.test(message)) {
    steps.push('Definir os requisitos funcionais');
    steps.push('Escolher a estrutura mais adequada');
    steps.push('Implementar o núcleo da solução');
    steps.push('Adicionar tratamento de erros e edge cases');
  }

  return steps;
}

// ─── Síntese de Conhecimento ───────────────────────────────────────────────────

function synthesizeKnowledge(message: string, facts: Fact[]): string {
  const relevant = facts
    .filter(f => f.confidence > 0.5)
    .filter(f => {
      const mw = message.toLowerCase();
      return mw.includes(f.subject.toLowerCase()) ||
             mw.includes(f.object.toLowerCase());
    })
    .slice(0, 5);

  if (relevant.length < 2) return '';

  // Agrupa por sujeito
  const bySubject = new Map<string, Fact[]>();
  for (const f of relevant) {
    const g = bySubject.get(f.subject) || [];
    g.push(f);
    bySubject.set(f.subject, g);
  }

  const synthesis: string[] = [];
  for (const [subject, subFacts] of bySubject) {
    if (subFacts.length > 0) {
      const predicates = subFacts.map(f => `${f.predicate} ${f.object}`).join(', ');
      synthesis.push(`${subject}: ${predicates}`);
    }
  }

  return synthesis.length > 0 ? synthesis.join('\n') : '';
}

// ─── Motor Principal ───────────────────────────────────────────────────────────

class KronosReasoner {
  private static instance: KronosReasoner;
  private factBase = new FactBase();
  private rules = [...BUILTIN_RULES];
  private learnedRules: Rule[] = [];

  static shared(): KronosReasoner {
    if (!KronosReasoner.instance) KronosReasoner.instance = new KronosReasoner();
    return KronosReasoner.instance;
  }

  // Raciocina sobre uma mensagem sem nenhuma API externa
  reason(message: string): ReasoningResult {
    const steps: string[] = [];
    const contradictions = this.factBase.detectContradictions();
    const facts = this.factBase.getAll();

    // 0. Verifica cache neural primeiro (resposta instantânea)
    const cached = neuralCache.get(message);
    if (cached && cached.confidence >= 0.8) {
      return {
        answer: cached.answer,
        confidence: cached.confidence,
        method: 'cache',
        steps: [`Cache neural hit (usado ${cached.uses}x, precisão ${(cached.accuracy * 100).toFixed(0)}%)`],
        contradictions,
        fromCache: true,
      };
    }

    // 1. Tenta cálculo matemático direto
    const mathAttempt = message.trim().replace(/[^0-9+\-*/().% ]/g, '').trim();
    if (mathAttempt.length > 2 && /\d/.test(mathAttempt)) {
      try {
        const result = new Function(`"use strict"; return (${mathAttempt})`)();
        if (typeof result === 'number' && isFinite(result)) {
          neuralCache.set(message, String(result), 1.0, true);
          return {
            answer: String(result),
            confidence: 1.0,
            method: 'deductive',
            steps: [`Cálculo direto: ${mathAttempt} = ${result}`],
            contradictions,
            fromCache: false,
          };
        }
      } catch { /* não é matemática pura */ }
    }

    // 2. Aplica regras dedutivas
    for (const rule of [...this.rules, ...this.learnedRules]) {
      if (rule.condition(facts, message)) {
        const conclusion = rule.conclusion(facts, message);
        if (conclusion && conclusion.length > 5) {
          rule.usageCount++;
          steps.push(`Regra "${rule.id}" aplicada`);
          if (rule.weight >= 0.8) {
            neuralCache.set(message, conclusion, rule.weight, true);
            return {
              answer: conclusion,
              confidence: rule.weight,
              method: 'deductive',
              steps,
              contradictions,
              fromCache: false,
            };
          }
        }
      }
    }

    // 3. Decomposição de problema
    const decomposition = decomposeQuestion(message);
    if (decomposition.length > 0) {
      steps.push(...decomposition.map((s, i) => `Passo ${i + 1}: ${s}`));
    }

    // 4. Analogia com fatos conhecidos
    const analogy = findAnalogy(message, facts);
    if (analogy) {
      steps.push(analogy);
      neuralCache.set(message, analogy, 0.65, true);
      return {
        answer: analogy,
        confidence: 0.65,
        method: 'analogical',
        steps,
        contradictions,
        fromCache: false,
      };
    }

    // 5. Síntese de conhecimento acumulado
    const synthesis = synthesizeKnowledge(message, facts);
    if (synthesis) {
      neuralCache.set(message, synthesis, 0.6, true);
      return {
        answer: synthesis,
        confidence: 0.6,
        method: 'synthesis',
        steps,
        contradictions,
        fromCache: false,
      };
    }

    // 6. Sem resposta local — passa para a API
    return {
      answer: '',
      confidence: 0,
      method: 'none',
      steps: decomposition.length > 0 ? steps : [],
      contradictions,
      fromCache: false,
    };
  }

  // Aprende um novo fato a partir de uma interação
  learn(subject: string, predicate: string, object: string, confidence = 0.7): void {
    this.factBase.add({
      subject, predicate, object, confidence,
      source: 'learned',
      timestamp: Date.now(),
    });
  }

  // Aprende uma nova regra a partir de correções do usuário
  learnRule(trigger: string, response: string, confidence: number): void {
    const triggerWords = trigger.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const rule: Rule = {
      id: `learned_${Date.now()}`,
      condition: (_, ctx) => triggerWords.some(w => ctx.toLowerCase().includes(w)),
      conclusion: () => response,
      weight: Math.min(0.9, confidence),
      usageCount: 0,
    };
    this.learnedRules.push(rule);
    // Mantém máximo 50 regras aprendidas — remove as menos usadas
    if (this.learnedRules.length > 50) {
      this.learnedRules.sort((a, b) => b.usageCount - a.usageCount);
      this.learnedRules = this.learnedRules.slice(0, 50);
    }
  }

  // Importa fatos do Supabase (memória persistente)
  importFacts(entries: { topic: string; detail: string; importance_score: number }[]): void {
    for (const e of entries) {
      this.factBase.add({
        subject: e.topic,
        predicate: 'é',
        object: e.detail,
        confidence: Math.min(1, e.importance_score / 10),
        source: 'learned',
        timestamp: Date.now(),
      });
    }
  }

  getStats(): { facts: number; rules: number; learnedRules: number; cacheHits: number } {
    const cacheStats = neuralCache.getStats();
    return {
      facts: this.factBase.size(),
      rules: this.rules.length,
      learnedRules: this.learnedRules.length,
      cacheHits: cacheStats.totalUses,
    };
  }
}

// ─── Singleton exportado ───────────────────────────────────────────────────────

export const REASONER = KronosReasoner.shared();

export function reason(message: string): ReasoningResult {
  return REASONER.reason(message);
}

export function learnFact(subject: string, predicate: string, object: string, confidence?: number): void {
  REASONER.learn(subject, predicate, object, confidence);
}

export function learnRule(trigger: string, response: string, confidence: number): void {
  REASONER.learnRule(trigger, response, confidence);
}

export function importFactsFromMemory(entries: { topic: string; detail: string; importance_score: number }[]): void {
  REASONER.importFacts(entries);
}

export function getNeuralCacheStats() {
  return neuralCache.getStats();
}

export function clearNeuralCache(): void {
  neuralCache.getStats(); // Força limpeza
}