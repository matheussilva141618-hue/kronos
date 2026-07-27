import { NextResponse } from 'next/server';

// Health check — retorna status do servidor e das dependências críticas
export async function GET() {
  const checks: Record<string, 'ok' | 'missing'> = {
    cerebras: process.env.CEREBRAS_API_KEY ? 'ok' : 'missing',
    supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'ok' : 'missing',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'missing',
  };

  const allOk = Object.values(checks).every(v => v === 'ok');

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  }, { status: allOk ? 200 : 503 });
}
