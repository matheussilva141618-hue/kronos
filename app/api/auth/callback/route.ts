export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code  = searchParams.get('code');
  const token = searchParams.get('token');
  const type  = searchParams.get('type');   // 'signup', 'magiclink', 'recovery', etc.
  const next  = searchParams.get('next') ?? '/';

  const supabase = await createClient();

  // Fluxo PKCE (magic link, OAuth, email confirm)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] Erro PKCE:', error.message);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Fluxo implícito (token hash na URL — OTP / email confirmation)
  if (token && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: type as 'signup' | 'magiclink' | 'email',
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[Auth Callback] Erro OTP:', error.message);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}/login?error=Link+inválido+ou+expirado`);
}
