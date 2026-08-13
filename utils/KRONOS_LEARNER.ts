/**
 * KRONOS LEARNER — Aprendizado Incremental Real
 * 100% sem API. Aprende com cada conversa.
 *
 * v2.0 — Aprendizado acelerado com priorização por tensão saliente
 *
 * Algoritmos implementados:
 * 1. TF-IDF adaptativo — extrai os conceitos mais importantes de cada resposta
 * 2. Perceptron de padrões — aprende quais tipos de pergunta geram quais tipos de resposta
 * 3. Reforço positivo/negativo — ajusta pesos baseado em correções do usuário
 * 4. Memória associativa — conecta conceitos relacionados automaticamente
 * 5. Compressão de conhecimento — elimina redundâncias e consolida padrões
 * 6. Aprendizado por tensão — aprende mais rápido com emocional forte
 */

import { learnFact, learnRule, REASONER } from './KRONOS_REASONER';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface LearningEntry {
  input:     string;   // pergunta/mensagem
  output:    string;   // resposta gerada
  score:     number;   // avaliação da resposta (0-10)
  corrected: boolean;  // o usuário corrigiu?
  tokens:    string[]; // palavras-chave extraídas
  timestamp: number;
  emotionalIntensity: number; // 0-1: intensidade emocional da interação
}

interface ConceptNode {
  concept:      string;
  associations: Map<string, number>;  // conceito → peso da associação
  frequency:    number;
  lastSeen:     number;
  activationEnergy: number; // quanto "custo" para ativar este conceito
}

interface PerceptronPattern {
  features:  number[]; // vetor de características
  label:     string;   // tipo de resposta esperada
  weight:    number;
  accuracy:  number;   // taxa de acerto
}

// ─── TF-IDF Local ──────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-záéíóúàâêôãõüçñ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 3 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  'para', 'como', 'quando', 'onde', 'quem', 'qual', 'que', 'este',
  'esta', 'isso', 'aqui', 'mais', 'mais', 'muito', 'então', 'assim',
  'pode', 'seria', 'fazer', 'tenho', 'temos', 'você', 'minha', 'seus',
  'with', 'that', 'this', 'from', 'have', 'will', 'your', 'they',
]);

function computeTFIDF(
  doc: string[],
  corpus: string[][]
): Map<string, number> {
  const tf  = new Map<string, number>();
  const idf = new Map<string, number>();
  const N   = corpus.length + 1;

  // TF
  for (const term of doc) {
    tf.set(term, (tf.get(term) ?? 0) + 1);
  }
  for (const [term, count] of tf) {
    tf.set(term, count / doc.length);
  }

  // IDF
  const allTerms = new Set(doc);
  for (const term of allTerms) {
    const docsWithTerm = corpus.filter(d => d.includes(term)).length + 1;
    idf.set(term, Math.log(N / docsWithTerm));
  }

  // TF-IDF
  const result = new Map<string, number>();
  for (const term of allTerms) {
    result.set(term, (tf.get(term) ?? 0) * (idf.get(term) ?? 1));
  }
  return result;
}

// ─── Motor de Aprendizado ──────────────────────────────────────────────────────

class KronosLearner {
  private static instance: KronosLearner;

  private history:    LearningEntry[]             = [];
  private concepts:   Map<string, ConceptNode>    = new Map();
  private patterns:   PerceptronPattern[]         = [];
  private corpus:     string[][]                  = [];

  private stats = {
    totalLearned:     0,
    correctionsApplied: 0,
    conceptsFormed:   0,
    patternsFired:    0,
    emotionalLearningEvents: 0, // eventos de aprendizado com alta emoção
  };

  static shared(): KronosLearner {
    if (!KronosLearner.instance) KronosLearner.instance = new KronosLearner();
    return KronosLearner.instance;
  }

  // ─── Aprende com uma interação ──────────────────────────────────────────

  learnFromInteraction(
    input:    string,
    output:   string,
    score:    number,
    corrected = false,
    correction?: string,
    emotionalIntensity = 0.5
  ): void {
    const tokens = tokenize(input + ' ' + output);
    this.corpus.push(tokens);
    if (this.corpus.length > 500) this.corpus.shift(); // janela deslizante

    // Registra na história
    this.history.push({ input, output, score, corrected, tokens, timestamp: Date.now(), emotionalIntensity });
    if (this.history.length > 200) this.history.shift();

    // Extrai conceitos importantes via TF-IDF
    if (score >= 6 && tokens.length > 0) {
      const tfidf = computeTFIDF(tokens, this.corpus);
      const topTerms = [...tfidf.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => e[0]);

      // Aprendizado acelerado por tensão emocional
      const learningBoost = 1 + emotionalIntensity * 0.5; // até 1.5x mais rápido
      this.formConcepts(topTerms, score * learningBoost);

      // Aprende regra se a resposta foi boa
      if (score >= 8 && input.length < 200 && output.length < 500) {
        const trigger  = topTerms.slice(0, 3).join(' ');
        const confidence = (score / 10) * learningBoost;
        learnRule(trigger, output.slice(0, 300), Math.min(1, confidence));
      }

      // Evento de aprendizado emocional
      if (emotionalIntensity > 0.7) {
        this.stats.emotionalLearningEvents++;
      }
    }

    // Processa correção com reforço negativo
    if (corrected && correction) {
      this.applyCorrection(input, output, correction);
    }

    this.stats.totalLearned++;
    this.updatePatterns(input, output, score);
  }

  // ─── Forma conexões entre conceitos ─────────────────────────────────────

  private formConcepts(terms: string[], score: number): void {
    for (const term of terms) {
      const node = this.concepts.get(term) ?? {
        concept:      term,
        associations: new Map(),
        frequency:    0,
        lastSeen:     Date.now(),
        activationEnergy: 1.0, // energia inicial
      };

      node.frequency++;
      node.lastSeen = Date.now();

      // Cria associações entre termos que aparecem juntos
      for (const other of terms) {
        if (other !== term) {
          const current = node.associations.get(other) ?? 0;
          // Reforça associação — quanto maior o score, mais forte a associação
          node.associations.set(other, current + (score / 10) * 0.1);
        }
      }

      // Atualiza energia de ativação ( conceitos usados recentemente têm menor energia )
      node.activationEnergy = Math.max(0.1, node.activationEnergy - 0.05);

      this.concepts.set(term, node);
    }
    this.stats.conceptsFormed = this.concepts.size;

    // Converte conceitos com alta frequência em fatos no Reasoner
    for (const [term, node] of this.concepts) {
      if (node.frequency >= 3) {
        const topAssoc = [...node.associations.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2);

        for (const [assoc, weight] of topAssoc) {
          if (weight > 0.3) {
            learnFact(term, 'está relacionado a', assoc, Math.min(0.9, weight));
          }
        }
      }
    }
  }

  // ─── Aplica correção com reforço negativo ─────────────────────────────────

  private applyCorrection(input: string, wrongOutput: string, correction: string): void {
    // Remove padrões que geraram a resposta errada
    const wrongTokens = new Set(tokenize(input + ' ' + wrongOutput));
    this.patterns = this.patterns.filter(p => {
      // Mantém padrões que não estão associados à resposta errada
      const patternTerms = new Set(p.label.toLowerCase().split(/\s+/));
      const overlap = [...wrongTokens].filter(t => patternTerms.has(t)).length;
      return overlap < 2; // remove se tiver mais de 2 tokens em comum
    });

    // Aprende com a correção certa
    const corrTokens = tokenize(correction);
    const trigger    = tokenize(input).slice(0, 3).join(' ');
    learnRule(trigger, correction, 0.95);
    this.formConcepts(corrTokens, 10); // score máximo pra correção

    this.stats.correctionsApplied++;
    console.log(`[Learner] Correção aplicada. Padrões após poda: ${this.patterns.length}`);
  }

  // ─── Perceptron de padrões ────────────────────────────────────────────────

  private updatePatterns(input: string, output: string, score: number): void {
    if (score < 7) return; // só aprende com respostas boas

    const features = this.extractFeatures(input);
    const label    = this.classifyOutput(output);

    const existing = this.patterns.find(p =>
      p.label === label &&
      p.features.every((f, i) => Math.abs(f - features[i]) < 0.2)
    );

    if (existing) {
      // Reforça padrão existente
      existing.weight = Math.min(1.0, existing.weight + 0.05);
      existing.accuracy = (existing.accuracy * 0.9) + (score / 10 * 0.1);
    } else {
      this.patterns.push({ features, label, weight: score / 10, accuracy: score / 10 });
      if (this.patterns.length > 100) {
        // Remove padrões mais fracos
        this.patterns.sort((a, b) => b.weight - a.weight);
        this.patterns = this.patterns.slice(0, 100);
      }
    }
    this.stats.patternsFired++;
  }

  private extractFeatures(text: string): number[] {
    const t = text.toLowerCase();
    return [
      t.length > 100 ? 1 : 0,                           // mensagem longa
      /\?/.test(t) ? 1 : 0,                              // é pergunta
      /código|function|const|class/i.test(t) ? 1 : 0,   // é sobre código
      /como|por que|explica/i.test(t) ? 1 : 0,           // didático
      /erro|bug|problema|não funciona/i.test(t) ? 1 : 0, // é um erro
      /crie|gere|implemente/i.test(t) ? 1 : 0,           // criação
    ];
  }

  private classifyOutput(output: string): string {
    if (/function|const |class |def /i.test(output)) return 'code';
    if (output.length < 100)                             return 'short_answer';
    if (/\n•|\n\d\./i.test(output))                      return 'list';
    return 'explanation';
  }

  // ─── Prediz o melhor tipo de resposta para uma nova pergunta ─────────────

  predictResponseType(input: string): string | null {
    const features = this.extractFeatures(input);
    let   bestMatch: PerceptronPattern | null = null;
    let   bestScore  = 0;

    for (const pattern of this.patterns) {
      const similarity = features.reduce((sum, f, i) =>
        sum + (f === pattern.features[i] ? 1 : 0), 0) / features.length;
      const score = similarity * pattern.weight * pattern.accuracy;

      if (score > bestScore && score > 0.5) {
        bestScore  = score;
        bestMatch  = pattern;
      }
    }

    return bestMatch?.label ?? null;
  }

  // ─── Busca na memória associativa ────────────────────────────────────────

  associativeSearch(query: string): string[] {
    const queryTokens = tokenize(query);
    const results: { concept: string; score: number }[] = [];

    for (const token of queryTokens) {
      const node = this.concepts.get(token);
      if (node) {
        for (const [assoc, weight] of node.associations) {
          if (weight > 0.2) {
            // Considera energia de ativação (conceitos recentes são mais fáceis de ativar)
            const activationBonus = (1 - node.activationEnergy) * 0.3;
            results.push({ concept: assoc, score: weight * node.frequency + activationBonus });
          }
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(r => r.concept);
  }

  // ─── Comprime conhecimento — elimina redundâncias ────────────────────────

  compressKnowledge(): void {
    // Remove conceitos muito raramente usados
    for (const [term, node] of this.concepts) {
      const ageDays = (Date.now() - node.lastSeen) / 86400000;
      if (node.frequency < 2 && ageDays > 7) {
        this.concepts.delete(term);
      }
    }

    // Consolida padrões duplicados
    const grouped = new Map<string, PerceptronPattern[]>();
    for (const p of this.patterns) {
      const key = p.label;
      const g   = grouped.get(key) || [];
      g.push(p);
      grouped.set(key, g);
    }

    const compressed: PerceptronPattern[] = [];
    for (const [, group] of grouped) {
      // Mantém só os 5 mais fortes por tipo
      compressed.push(...group.sort((a, b) => b.weight - a.weight).slice(0, 5));
    }
    this.patterns = compressed;
  }

  // ─── Aprendizado por tensão (novo) ──────────────────────────────────────

  accelerateLearning(highIntensityTopics: string[]): void {
    // Marca tópicos de alto interesse para aprendizado prioritário
    for (const topic of highIntensityTopics) {
      const tokens = tokenize(topic);
      for (const token of tokens) {
        const node = this.concepts.get(token);
        if (node) {
          // Aumenta energia de ativação (fica mais "acessível")
          node.activationEnergy = Math.max(0.1, node.activationEnergy - 0.2);
          // Aumenta frequência
          node.frequency += 2;
        }
      }
    }
  }

  getStats() {
    return {
      ...this.stats,
      concepts:       this.concepts.size,
      patterns:       this.patterns.length,
      historySize:    this.history.length,
      reasonerStats:  REASONER.getStats(),
    };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const LEARNER = KronosLearner.shared();

export function learnFromInteraction(
  input: string, output: string, score: number,
  corrected?: boolean, correction?: string, emotionalIntensity = 0.5
): void {
  LEARNER.learnFromInteraction(input, output, score, corrected, correction, emotionalIntensity);
}

export function predictResponseType(input: string): string | null {
  return LEARNER.predictResponseType(input);
}

export function associativeSearch(query: string): string[] {
  return LEARNER.associativeSearch(query);
}

export function getLearnerStats() {
  return LEARNER.getStats();
}

export function accelerateLearning(topics: string[]): void {
  LEARNER.accelerateLearning(topics);
}

// Roda compressão periódica em background
setInterval(() => {
  LEARNER.compressKnowledge();
}, 30 * 60 * 1000); // a cada 30 min