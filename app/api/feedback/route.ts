/**
 * POST /api/feedback
 * Recebe avaliação e correções do usuário para ajuste de preferências.
 */

import { NextResponse } from 'next/server';
import { saveFeedback } from '@/utils/MEMORY_ENGINE';
import { createServiceClient } from '@/utils/supabase/service';
import { saveSelfCorrection } from '@/utils/VECTOR_MEMORY';

export async function POST(req: Request) {
  try {
    const { username, rating, context, correction } = await req.json() as {
      username:    string;
      rating:      number;
      context:     string;
      correction?: string;
    };

    if (!username || !rating || !context) {
      return NextResponse.json({ error: 'Campos obrigatórios: username, rating, context.' }, { status: 400 });
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating deve ser entre 1 e 5.' }, { status: 400 });
    }

    await saveFeedback(username, rating, context, correction);

    // Se rating <= 2 e há correção: persiste como auto-correção vetorial e memória
    if (rating <= 2 && correction) {
      // Auto-correção com alta prioridade no sistema vetorial
      await saveSelfCorrection(username, context, correction, undefined, 9);

      // Também persiste na memória estruturada
      const sb = createServiceClient();
      await sb.from('user_memory').upsert({
        username,
        mode: 'profissional',
        topic: 'feedback_negativo_recente',
        detail: `Nota ${rating}. Correção: ${correction.slice(0, 200)}`,
        importance_score: 9,
        category: 'feedback',
        source: 'explicit',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'username,mode,topic', ignoreDuplicates: false });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
