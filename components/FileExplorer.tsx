"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import type { KronosMode } from "@/app/api/chat/route";

interface Conversation {
  id: string;
  title: string;
  mode: KronosMode;
  updatedAt?: string;
}

interface FileExplorerProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: (mode: KronosMode) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function groupByDate(convs: Conversation[]) {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const week      = new Date(today); week.setDate(today.getDate()-7);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Hoje",           items: [] },
    { label: "Ontem",          items: [] },
    { label: "Últimos 7 dias", items: [] },
    { label: "Mais antigas",   items: [] },
  ];

  for (const c of convs) {
    const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    if      (t >= today.getTime())     groups[0].items.push(c);
    else if (t >= yesterday.getTime()) groups[1].items.push(c);
    else if (t >= week.getTime())      groups[2].items.push(c);
    else                               groups[3].items.push(c);
  }

  // Se nenhuma tem updatedAt (legado), coloca tudo em "Recentes"
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  if (total === 0 && convs.length > 0) {
    return [{ label: "Recentes", items: convs }];
  }

  return groups.filter((g) => g.items.length > 0);
}

function ConvItem({
  c, activeId, onSelect, onDelete, onRename,
}: {
  c: Conversation;
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(c.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== c.title) onRename(c.id, t);
    setEditing(false);
  };

  const isActive = c.id === activeId;

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      }`}
      onClick={() => !editing && onSelect(c.id)}
    >
      <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 opacity-40" />

      {editing ? (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-zinc-700/60 text-zinc-100 text-xs rounded px-1.5 py-0.5 outline-none border border-zinc-600 min-w-0"
          />
          <button onClick={(e) => { e.stopPropagation(); commit(); }} className="text-emerald-400 hover:text-emerald-300 shrink-0">
            <Check strokeWidth={2} className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-zinc-600 hover:text-zinc-400 shrink-0">
            <X strokeWidth={2} className="w-3 h-3" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-xs truncate">{c.title}</span>
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setDraft(c.title); setEditing(true); }}
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition"
            >
              <Pencil strokeWidth={1.5} className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDelete(c.id)}
              className="p-1 rounded text-zinc-600 hover:text-red-400 transition"
            >
              <Trash2 strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FileExplorer({ conversations, activeId, onSelect, onNew: _onNew, onDelete, onRename }: FileExplorerProps) {
  const groups = groupByDate(conversations);

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-[11px] text-zinc-700">Nenhuma conversa ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-medium text-zinc-700 uppercase tracking-widest px-3 mb-1">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((c) => (
              <ConvItem
                key={c.id}
                c={c}
                activeId={activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onRename={onRename}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
