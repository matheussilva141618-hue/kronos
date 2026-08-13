/**
 * POST /api/execute
 * Motor de execução sandboxed com auditoria.
 * Roda: JavaScript seguro, consultas SQL leves e chamadas de API externas.
 * NUNCA executa código arbitrário do usuário — apenas templates pré-aprovados.
 */

import { NextResponse } from 'next/server';

type ExecuteType = 'math' | 'json_parse' | 'date_calc' | 'unit_convert' | 'api_call';

interface ExecuteRequest {
  type:      ExecuteType;
  input:     string;
  options?:  Record<string, unknown>;
  username?: string;
}

interface AuditEntry {
  type:      ExecuteType;
  input:     string;
  result:    unknown;
  success:   boolean;
  durationMs: number;
  timestamp:  string;
}

const auditLog: AuditEntry[] = [];  // em memória — em prod usaria DB

// ─── Executores seguros ───────────────────────────────────────────────────────

function execMath(expr: string): number | string {
  // Apenas expressões matemáticas simples — sem eval de código arbitrário
  const clean = expr.replace(/[^0-9+\-*/().% ]/g, '').trim();
  if (!clean) throw new Error('Expressão inválida');
  // Usa Function para aritmética pura — sem acesso a globals
  const fn = new Function('"use strict"; return (' + clean + ')');
  const result = fn();
  if (typeof result !== 'number' || !isFinite(result)) throw new Error('Resultado inválido');
  return result;
}

function execJsonParse(input: string): unknown {
  return JSON.parse(input);
}

function execDateCalc(input: string): string {
  // Formatos: "hoje + 30 dias", "<data> + 6 meses", "diff <data> <data>"
  const diffMatch = input.match(/diff\s+([\d-]+)\s+([\d-]+)/i);
  if (diffMatch) {
    const d1   = new Date(diffMatch[1]);
    const d2   = new Date(diffMatch[2]);
    const diff = Math.abs(d2.getTime() - d1.getTime());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return `${days} dias (${Math.round(days / 30)} meses aproximado)`;
  }

  const addMatch = input.match(/(hoje|[\d-]+)\s*\+\s*(\d+)\s*(dia|semana|mês|mes|ano)/i);
  if (addMatch) {
    const base = addMatch[1].toLowerCase() === 'hoje' ? new Date() : new Date(addMatch[1]);
    const n    = parseInt(addMatch[2]);
    const unit = addMatch[3].toLowerCase();
    if (unit.startsWith('dia')) base.setDate(base.getDate() + n);
    else if (unit.startsWith('semana')) base.setDate(base.getDate() + n * 7);
    else if (unit.startsWith('m')) base.setMonth(base.getMonth() + n);
    else if (unit.startsWith('ano')) base.setFullYear(base.getFullYear() + n);
    return base.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  throw new Error('Formato de data não reconhecido');
}

function execUnitConvert(input: string): string {
  // "100 km/h para mph", "1 kg para lb", "100 BRL para USD"
  const m = input.match(/([\d.,]+)\s+(\w+\/?\w*)\s+(?:para|to)\s+(\w+\/?\w*)/i);
  if (!m) throw new Error('Formato inválido');

  const val  = parseFloat(m[1].replace(',', '.'));
  const from = m[2].toLowerCase();
  const to   = m[3].toLowerCase();

  const conversions: Record<string, Record<string, (v: number) => number>> = {
    'km/h': { 'mph': v => v * 0.621371, 'm/s': v => v / 3.6 },
    'mph':  { 'km/h': v => v * 1.60934 },
    'kg':   { 'lb': v => v * 2.20462, 'g': v => v * 1000 },
    'lb':   { 'kg': v => v * 0.453592 },
    'km':   { 'mi': v => v * 0.621371, 'm': v => v * 1000 },
    'mi':   { 'km': v => v * 1.60934 },
    'c':    { 'f': v => v * 9/5 + 32, 'k': v => v + 273.15 },
    'f':    { 'c': v => (v - 32) * 5/9 },
    'k':    { 'c': v => v - 273.15 },
  };

  const fn = conversions[from]?.[to];
  if (!fn) throw new Error(`Conversão ${from} → ${to} não suportada`);
  const result = fn(val);
  return `${val} ${m[2]} = ${result.toFixed(4).replace(/\.?0+$/, '')} ${m[3]}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function execApiCall(input: string, _options: Record<string, unknown>): Promise<unknown> {
  // Apenas URLs em whitelist — sem chamadas arbitrárias
  const WHITELIST = [
    /^https:\/\/api\.exchangerate-api\.com\//,
    /^https:\/\/api\.openweathermap\.org\//,
    /^https:\/\/viacep\.com\.br\//,
    /^https:\/\/brasilapi\.com\.br\//,
  ];

  const url = input.trim();
  if (!WHITELIST.some(rx => rx.test(url))) throw new Error('URL não permitida');

  const res  = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const start = Date.now();
  let body: ExecuteRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const { type, input, options = {} } = body;
  let result: unknown;
  let success = false;

  try {
    switch (type) {
      case 'math':         result = execMath(input);                    break;
      case 'json_parse':   result = execJsonParse(input);               break;
      case 'date_calc':    result = execDateCalc(input);                break;
      case 'unit_convert': result = execUnitConvert(input);             break;
      case 'api_call':     result = await execApiCall(input, options);  break;
      default:             throw new Error('Tipo de execução inválido');
    }
    success = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    const entry: AuditEntry = { type, input, result: null, success: false, durationMs: Date.now() - start, timestamp: new Date().toISOString() };
    auditLog.push(entry);
    return NextResponse.json({ error: msg, type, durationMs: Date.now() - start });
  }

  // Auditoria
  const entry: AuditEntry = { type, input, result, success, durationMs: Date.now() - start, timestamp: new Date().toISOString() };
  auditLog.push(entry);
  if (auditLog.length > 500) auditLog.splice(0, 100); // limita tamanho

  return NextResponse.json({ result, type, success, durationMs: Date.now() - start });
}

// GET /api/execute — retorna últimas 20 entradas do log (apenas para debug)
export async function GET() {
  return NextResponse.json({ log: auditLog.slice(-20) });
}
