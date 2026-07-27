/**
 * KRONOS — Deep Reader Core
 * Parser local de PDFs. Roda 100% no servidor Next.js, sem serviços externos.
 * Suporta: holerites, contratos, notas fiscais, laudos, relatórios genéricos.
 */

import * as pdfParse from 'pdf-parse';

// ─── Tipos de saída ───────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'holerite'
  | 'contrato'
  | 'nota_fiscal'
  | 'laudo'
  | 'relatorio'
  | 'generico';

export interface ExtractedField {
  label: string;
  value: string;
  confidence: 'alta' | 'media' | 'baixa';
}

export interface DeepReaderResult {
  fileName:   string;
  category:   DocumentCategory;
  pageCount:  number;
  rawText:    string;
  fields:     ExtractedField[];
  summary:    string;
  auditFlags: string[];  // ⚠️ inconsistências detectadas
}

// ─── Classificação do documento ───────────────────────────────────────────────

function classifyDocument(text: string): DocumentCategory {
  const t = text.toLowerCase();
  if (/holerite|contracheque|folha\s+de\s+pagamento|salário\s+bruto|inss|fgts|irrf/.test(t)) return 'holerite';
  if (/contrato\s+de|cláusula|partes\s+contratantes|vigência|rescisão/.test(t))              return 'contrato';
  if (/nota\s+fiscal|nf-e|cnpj|cfop|icms|valor\s+total\s+da\s+nota/.test(t))               return 'nota_fiscal';
  if (/laudo|diagnóstico|exame|paciente|crm|cid|resultado/.test(t))                          return 'laudo';
  if (/relatório|análise|período|resultado\s+do\s+período/.test(t))                          return 'relatorio';
  return 'generico';
}

// ─── Extratores por categoria ─────────────────────────────────────────────────

function extractHolerite(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];

  const patterns: [string, RegExp, ExtractedField['confidence']][] = [
    ['Nome do Funcionário', /(?:funcionário|colaborador|nome)[:\s]+([A-ZÀ-Ú][a-zA-ZÀ-ú\s]{3,50})/i,     'alta'],
    ['Empresa',            /(?:empresa|empregador|razão\s+social)[:\s]+([A-Za-zÀ-ú\s.&]{3,60})/i,       'alta'],
    ['CPF',                /cpf[:\s]*([\d]{3}\.[\d]{3}\.[\d]{3}-[\d]{2}|\d{11})/i,                      'alta'],
    ['Matrícula',          /matrícula[:\s]*([\w\d-]{3,20})/i,                                            'media'],
    ['Competência',        /(?:competência|período|mês)[:\s]*([a-zA-Z]{3,9}\/\d{4}|\d{2}\/\d{4})/i,     'alta'],
    ['Salário Bruto',      /salário\s+bruto[:\s]*R?\$?\s*([\d.,]+)/i,                                    'alta'],
    ['INSS',               /inss[:\s]*R?\$?\s*([\d.,]+)/i,                                               'alta'],
    ['IRRF',               /irrf[:\s]*R?\$?\s*([\d.,]+)/i,                                               'alta'],
    ['FGTS',               /fgts[:\s]*R?\$?\s*([\d.,]+)/i,                                               'alta'],
    ['Salário Líquido',    /(?:salário|valor)\s+líquido[:\s]*R?\$?\s*([\d.,]+)/i,                        'alta'],
    ['Horas Extras',       /horas\s+extras?[:\s]*R?\$?\s*([\d.,]+)/i,                                    'media'],
    ['Periculosidade',     /periculosidade[:\s]*R?\$?\s*([\d.,]+)/i,                                     'media'],
    ['Insalubridade',      /insalubridade[:\s]*R?\$?\s*([\d.,]+)/i,                                      'media'],
    ['VT',                 /vale[-\s]transporte[:\s]*R?\$?\s*([\d.,]+)/i,                                 'media'],
    ['VR/VA',              /vale[-\s](?:refeição|alimentação)[:\s]*R?\$?\s*([\d.,]+)/i,                   'media'],
  ];

  for (const [label, rx, confidence] of patterns) {
    const m = text.match(rx);
    if (m?.[1]) fields.push({ label, value: m[1].trim(), confidence });
  }
  return fields;
}

function extractContrato(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const patterns: [string, RegExp, ExtractedField['confidence']][] = [
    ['Partes',        /(?:entre|contratante)[:\s]+([A-Za-zÀ-ú\s.,]{5,80})/i,          'media'],
    ['Vigência',      /vigência[:\s]+([^\n]{5,50})/i,                                  'alta'],
    ['Valor',         /valor[:\s]+R?\$?\s*([\d.,]+)/i,                                 'alta'],
    ['Objeto',        /objeto[:\s]+([^\n]{10,120})/i,                                   'media'],
    ['Prazo',         /prazo[:\s]+([^\n]{3,60})/i,                                      'media'],
    ['Penalidade',    /multa[:\s]+([^\n]{3,80})/i,                                      'media'],
  ];
  for (const [label, rx, confidence] of patterns) {
    const m = text.match(rx);
    if (m?.[1]) fields.push({ label, value: m[1].trim(), confidence });
  }
  return fields;
}

function extractNotaFiscal(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const patterns: [string, RegExp, ExtractedField['confidence']][] = [
    ['Emitente',       /(?:emitente|razão\s+social)[:\s]+([A-Za-zÀ-ú\s.&]{3,60})/i,   'alta'],
    ['CNPJ Emitente',  /cnpj[:\s]*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})/i,     'alta'],
    ['Número NF',      /n[°úo]?\s*[:\s]*([\d]{1,10})/i,                                'alta'],
    ['Data Emissão',   /(?:emissão|emitida\s+em)[:\s]+(\d{2}\/\d{2}\/\d{4})/i,         'alta'],
    ['Valor Total',    /valor\s+total[:\s]*R?\$?\s*([\d.,]+)/i,                         'alta'],
    ['CFOP',           /cfop[:\s]*([\d.]{4,10})/i,                                      'media'],
    ['ICMS',           /icms[:\s]*R?\$?\s*([\d.,]+)/i,                                  'media'],
  ];
  for (const [label, rx, confidence] of patterns) {
    const m = text.match(rx);
    if (m?.[1]) fields.push({ label, value: m[1].trim(), confidence });
  }
  return fields;
}

function extractGenerico(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  // Extrai datas
  const dates = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g);
  if (dates?.length) fields.push({ label: 'Datas encontradas', value: [...new Set(dates)].slice(0, 5).join(', '), confidence: 'alta' });
  // Extrai valores monetários
  const valores = text.match(/R\$\s*[\d.,]+/g);
  if (valores?.length) fields.push({ label: 'Valores encontrados', value: [...new Set(valores)].slice(0, 8).join(' | '), confidence: 'media' });
  // Extrai CPFs
  const cpfs = text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g);
  if (cpfs?.length) fields.push({ label: 'CPFs', value: [...new Set(cpfs)].join(', '), confidence: 'alta' });
  // Extrai CNPJs
  const cnpjs = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g);
  if (cnpjs?.length) fields.push({ label: 'CNPJs', value: [...new Set(cnpjs)].join(', '), confidence: 'alta' });
  // Extrai emails
  const emails = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/g);
  if (emails?.length) fields.push({ label: 'E-mails', value: [...new Set(emails)].slice(0, 3).join(', '), confidence: 'alta' });
  return fields;
}

// ─── Flags de auditoria ───────────────────────────────────────────────────────

function runAuditFlags(category: DocumentCategory, fields: ExtractedField[], text: string): string[] {
  const flags: string[] = [];
  const t = text.toLowerCase();

  if (category === 'holerite') {
    const bruto  = parseFloat(fields.find(f => f.label === 'Salário Bruto')?.value.replace(/\./g,'').replace(',','.') ?? '0');
    const liquido = parseFloat(fields.find(f => f.label === 'Salário Líquido')?.value.replace(/\./g,'').replace(',','.') ?? '0');
    const inss   = parseFloat(fields.find(f => f.label === 'INSS')?.value.replace(/\./g,'').replace(',','.') ?? '0');
    const irrf   = parseFloat(fields.find(f => f.label === 'IRRF')?.value.replace(/\./g,'').replace(',','.') ?? '0');

    if (bruto > 0 && liquido > 0) {
      const descTotal = bruto - liquido;
      const descCalc  = inss + irrf;
      if (descCalc > 0 && Math.abs(descTotal - descCalc) > 50) {
        flags.push(`⚠️ Descrepância nos descontos: bruto - líquido = R$ ${descTotal.toFixed(2)}, mas INSS + IRRF = R$ ${descCalc.toFixed(2)}`);
      }
    }
    if (bruto > 0 && inss === 0) flags.push('⚠️ INSS não identificado no documento');
    if (!fields.find(f => f.label === 'FGTS')) flags.push('ℹ️ FGTS não localizado — verifique se consta no verso');
  }

  if (t.includes('vencido') || t.includes('prazo expirado')) {
    flags.push('⚠️ Documento pode conter prazo vencido — verifique a vigência');
  }

  return flags;
}

// ─── Gerador de resumo ────────────────────────────────────────────────────────

function buildSummary(category: DocumentCategory, fields: ExtractedField[], fileName: string): string {
  if (category === 'holerite') {
    const nome   = fields.find(f => f.label === 'Nome do Funcionário')?.value ?? '—';
    const emp    = fields.find(f => f.label === 'Empresa')?.value ?? '—';
    const comp   = fields.find(f => f.label === 'Competência')?.value ?? '—';
    const bruto  = fields.find(f => f.label === 'Salário Bruto')?.value ?? '—';
    const liq    = fields.find(f => f.label === 'Salário Líquido')?.value ?? '—';
    const inss   = fields.find(f => f.label === 'INSS')?.value ?? '—';
    const irrf   = fields.find(f => f.label === 'IRRF')?.value ?? '—';
    return `Holerite de ${nome} — ${emp} (${comp})\nSalário Bruto: R$ ${bruto} | Líquido: R$ ${liq}\nDescontos: INSS R$ ${inss} · IRRF R$ ${irrf}`;
  }
  if (category === 'contrato') {
    const obj = fields.find(f => f.label === 'Objeto')?.value ?? '—';
    const val = fields.find(f => f.label === 'Valor')?.value ?? '—';
    const vig = fields.find(f => f.label === 'Vigência')?.value ?? '—';
    return `Contrato — Objeto: ${obj}\nValor: R$ ${val} | Vigência: ${vig}`;
  }
  if (category === 'nota_fiscal') {
    const emit = fields.find(f => f.label === 'Emitente')?.value ?? '—';
    const val  = fields.find(f => f.label === 'Valor Total')?.value ?? '—';
    const num  = fields.find(f => f.label === 'Número NF')?.value ?? '—';
    return `Nota Fiscal nº ${num} — ${emit}\nValor Total: R$ ${val}`;
  }
  const fieldCount = fields.length;
  return `${fileName}: ${fieldCount} campo(s) extraído(s). Documento classificado como "${category}".`;
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function parsePDF(buffer: Buffer, fileName: string): Promise<DeepReaderResult> {
  const parsed    = await (pdfParse as any)(buffer);
  const rawText   = parsed.text.replace(/\s{3,}/g, '\n').trim();
  const pageCount = parsed.numpages;
  const category  = classifyDocument(rawText);

  let fields: ExtractedField[] = [];
  switch (category) {
    case 'holerite':    fields = extractHolerite(rawText);   break;
    case 'contrato':    fields = extractContrato(rawText);   break;
    case 'nota_fiscal': fields = extractNotaFiscal(rawText); break;
    default:            fields = extractGenerico(rawText);   break;
  }

  const auditFlags = runAuditFlags(category, fields, rawText);
  const summary    = buildSummary(category, fields, fileName);

  return { fileName, category, pageCount, rawText, fields, summary, auditFlags };
}

// ─── Formata contexto para o LLM ─────────────────────────────────────────────

export function formatForLLM(result: DeepReaderResult): string {
  const fieldLines = result.fields.map(f => `${f.label}: ${f.value}`).join('\n');
  const flagLines  = result.auditFlags.length ? `\nFLAGS DE AUDITORIA:\n${result.auditFlags.join('\n')}` : '';
  return `DOCUMENTO: ${result.fileName} (${result.category}, ${result.pageCount} página(s))
RESUMO: ${result.summary}

CAMPOS EXTRAÍDOS:
${fieldLines || 'Nenhum campo estruturado identificado.'}
${flagLines}

TEXTO COMPLETO (para análise profunda):
${result.rawText.slice(0, 8000)}${result.rawText.length > 8000 ? '\n[... conteúdo truncado para análise]' : ''}`;
}
