/**
 * Kronos AI — Evolution API WhatsApp Service
 * Documentação: https://doc.evolution-api.com
 */

const API_URL = process.env.WHATSAPP_API_URL?.replace(/\/$/, '');
const API_KEY = process.env.WHATSAPP_API_KEY;

export interface SendWhatsAppParams {
  number:   string;   // formato: 5511999998888 (sem + e sem espaços)
  message:  string;
  instance: string;   // nome da instância configurada na Evolution API
}

export interface SendWhatsAppResult {
  success:   boolean;
  messageId?: string;
  error?:    string;
}

/** Normaliza número: remove tudo que não seja dígito */
export function normalizeNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Envia mensagem de texto simples via Evolution API */
export async function sendWhatsAppMessage(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
  if (!API_URL || !API_KEY) {
    return { success: false, error: 'WHATSAPP_API_URL ou WHATSAPP_API_KEY não configurados.' };
  }

  const number = normalizeNumber(params.number);
  if (number.length < 10 || number.length > 15) {
    return { success: false, error: 'Número inválido. Use o formato: 5511999998888' };
  }

  const url = `${API_URL}/message/sendText/${params.instance}`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       API_KEY,
      },
      body: JSON.stringify({
        number,
        text: params.message.trim(),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.message ?? data?.error ?? `HTTP ${res.status}`;
      console.error('[WhatsApp] Erro Evolution API:', errMsg);
      return { success: false, error: errMsg };
    }

    const messageId = data?.key?.id ?? data?.id ?? undefined;
    console.log(`[WhatsApp] Enviado para ${number} | id: ${messageId}`);
    return { success: true, messageId };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro de conexão';
    console.error('[WhatsApp] Erro:', msg);
    return { success: false, error: msg };
  }
}
