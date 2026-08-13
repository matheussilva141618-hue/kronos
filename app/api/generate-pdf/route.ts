export const dynamic = 'force-dynamic';

/**
 * POST /api/generate-pdf
 * Recebe conteúdo do LLM, gera PDF profissional via PDF_ENGINE e retorna URL.
 */

import { NextResponse } from 'next/server';
import { generatePDF, formatBytes } from '@/utils/PDF_ENGINE';
import type { PDFSection } from '@/utils/PDF_ENGINE';

function detectPDFType(input: string): 'dossie' | 'relatorio' | 'holerite_auditoria' | 'contrato' | 'plano' | 'generico' {
  const value = input.toLowerCase();
  if (value.includes('contrato') || value.includes('acordo')) return 'contrato';
  if (value.includes('holerite') || value.includes('auditoria')) return 'holerite_auditoria';
  if (value.includes('plano') || value.includes('planejamento')) return 'plano';
  if (value.includes('dossiê') || value.includes('portfolio')) return 'dossie';
  if (value.includes('relatório') || value.includes('report')) return 'relatorio';
  return 'generico';
}

export async function POST(req: Request) {
  try {
    const { title, content, message, author, flags } = await req.json() as {
      title:    string;
      content:  string;
      message?: string;
      author?:  string;
      flags?:   string[];
    };

    if (!title || !content) {
      return NextResponse.json({ error: 'title e content são obrigatórios.' }, { status: 400 });
    }

    const docType = detectPDFType(message ?? title);

    // Divide o conteúdo em seções por cabeçalho (linhas em caps ou com ":")
    const rawSections = content.split(/\n(?=[A-ZÁÉÍÓÚ\s]{4,}:|#{1,3}\s)/);
    const sections: PDFSection[] = rawSections.map((block) => {
      const lines = block.trim().split('\n');
      const firstLine = lines[0].trim();
      const isTitle = firstLine.length < 80 && /^[A-ZÁÉÍÓÚ\s:]{4,}$/.test(firstLine.replace(/[:#]/g, '').trim());
      return {
        title: isTitle ? firstLine.replace(/[:#]/g, '').trim() : undefined,
        body:  isTitle ? lines.slice(1).join('\n').trim() : block.trim(),
      };
    }).filter(s => s.body || s.title);

    // Se não detectou seções, usa o conteúdo todo numa seção
    if (sections.length === 0 || (sections.length === 1 && !sections[0].body)) {
      sections.splice(0, sections.length, { body: content });
    }

    const result = await generatePDF({
      type:     docType,
      title,
      subtitle: `Gerado pelo Kronos AI`,
      author:   author ?? 'Matheus',
      sections,
      flags:    flags ?? [],
    });

    return NextResponse.json({
      success:   true,
      fileName:  result.fileName,
      publicUrl: result.publicUrl,
      size:      formatBytes(result.sizeBytes),
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido.';
    console.error('[PDF Engine] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
