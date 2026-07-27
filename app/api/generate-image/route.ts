import { NextResponse } from 'next/server';

const POLLINATIONS_TOKEN = process.env.POLLINATIONS_API_KEY || '';

// ─── Prompt engineering avançado ─────────────────────────────────────────────
// Expande o prompt do usuário com qualidade cinematográfica antes de gerar

function expandPrompt(userPrompt: string): string {
  const p = userPrompt.trim().toLowerCase();

  // Detecta contexto e aplica estilo adequado
  const isPhoto     = /foto|person|pessoa|rosto|portrait|real|realistic|natureza|animal|cidade|street/i.test(p);
  const is3d        = /3d|render|cgi|blender|digital art|illustration|ilustra/i.test(p);
  const isAbstract  = /abstrato|abstract|art|pintura|paint|canvas/i.test(p);
  const isProduct   = /produto|product|logo|brand|minimal|clean/i.test(p);

  const qualityBase = 'masterpiece, best quality, ultra detailed, sharp focus, 8K resolution';

  let styleEnhancement = '';
  if (isPhoto) {
    styleEnhancement = 'photorealistic, Canon EOS R5, 85mm lens f/1.8, natural lighting, depth of field, professional photography';
  } else if (is3d) {
    styleEnhancement = 'octane render, cinema 4d, volumetric lighting, ray tracing, photorealistic materials';
  } else if (isAbstract) {
    styleEnhancement = 'vibrant colors, dynamic composition, award winning digital art, trending on artstation';
  } else if (isProduct) {
    styleEnhancement = 'studio lighting, white background, product photography, clean minimal composition';
  } else {
    styleEnhancement = 'cinematic lighting, dramatic atmosphere, hyper realistic, professional grade';
  }

  return `${userPrompt.trim()}, ${styleEnhancement}, ${qualityBase}`;
}

async function generateViaUrl(prompt: string): Promise<string> {
  const seed    = Math.floor(Math.random() * 999999);
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux&enhance=true`;
}

async function generateViaApi(prompt: string): Promise<string | null> {
  if (!POLLINATIONS_TOKEN) return null;
  try {
    const res = await fetch('https://api.pollinations.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${POLLINATIONS_TOKEN}`,
      },
      body: JSON.stringify({ model: 'flux', prompt, n: 1, size: '1024x1024' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawPrompt: string = body?.prompt ?? '';

    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return NextResponse.json({ error: 'Prompt inválido.' }, { status: 400 });
    }

    // Aplica engenharia de prompt avançada
    const enhancedPrompt = expandPrompt(rawPrompt);
    const displayPrompt  = rawPrompt.trim().slice(0, 120); // legenda limpa para o usuário

    console.log(`[Image] Prompt original: "${rawPrompt.slice(0, 60)}"`);
    console.log(`[Image] Prompt expandido: "${enhancedPrompt.slice(0, 100)}"`);

    // Tenta API autenticada primeiro
    const urlFromApi = await generateViaApi(enhancedPrompt);
    if (urlFromApi) {
      return NextResponse.json({ imageUrl: urlFromApi, displayPrompt });
    }

    // Fallback: URL direta com prompt expandido
    const urlDirect = await generateViaUrl(enhancedPrompt);
    return NextResponse.json({ imageUrl: urlDirect, displayPrompt, fallback: true });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido.';
    console.error('[Image] Erro:', msg);
    try {
      const { prompt } = await req.clone().json().catch(() => ({ prompt: 'abstract art' }));
      const fallback = await generateViaUrl(expandPrompt(String(prompt).slice(0, 200)));
      return NextResponse.json({ imageUrl: fallback, fallback: true });
    } catch {
      return NextResponse.json({ error: 'Não foi possível gerar a imagem.' }, { status: 500 });
    }
  }
}
