export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// Rota desativada — auth removida, perfil gerenciado via localStorage
export async function GET() {
  return NextResponse.json({ profile: null });
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
