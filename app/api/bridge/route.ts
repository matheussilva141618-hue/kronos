export const dynamic = 'force-dynamic';

/**
 * POST /api/bridge
 * Proxy para o Kronos OS Bridge local (http://127.0.0.1:8000).
 * Recebe a ação do frontend/chat e repassa ao bridge Python.
 */

import { NextResponse } from 'next/server';

const BRIDGE_URL = 'http://127.0.0.1:8000/execute';
const BRIDGE_TIMEOUT = 65000; // 65s (terminal pode demorar)

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, target, extra_data } = body as {
      action: string;
      target?: string;
      extra_data?: string;
    };

    if (!action) {
      return NextResponse.json({ success: false, error: 'Campo action obrigatório' }, { status: 400 });
    }

    // Verifica se o bridge está online
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT);

    try {
      const res = await fetch(BRIDGE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, target: target ?? '', extra_data: extra_data ?? '' }),
        signal:  controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      return NextResponse.json(data, { status: res.ok ? 200 : 500 });

    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isOffline = (fetchErr as Error).name === 'AbortError' ||
                        (fetchErr as Error).message?.includes('ECONNREFUSED') ||
                        (fetchErr as Error).message?.includes('fetch failed');

      if (isOffline) {
        return NextResponse.json({
          success: false,
          error:   'Kronos Bridge offline. Inicie com: python scripts/kronos_bridge.py',
          offline: true,
        }, { status: 503 });
      }
      throw fetchErr;
    }

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }, { status: 500 });
  }
}

// Health check
export async function GET() {
  try {
    const res  = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch {
    return NextResponse.json({ online: false, message: 'Bridge offline' }, { status: 503 });
  }
}
