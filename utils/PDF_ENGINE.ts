/**
 * KRONOS — PDF Engine
 * Geração de documentos PDF profissionais server-side com pdfkit.
 * Salva em /public/OUTPUT_DOCS e retorna URL pública de download.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PDFDocumentType =
  | 'dossie'
  | 'relatorio'
  | 'holerite_auditoria'
  | 'contrato'
  | 'plano'
  | 'generico';

export interface PDFSection {
  title?: string;
  body:   string;
  table?: { headers: string[]; rows: string[][] };
}

export interface PDFGenerateOptions {
  type:      PDFDocumentType;
  title:     string;
  subtitle?: string;
  author?:   string;
  sections:  PDFSection[];
  flags?:    string[];  // alertas/flags de auditoria
}

export interface PDFGenerateResult {
  fileName:   string;
  filePath:   string;
  publicUrl:  string;
  sizeBytes:  number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureOutputDir(): string {
  const dir = path.join(process.cwd(), 'public', 'OUTPUT_DOCS');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

const COLORS = {
  primary:    '#0f172a',
  accent:     '#3b82f6',
  muted:      '#64748b',
  border:     '#e2e8f0',
  flagBg:     '#fef2f2',
  flagText:   '#dc2626',
  success:    '#16a34a',
  white:      '#ffffff',
  headerBg:   '#1e293b',
};

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function generatePDF(opts: PDFGenerateOptions): Promise<PDFGenerateResult> {
  const outputDir  = ensureOutputDir();
  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName   = `${slugify(opts.title)}_${timestamp}.pdf`;
  const filePath   = path.join(outputDir, fileName);
  const publicUrl  = `/OUTPUT_DOCS/${fileName}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth  = doc.page.width  - 100; // margins
    const now        = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(COLORS.headerBg);
    doc.fillColor(COLORS.white).fontSize(20).font('Helvetica-Bold')
       .text('KRONOS AI', 50, 20, { continued: false });
    doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
       .text('Sistema de Inteligência Autônoma — Matheus', 50, 45);
    doc.fillColor(COLORS.white).fontSize(9)
       .text(now, 50, 60);

    doc.moveDown(3);

    // ── Tipo de documento (badge) ────────────────────────────────────────────
    const typeLabels: Record<PDFDocumentType, string> = {
      dossie:             '📁 DOSSIÊ',
      relatorio:          '📊 RELATÓRIO',
      holerite_auditoria: '📋 AUDITORIA DE HOLERITE',
      contrato:           '📄 CONTRATO',
      plano:              '🗂️ PLANO',
      generico:           '📝 DOCUMENTO',
    };
    doc.fillColor(COLORS.accent).fontSize(9).font('Helvetica-Bold')
       .text(typeLabels[opts.type] ?? 'DOCUMENTO', { align: 'left' });

    // ── Título ───────────────────────────────────────────────────────────────
    doc.moveDown(0.3);
    doc.fillColor(COLORS.primary).fontSize(22).font('Helvetica-Bold')
       .text(opts.title, { align: 'left' });

    if (opts.subtitle) {
      doc.moveDown(0.2);
      doc.fillColor(COLORS.muted).fontSize(12).font('Helvetica')
         .text(opts.subtitle);
    }

    if (opts.author) {
      doc.moveDown(0.2);
      doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica')
         .text(`Preparado por: ${opts.author}`);
    }

    // Linha separadora
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y)
       .strokeColor(COLORS.accent).lineWidth(2).stroke();
    doc.moveDown(1);

    // ── Flags de auditoria ───────────────────────────────────────────────────
    if (opts.flags?.length) {
      const flagY = doc.y;
      doc.rect(50, flagY, pageWidth, 18 + opts.flags.length * 16)
         .fill('#fff5f5').stroke('#fecaca');
      doc.fillColor(COLORS.flagText).fontSize(9).font('Helvetica-Bold')
         .text('⚠️ ALERTAS DE AUDITORIA', 58, flagY + 8);
      opts.flags.forEach((flag, i) => {
        doc.fillColor(COLORS.flagText).fontSize(8).font('Helvetica')
           .text(flag, 58, flagY + 22 + i * 14);
      });
      doc.moveDown(opts.flags.length * 0.8 + 1.5);
    }

    // ── Seções ───────────────────────────────────────────────────────────────
    for (const section of opts.sections) {
      if (section.title) {
        doc.addPage();
        // Título da seção com fundo sutil
        const secY = doc.y;
        doc.rect(50, secY, pageWidth, 22).fill('#f1f5f9');
        doc.fillColor(COLORS.primary).fontSize(12).font('Helvetica-Bold')
           .text(section.title.toUpperCase(), 58, secY + 6);
        doc.moveDown(1.2);
      }

      // Body text
      if (section.body) {
        doc.fillColor(COLORS.primary).fontSize(10).font('Helvetica')
           .text(section.body, { align: 'justify', lineGap: 3 });
        doc.moveDown(0.8);
      }

      // Tabela inline
      if (section.table) {
        const { headers, rows } = section.table;
        const colWidth = pageWidth / headers.length;
        let tableY = doc.y;

        // Header da tabela
        doc.rect(50, tableY, pageWidth, 20).fill(COLORS.headerBg);
        headers.forEach((h, i) => {
          doc.fillColor(COLORS.white).fontSize(9).font('Helvetica-Bold')
             .text(h, 54 + i * colWidth, tableY + 6, { width: colWidth - 4, ellipsis: true });
        });
        tableY += 20;

        // Linhas
        rows.forEach((row, ri) => {
          const rowBg = ri % 2 === 0 ? '#f8fafc' : COLORS.white;
          doc.rect(50, tableY, pageWidth, 18).fill(rowBg).stroke(COLORS.border);
          row.forEach((cell, ci) => {
            doc.fillColor(COLORS.primary).fontSize(9).font('Helvetica')
               .text(String(cell), 54 + ci * colWidth, tableY + 5, { width: colWidth - 4, ellipsis: true });
          });
          tableY += 18;
        });
        doc.y = tableY + 10;
        doc.moveDown(0.5);
      }
    }

    // ── Rodapé em todas as páginas ───────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.moveTo(50, doc.page.height - 40)
         .lineTo(50 + pageWidth, doc.page.height - 40)
         .strokeColor(COLORS.border).lineWidth(1).stroke();
      doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
         .text(
           `Kronos AI · Gerado em ${now} · Página ${i + 1} de ${pageCount}`,
           50, doc.page.height - 28, { align: 'center', width: pageWidth }
         );
    }

    doc.end();

    stream.on('finish', () => {
      const sizeBytes = fs.statSync(filePath).size;
      resolve({ fileName, filePath, publicUrl, sizeBytes });
    });
    stream.on('error', reject);
  });
}

// ─── Formata bytes ────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
