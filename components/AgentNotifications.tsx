"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  X,
  Code,
  BookOpen,
  Lightbulb,
  FolderKanban,
  Brain,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import type { NotificationType } from "@/utils/AUTONOMOUS_AGENT";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: number;
  metadata?: Record<string, unknown>;
  source?: string;
  created_at: string;
}

interface AgentNotificationsProps {
  username: string;
  onNotificationCount?: (count: number) => void;
  onSelectNotification?: (notif: NotificationItem) => void;
  onClose?: () => void;
}

// ─── Configuração visual por tipo ─────────────────────────────────────────────

const NOTIF_META: Record<NotificationType, {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
  border: string;
}> = {
  code_optimization: {
    icon: Code,
    label: "Código",
    color: "text-blue-400",
    bg: "bg-blue-950/40",
    border: "border-blue-900/50",
  },
  study_reminder: {
    icon: BookOpen,
    label: "Estudo",
    color: "text-amber-400",
    bg: "bg-amber-950/40",
    border: "border-amber-900/50",
  },
  insight: {
    icon: Lightbulb,
    label: "Insight",
    color: "text-purple-400",
    bg: "bg-purple-950/40",
    border: "border-purple-900/50",
  },
  project_status: {
    icon: FolderKanban,
    label: "Projeto",
    color: "text-emerald-400",
    bg: "bg-emerald-950/40",
    border: "border-emerald-900/50",
  },
  knowledge_gap: {
    icon: Brain,
    label: "Conhecimento",
    color: "text-rose-400",
    bg: "bg-rose-950/40",
    border: "border-rose-900/50",
  },
  news_alert: {
    icon: ExternalLink,
    label: "Notícia",
    color: "text-cyan-400",
    bg: "bg-cyan-950/40",
    border: "border-cyan-900/50",
  },
};

// ─── Componente de Notificação Individual ─────────────────────────────────────

function NotificationCard({
  item,
  onDismiss,
  onRead,
}: {
  item: NotificationItem;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
}) {
  const meta = NOTIF_META[item.type] ?? NOTIF_META.insight;
  const Icon = meta.icon;
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = () => {
    setDismissing(true);
    setTimeout(() => onDismiss(item.id), 300);
  };

  // Prioridade visual
  const priorityLabel =
    item.priority >= 8 ? "Alta" :
    item.priority >= 5 ? "Média" :
    "Baixa";
  const priorityColor =
    item.priority >= 8 ? "text-red-400" :
    item.priority >= 5 ? "text-amber-400" :
    "text-zinc-500";

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 transition-all duration-300 ${
        dismissing ? "opacity-0 translate-x-4" : "opacity-100"
      } ${meta.bg} ${meta.border}`}
      onClick={() => onRead(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onRead(item.id); }}
    >
      {/* Header da notificação */}
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon strokeWidth={1.5} className={`w-3.5 h-3.5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
            <span className={`text-[9px] font-medium ${priorityColor}`}>· {priorityLabel}</span>
          </div>
          <h4 className="text-xs font-medium text-zinc-200 leading-tight">{item.title}</h4>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          className="p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all shrink-0"
          title="Descartar"
        >
          <X strokeWidth={1.5} className="w-3 h-3" />
        </button>
      </div>

      {/* Corpo da mensagem */}
      <p className="text-[11px] text-zinc-400 leading-relaxed ml-9">{item.message}</p>

      {/* Timestamp */}
      <div className="flex items-center justify-between ml-9">
        <span className="text-[9px] text-zinc-600">
          {new Date(item.created_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>
        {item.metadata && typeof item.metadata.tech === 'string' && (
          <span className="text-[9px] text-zinc-600 font-mono">via {item.metadata.tech}</span>
        )}
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function AgentNotifications({
  username,
  onNotificationCount,
  onSelectNotification,
  onClose,
}: AgentNotificationsProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ── Polling de notificações (a cada 15s) ──
  const fetchNotifications = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetch(`/api/agent/notifications?username=${encodeURIComponent(username)}&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
        onNotificationCount?.(data.count ?? 0);
        setError(false);
      }
    } catch {
      if (!error) setError(true);
    } finally {
      setLoading(false);
    }
  }, [username, onNotificationCount, error]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // 15s polling
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // ── Ações ──
  const handleDismiss = async (id: string) => {
    try {
      await fetch("/api/agent/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", username, notificationId: id }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      onNotificationCount?.(notifications.length - 1);
    } catch { /* silently fail */ }
  };

  const handleRead = async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    if (notif) {
      onSelectNotification?.(notif);
    }
    try {
      await fetch("/api/agent/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", username, notificationId: id }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      onNotificationCount?.(notifications.length - 1);
    } catch { /* silently fail */ }
  };

  const handleReadAll = async () => {
    try {
      await fetch("/api/agent/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all", username }),
      });
      setNotifications([]);
      onNotificationCount?.(0);
    } catch { /* silently fail */ }
  };

  // ── Render ──
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <Sparkles strokeWidth={1.5} className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-semibold text-zinc-300 tracking-wide">Kronos Ativo</span>
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 1 && (
            <button
              onClick={handleReadAll}
              className="text-[10px] text-zinc-600 hover:text-zinc-300 px-2 py-1 rounded-md hover:bg-zinc-800/50 transition-all"
            >
              Ler todas
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all">
              <X strokeWidth={1.5} className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-purple-500 rounded-full animate-spin mb-3" />
            <p className="text-xs text-zinc-600">Carregando iniciativas...</p>
          </div>
        )}

        {error && !loading && (
          <div className="px-3 py-4 rounded-xl bg-red-950/40 border border-red-900/50 text-center">
            <p className="text-xs text-red-400">Não foi possível carregar as notificações.</p>
            <button
              onClick={fetchNotifications}
              className="text-[10px] text-red-500 hover:text-red-300 mt-2 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Bell strokeWidth={1} className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-xs text-zinc-600">Nenhuma iniciativa proativa no momento.</p>
            <p className="text-[10px] text-zinc-700 mt-1">
              O Kronos monitora seus projetos, estudos e interesses em segundo plano.
            </p>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <>
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest">
              {notifications.length} {notifications.length === 1 ? "iniciativa" : "iniciativas"} · Kronos
            </p>
            {notifications.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                onDismiss={handleDismiss}
                onRead={handleRead}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800/30 px-4 py-2.5">
        <p className="text-[9px] text-zinc-700 text-center">
          O Kronos analisa seu contexto periodicamente
          {notifications.length > 0 ? " · 🟢 ativo" : " · 💤 modo observação"}
        </p>
      </div>
    </div>
  );
}