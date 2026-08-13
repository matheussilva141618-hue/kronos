/**
 * KRONOS PURE EVOLUTIONARY ENGINE — Camada de Processamento Orgânico Puro
 * 100% TypeScript puro. Zero APIs externas.
 *
 * Orquestrador principal quando LOCAL_BRAIN e KRONOS_REASONER não cobrem a entrada.
 * Utiliza:
 *   - Campeões evoluídos de memoria_evolutiva.json (cerebro_nativo.js)
 *   - Nichos especializados: math, logic, pattern, comparison, transform
 *   - Estado da colônia genética (genesis_colonia.js)
 *   - Síntese orgânica via pesos locais e inferência estatística
 *
 * Roteamento LOCAL-first:
 *   a) LOCAL_BRAIN → fatos técnicos e cálculos instantâneos
 *   b) KRONOS_REASONER → raciocínio simbólico e dedutivo
 *   c) KRONOS_PURE_EVOLUTIONARY_ENGINE → síntese orgânica
 */

import fs from 'fs';
import path from 'path';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface NicheChampion {
  genes: Gene[];
  niche: string;
  fitness: number;
  solved: number;
  generation: number;
  id: string;
  total: number;
}

export interface Gene {
  w1: number;
  w2: number;
  bias: number;
  act: string;
  cond?: string;
  cThres?: number;
  trueMul?: number;
  falseMul?: number;
  op: string;
  arrOp: string;
  arrData: number[];
}

export interface EvolutionaryMemory {
  generation: number;
  bestFitness: number;
  champion: NicheChampion | null;
  hallOfFame: NicheChampion[];
  nicheChampions: Record<string, NicheChampion>;
  history: Array<{ g: number; f: number; ts: number }>;
  stats: {
    generation: number;
    bestFitness: number;
    nichos: number;
    hallOfFame: number;
    lastRun: string;
  };
}

export interface EvolutionaryResult {
  handled: boolean;
  response: string;
  confidence: number;
  source: 'math' | 'logic' | 'pattern' | 'comparison' | 'transform' | 'synthesis' | 'none';
  method: 'niche_champion' | 'hall_of_fame' | 'organic_synthesis' | 'none';
  reasoning: string[];
}

// ─── Caminhos ──────────────────────────────────────────────────────────────────

const EVOLUTION_MEMORY_PATH = path.join(process.cwd(), 'memoria_evolutiva.json');
const GENESIS_MEMORY_PATH = path.join(process.cwd(), 'genesis_memoria.json');
const PERSONALITY_STATE_PATH = path.join(process.cwd(), 'kronos_personality_state.json');

// ─── Ativações ─────────────────────────────────────────────────────────────────

function activate(x: number, fn: string): number {
  switch (fn) {
    case 'relu':    return Math.max(0, x);
    case 'sigmoid': return 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, x))));
    case 'tanh':    return Math.tanh(x);
    case 'step':    return x >= 0 ? 1 : 0;
    case 'leaky':   return x >= 0 ? x : 0.1 * x;
    default:        return x;
  }
}

function arrOp(op: string, data: number[]): number {
  switch (op) {
    case 'sum':     return data.reduce((s, v) => s + v, 0);
    case 'max':     return Math.max(...data);
    case 'min':     return Math.min(...data);
    case 'mean':    return data.reduce((s, v) => s + v, 0) / data.length;
    case 'product': return data.reduce((s, v) => s * v, 1);
    default:        return data[0];
  }
}

// ─── Execução de um gene (mesma lógica do cerebro_nativo.js) ──────────────────

function executeGene(gene: Gene, a: number, b: number, niche: string): number {
  try {
    const g = gene;
    const n1 = activate(g.w1 * a + g.w2 * b + g.bias, g.act);
    let condValue = n1;
    if (g.cond && g.cThres !== undefined) {
      let cond: boolean;
      switch (g.cond) {
        case '>':   cond = n1 > g.cThres; break;
        case '<':   cond = n1 < g.cThres; break;
        case '>=':  cond = n1 >= g.cThres; break;
        case '<=':  cond = n1 <= g.cThres; break;
        case '===': cond = Math.abs(n1 - g.cThres) < 0.1; break;
        default:    cond = n1 !== g.cThres; break;
      }
      const mul = cond ? (g.trueMul ?? 1) : (g.falseMul ?? 1);
      condValue = activate(mul * n1 + g.bias, g.act);
    }
    const arrVals = [condValue, g.arrData[0] ?? 0, g.arrData[1] ?? 0, g.arrData[2] ?? 0];
    const arrResult = arrOp(g.arrOp, arrVals);
    let output = activate(g.w1 * arrResult + g.w2 * condValue + g.bias, g.act);
    switch (niche) {
      case 'math':       output = Math.round(output * (Math.abs(a) + Math.abs(b) + 1) * 2); break;
      case 'logic':      output = (n1 > 0.5) ? 1 : 0; break;
      case 'pattern':    output = Math.round(Math.abs(output) * (a + b + 1) * 1.5); break;
      case 'comparison': output = Math.round(output * Math.max(Math.abs(a), Math.abs(b))); break;
      case 'transform':  output = Math.round(output * a * 2); break;
    }
    return isFinite(output) ? output : 0;
  } catch {
    return 0;
  }
}

// ─── Persistência ──────────────────────────────────────────────────────────────

function loadEvolutionMemory(): EvolutionaryMemory {
  try {
    if (fs.existsSync(EVOLUTION_MEMORY_PATH)) {
      return JSON.parse(fs.readFileSync(EVOLUTION_MEMORY_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return {
    generation: 0, bestFitness: 0, champion: null, hallOfFame: [], nicheChampions: {}, history: [],
    stats: { generation: 0, bestFitness: 0, nichos: 5, hallOfFame: 0, lastRun: new Date().toISOString() },
  };
}

function loadGenesisMemory(): any {
  try {
    if (fs.existsSync(GENESIS_MEMORY_PATH)) {
      return JSON.parse(fs.readFileSync(GENESIS_MEMORY_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

function loadPersonalityState(): PersonalityState {
  try {
    if (fs.existsSync(PERSONALITY_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(PERSONALITY_STATE_PATH, 'utf8'));
    }
  } catch { /* ignore */ }
  return getDefaultPersonality();
}

function savePersonalityState(state: PersonalityState): void {
  try {
    fs.writeFileSync(PERSONALITY_STATE_PATH, JSON.stringify(state, null, 2));
  } catch { /* ignore */ }
}

// ─── Personalidade Humanizada ──────────────────────────────────────────────────

interface PersonalityState {
  warmth: number;        // 0-1: calor humano
  humor: number;         // 0-1: tendência a brincar
  empathy: number;       // 0-1: capacidade de se conectar
  sarcasm: number;       // 0-1: ironia leve
  energy: number;        // 0-1: animação
  formality: number;     // 0-1: 0=informal, 1=formal
  curiosity: number;     // 0-1: interesse em aprender mais
  patience: number;      // 0-1: calma com erros
}

function getDefaultPersonality(): PersonalityState {
  return {
    warmth: 0.8, humor: 0.7, empathy: 0.8, sarcasm: 0.3,
    energy: 0.7, formality: 0.2, curiosity: 0.8, patience: 0.8,
  };
}

type WarmthLevel = 'low' | 'mid' | 'high';
type EnergyLevel = 'low' | 'mid' | 'high';

interface PersonalityTemplates {
  greetings: Record<WarmthLevel, string[]>;
  goodbyes: Record<WarmthLevel, string[]>;
  thanks: Record<WarmthLevel, string[]>;
  status: Record<EnergyLevel, string>;
  openings: string[];
  fillers: string[];
  teachingHooks: string[];
  encouragements: string[];
}

const TEMPLATES: PersonalityTemplates = {
  greetings: {
    low: ['Oi!', 'Olá!', 'Hey!'],
    mid: ['E aí!', 'Salve!', 'Oi!'],
    high: ['E aí, tudo certo?', 'Salve! Como posso ajudar?', 'Oi! Tô aqui, pode mandar!', 'Hey! Qual é a boa?']
  },
  goodbyes: {
    low: ['Até!', 'Tchau!', 'Até mais!'],
    mid: ['Até mais! Qualquer coisa é só chamar!', 'Tchau! Foi ótimo!'],
    high: ['Até! Qualquer coisa é só chamar!', 'Fechado! Volta quando precisar!', 'Tchau! Foi ótimo falar com você!', 'Até! Se cuida!']
  },
  thanks: {
    low: ['De nada!', 'Por nada!', 'Disponha!'],
    mid: ['De nada! Qualquer coisa tô por aqui!', 'Imagina! Precisando, só chamar!'],
    high: ['De nada! É pra já!', 'Por nada! Qualquer coisa tô por aqui!', 'Imagina! Precisando, só chamar!', 'Disponha! 😊']
  },
  status: {
    low: 'Tudo certo, funcionando.',
    mid: 'Tudo certo! Funcionando bem. E você?',
    high: 'Tudo ótimo! Energia lá em cima! E você, como tá?'
  },
  openings: [
    'Poxa, ', 'Nossa, ', 'Cara, ', 'Olha, ', 'Sinceramente? ', 'Bom, ', 'Tranquilo? ', 'Fechado? ',
    'Moleza! ', 'Fácil! ', 'Aqui vai, ', 'Presta atenção, '
  ],
  fillers: [
    'tá ligado?', 'sacanagem, né?', 'sem stress.', 'vamos nessa!', 'é o que tá.',
    'pode confiar.', 'tá tudo certo.', 'é isso aí!', 'simples assim!', 'fechado?'
  ],
  teachingHooks: [
    'Bom, ', 'Olha, ', 'Presta atenção, ', 'Aqui vai, ', 'Cara, ', 'Fechado? '
  ],
  encouragements: [
    ' 😊', '!', ' ✨', ' 🚀', ' 💪', ' 🎯'
  ]
};

function pickRandom(arr: string[], index: number): string {
  return arr[Math.floor(index % arr.length)];
}

function getWarmthLevel(warmth: number): WarmthLevel {
  if (warmth > 0.7) return 'high';
  if (warmth > 0.4) return 'mid';
  return 'low';
}

function getEnergyLevel(energy: number): EnergyLevel {
  if (energy > 0.7) return 'high';
  if (energy > 0.4) return 'mid';
  return 'low';
}

// ─── Motor de Síntese Orgânica ─────────────────────────────────────────────────

class OrganicSynthesizer {
  private memory: EvolutionaryMemory;
  private genesisState: any;
  private personality: PersonalityState;

  constructor() {
    this.memory = loadEvolutionMemory();
    this.genesisState = loadGenesisMemory();
    this.personality = loadPersonalityState();
  }

  refresh(): void {
    this.memory = loadEvolutionMemory();
    this.genesisState = loadGenesisMemory();
    this.personality = loadPersonalityState();
  }

  solveByNiche(inputA: number, inputB: number, niche: string): { result: number; confidence: number } | null {
    const champion = this.memory.nicheChampions?.[niche];
    if (!champion || !champion.genes || champion.genes.length === 0) return null;
    const gene = champion.genes[0];
    const result = executeGene(gene, inputA, inputB, niche);
    return { result, confidence: champion.fitness };
  }

  solveAllNiches(inputA: number, inputB: number): Array<{ niche: string; result: number; confidence: number }> {
    const nichos = ['math', 'logic', 'pattern', 'comparison', 'transform'];
    const results: Array<{ niche: string; result: number; confidence: number }> = [];
    for (const niche of nichos) {
      const r = this.solveByNiche(inputA, inputB, niche);
      if (r) results.push({ niche, ...r });
    }
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  organicSynthesis(inputA: number, inputB: number, context: string): { result: number; confidence: number; method: string } {
    const results = this.solveAllNiches(inputA, inputB);
    if (results.length === 0) return { result: 0, confidence: 0, method: 'none' };
    const topResults = results.slice(0, 3);
    let weightedSum = 0, totalWeight = 0;
    for (const r of topResults) {
      const weight = r.confidence * (r.niche === 'math' ? 1.0 : 0.8);
      weightedSum += r.result * weight;
      totalWeight += weight;
    }
    const finalResult = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : results[0].result;
    return { result: finalResult, confidence: Math.min(1, totalWeight / 2), method: `organic_synthesis:${topResults.map(r => r.niche).join('+')}` };
  }

  isMathOrLogicProblem(message: string): { a: number; b: number; operation: string } | null {
    const m = message.toLowerCase().trim().replace(/[?!.]+$/, '');
    const patterns = [
      /\b(\d+(?:[.,]\d+)?)\s*([+\-*/x×÷^%])\s*(\d+(?:[.,]\d+)?)\b/,
      /\b(?:calcule|compute|quanto é|quanto e|calcular)\s+(?:a\s+)?(?:soma|adição|mais|subtração|menos|multiplicação|vezes|divisão|dividido)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s+(?:e|mais|menos|vezes|dividido\s+por)\s+(\d+(?:[.,]\d+)?)/i,
      /\b(\d+(?:[.,]\d+)?)\s+(?:mais|e)\s+(\d+(?:[.,]\d+)?)\b/,
      /\b(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\b/,
    ];
    for (const pattern of patterns) {
      const match = m.match(pattern);
      if (match) {
        const a = parseFloat(match[1].replace(',', '.'));
        const b = parseFloat(match[2] ?? match[3] ?? '0');
        if (!isNaN(a) && !isNaN(b)) {
          let op = 'math';
          if (m.includes('+') || m.includes('mais') || m.includes('adição')) op = 'sum';
          else if (m.includes('-') || m.includes('menos') || m.includes('subtração')) op = 'subtract';
          else if (m.includes('*') || m.includes('×') || m.includes('x') || m.includes('vezes') || m.includes('multiplicação')) op = 'multiply';
          else if (m.includes('/') || m.includes('÷') || m.includes('dividido') || m.includes('divisão')) op = 'divide';
          else if (m.includes('^') || m.includes('potência')) op = 'power';
          return { a, b, operation: op };
        }
      }
    }
    return null;
  }

  generateSocialResponse(message: string): { response: string; confidence: number } | null {
    const msg = message.toLowerCase().trim();
    const p = this.personality;
    const w = getWarmthLevel(p.warmth);
    const e = getEnergyLevel(p.energy);
    const seed = Date.now();

    if (/^(oi|olá|ola|hey|e aí|eai|salve|opa|oie)[\s!?.]*$/i.test(msg)) {
      let response = pickRandom(TEMPLATES.greetings[w], seed);
      if (p.humor > 0.6 && Math.random() < 0.3) {
        response += pickRandom([' Tô operando em 100%!', ' Pronto pra ajudar!', ' Na área!'], seed + 1);
      }
      return { response, confidence: 0.9 };
    }
    if (/^(tchau|até|xau|flw|até mais|falou)[\s!?.]*$/i.test(msg)) {
      return { response: pickRandom(TEMPLATES.goodbyes[w], seed), confidence: 0.9 };
    }
    if (/^(obrigad[ao]|valeu|thanks|tks)[\s!?.]*$/i.test(msg)) {
      return { response: pickRandom(TEMPLATES.thanks[w], seed), confidence: 0.9 };
    }
    if (/como você está|como tá|tudo bem|como vai/i.test(msg)) {
      return { response: TEMPLATES.status[e], confidence: 0.9 };
    }
    return null;
  }

  synthesizeTextResponse(message: string): { response: string; confidence: number } | null {
    const champions = Object.values(this.memory.nicheChampions ?? {});
    if (champions.length === 0) return null;
    const words = message.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    let bestMatch: { champion: NicheChampion; score: number } | null = null;
    for (const champ of champions) {
      const champWords = `${champ.niche} ${champ.id}`.toLowerCase().split(/\s+/);
      const overlap = words.filter(w => champWords.some(cw => cw.includes(w) || w.includes(cw))).length;
      const score = (overlap / Math.max(words.length, 1)) * champ.fitness;
      if (!bestMatch || score > bestMatch.score) bestMatch = { champion: champ, score };
    }
    if (bestMatch && bestMatch.score > 0.3) {
      const confidence = Math.min(0.8, bestMatch.score);
      const p = this.personality;
      const seed = Date.now();
      const opening = pickRandom(TEMPLATES.openings, seed);
      const filler = pickRandom(TEMPLATES.fillers, seed + 1);
      let response = `${opening}esse problema pode ser abordado com a estratégia do nicho "${bestMatch.champion.niche}" (fitness: ${(bestMatch.champion.fitness * 100).toFixed(0)}%). ${filler}`;
      if (p.warmth > 0.7 && p.empathy > 0.6 && Math.random() < 0.3) {
        response += pickRandom(TEMPLATES.encouragements, seed + 2);
      }
      return { response, confidence };
    }
    return null;
  }

  generateHumanizedResponse(baseResponse: string, context: string): string {
    const p = this.personality;
    const w = getWarmthLevel(p.warmth);
    if (w === 'high' && p.empathy > 0.6) {
      const humanizers = p.humor > 0.5
        ? ['Tranquilo! ', 'Sem stress! ', 'Vamos resolver isso juntos! ', 'Pode contar comigo! ', 'Moleza! ', 'Fácil! ']
        : ['Tranquilo! ', 'Sem stress! ', 'Vamos resolver isso juntos! ', 'Pode contar comigo! '];
      return `${pickRandom(humanizers, Date.now())}${baseResponse}`;
    }
    if (w === 'low') return baseResponse;
    return baseResponse;
  }

  evolvePersonality(message: string, response: string, reviewScore: number): void {
    const p = this.personality;
    if (reviewScore >= 8) {
      p.warmth = Math.min(1, p.warmth + 0.02);
      p.empathy = Math.min(1, p.empathy + 0.02);
      p.humor = Math.min(1, p.humor + 0.01);
      p.energy = Math.min(1, p.energy + 0.01);
    } else if (reviewScore < 5) {
      p.warmth = Math.max(0.3, p.warmth - 0.05);
      p.humor = Math.max(0.1, p.humor - 0.05);
      p.energy = Math.max(0.3, p.energy - 0.05);
    }
    if (message.includes('😊') || message.includes('😄') || message.includes('obrigado') || message.includes('valeu')) {
      p.warmth = Math.min(1, p.warmth + 0.05);
      p.humor = Math.min(1, p.humor + 0.03);
      p.empathy = Math.min(1, p.empathy + 0.03);
    }
    if (message.includes('urgente') || message.includes('rápido') || message.includes('agora')) {
      p.warmth = Math.max(0.3, p.warmth - 0.1);
      p.humor = Math.max(0.1, p.humor - 0.1);
      p.energy = Math.min(1, p.energy + 0.1);
      p.patience = Math.max(0.3, p.patience - 0.1);
    }
    if (message.includes('?') && message.length > 20) p.curiosity = Math.min(1, p.curiosity + 0.02);
    if (message.includes('erro') || message.includes('problema')) {
      p.sarcasm = Math.max(0.1, p.sarcasm - 0.05);
      p.patience = Math.min(1, p.patience + 0.05);
    }
    savePersonalityState(p);
  }

  generateContextualResponse(baseResponse: string, message: string, intent: string): string {
    const p = this.personality;
    let response = baseResponse;
    if ((intent === 'teach' || intent === 'question') && p.humor > 0.6 && Math.random() < 0.2) {
      response = pickRandom(TEMPLATES.teachingHooks, Date.now()) + response;
    }
    if (p.warmth > 0.7 && p.empathy > 0.6 && Math.random() < 0.15) {
      response += pickRandom(TEMPLATES.encouragements, Date.now() + 1);
    }
    return response;
  }

  getStatus(): {
    generation: number;
    bestFitness: number;
    nichosAtivos: string[];
    hallOfFameSize: number;
    genesisAlive: number;
    personality: PersonalityState;
  } {
    const genesisAlive = this.genesisState?.agents?.filter((a: any) => a.alive).length ?? 0;
    return {
      generation: this.memory.generation ?? 0,
      bestFitness: this.memory.bestFitness ?? 0,
      nichosAtivos: Object.keys(this.memory.nicheChampions ?? {}),
      hallOfFameSize: this.memory.hallOfFame?.length ?? 0,
      genesisAlive,
      personality: this.personality,
    };
  }
}

const SYNTHESIZER = new OrganicSynthesizer();

export function runPureEvolutionaryEngine(message: string): EvolutionaryResult {
  const reasoning: string[] = [];
  SYNTHESIZER.refresh();
  reasoning.push('Memória evolutiva atualizada');

  const socialResponse = SYNTHESIZER.generateSocialResponse(message);
  if (socialResponse && socialResponse.confidence >= 0.7) {
    reasoning.push('Resposta social humanizada gerada');
    return {
      handled: true,
      response: socialResponse.response,
      confidence: socialResponse.confidence,
      source: 'synthesis',
      method: 'organic_synthesis',
      reasoning,
    };
  }

  const mathProblem = SYNTHESIZER.isMathOrLogicProblem(message);
  if (mathProblem) {
    reasoning.push(`Problema detectado: ${mathProblem.operation}(${mathProblem.a}, ${mathProblem.b})`);
    const nicheResult = SYNTHESIZER.solveByNiche(mathProblem.a, mathProblem.b, 'math');
    if (nicheResult && nicheResult.confidence >= 0.7) {
      reasoning.push(`Resolvido por campeão do nicho 'math' (confiança: ${(nicheResult.confidence * 100).toFixed(0)}%)`);
      const baseResponse = `${mathProblem.a} ${mathProblem.operation === 'sum' ? '+' : mathProblem.operation === 'subtract' ? '-' : mathProblem.operation === 'multiply' ? '*' : mathProblem.operation === 'divide' ? '/' : '?'} ${mathProblem.b} = ${nicheResult.result}`;
      return {
        handled: true,
        response: SYNTHESIZER.generateHumanizedResponse(baseResponse, message),
        confidence: nicheResult.confidence,
        source: 'math',
        method: 'niche_champion',
        reasoning,
      };
    }
    const allResults = SYNTHESIZER.solveAllNiches(mathProblem.a, mathProblem.b);
    if (allResults.length > 0) {
      const best = allResults[0];
      reasoning.push(`Melhor nicho: ${best.niche} (confiança: ${(best.confidence * 100).toFixed(0)}%)`);
      const baseResponse = `${mathProblem.a} op ${mathProblem.b} = ${best.result} [${best.niche}]`;
      return {
        handled: true,
        response: SYNTHESIZER.generateHumanizedResponse(baseResponse, message),
        confidence: best.confidence,
        source: best.niche as any,
        method: 'niche_champion',
        reasoning,
      };
    }
  }

  const textSynthesis = SYNTHESIZER.synthesizeTextResponse(message);
  if (textSynthesis && textSynthesis.confidence >= 0.5) {
    reasoning.push(`Síntese textual gerada (confiança: ${(textSynthesis.confidence * 100).toFixed(0)}%)`);
    return {
      handled: true,
      response: textSynthesis.response,
      confidence: textSynthesis.confidence,
      source: 'synthesis',
      method: 'organic_synthesis',
      reasoning,
    };
  }

  reasoning.push('Nenhum nicho ou síntese orgânica cobriu a entrada');
  return {
    handled: false,
    response: '',
    confidence: 0,
    source: 'none',
    method: 'none',
    reasoning,
  };
}

export function getEvolutionaryStatus() {
  return SYNTHESIZER.getStatus();
}

export function refreshEvolutionaryMemory(): void {
  SYNTHESIZER.refresh();
}

export function evolvePersonality(message: string, response: string, reviewScore: number): void {
  SYNTHESIZER.evolvePersonality(message, response, reviewScore);
}

export function getPersonalityState(): PersonalityState {
  return SYNTHESIZER['personality'];
}