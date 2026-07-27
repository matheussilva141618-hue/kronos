/**
 * GET  /api/agent/notifications — Busca notificações não lidas do usuário logado
 * POST /api/agent/notifications — Marca notificação como lida ou descartada
 *
 * Usado pelo frontend para polling periódico (a cada 15s)
 * Requer autenticação via username (passado no header ou query)
 */

import { NextResponse } from 'next/server';
import {
  getUnreadNotifications,
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
} from '@/utils/AUTONOMOUS_AGENT';

// ─── GET — Retorna notificações não lidas ─────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const limitParam = searchParams.get('limit');

    if (!username) {
      return NextResponse.json({ error: 'Parâmetro "username" é obrigatório.' }, { status: 400 });
    }

    const limit = limitParam ? Math.min(parseInt(limitParam), 50) : 20;

    const notifications = await getUnreadNotifications(username, limit);

    return NextResponse.json({
      success: true,
      notifications,
      count: notifications.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[AgentNotifications] GET erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — Marca notificação como lida/descartada ───────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, username, notificationId } = body as {
      action: 'read' | 'dismiss' | 'read_all';
      username: string;
      notificationId?: string;
    };

    if (!username) {
      return NextResponse.json({ error: 'Parâmetro "username" é obrigatório.' }, { status: 400 });
    }

    let success = false;

    switch (action) {
      case 'read':
        if (!notificationId) {
          return NextResponse.json({ error: 'Parâmetro "notificationId" é obrigatório para ação "read".' }, { status: 400 });
        }
        success = await markNotificationRead(username, notificationId);
        break;

      case 'dismiss':
        if (!notificationId) {
          return NextResponse.json({ error: 'Parâmetro "notificationId" é obrigatório para ação "dismiss".' }, { status: 400 });
        }
        success = await dismissNotification(username, notificationId);
        break;

      case 'read_all':
        success = await markAllNotificationsRead(username);
        break;

      default:
        return NextResponse.json({ error: `Ação "${action}" inválida. Use: read | dismiss | read_all` }, { status: 400 });
    }

    return NextResponse.json({ success, action, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[AgentNotifications] POST erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}