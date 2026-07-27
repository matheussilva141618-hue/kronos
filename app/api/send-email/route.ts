import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

interface Attachment {
  filename: string;
  content:  string; // base64
  mimeType: string;
}

export async function POST(req: Request) {
  try {
    const { to, subject, text, username, attachments } = await req.json() as {
      to:           string;
      subject:      string;
      text:         string;
      username?:    string;
      attachments?: Attachment[];
    };

    if (!to || !subject || !text) {
      return NextResponse.json({ error: 'Campos obrigatórios: to, subject, text.' }, { status: 400 });
    }

    if (!GMAIL_USER || !GMAIL_PASS) {
      return NextResponse.json({ error: 'Serviço de e-mail não configurado.' }, { status: 503 });
    }

    // Valida tamanho dos anexos
    if (attachments?.length) {
      for (const att of attachments) {
        const bytes = Buffer.from(att.content, 'base64').byteLength;
        if (bytes > MAX_ATTACHMENT_BYTES) {
          return NextResponse.json({
            error: `Arquivo "${att.filename}" muito grande para envio por e-mail. Limite: 5 MB.`,
          }, { status: 413 });
        }
      }
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });

    const nodemailerAttachments = (attachments ?? []).map((att) => ({
      filename:    att.filename,
      content:     Buffer.from(att.content, 'base64'),
      contentType: att.mimeType,
    }));

    const info = await transporter.sendMail({
      from:        `"Kronos AI" <${GMAIL_USER}>`,
      to:          to.trim(),
      subject:     subject.trim(),
      text:        text.trim(),
      attachments: nodemailerAttachments,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
        <p style="color:#888;font-size:12px;margin-bottom:24px">
          Enviado via <strong>Kronos AI</strong>${username ? ` por ${username}` : ''}
        </p>
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:#111">
          ${text.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}
        </div>
        ${nodemailerAttachments.length ? `<p style="color:#888;font-size:11px;margin-top:16px">📎 ${nodemailerAttachments.length} anexo(s): ${nodemailerAttachments.map(a=>a.filename).join(', ')}</p>` : ''}
        <hr style="margin-top:32px;border:none;border-top:1px solid #eee"/>
        <p style="color:#ccc;font-size:11px;margin-top:12px">Kronos AI · Assistente Pessoal de Elite</p>
      </div>`,
    });

    console.log(`[Gmail] Enviado para ${to} | anexos: ${nodemailerAttachments.length} | id: ${info.messageId}`);
    return NextResponse.json({ success: true, id: info.messageId });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido.';
    console.error('[Gmail] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
