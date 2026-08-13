"use client";

import React, { useState } from "react";
import { Download, X, Image, Bell, Eye, AlertTriangle, Layout } from "lucide-react";
import type { KronosMode } from "@/app/api/chat/route";
import AgentNotifications from "@/components/AgentNotifications";
import type { NotificationItem } from "@/components/AgentNotifications";
import type { AutonomousCoreStatus } from "@/utils/COGNITIVE_ENGINE";

export interface MediaItem {
  id: string;
  type: "image" | "file";
  url: string;
  name: string;
  prompt?: string;
}

export interface VisualReport {
  id: string;
  type: "vision_ui" | "vision_error" | "vision_image";
  content: string;
  imageUrl?: string;
  timestamp: string;
}

interface MediaWorkstationProps {
  media: MediaItem[];
  visualReports: VisualReport[];
  mode: KronosMode;
  recentTopics?: string[];
  onClose: () => void;
  username?: string;
  notificationBadge?: number;
  cognitiveStatus?: AutonomousCoreStatus | null;
  onNotificationCount?: (count: number) => void;
  onSelectNotification?: (notif: NotificationItem) => void;
}

// ─── Image Card ───────────────────────────────────────────────────────────────

function ImageCard({ item, onDownload }: { item: MediaItem; onDownload: (i: MediaItem) => void }) {
  return (
    <div className="group relative rounded-xl overflow-hidden border border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 transition-all">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={item.name} className="w-full h-40 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
          <button
            onClick={() => onDownload(item)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-900 text-[11px] font-medium hover:bg-white transition-all"
          >
            <Download strokeWidth={2} className="w-3 h-3" /> Baixar
          </button>
        </div>
      </div>
      {item.prompt && (
        <div className="px-3 py-2 border-t border-zinc-800/30">
          <p className="text-[10px] text-zinc-600 line-clamp-1 italic">{item.prompt}</p>
        </div>
      )}
    </div>
  );
}

// ─── Visual Report Card ───────────────────────────────────────────────────────

const REPORT_META: Record<VisualReport["type"], { icon: React.ElementType; label: string; color: string; bg: string }> = {
  vision_ui:    { icon: Layout,        label: "UI/UX",   color: "text-blue-400",   bg: "bg-blue-950/40 border-blue-900/50"   },
  vision_error: { icon: AlertTriangle, label: "Erro",    color: "text-red-400",    bg: "bg-red-950/40 border-red-900/50"     },
  vision_image: { icon: Eye,           label: "Visual",  color: "text-purple-400", bg: "bg-purple-950/40 border-purple-900/50" },
};

function VisualReportCard({ report }: { report: VisualReport }) {
  const [expanded, setExpanded] = useState(false);
  const meta = REPORT_META[report.type];
  const Icon = meta.icon;
  const lines = report.content.split("\n").filter(Boolean);
  const preview = lines.slice(0, 2).join(" ");

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${meta.bg}`}>
      <div className="flex items-center gap-2">
        <Icon strokeWidth={1.5} className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
        <span className="ml-auto text-[9px] text-zinc-600">
          {new Date(report.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <p className="text-[11px] text-zinc-300 leading-relaxed">
        {expanded ? report.content : preview}
        {!expanded && lines.length > 2 && "…"}
      </p>
      {lines.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {expanded ? "Ver menos" : "Ver análise completa"}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "midias" | "visual" | "kronos";

export default function MediaWorkstation({
  media, visualReports, onClose,
  username, notificationBadge = 0, onNotificationCount, onSelectNotification,
}: MediaWorkstationProps) {
  const [tab, setTab] = useState<Tab>(visualReports.length > 0 ? "visual" : "midias");

  const handleDownload = (item: MediaItem) => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const images = media.filter((m) => m.type === "image");

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "midias", label: "Mídias",  icon: Image,    badge: images.length > 0 ? images.length : undefined },
    { id: "kronos", label: "Kronos",  icon: Bell,     badge: notificationBadge > 0 ? notificationBadge : undefined },
    { id: "visual", label: "Vision",  icon: Eye,      badge: visualReports.length > 0 ? visualReports.length : undefined },
  ];

  return (
    <aside className="fixed md:static inset-y-0 right-0 z-40 w-72 border-l border-zinc-800/50 bg-zinc-950/90 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800/50">
        <span className="text-xs font-semibold text-zinc-300 tracking-wide">Workstation</span>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all">
          <X strokeWidth={1.5} className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/50 px-2 pt-2 gap-1">
        {TABS.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-medium transition-all relative ${
              tab === id
                ? "bg-zinc-800/60 text-zinc-200 border border-b-0 border-zinc-700/50"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <Icon strokeWidth={1.5} className="w-3 h-3" />
            {label}
            {badge !== undefined && (
              <span className="w-4 h-4 rounded-full bg-zinc-700 text-zinc-300 text-[9px] flex items-center justify-center font-bold">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {tab === "midias" && (
          images.length > 0 || media.filter(m => m.type === "file").length > 0 ? (
            <div className="space-y-3">
              {/* PDFs e arquivos */}
              {media.filter(m => m.type === "file").map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  download={item.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 hover:bg-zinc-900/60 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-950/50 border border-blue-900/50 flex items-center justify-center shrink-0">
                    <Download strokeWidth={1.5} className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-300 truncate">{item.name}</p>
                    <p className="text-[10px] text-zinc-600">PDF · clique para baixar</p>
                  </div>
                </a>
              ))}
              {/* Imagens geradas */}
              {images.map((item) => (
                <ImageCard key={item.id} item={item} onDownload={handleDownload} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="flex items-center justify-center">
                <Image strokeWidth={1} className="w-8 h-8 text-zinc-700" aria-hidden="true" />
              </span>
              <p className="text-[11px] text-zinc-600">Nenhuma mídia gerada ainda.</p>
              <p className="text-[10px] text-zinc-700 mt-1">Peça para gerar uma imagem ou documento.</p>
            </div>
          )
        )}

        {tab === "kronos" && username && (
          <div className="-mx-4 -my-4 h-full">
            <AgentNotifications
              username={username}
              onNotificationCount={onNotificationCount}
              onSelectNotification={onSelectNotification}
            />
          </div>
        )}

        {tab === "visual" && (
          visualReports.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest">
                {visualReports.length} {visualReports.length === 1 ? "análise" : "análises"} • Omni-Vision
              </p>
              {[...visualReports].reverse().map((r) => (
                <VisualReportCard key={r.id} report={r} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Eye strokeWidth={1} className="w-8 h-8 text-zinc-700 mb-3" />
              <p className="text-[11px] text-zinc-600">Omni-Vision aguardando.</p>
              <p className="text-[10px] text-zinc-700 mt-1">Envie um print, interface ou imagem para análise automática.</p>
            </div>
          )
        )}

      </div>

      <div className="border-t border-zinc-800/30 px-4 py-2.5">
        <p className="text-[9px] text-zinc-700 text-center">Kronos AI · Omni-Vision {visualReports.length > 0 ? "● ativo" : "○"}</p>
      </div>
    </aside>
  );
}
