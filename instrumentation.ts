/**
 * KRONOS — Instrumentation (Next.js lifecycle hook)
 * Roda UMA VEZ quando o servidor inicia.
 * Ativa o Heartbeat Engine — ciclos autônomos em background.
 */

export async function register() {
  // Só roda no server-side (não no edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startHeartbeat } = await import('./utils/KRONOS_HEARTBEAT');
    startHeartbeat();
  }
}
