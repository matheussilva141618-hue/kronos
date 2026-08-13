export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const arrayBuffer = await req.arrayBuffer();
    const res = await fetch('http://127.0.0.1:8001/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: Buffer.from(arrayBuffer),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`STT backend falhou: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ transcript: '', confidence: 0, isFinal: false }, { status: 200 });
  }
}
