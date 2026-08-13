export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:8001/health', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('Backend indisponível');
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ status: 'error', tts_engine: 'none', stt_engine: 'none' }, { status: 200 });
  }
}
