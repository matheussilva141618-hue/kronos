import { NextResponse } from 'next/server';

/**
 * Rota de geração de imagem do Kronos AI.
 * Atualmente usa o modelo de visão para ANÁLISE (OCR/extração de dados).
 * Geração artística é um recurso secundário — configurável via IMAGEN_API_KEY.
 */

const IMAGEN_KEY = process.env.IMAGEN_API_KEY;

const LIMIT_MESSAGE =
  'O motor de renderização visual está em recarga. ' +
  'A análise de documentos e dados permanece totalmente ativa. ' +
  'Gostaria de focar na exportação de um relatório em PDF enquanto isso?';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt inválido.' }, { status: 400 });
    }

    // Se não há chave configurada, retorna mensagem profissional
    if (!IMAGEN_KEY) {
      console.log('[Kronos Image] Chave de geração não configurada — modo análise ativo.');
      return NextResponse.json({ error: LIMIT_MESSAGE, fallback: true }, { status: 503 });
    }

    // Stable Diffusion via Stability AI (configurável)
    const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${IMAGEN_KEY}`,
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        steps: 30,
        samples: 1,
      }),
    });

    if (res.status === 429 || res.status === 402) {
      console.warn('[Kronos Image] Limite atingido.');
      return NextResponse.json({ error: LIMIT_MESSAGE, fallback: true }, { status: 503 });
    }

    if (!res.ok) {
      const err = await res.text();
      console.error('[Kronos Image] Erro:', err);
      return NextResponse.json({ error: LIMIT_MESSAGE, fallback: true }, { status: 503 });
    }

    const data = await res.json();
    const base64 = data?.artifacts?.[0]?.base64;

    if (!base64) {
      return NextResponse.json({ error: LIMIT_MESSAGE, fallback: true }, { status: 503 });
    }

    return NextResponse.json({ image: `data:image/png;base64,${base64}` });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido.';
    console.error('[Kronos Image] Erro:', msg);
    return NextResponse.json({ error: LIMIT_MESSAGE, fallback: true }, { status: 503 });
  }
}
