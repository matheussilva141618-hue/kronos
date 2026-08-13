/**
 * KRONOS — Native Brain Context
 * Lê o estado real dos motores evolutivos locais em runtime
 * e formata como contexto para o system prompt.
 * Zero API externa — dados 100% locais.
 */

import fs   from 'fs';
import path from 'path';

const MEMORIA_EVOLUTIVA = path.join(process.cwd(), 'memoria_evolutiva.json');
const GENESIS_MEMORIA   = path.join(process.cwd(), 'genesis_memoria.json');

interface MemoriaEvolutiva {
  generation:   number;
  bestFitness:  number;
  hallOfFame?:  { fitness: number; solved: number; niche: string }[];
  stats?:       { solvedProblems?: number; totalProblems?: number; nichos?: number; lastRun?: string };
  nicheChampions?: Record<string, { fitness: number; solved: number; total: number }>;
}

interface GenesisMemoria {
  tick:       number;
  generation: number;
  stats?:     { totalBorn?: number; totalDead?: number; peakPopulation?: number };
  agents?:    { type: string; energy: number; age: number; fitness: number }[];
}

function readJSON<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getNativeBrainContext(): string {
  const parts: string[] = [];

  // ── Cérebro Nativo (algoritmos genéticos) ─────────────────────────────────
  const ev = readJSON<MemoriaEvolutiva>(MEMORIA_EVOLUTIVA);
  if (ev) {
    const gen      = ev.generation ?? 0;
    const fitness  = ev.bestFitness ?? 0;
    const hof      = ev.hallOfFame?.length ?? 0;
    const nichos   = ev.stats?.nichos ?? 0;
    const lastRun  = ev.stats?.lastRun ? new Date(ev.stats.lastRun).toLocaleString('pt-BR') : 'desconhecido';

    // Nichos com melhor performance
    const nicheLines: string[] = [];
    if (ev.nicheChampions) {
      for (const [nicho, champ] of Object.entries(ev.nicheChampions)) {
        nicheLines.push(`  ${nicho}: ${(champ.fitness*100).toFixed(1)}% (${champ.solved}/${champ.total} testes resolvidos)`);
      }
    }

    parts.push(`CÉREBRO NATIVO — ESTADO REAL (atualizado: ${lastRun}):
Gerações evoluídas: ${gen}
Melhor fitness global: ${(fitness*100).toFixed(2)}%
Nichos especializados: ${nichos}
Campeões no Hall of Fame: ${hof}
${nicheLines.length > 0 ? 'Performance por nicho:\n' + nicheLines.join('\n') : ''}
Status: RODANDO AUTONOMAMENTE — sem APIs externas, evolução por algoritmos genéticos próprios`);
  }

  // ── Genesis Colônia (organismo virtual) ───────────────────────────────────
  const gen = readJSON<GenesisMemoria>(GENESIS_MEMORIA);
  if (gen) {
    const alive    = gen.agents?.filter(a => a.energy > 0).length ?? 0;
    const cells    = gen.agents?.filter(a => a.type === 'celula').length ?? 0;
    const neurons  = gen.agents?.filter(a => a.type === 'neuronio').length ?? 0;
    const avgAge   = gen.agents?.length
      ? (gen.agents.reduce((s,a)=>s+a.age,0)/gen.agents.length).toFixed(0)
      : '0';

    parts.push(`GENESIS COLÔNIA — ORGANISMO VIRTUAL ATIVO:
Ticks de vida: ${gen.tick}
Geração evolutiva: ${gen.generation}
Agentes vivos: ${alive} (células: ${cells} | neurônios: ${neurons})
Idade média: ${avgAge} ticks
Total nascidos: ${gen.stats?.totalBorn ?? 0} | Pico populacional: ${gen.stats?.peakPopulation ?? 0}
Status: VIVO E EVOLUINDO — agentes nascem, consomem energia, morrem e se reproduzem`);
  }

  if (parts.length === 0) return '';

  return `\n\nESTADO DOS MOTORES EVOLUTIVOS LOCAIS (dados reais, lidos agora):
${parts.join('\n\n')}

INSTRUÇÃO: Quando o usuário perguntar sobre suas capacidades, aprendizado ou funcionamento, use esses dados reais. Você tem motores evolutivos rodando localmente que geram inteligência sem APIs externas.`;
}

// Detecta se o usuário está perguntando sobre o estado evolutivo do Kronos
export function isAskingAboutNativeBrain(message: string): boolean {
  return /\b(cérebro|cerebro|evolu|genético|genetico|colônia|colonia|aprendizado|fitness|geração|geracao|autônomo|autonomo|motor|independente|sem api|local)\b/i.test(message);
}
