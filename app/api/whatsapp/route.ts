import { NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/services/whatsapp';

// ─── Rate limit por username ──────────────────────────────────────────────────
const lastSentAt: Record<string, number> = {};
const RATE_LIMIT_MS = 5_000;

export async function POST(req: Request) {
  try {
    const { number, message, username, instance = 'kronos' } = await req.json() as {
      number:    string;
      message:   string;
      username?: string;
      instance?: string;
    };

    if (!number || !message) {
      return NextResponse.json({ error: 'Campos obrigatórios: number, message.' }, { status: 400 });
    }

    const user = username ?? 'anon';
    const now  = Date.now();
    const last = lastSentAt[user] ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
      return NextResponse.json({ error: `Aguarde ${wait}s antes de enviar outra mensagem.` }, { status: 429 });
    }
    lastSentAt[user] = now;

    const result = await sendWhatsAppMessage({ number, message, instance });

    // Tenta logar no Supabase sem bloquear
    try {
      const { createClient } = await import('@/utils/supabase/server');
      const supabase = await createClient();
      await supabase.from('whatsapp_logs').insert({
        username:     user,
        destinatario: number.replace(/\D/g, ''),
        conteudo:     message.trim(),
        status_envio: result.success ? 'enviado' : 'erro',
        erro_detalhe: result.error   ?? null,
        message_id:   result.messageId ?? null,
      });
    } catch { /* log falhou — não bloqueia */ }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
    console.error('[WhatsApp Route] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
