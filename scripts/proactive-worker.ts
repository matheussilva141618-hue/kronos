/**
 * KRONOS — Proactive Worker v2.0 (Background)
 *
 * Loop contínuo com dois modos:
 *   Standard  → ciclo proativo: analisa usuários, gera notificações
 *   Agentic   → ciclo proativo + varredura de projetos + hipóteses autônomas
 *
 * npm run proactive:worker         → standard, intervalo 600s
 * npm run proactive:worker:fast    → standard, 5 ciclos de 120s
 * npm run proactive:agentic        → agentic mode, intervalo 600s
 * npm run kronos:core              → cognitive:full + proactive:agentic em paralelo
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const getArg     = (name: string, def: string) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const INTERVAL   = parseInt(getArg('interval', '600')) * 1000;
const MAX_CYCLES = parseInt(getArg('cycles', '0'));
const AGENTIC    = args.includes('--agentic');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error' | 'ok', msg: string) {
  const ts    = new Date().toLocaleTimeString('pt-BR');
  const icons = { info: '→', warn: '⚠', error: '✗', ok: '✓' };
  console.log(`${ts} [${icons[level]}] ${msg}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Ciclo proativo padrão ────────────────────────────────────────────────────

async function runStandardCycle() {
  const { runProactiveCycle } = await import('@/utils/AUTONOMOUS_AGENT');
  return runProactiveCycle();
}

// ─── Ciclo agentic: chama o endpoint HTTP interno ────────────────────────────
// Usa HTTP interno para reutilizar o pipeline completo do route handler

async function runAgenticCycle(): Promise<{
  totalNotifications: number;
  usersProcessed: number;
  agenticHypotheses: number;
  errors: number;
}> {
  const base   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const secret = process.env.COGNITIVE_LOOP_SECRET ?? 'kronos-loop-2026';

  const res = await fetch(`${base}/api/agent/cycle?action=agentic`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

// ─── Loop principal ───────────────────────────────────────────────────────────

async function runCycle(num: number) {
  if (AGENTIC) {
    // Agentic mode: proactive + hypothesis engine
    const result = await runAgenticCycle();
    if (result.totalNotifications > 0 || result.agenticHypotheses > 0) {
      log('ok', `${result.totalNotifications} notif. | ${result.agenticHypotheses} hipóteses | ${result.usersProcessed} usuários`);
    } else {
      log('info', `Nenhuma ação necessária — ${result.usersProcessed} usuários verificados`);
    }
    if (result.errors > 0) log('warn', `${result.errors} erro(s)`);
    return result;
  } else {
    // Standard mode
    const result = await runStandardCycle();
    if (result.totalNotifications > 0) {
      log('ok', `${result.totalNotifications} notif. para ${result.usersProcessed} usuários`);
    } else {
      log('info', `Nenhuma notificação — ${result.usersProcessed} usuários verificados`);
    }
    if (result.errors > 0) log('warn', `${result.errors} erro(s)`);
    return result;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltam variáveis SUPABASE. Verifique .env.local');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  KRONOS — PROACTIVE WORKER v2.0');
  console.log(`  Modo: ${AGENTIC ? 'AGENTIC (projetos + hipóteses)' : 'STANDARD'}`);
  console.log(`  Intervalo: ${INTERVAL / 1000}s | Ciclos: ${MAX_CYCLES || '∞'}`);
  console.log('═'.repeat(60));

  let num = 0;
  while (true) {
    num++;
    console.log(`\n${'─'.repeat(60)}`);
    log('info', `CICLO ${num} — ${new Date().toLocaleString('pt-BR')}`);

    const t0 = Date.now();
    try { await runCycle(num); }
    catch (e) { log('error', `Ciclo ${num} falhou: ${e instanceof Error ? e.message : e}`); }

    log('info', `Ciclo completo em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    if (MAX_CYCLES > 0 && num >= MAX_CYCLES) {
      log('ok', `${MAX_CYCLES} ciclos concluídos.`);
      break;
    }

    log('info', `Aguardando ${INTERVAL / 1000}s...`);
    await sleep(INTERVAL);
  }

  process.exit(0);
}

main().catch(e => { console.error('[ProactiveWorker] Fatal:', e); process.exit(1); });
