/**
 * Script de ativação do Pipeline Cognitivo Autônomo
 * Executa localmente em loop com intervalo configurável.
 *
 * Uso: node scripts/run-cognitive-loop.mjs
 * Ou: node scripts/run-cognitive-loop.mjs --interval=600 --cycles=5
 */

const BASE_URL = process.env.KRONOS_URL       ?? 'http://localhost:3000';
const SECRET   = process.env.COGNITIVE_LOOP_SECRET ?? 'kronos-loop-2026';
const INTERVAL = parseInt(process.argv.find(a => a.startsWith('--interval='))?.split('=')[1] ?? '300') * 1000;
const MAX_CYCLES = parseInt(process.argv.find(a => a.startsWith('--cycles='))?.split('=')[1]  ?? '0');

let cycleCount = 0;

async function runCycle() {
  cycleCount++;
  const label = `[Ciclo ${cycleCount}] ${new Date().toLocaleTimeString('pt-BR')}`;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${label} — Iniciando pipeline cognitivo...`);

  try {
    const res  = await fetch(`${BASE_URL}/api/cognitive-loop`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    });

    const data = await res.json();

    if (data.success) {
      console.log(`✓ Tema:     ${data.tema}`);
      console.log(`✓ Domínio:  ${data.dominio}`);
      console.log(`✓ Qualidade: ${data.qualityScore}/10`);
      console.log(`✓ Duração:  ${data.durationMs}ms`);
      if (data.issues?.length)      console.log(`⚠ Issues:   ${data.issues.join('; ')}`);
      if (data.directive)           console.log(`→ Diretriz: ${data.directive}`);
    } else {
      console.error(`✗ Erro: ${data.error}`);
    }
  } catch (err) {
    console.error(`✗ Falha de conexão: ${err.message}`);
    console.log('  Verifique se o servidor está rodando em:', BASE_URL);
  }

  // Verifica se deve continuar
  if (MAX_CYCLES > 0 && cycleCount >= MAX_CYCLES) {
    console.log(`\n✓ ${MAX_CYCLES} ciclos concluídos. Encerrando.`);
    process.exit(0);
  }

  console.log(`\n⏱  Próximo ciclo em ${INTERVAL / 1000}s...`);
  setTimeout(runCycle, INTERVAL);
}

// Status inicial
async function printStatus() {
  try {
    const res  = await fetch(`${BASE_URL}/api/cognitive-loop`, {
      headers: { 'Authorization': `Bearer ${SECRET}` },
    });
    const data = await res.json();
    console.log('\nKRONOS — PIPELINE COGNITIVO AUTÔNOMO');
    console.log('─'.repeat(60));
    console.log(`Total de ciclos: ${data.totalCiclos}`);
    console.log(`Score médio:     ${data.avgQualityScore}/10`);
    if (data.dominioCoverage) {
      console.log('Cobertura por domínio:');
      for (const [d, n] of Object.entries(data.dominioCoverage)) {
        console.log(`  • ${d}: ${n} tópicos`);
      }
    }
    console.log('─'.repeat(60));
  } catch {
    console.log('\nKRONOS — PIPELINE COGNITIVO AUTÔNOMO');
    console.log('─'.repeat(60));
    console.log('Status: aguardando primeiro ciclo');
    console.log('─'.repeat(60));
  }
}

(async () => {
  await printStatus();
  console.log(`\nIniciando loop | Intervalo: ${INTERVAL / 1000}s | Ciclos: ${MAX_CYCLES || '∞'}`);
  runCycle();
})();
