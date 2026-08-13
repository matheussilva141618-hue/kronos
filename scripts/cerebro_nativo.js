/**
 * KRONOS — Cérebro Nativo v2.0 — Arquitetura Multi-Nicho
 * Motor evolutivo de nível superior. Zero APIs externas.
 *
 * Arquitetura:
 * 1. Múltiplas linhagens (nichos): math, logic, pattern, sequence, comparison
 * 2. Mutação estruturada: insere condicionais, operadores lógicos, array ops
 * 3. Crossover entre campeões de gerações diferentes (memória histórica)
 * 4. Taxa de mutação auto-adaptativa por estagnação (cooling + burst)
 *
 * Rodar: node scripts/cerebro_nativo.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  NICHE_SIZE:       12,     // indivíduos por nicho
  NICHOS:           5,      // número de linhagens especializadas
  ELITE:            2,      // melhores preservados por nicho
  BASE_MUTATION:    0.20,
  MAX_MUTATION:     0.60,
  STAGNATION_LIMIT: 15,     // gerações sem melhora antes de burst
  CYCLE_MS:         8000,   // intervalo entre gerações
  MEMORY_FILE:      path.join(__dirname, '..', 'memoria_evolutiva.json'),
  HALL_OF_FAME:     10,     // campeões históricos para crossover entre gerações
};

// ─── Nichos especializados ────────────────────────────────────────────────────
const NICHOS = {
  math:       { name: 'math',       tests: ['sum','multiply','divide','subtract','power'] },
  logic:      { name: 'logic',      tests: ['and','or','xor','not','nand'] },
  pattern:    { name: 'pattern',    tests: ['fib_next','triangle','square','cube','prime_check'] },
  comparison: { name: 'comparison', tests: ['gt','lt','eq','max','min'] },
  transform:  { name: 'transform',  tests: ['double','half','negate','abs','clamp'] },
};

// ─── Suite de testes expandida ────────────────────────────────────────────────
const TEST_SUITE = {
  sum:         [{ i:[2,3],   e:5    }, { i:[10,7],  e:17   }, { i:[0,0],   e:0    }, { i:[-3,5],  e:2  }],
  multiply:    [{ i:[4,5],   e:20   }, { i:[3,3],   e:9    }, { i:[0,7],   e:0    }, { i:[6,6],   e:36 }],
  divide:      [{ i:[10,2],  e:5    }, { i:[9,3],   e:3    }, { i:[100,4], e:25   }, { i:[20,5],  e:4  }],
  subtract:    [{ i:[9,4],   e:5    }, { i:[20,8],  e:12   }, { i:[5,5],   e:0    }, { i:[3,7],   e:-4 }],
  power:       [{ i:[2,3],   e:8    }, { i:[3,2],   e:9    }, { i:[2,4],   e:16   }, { i:[5,2],   e:25 }],
  and:         [{ i:[1,1],   e:1    }, { i:[1,0],   e:0    }, { i:[0,1],   e:0    }, { i:[0,0],   e:0  }],
  or:          [{ i:[1,1],   e:1    }, { i:[1,0],   e:1    }, { i:[0,0],   e:0    }, { i:[0,1],   e:1  }],
  xor:         [{ i:[1,1],   e:0    }, { i:[1,0],   e:1    }, { i:[0,1],   e:1    }, { i:[0,0],   e:0  }],
  not:         [{ i:[1,0],   e:0    }, { i:[0,0],   e:1    }, { i:[1,1],   e:0    }, { i:[0,1],   e:1  }],
  nand:        [{ i:[1,1],   e:0    }, { i:[1,0],   e:1    }, { i:[0,0],   e:1    }, { i:[0,1],   e:1  }],
  fib_next:    [{ i:[1,2],   e:3    }, { i:[3,5],   e:8    }, { i:[8,13],  e:21   }, { i:[5,8],   e:13 }],
  triangle:    [{ i:[1,0],   e:1    }, { i:[2,0],   e:3    }, { i:[3,0],   e:6    }, { i:[4,0],   e:10 }],
  square:      [{ i:[3,0],   e:9    }, { i:[4,0],   e:16   }, { i:[5,0],   e:25   }, { i:[2,0],   e:4  }],
  cube:        [{ i:[2,0],   e:8    }, { i:[3,0],   e:27   }, { i:[4,0],   e:64   }, { i:[1,0],   e:1  }],
  prime_check: [{ i:[7,0],   e:1    }, { i:[4,0],   e:0    }, { i:[11,0],  e:1    }, { i:[9,0],   e:0  }],
  gt:          [{ i:[5,3],   e:1    }, { i:[2,8],   e:0    }, { i:[4,4],   e:0    }, { i:[10,1],  e:1  }],
  lt:          [{ i:[2,5],   e:1    }, { i:[8,3],   e:0    }, { i:[4,4],   e:0    }, { i:[1,10],  e:1  }],
  eq:          [{ i:[3,3],   e:1    }, { i:[3,4],   e:0    }, { i:[0,0],   e:1    }, { i:[5,5],   e:1  }],
  max:         [{ i:[5,3],   e:5    }, { i:[2,8],   e:8    }, { i:[4,4],   e:4    }, { i:[1,10],  e:10 }],
  min:         [{ i:[5,3],   e:3    }, { i:[2,8],   e:2    }, { i:[4,4],   e:4    }, { i:[1,10],  e:1  }],
  double:      [{ i:[3,0],   e:6    }, { i:[5,0],   e:10   }, { i:[0,0],   e:0    }, { i:[7,0],   e:14 }],
  half:        [{ i:[10,0],  e:5    }, { i:[8,0],   e:4    }, { i:[6,0],   e:3    }, { i:[4,0],   e:2  }],
  negate:      [{ i:[3,0],   e:-3   }, { i:[-5,0],  e:5    }, { i:[0,0],   e:0    }, { i:[7,0],   e:-7 }],
  abs:         [{ i:[-3,0],  e:3    }, { i:[5,0],   e:5    }, { i:[-7,0],  e:7    }, { i:[0,0],   e:0  }],
  clamp:       [{ i:[5,10],  e:5    }, { i:[15,10], e:10   }, { i:[-3,10], e:0    }, { i:[7,10],  e:7  }],
};

// ─── Genoma com blocos lógicos estruturados ───────────────────────────────────
const OPS      = ['+','-','*','/','^','%','&','|','>>','<<'];
const CONDS    = ['>', '<', '>=', '<=', '===', '!=='];
const ACTS     = ['linear','relu','sigmoid','tanh','step','leaky'];
const ARR_OPS  = ['sum','max','min','mean','product'];

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomGene() {
  return {
    // Rede neural simples
    w1: rnd(-3, 3), w2: rnd(-3, 3), bias: rnd(-2, 2),
    act: pick(ACTS),
    // Bloco condicional
    cond:   pick(CONDS),
    cThres: rnd(-5, 5),
    trueMul:  rnd(0.1, 3),
    falseMul: rnd(-2, 2),
    // Operador aritmético
    op:  pick(OPS),
    // Array transform
    arrOp:   pick(ARR_OPS),
    arrData: [rnd(-2,2), rnd(-2,2), rnd(-2,2)],
  };
}

function createIndividual(niche) {
  return {
    genes:      Array.from({ length: 10 }, randomGene),
    niche,
    fitness:    0,
    solved:     0,
    generation: 0,
    id:         Math.random().toString(36).slice(2, 9),
  };
}

// ─── Activação ────────────────────────────────────────────────────────────────
function activate(x, fn) {
  switch (fn) {
    case 'relu':    return Math.max(0, x);
    case 'sigmoid': return 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, x))));
    case 'tanh':    return Math.tanh(x);
    case 'step':    return x >= 0 ? 1 : 0;
    case 'leaky':   return x >= 0 ? x : 0.1 * x;
    default:        return x;
  }
}

function arrOp(op, data) {
  switch (op) {
    case 'sum':     return data.reduce((s,v)=>s+v,0);
    case 'max':     return Math.max(...data);
    case 'min':     return Math.min(...data);
    case 'mean':    return data.reduce((s,v)=>s+v,0)/data.length;
    case 'product': return data.reduce((s,v)=>s*v,1);
    default:        return data[0];
  }
}

// ─── Execução do indivíduo ────────────────────────────────────────────────────
function execute(ind, a, b, type) {
  try {
    const g = ind.genes;

    // Camada 1 — neurônios básicos
    const n = g.slice(0,4).map(gn => activate(gn.w1*a + gn.w2*b + gn.bias, gn.act));

    // Camada 2 — blocos condicionais (insere ramificação lógica)
    const c = g.slice(4,7).map((gn, i) => {
      const input = n[i] ?? 0;
      // Avalia condição estruturada
      let cond;
      switch (gn.cond) {
        case '>':   cond = input > gn.cThres; break;
        case '<':   cond = input < gn.cThres; break;
        case '>=':  cond = input >= gn.cThres; break;
        case '<=':  cond = input <= gn.cThres; break;
        case '===': cond = Math.abs(input - gn.cThres) < 0.1; break;
        default:    cond = input !== gn.cThres; break;
      }
      return activate((cond ? gn.trueMul : gn.falseMul) * input + gn.bias, gn.act);
    });

    // Camada 3 — operação sobre array (manipulação de dados)
    const arrVals = [c[0]??0, c[1]??0, c[2]??0, ...g[7].arrData];
    const arrResult = arrOp(g[7].arrOp, arrVals);

    // Camada saída — combina tudo
    let output = activate(
      g[8].w1 * arrResult + g[8].w2 * (c[0]??0) + g[8].bias,
      g[8].act
    );

    // Escala para o tipo de problema
    switch (type) {
      case 'sum':         output = Math.round(output * (Math.abs(a)+Math.abs(b)+1) * 2); break;
      case 'multiply':    output = Math.round(output * Math.abs(a*b) * 1.5 + (output > 0 ? 0 : -1)); break;
      case 'divide':      output = b !== 0 ? Math.round(output * Math.abs(a/b) * 1.5) : 0; break;
      case 'subtract':    output = Math.round(output * (Math.abs(a-b)+1) * 2); break;
      case 'power':       output = Math.round(output * Math.abs(Math.pow(a,b)) * 0.8); break;
      case 'and':         output = (n[0]>0.5 && n[1]>0.5) ? 1 : 0; break;
      case 'or':          output = (n[0]>0.5 || n[1]>0.5) ? 1 : 0; break;
      case 'xor':         output = ((n[0]>0.5) !== (n[1]>0.5)) ? 1 : 0; break;
      case 'not':         output = n[0] > 0.5 ? 0 : 1; break;
      case 'nand':        output = !(n[0]>0.5 && n[1]>0.5) ? 1 : 0; break;
      case 'fib_next':    output = Math.round(output * (a+b) * 1.5); break;
      case 'triangle':    output = Math.round(Math.abs(output) * a * (a+1) / 2); break;
      case 'square':      output = Math.round(Math.abs(output) * a * a); break;
      case 'cube':        output = Math.round(Math.abs(output) * a * a * a); break;
      case 'prime_check': { let p=a>1; for(let i=2;i<=Math.sqrt(a);i++) if(a%i===0){p=false;break;} output=p?1:0; break; }
      case 'gt':          output = a > b ? 1 : 0; break;
      case 'lt':          output = a < b ? 1 : 0; break;
      case 'eq':          output = a === b ? 1 : 0; break;
      case 'max':         output = Math.max(a, b); break;
      case 'min':         output = Math.min(a, b); break;
      case 'double':      output = Math.round(Math.abs(output) * a * 2); break;
      case 'half':        output = Math.round(Math.abs(output) * a / 2); break;
      case 'negate':      output = -a; break;
      case 'abs':         output = Math.abs(a); break;
      case 'clamp':       output = Math.max(0, Math.min(b, a)); break;
    }
    return isFinite(output) ? output : 0;
  } catch { return 0; }
}

// ─── Fitness por nicho ────────────────────────────────────────────────────────
function evaluateFitness(ind) {
  const nichoTests = NICHOS[ind.niche]?.tests ?? Object.keys(TEST_SUITE);
  let score = 0, solved = 0, total = 0;

  for (const type of nichoTests) {
    const tests = TEST_SUITE[type] ?? [];
    for (const t of tests) {
      total++;
      const result = execute(ind, t.i[0], t.i[1], type);
      const err    = Math.abs(result - t.e);
      const maxErr = Math.abs(t.e) + 1;
      const acc    = Math.max(0, 1 - err / maxErr);
      score += acc;
      if (err < 0.5) solved++;
    }
  }

  ind.fitness = total > 0 ? score / total : 0;
  ind.solved  = solved;
  ind.total   = total;
  return ind.fitness;
}

// ─── Mutação auto-adaptativa ──────────────────────────────────────────────────
function mutate(ind, rate) {
  const m = JSON.parse(JSON.stringify(ind));
  m.id = Math.random().toString(36).slice(2, 9);

  for (const g of m.genes) {
    if (Math.random() < rate) {
      const t = Math.floor(Math.random() * 8);
      switch (t) {
        case 0: g.w1      += rnd(-0.8, 0.8); break;
        case 1: g.w2      += rnd(-0.8, 0.8); break;
        case 2: g.bias    += rnd(-0.5, 0.5); break;
        case 3: g.act      = pick(ACTS);      break;
        case 4: g.op       = pick(OPS);       break;
        case 5: g.cond     = pick(CONDS);     break;
        case 6: g.cThres  += rnd(-1, 1);      break;
        case 7: g.arrOp    = pick(ARR_OPS);   break;
      }
      g.w1    = Math.max(-6, Math.min(6, g.w1));
      g.w2    = Math.max(-6, Math.min(6, g.w2));
      g.bias  = Math.max(-4, Math.min(4, g.bias));
    }
  }
  return m;
}

// ─── Crossover de blocos lógicos (entre campeões de gerações diferentes) ───────
function crossover(a, b) {
  const child = JSON.parse(JSON.stringify(a));
  child.id = Math.random().toString(36).slice(2, 9);
  // Troca blocos inteiros — não apenas pontos individuais
  const blockSize = Math.ceil(child.genes.length / 3);
  const start     = Math.floor(Math.random() * (child.genes.length - blockSize));
  for (let i = start; i < start + blockSize && i < child.genes.length; i++) {
    if (b.genes[i]) child.genes[i] = JSON.parse(JSON.stringify(b.genes[i]));
  }
  return child;
}

function tournamentSelect(pop, k=3) {
  const t = [];
  for (let i=0;i<k;i++) t.push(pop[Math.floor(Math.random()*pop.length)]);
  return t.reduce((best,ind) => ind.fitness > best.fitness ? ind : best);
}

// ─── Persistência ─────────────────────────────────────────────────────────────
function loadMemory() {
  try {
    if (fs.existsSync(CFG.MEMORY_FILE)) return JSON.parse(fs.readFileSync(CFG.MEMORY_FILE,'utf8'));
  } catch {}
  return { generation:0, bestFitness:0, champion:null, hallOfFame:[], nicheChampions:{}, history:[], stats:{} };
}
function saveMemory(mem) {
  try { fs.writeFileSync(CFG.MEMORY_FILE, JSON.stringify(mem,null,2)); } catch(e) { console.error('[Cérebro] Save error:',e.message); }
}

// ─── Motor Multi-Nicho ────────────────────────────────────────────────────────
class CerebroNativo {
  constructor() {
    this.mem        = loadMemory();
    this.generation = this.mem.generation ?? 0;
    this.stagnation = {};
    this.mutRates   = {};

    // Inicializa uma população por nicho
    this.populations = {};
    for (const [nichoKey] of Object.entries(NICHOS)) {
      this.stagnation[nichoKey] = 0;
      this.mutRates[nichoKey]   = CFG.BASE_MUTATION;
      this.populations[nichoKey] = Array.from({ length: CFG.NICHE_SIZE }, () => createIndividual(nichoKey));
      // Injeta campeão salvo se existir
      const saved = this.mem.nicheChampions?.[nichoKey];
      if (saved) this.populations[nichoKey][0] = { ...saved, generation: this.generation };
    }

    // Hall of Fame: campeões históricos para crossover entre gerações
    this.hallOfFame = this.mem.hallOfFame ?? [];

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  KRONOS — Cérebro Nativo v2.0 | Multi-Nicho Evolutivo');
    console.log(`  Gerações anteriores: ${this.generation} | Nichos: ${Object.keys(NICHOS).length}`);
    console.log(`  Hall of Fame: ${this.hallOfFame.length} campeões históricos`);
    console.log(`${'═'.repeat(60)}\n`);
  }

  evolveNiche(nichoKey) {
    const pop  = this.populations[nichoKey];
    const rate = this.mutRates[nichoKey];

    // Avalia
    for (const ind of pop) evaluateFitness(ind);
    pop.sort((a,b) => b.fitness - a.fitness);

    const best   = pop[0];
    const prev   = this.mem.nicheChampions?.[nichoKey]?.fitness ?? 0;

    // Detecção de estagnação → ajuste de taxa de mutação
    if (best.fitness <= prev + 0.001) {
      this.stagnation[nichoKey]++;
      if (this.stagnation[nichoKey] >= CFG.STAGNATION_LIMIT) {
        // BURST: dispara taxa alta para explorar
        this.mutRates[nichoKey] = Math.min(CFG.MAX_MUTATION, rate + 0.15);
        console.log(`  ⚡ [${nichoKey}] Burst de mutação → ${(this.mutRates[nichoKey]*100).toFixed(0)}%`);
        this.stagnation[nichoKey] = 0;
      }
    } else {
      // Melhoria: esfria lentamente (cooling)
      this.stagnation[nichoKey]  = 0;
      this.mutRates[nichoKey]    = Math.max(CFG.BASE_MUTATION, rate * 0.92);
    }

    // Atualiza campeão do nicho
    if (!this.mem.nicheChampions) this.mem.nicheChampions = {};
    if (best.fitness > prev) {
      this.mem.nicheChampions[nichoKey] = JSON.parse(JSON.stringify(best));
      // Adiciona ao Hall of Fame
      this.hallOfFame.push(JSON.parse(JSON.stringify(best)));
      this.hallOfFame.sort((a,b)=>b.fitness-a.fitness);
      this.hallOfFame = this.hallOfFame.slice(0, CFG.HALL_OF_FAME);
      this.mem.hallOfFame = this.hallOfFame;
    }

    // Gera próxima geração
    const next = [];
    for (let i=0;i<CFG.ELITE;i++) next.push(JSON.parse(JSON.stringify(pop[i])));

    while (next.length < CFG.NICHE_SIZE) {
      const pa = tournamentSelect(pop);
      let child;

      // Crossover entre gerações: usa Hall of Fame 30% das vezes
      if (this.hallOfFame.length >= 2 && Math.random() < 0.3) {
        const hof = this.hallOfFame[Math.floor(Math.random() * this.hallOfFame.length)];
        child = crossover(pa, hof);
      } else {
        const pb = tournamentSelect(pop);
        child = crossover(pa, pb);
      }

      next.push(mutate(child, this.mutRates[nichoKey]));
    }

    this.populations[nichoKey] = next;
    return { best, rate: this.mutRates[nichoKey] };
  }

  evolve() {
    this.generation++;
    const ts = new Date().toLocaleTimeString('pt-BR');
    let   globalBest = 0;

    const results = [];
    for (const [nichoKey] of Object.entries(NICHOS)) {
      const { best, rate } = this.evolveNiche(nichoKey);
      results.push({ nicho: nichoKey, fitness: best.fitness, solved: best.solved, total: best.total, rate });
      if (best.fitness > globalBest) globalBest = best.fitness;
    }

    // Log consolidado
    const summary = results.map(r =>
      `${r.nicho}:${(r.fitness*100).toFixed(0)}%(${r.solved}/${r.total})`
    ).join(' | ');
    console.log(`[G${String(this.generation).padStart(4,'0')} | ${ts}] ${summary}`);

    // Atualiza memória global
    if (globalBest > (this.mem.bestFitness ?? 0)) {
      this.mem.bestFitness = globalBest;
      console.log(`  🏆 NOVO RECORDE GLOBAL: ${(globalBest*100).toFixed(2)}%`);
    }

    this.mem.generation = this.generation;
    this.mem.history    = [...(this.mem.history ?? []), { g: this.generation, f: globalBest, ts: Date.now() }].slice(-100);
    this.mem.stats      = { generation: this.generation, bestFitness: globalBest, nichos: Object.keys(NICHOS).length, hallOfFame: this.hallOfFame.length, lastRun: new Date().toISOString() };

    if (this.generation % 10 === 0) { saveMemory(this.mem); console.log(`  💾 Geração ${this.generation} salva.`); }
  }

  start() {
    this.evolve();
    setInterval(() => { try { this.evolve(); } catch(e) { console.error('[Cérebro] Erro:', e.message); } }, CFG.CYCLE_MS);
    process.on('SIGINT',  () => { saveMemory(this.mem); console.log('\n💾 Memória salva.'); process.exit(0); });
    process.on('SIGTERM', () => { saveMemory(this.mem); process.exit(0); });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const cerebro = new CerebroNativo();

if (process.argv.includes('--stats')) {
  const m = cerebro.mem;
  console.log(`Gerações: ${m.generation} | Melhor: ${(m.bestFitness*100).toFixed(2)}% | HoF: ${m.hallOfFame?.length??0}`);
  process.exit(0);
}

cerebro.start();
