/**
 * KRONOS — Genesis Colônia v1.0
 * Organismo virtual com colônia de agentes autônomos.
 * 100% Node.js puro. Zero APIs externas.
 *
 * Dois tipos de agentes: células e neurônios
 * - Nascem, consomem energia, interagem, morrem
 * - Os mais aptos transmitem DNA para a próxima geração
 * - Estado persiste em genesis_memoria.json
 *
 * Rodar: node scripts/genesis_colonia.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  TICK_MS:          2000,    // ms por tick (tempo da colônia)
  MAX_AGENTS:       60,      // população máxima
  INITIAL_AGENTS:   20,      // população inicial
  ENERGY_PER_TICK:  100,     // energia disponível por tick no ambiente
  MEMORY_FILE:      path.join(__dirname, '..', 'genesis_memoria.json'),
  SAVE_INTERVAL:    10,      // salva a cada N ticks
};

// ─── DNA — características genéticas de cada agente ──────────────────────────
function randomDNA(type) {
  return {
    type,
    // Eficiência metabólica (quanto extrai de energia do ambiente)
    metabolism:    0.3 + Math.random() * 0.7,
    // Resistência (quanto dura com pouca energia)
    resilience:    0.2 + Math.random() * 0.8,
    // Taxa de reprodução (energia necessária para se reproduzir)
    reproThreshold: 40 + Math.random() * 60,
    // Velocidade (células se movem, neurônios transmitem sinais)
    speed:          0.1 + Math.random() * 0.9,
    // Cooperação (neurônios compartilham energia com células próximas)
    cooperation:    type === 'neuronio' ? 0.4 + Math.random() * 0.6 : Math.random() * 0.3,
    // Mutação espontânea ao se reproduzir
    mutationRate:   0.05 + Math.random() * 0.20,
  };
}

function mutateDNA(dna) {
  const m = { ...dna };
  const keys = ['metabolism','resilience','speed','cooperation','mutationRate'];
  for (const k of keys) {
    if (Math.random() < dna.mutationRate) {
      m[k] = Math.max(0.01, Math.min(1, dna[k] + (Math.random()-0.5) * 0.2));
    }
  }
  if (Math.random() < dna.mutationRate * 0.1) {
    m.reproThreshold = Math.max(20, Math.min(120, dna.reproThreshold + (Math.random()-0.5)*15));
  }
  return m;
}

function crossoverDNA(a, b) {
  // Herda metade dos genes de cada pai
  return {
    type:          Math.random() < 0.5 ? a.type : b.type,
    metabolism:    Math.random() < 0.5 ? a.metabolism    : b.metabolism,
    resilience:    Math.random() < 0.5 ? a.resilience    : b.resilience,
    reproThreshold:Math.random() < 0.5 ? a.reproThreshold: b.reproThreshold,
    speed:         Math.random() < 0.5 ? a.speed         : b.speed,
    cooperation:   Math.random() < 0.5 ? a.cooperation   : b.cooperation,
    mutationRate:  (a.mutationRate + b.mutationRate) / 2,
  };
}

// ─── Agente ───────────────────────────────────────────────────────────────────
let agentIdCounter = 0;

function createAgent(dna, parentId = null, energy = 50) {
  return {
    id:           ++agentIdCounter,
    parentId,
    type:         dna.type,
    dna,
    energy,
    age:          0,
    fitness:      0,       // acumulado ao longo da vida
    interactions: 0,       // quantas vezes interagiu com outros agentes
    reproduced:   0,       // quantas vezes se reproduziu
    alive:        true,
    bornAt:       0,       // tick de nascimento (preenchido no tick atual)
  };
}

// ─── Ambiente ─────────────────────────────────────────────────────────────────
class Colonia {
  constructor(savedState) {
    this.tick       = savedState?.tick       ?? 0;
    this.generation = savedState?.generation ?? 0;
    this.agents     = [];
    this.stats      = savedState?.stats      ?? { totalBorn:0, totalDead:0, peakPopulation:0, avgFitness:0 };
    this.history    = savedState?.history    ?? [];

    // Restaura agentes salvos ou cria população inicial
    if (savedState?.agents?.length > 0) {
      for (const a of savedState.agents) {
        this.agents.push({ ...a, alive: true });
      }
      agentIdCounter = Math.max(...this.agents.map(a => a.id), 0);
      console.log(`  Colônia restaurada: ${this.agents.length} agentes, tick ${this.tick}`);
    } else {
      this.seed();
    }
  }

  seed() {
    for (let i = 0; i < CFG.INITIAL_AGENTS; i++) {
      const type = i % 3 === 0 ? 'neuronio' : 'celula';
      const agent = createAgent(randomDNA(type), null, 30 + Math.random() * 40);
      agent.bornAt = this.tick;
      this.agents.push(agent);
    }
    this.stats.totalBorn += CFG.INITIAL_AGENTS;
    console.log(`  Semeada nova colônia com ${CFG.INITIAL_AGENTS} agentes.`);
  }

  // Distribui energia do ambiente pelos agentes vivos
  distributeEnergy() {
    const alive    = this.agents.filter(a => a.alive);
    if (!alive.length) return;

    // Células consomem do ambiente diretamente
    const cells    = alive.filter(a => a.type === 'celula');
    const neurons  = alive.filter(a => a.type === 'neuronio');

    const totalCellMeta  = cells.reduce((s,a)=>s+a.dna.metabolism,0) || 1;
    const totalNeuronMeta= neurons.reduce((s,a)=>s+a.dna.metabolism,0) || 1;

    const cellEnergy   = CFG.ENERGY_PER_TICK * 0.65;
    const neuronEnergy = CFG.ENERGY_PER_TICK * 0.35;

    for (const a of cells) {
      const gained = (a.dna.metabolism / totalCellMeta) * cellEnergy;
      a.energy += gained;
    }
    for (const a of neurons) {
      const gained = (a.dna.metabolism / totalNeuronMeta) * neuronEnergy;
      a.energy += gained;
      // Neurônios com alta cooperação compartilham 20% com células próximas
      if (a.dna.cooperation > 0.5 && cells.length > 0) {
        const share   = gained * a.dna.cooperation * 0.2;
        const target  = cells[Math.floor(Math.random() * cells.length)];
        target.energy += share;
        a.energy      -= share;
        a.interactions++;
        target.interactions++;
      }
    }
  }

  // Custo metabólico por tick (envelhecimento + respiração)
  metabolize() {
    for (const a of this.agents) {
      if (!a.alive) continue;
      a.age++;
      // Custo base + custo por velocidade + penalidade por idade
      const cost = 2 + a.dna.speed * 1.5 + (a.age > 50 ? a.age * 0.03 : 0);
      a.energy  -= cost;
      // Morre se energia esgota (resilience dá chance de sobreviver)
      if (a.energy <= 0) {
        if (Math.random() > a.dna.resilience) {
          a.alive  = false;
          a.energy = 0;
          a.fitness = this.calcFitness(a);
        } else {
          a.energy = 1; // sobreviveu por resiliência
        }
      }
      // Morre de velhice (neurônios vivem mais)
      const maxAge = a.type === 'neuronio' ? 200 : 120;
      if (a.age > maxAge) {
        a.alive  = false;
        a.fitness = this.calcFitness(a);
      }
    }
  }

  // Fitness: combinação de longevidade, reprodução e cooperação
  calcFitness(a) {
    return (
      a.age * 0.3 +
      a.reproduced * 15 +
      a.interactions * 0.5 +
      (a.energy > 0 ? a.energy * 0.1 : 0)
    );
  }

  // Reprodução assexuada (divisão/brotamento) e sexual (crossover entre dois pais)
  reproduce() {
    const alive = this.agents.filter(a => a.alive);
    if (alive.length >= CFG.MAX_AGENTS) return;

    const candidates = alive.filter(a => a.energy >= a.dna.reproThreshold);
    for (const a of candidates) {
      if (this.agents.filter(x=>x.alive).length >= CFG.MAX_AGENTS) break;

      // Gasta energia para se reproduzir
      a.energy      -= a.dna.reproThreshold * 0.6;
      a.reproduced++;

      let childDNA;
      // Reprodução sexual: 40% de chance de encontrar parceiro compatível
      const partner = alive.find(b => b !== a && b.type === a.type && b.energy > 20);
      if (partner && Math.random() < 0.4) {
        childDNA = mutateDNA(crossoverDNA(a.dna, partner.dna));
      } else {
        childDNA = mutateDNA({ ...a.dna });
      }

      const child   = createAgent(childDNA, a.id, 20 + Math.random() * 15);
      child.bornAt  = this.tick;
      this.agents.push(child);
      this.stats.totalBorn++;
    }
  }

  // Repovoamento quando a colônia fica pequena demais
  repopulate() {
    const alive = this.agents.filter(a => a.alive);
    if (alive.length < 5) {
      console.log(`  ⚠ Colônia crítica (${alive.length} agentes). Repovoando...`);
      // Usa os melhores mortos para semear nova geração
      const elite = this.agents
        .filter(a => !a.alive && a.fitness > 0)
        .sort((x,y) => y.fitness - x.fitness)
        .slice(0, 5);

      const seeds = elite.length > 0 ? elite : [];
      for (let i = 0; i < 10; i++) {
        const base = seeds[i % seeds.length];
        const dna  = base ? mutateDNA(base.dna) : randomDNA(i % 3 === 0 ? 'neuronio' : 'celula');
        const a    = createAgent(dna, base?.id ?? null, 40);
        a.bornAt   = this.tick;
        this.agents.push(a);
        this.stats.totalBorn++;
      }
      this.generation++;
    }
  }

  // Limpeza — remove mortos antigos para não crescer infinitamente
  gc() {
    const dead = this.agents.filter(a => !a.alive);
    if (dead.length > 100) {
      // Mantém apenas os 20 mortos mais recentes (para estatísticas)
      const sorted = dead.sort((a,b) => (b.age + b.fitness) - (a.age + a.fitness));
      const keep   = new Set(sorted.slice(0,20).map(a=>a.id));
      this.agents  = this.agents.filter(a => a.alive || keep.has(a.id));
    }
  }

  // Tick principal
  doTick() {
    this.tick++;
    this.distributeEnergy();
    this.metabolize();
    this.reproduce();
    this.repopulate();
    if (this.tick % 5 === 0) this.gc();

    // Estatísticas
    const alive   = this.agents.filter(a => a.alive);
    const cells   = alive.filter(a => a.type === 'celula').length;
    const neurons = alive.filter(a => a.type === 'neuronio').length;
    const avgEng  = alive.length > 0 ? (alive.reduce((s,a)=>s+a.energy,0)/alive.length).toFixed(1) : 0;
    const avgAge  = alive.length > 0 ? (alive.reduce((s,a)=>s+a.age,0)/alive.length).toFixed(1) : 0;
    const dead    = this.agents.filter(a=>!a.alive).length;

    if (alive.length > (this.stats.peakPopulation ?? 0)) this.stats.peakPopulation = alive.length;
    this.stats.avgFitness = alive.reduce((s,a)=>s+this.calcFitness(a),0) / Math.max(alive.length,1);
    this.stats.totalDead  = (this.stats.totalDead??0) + this.agents.filter(a=>!a.alive&&a.age>0).length;

    const ts = new Date().toLocaleTimeString('pt-BR');
    console.log(
      `[Tick ${String(this.tick).padStart(4,'0')} | ${ts}] ` +
      `Vivos: ${alive.length} (C:${cells} N:${neurons}) | ` +
      `Energia média: ${avgEng} | Idade média: ${avgAge} | ` +
      `Mortos total: ${dead} | Gen: ${this.generation}`
    );

    this.history.push({ tick: this.tick, alive: alive.length, cells, neurons, avgEng: +avgEng, gen: this.generation });
    if (this.history.length > 200) this.history.shift();
  }

  save() {
    const alive = this.agents.filter(a => a.alive);
    const data  = {
      tick:       this.tick,
      generation: this.generation,
      stats:      this.stats,
      history:    this.history.slice(-100),
      agents:     alive.map(a => ({ ...a, fitness: this.calcFitness(a) })),
      savedAt:    new Date().toISOString(),
    };
    try { fs.writeFileSync(CFG.MEMORY_FILE, JSON.stringify(data, null, 2)); }
    catch(e) { console.error('[Colônia] Save error:', e.message); }
  }

  start() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  KRONOS — Genesis Colônia v1.0');
    console.log(`  Tick inicial: ${this.tick} | Geração: ${this.generation}`);
    console.log(`  Agentes ativos: ${this.agents.filter(a=>a.alive).length}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Primeiro tick imediato
    this.doTick();

    setInterval(() => {
      try { this.doTick(); }
      catch(e) { console.error('[Colônia] Tick error:', e.message); }

      if (this.tick % CFG.SAVE_INTERVAL === 0) {
        this.save();
        console.log(`  💾 Estado salvo — tick ${this.tick}`);
      }
    }, CFG.TICK_MS);

    process.on('SIGINT',  () => { this.save(); console.log('\n💾 Colônia salva.'); process.exit(0); });
    process.on('SIGTERM', () => { this.save(); process.exit(0); });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
let savedState = null;
try {
  if (fs.existsSync(CFG.MEMORY_FILE)) {
    savedState = JSON.parse(fs.readFileSync(CFG.MEMORY_FILE, 'utf8'));
  }
} catch {}

if (process.argv.includes('--reset')) savedState = null;

if (process.argv.includes('--stats')) {
  if (savedState) {
    console.log(`\nGenesis Colônia — Estatísticas`);
    console.log(`Tick: ${savedState.tick} | Geração: ${savedState.generation}`);
    console.log(`Total nascidos: ${savedState.stats?.totalBorn} | Total mortos: ${savedState.stats?.totalDead}`);
    console.log(`Pico populacional: ${savedState.stats?.peakPopulation}`);
    console.log(`Agentes ativos: ${savedState.agents?.length}`);
  } else {
    console.log('Nenhuma memória encontrada.');
  }
  process.exit(0);
}

const colonia = new Colonia(savedState);
colonia.start();
