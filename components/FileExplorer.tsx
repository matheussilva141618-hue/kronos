"use client";

import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, MessageSquare, Plus } from "lucide-react";
import type { KronosMode } from "@/app/api/chat/route";

interface Conversation {
  id: string;
  title: string;
  mode: KronosMode;
}

interface FolderDef {
  id: string;
  label: string;
  mode: KronosMode;
  emoji: string;
}

const FOLDERS: FolderDef[] = [
  { id: "profissional", label: "Projetos",  mode: "profissional", emoji: "💼" },
  { id: "academy",      label: "Estudos",   mode: "academy",      emoji: "📚" },
  { id: "kids",         label: "Kids",      mode: "kids",         emoji: "🎉" },
];

interface FileExplorerProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: (mode: KronosMode) => void;
}

export default function FileExplorer({ conversations, activeId, onSelect, onNew }: FileExplorerProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({ profissional: true });

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-0.5">
      {FOLDERS.map((folder) => {
        const items = conversations.filter((c) => c.mode === folder.mode);
        const isOpen = !!open[folder.id];

        return (
          <div key={folder.id}>
            {/* Folder row */}
            <div className="flex items-center justify-between group px-2 py-1.5 rounded-md hover:bg-zinc-800/50 cursor-pointer transition-colors"
              onClick={() => toggle(folder.id)}>
              <div className="flex items-center gap-2 min-w-0">
                <ChevronRight
                  strokeWidth={1.5}
                  className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                />
                {isOpen
                  ? <FolderOpen strokeWidth={1.5} className="w-4 h-4 text-zinc-400 shrink-0" />
                  : <Folder     strokeWidth={1.5} className="w-4 h-4 text-zinc-500 shrink-0" />
                }
                <span className="text-xs text-zinc-400 font-medium truncate">{folder.label}</span>
                {items.length > 0 && (
                  <span className="text-[9px] text-zinc-600 ml-0.5">{items.length}</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onNew(folder.mode); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-emerald-400 text-zinc-600 transition"
                title={`Nova conversa em ${folder.label}`}
              >
                <Plus strokeWidth={1.5} className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Items */}
            {isOpen && (
              <div className="ml-5 border-l border-zinc-800/60 pl-2 space-y-0.5 mt-0.5 mb-1">
                {items.length === 0 ? (
                  <button
                    onClick={() => onNew(folder.mode)}
                    className="w-full text-left px-2 py-1.5 text-[10px] text-zinc-700 hover:text-zinc-500 transition italic"
                  >
                    + Nova conversa
                  </button>
                ) : (
                  items.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-xs transition-colors ${
                        c.id === activeId
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300"
                      }`}
                    >
                      <MessageSquare strokeWidth={1.5} className="w-3 h-3 shrink-0 opacity-50" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
