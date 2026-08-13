"use client";

import { useEffect, useRef } from "react";
import { Mail, BookOpen, Sparkles, MessageCircle, Wrench, Bug, Activity, Zap } from "lucide-react";

export interface Command {
  id:          string;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  fill:        string;
  group:       "ação" | "modo" | "comunicação";
}

export const COMMANDS: Command[] = [
  // Ação direta
  { id: "/fix",       label: "/fix",       description: "Analisar e corrigir problema atual",  icon: <Wrench        strokeWidth={1.5} className="w-4 h-4" />, fill: "text-red-400",     group: "ação" },
  { id: "/debug",     label: "/debug",     description: "Debugar código ou fluxo ativo",       icon: <Bug           strokeWidth={1.5} className="w-4 h-4" />, fill: "text-orange-400",  group: "ação" },
  { id: "/status",    label: "/status",    description: "Status do projeto e última atividade", icon: <Activity      strokeWidth={1.5} className="w-4 h-4" />, fill: "text-emerald-400", group: "ação" },
  { id: "/dossie",    label: "/dossie",    description: "Buscar nos seus documentos",           icon: <BookOpen      strokeWidth={1.5} className="w-4 h-4" />, fill: "text-amber-400",   group: "ação" },
  { id: "/imagem",    label: "/imagem",    description: "Gerar imagem com IA",                 icon: <Sparkles      strokeWidth={1.5} className="w-4 h-4" />, fill: "text-purple-400",  group: "ação" },
  // Comunicação
  { id: "/email",     label: "/email",     description: "Abrir formulário de e-mail",          icon: <Mail          strokeWidth={1.5} className="w-4 h-4" />, fill: "text-blue-400",    group: "comunicação" },
  { id: "/whatsapp",  label: "/whatsapp",  description: "Enviar mensagem WhatsApp",            icon: <MessageCircle strokeWidth={1.5} className="w-4 h-4" />, fill: "text-emerald-400", group: "comunicação" },
  // Modo
  { id: "/kids",      label: "/kids",      description: "Alternar para modo Kids",             icon: <Sparkles      strokeWidth={1.5} className="w-4 h-4" />, fill: "text-yellow-400",  group: "modo" },
  { id: "/academy",   label: "/academy",   description: "Alternar para modo Academy",          icon: <Zap           strokeWidth={1.5} className="w-4 h-4" />, fill: "text-cyan-400",    group: "modo" },
];

interface CommandBarMenuProps {
  query:    string;
  onSelect: (cmd: Command) => void;
  onClose:  () => void;
}

export default function CommandBarMenu({ query, onSelect, onClose }: CommandBarMenuProps) {
  const ref      = useRef<HTMLDivElement>(null);
  const filtered = COMMANDS.filter((c) =>
    c.id.includes(query.toLowerCase()) || c.description.toLowerCase().includes(query.toLowerCase())
  );

  const groups = ["ação", "comunicação", "modo"] as const;
  const grouped = groups.map((g) => ({
    label: g,
    items: filtered.filter((c) => c.group === g),
  })).filter((g) => g.items.length > 0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!filtered.length) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 right-0 bg-zinc-950/95 border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl"
    >
      {grouped.map((group, gi) => (
        <div key={group.label}>
          {gi > 0 && <div className="border-t border-zinc-900" />}
          <div className="px-3 pt-2 pb-1">
            <span className="text-[9px] font-medium text-zinc-700 uppercase tracking-widest">{group.label}</span>
          </div>
          {group.items.map((cmd) => (
            <button
              key={cmd.id}
              onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/50 transition-colors text-left group"
            >
              <span className={`shrink-0 ${cmd.fill}`}>{cmd.icon}</span>
              <span className="text-xs font-mono font-semibold text-zinc-300 group-hover:text-zinc-100 w-20 shrink-0">{cmd.label}</span>
              <span className="text-xs text-zinc-600 truncate group-hover:text-zinc-500">{cmd.description}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="px-3 py-1.5 border-t border-zinc-900/80">
        <span className="text-[9px] text-zinc-700">Esc fechar</span>
      </div>
    </div>
  );
}
