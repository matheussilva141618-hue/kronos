export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/kids-profile?username=xxx
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username')?.trim();

  if (!username) {
    return NextResponse.json({ error: 'username obrigatório.' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    
    // Verifica se a tabela existe antes de consultar
    const { data, error } = await supabase
      .from('perfis_kids')
      .select('nome, idade, updated_at')
      .eq('username', username)
      .maybeSingle();

    // Se erro de tabela não existir, retorna null silenciosamente
    if (error) {
      if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return NextResponse.json({ profile: null });
      }
      throw error;
    }
    
    return NextResponse.json({ profile: data ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
    console.error('[KidsProfile] GET erro:', msg);
    // Retorna null ao invés de erro para não bloquear o app
    return NextResponse.json({ profile: null });
  }
}

// POST /api/kids-profile  { username, nome, idade }
export async function POST(req: Request) {
  try {
    const { username, nome, idade } = await req.json() as {
      username: string;
      nome: string;
      idade: number;
    };

    if (!username || !nome || !idade) {
      return NextResponse.json({ error: 'Campos obrigatórios: username, nome, idade.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('perfis_kids')
      .upsert({ username: username.trim(), nome: nome.trim(), idade: Number(idade) }, { onConflict: 'username' })
      .select('nome, idade')
      .single();

    if (error) throw error;

    console.log(`[KidsProfile] Salvo: ${nome}, ${idade} anos`);
    return NextResponse.json({ profile: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
    console.error('[KidsProfile] POST erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
