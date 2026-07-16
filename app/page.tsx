"use client";

import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Send, Plus, LogOut, Paperclip, X,
  FileText, ChevronDown, Square, Globe, Menu,
} from "lucide-react";
import { useRouter } from "next/navigation";
import KronosAvatar from "@/components/KronosAvatar";
import ProgressBar  from "@/components/ProgressBar";
import FileExplorer from "@/components/FileExplorer";
import type { ExportTable } from "@/utils/exporter";
import { loadMemory, formatMemoryForPrompt } from "@/utils/memory";
import type { KronosMode } from "@/app/api/chat/route";

// Lazy load dos componentes pesados
const ChatExporter = lazy(() => import("@/components/ChatExporter"));

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message { role: "user" | "assistant"; content: string; }
interface Conversation { id: string; title: string; messages: Message[]; mode: KronosMode; }
interface FilePayload { fileName: string; fileType: string; base64Data: string; }
interface AttachedFile { file: File; preview?: string; }

// ─── Mode config ──────────────────────────────────────────────────────────────

const MODES: { value: KronosMode; label: string; emoji: string }[] = [
  { value: "profissional", label: "Profissional", emoji: "💼" },
  { value: "academy",      label: "Academy",      emoji: "📚" },
  { value: "kids",         label: "Kids",         emoji: "🎉" },
];

const MODE_WELCOME: Record<KronosMode, (n: string) => string> = {
  profissional: (n) => `Olá, ${n}. Modo Profissional ativado.\nPronto para auditorias, código e análise de documentos.`,
  academy:      (n) => `Olá, ${n}. Modo Academy ativado.\nMe diga o que quer aprender e preparo um plano completo.`,
  kids:         (n) => `Oi, ${n}! 🎉 Sou o Kronos, seu amigo superesperto. O que vamos descobrir hoje? 🚀`,
};

function getModeConfig(m: KronosMode) { return MODES.find((x) => x.value === m) ?? MODES[0]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHATS_KEY = (u: string) => `kronos_chats_${u}`;
const MODE_KEY  = (u: string) => `kronos_mode_${u}`;
const ACCEPTED  = ["image/png","image/jpeg","image/jpg","image/webp","image/gif","text/plain","text/csv","application/pdf"].join(",");

function newConv(name: string, mode: KronosMode): Conversation {
  return {
    id: crypto.randomUUID(), title: "Nova conversa", mode,
    messages: [{ role: "assistant", content: MODE_WELCOME[mode](name) }],
  };
}

function sanitizeText(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_{1,3}(.+?)_{1,3}/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`{3}[a-z]*\n?/g, '').replace(/`{3}/g, ''))
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^>{1,}\s+/gm, '')
    .replace(/---+/g, '────────────────────')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseExportTable(content: string): { text: string; table: (ExportTable & { subtitle?: string }) | null } {
  const S = "%%EXPORT_TABLE_START%%", E = "%%EXPORT_TABLE_END%%";
  const si = content.indexOf(S), ei = content.indexOf(E);
  if (si === -1 || ei === -1) return { text: sanitizeText(content), table: null };
  const before = content.slice(0, si).trim();
  const after  = content.slice(ei + E.length).trim();
  try {
    return {
      text: sanitizeText([before, after].filter(Boolean).join("\n\n")),
      table: JSON.parse(content.slice(si + S.length, ei).trim()),
    };
  } catch { return { text: sanitizeText(content), table: null }; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [username, setUsername]         = useState("");
  const [conversations, setConvs]       = useState<Conversation[]>([]);
  const [activeId, setActiveId]         = useState("");
  const [mode, setMode]                 = useState<KronosMode>("profissional");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [input, setInput]               = useState("");
  const [isLoading, setIsLoading]       = useState(false);
  const [isSearching, setIsSearching]   = useState(false);
  const [hydrated, setHydrated]         = useState(false);
  const [redirecting, setRedirecting]   = useState(false);
  const [attachedFiles, setAttached]    = useState<AttachedFile[]>([]);
  const messagesEndRef                  = useRef<HTMLDivElement>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);
  const abortRef                        = useRef<AbortController | null>(null);
  // swipe tracking
  const touchStartX                     = useRef<number>(0);
  const router                          = useRouter();

  // ── Init ──
  useEffect(() => {
    const stored = localStorage.getItem("kronos_username");
    if (!stored) { setRedirecting(true); router.push("/login"); return; }
    setUsername(stored);
    const savedMode = (localStorage.getItem(MODE_KEY(stored)) as KronosMode) || "profissional";
    setMode(savedMode);
    try {
      const raw = localStorage.getItem(CHATS_KEY(stored));
      if (raw) {
        const parsed: Conversation[] = JSON.parse(raw);
        if (parsed.length > 0) { setConvs(parsed); setActiveId(parsed[0].id); setHydrated(true); return; }
      }
    } catch { /* ignore */ }
    const first = newConv(stored, savedMode);
    setConvs([first]); setActiveId(first.id); setHydrated(true);
  }, [router]);

  // ── Persist ──
  useEffect(() => {
    if (!hydrated || !username) return;
    localStorage.setItem(CHATS_KEY(username), JSON.stringify(conversations));
  }, [conversations, hydrated, username]);

  // ── Swipe para abrir/fechar sidebar no mobile ──
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 60) setSidebarOpen(true);
    if (dx < -60) setSidebarOpen(false);
  };

  const handleModeChange = (m: KronosMode) => {
    setMode(m); setShowModeMenu(false);
    if (username) localStorage.setItem(MODE_KEY(username), m);
  };

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages   = activeConv?.messages ?? [];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  const handleNewConv = (m?: KronosMode) => {
    const c = newConv(username, m ?? mode);
    setConvs((p) => [c, ...p]); setActiveId(c.id);
    setSidebarOpen(false);
    if (m && m !== mode) handleModeChange(m);
  };

  const updateConv = useCallback((id: string, msgs: Message[]) => {
    setConvs((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const first = msgs.find((m) => m.role === "user");
      const raw   = first?.content.replace(/\n📎.*/, "").trim() ?? "";
      const title = raw ? raw.slice(0, 40) + (raw.length > 40 ? "…" : "") : c.title;
      return { ...c, messages: msgs, title };
    }));
  }, []);

  const toPayload = (file: File): Promise<FilePayload> =>
    new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej;
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        r.onload = () => res({ fileName: file.name, fileType: file.type, base64Data: r.result as string });
        r.readAsDataURL(file);
      } else {
        r.onload = () => res({ fileName: file.name, fileType: file.type, base64Data: r.result as string });
        r.readAsText(file);
      }
    });

  const addFiles = (files: File[]) =>
    setAttached((p) => [...p, ...files.map((f) => ({
      file: f, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }))]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); if (files.length) addFiles(files); e.target.value = "";
  };

  const removeFile = (i: number) =>
    setAttached((p) => { const c = [...p]; if (c[i].preview) URL.revokeObjectURL(c[i].preview!); c.splice(i, 1); return c; });

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!hydrated) return;
    const imgs = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    addFiles(imgs.map((item) => item.getAsFile()!));
    inputRef.current?.focus();
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleStop = () => { abortRef.current?.abort(); setIsLoading(false); setIsSearching(false); };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachedFiles.length) || isLoading || !activeId) return;

    const userText  = input.trim() || "Analise esta imagem.";
    setInput("");
    const fileNames = attachedFiles.map((a) => a.file.name).join(", ");
    const display   = fileNames ? `${userText}\n📎 ${fileNames}` : userText;
    const updated: Message[] = [...messages, { role: "user", content: display }];
    updateConv(activeId, updated);

    const toSend = [...attachedFiles]; setAttached([]);
    setIsLoading(true);

    const searchTriggers = /hoje|agora|atual|recente|preço|cotaç|clima|busque|pesquise|2024|2025|2026/i;
    if (searchTriggers.test(userText)) setIsSearching(true);

    const controller = new AbortController(); abortRef.current = controller;

    try {
      const payloads      = await Promise.all(toSend.map((a) => toPayload(a.file)));
      toSend.forEach((a) => { if (a.preview) URL.revokeObjectURL(a.preview); });
      const memoryContext = formatMemoryForPrompt(loadMemory(username, mode));

      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, userName: username, mode, files: payloads.length ? payloads : undefined, memoryContext }),
        signal: controller.signal,
      });
      setIsSearching(false);
      const data = await res.json();
      updateConv(activeId, [...updated, { role: "assistant", content: data.response ?? data.error ?? "Erro." }]);
    } catch (err) {
      setIsSearching(false);
      if ((err as Error).name !== "AbortError")
        updateConv(activeId, [...updated, { role: "assistant", content: "Erro na conexão com o servidor." }]);
    } finally { setIsLoading(false); setIsSearching(false); abortRef.current = null; }
  };

  const handleLogout = () => { localStorage.removeItem("kronos_username"); router.push("/login"); };

  const initials = username.slice(0, 2).toUpperCase();
  const modeCfg  = getModeConfig(mode);

  if (redirecting || !hydrated) return (
    <div className="flex h-screen bg-zinc-950 items-center justify-center">
      <KronosAvatar size={40} />
    </div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-zinc-900">
        <KronosAvatar size={28} />
        <div>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">Kronos</span>
          <span className="text-sm font-light text-zinc-500">.ai</span>
        </div>
        {/* Fechar no mobile */}
        <button onClick={() => setSidebarOpen(false)} className="ml-auto p-1 text-zinc-600 hover:text-zinc-300 md:hidden">
          <X strokeWidth={1.5} className="w-4 h-4" />
        </button>
      </div>

      {/* Nova conversa */}
      <div className="px-3 pt-4 pb-2">
        <button onClick={() => handleNewConv()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900/40 text-xs font-medium transition-colors active:scale-95">
          <Plus strokeWidth={1.5} className="w-3.5 h-3.5" />
          Nova conversa
        </button>
      </div>

      {/* Explorador */}
      <div className="px-3 pb-4 flex-1 overflow-y-auto">
        <p className="text-[10px] font-medium text-zinc-700 uppercase tracking-widest px-2 mb-2">Conversas</p>
        <FileExplorer
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setSidebarOpen(false); }}
          onNew={handleNewConv}
        />
      </div>

      {/* Perfil */}
      <div className="border-t border-zinc-900 p-3">
        <div className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-zinc-900/40 transition-colors group">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-900 to-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-semibold text-zinc-300 shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-zinc-300 truncate">{username}</span>
              <span className="text-[9px] text-zinc-600">Kronos AI</span>
            </div>
          </div>
          <button onClick={handleLogout}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-400 text-zinc-600 transition" title="Sair">
            <LogOut strokeWidth={1.5} className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden"
      style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}
      onClick={() => { if (showModeMenu) setShowModeMenu(false); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── OVERLAY MOBILE ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR desktop (fixa) + mobile (drawer) ── */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-60 border-r border-zinc-900 bg-[#0c0c0e]
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {sidebarContent}
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col h-screen bg-zinc-950 relative min-w-0">

        <ProgressBar active={isLoading} searching={isSearching} />

        {/* Topbar */}
        <header className="h-12 border-b border-zinc-900 flex items-center justify-between px-4 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Hambúrguer mobile */}
            <button onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors md:hidden">
              <Menu strokeWidth={1.5} className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs text-zinc-500 font-medium truncate max-w-[140px] sm:max-w-xs">
                {activeConv?.title !== "Nova conversa" ? activeConv?.title : "Kronos AI"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <button
                onClick={() => setShowModeMenu((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors active:scale-95"
              >
                <span className="text-sm leading-none">{modeCfg.emoji}</span>
                <span className="hidden sm:inline">{modeCfg.label}</span>
                <ChevronDown strokeWidth={1.5} className={`w-3 h-3 transition-transform ${showModeMenu ? "rotate-180" : ""}`} />
              </button>

              {showModeMenu && (
                <div className="absolute right-0 top-9 w-44 border border-zinc-800 bg-[#0c0c0e] shadow-2xl overflow-hidden z-50 rounded-lg">
                  {MODES.map((m) => (
                    <button key={m.value} onClick={() => handleModeChange(m.value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs hover:bg-zinc-800/60 transition-colors text-left ${mode === m.value ? "text-zinc-100" : "text-zinc-500"}`}>
                      <span>{m.emoji}</span>
                      <span className="font-medium">{m.label}</span>
                      {mode === m.value && <span className="ml-auto text-emerald-500 text-[10px]">●</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-zinc-700 font-mono hidden sm:block">120B</span>
          </div>
        </header>

        {/* Mensagens */}
        <section className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg, i) => {
              const { text, table } = msg.role === "assistant"
                ? parseExportTable(msg.content)
                : { text: msg.content, table: null };

              return (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role !== "user" && (
                    <div className="shrink-0 mt-0.5"><KronosAvatar size={28} /></div>
                  )}
                  <div className={msg.role === "user" ? "max-w-[85%]" : "flex-1 min-w-0"}>
                    <div className={`px-4 py-3 text-sm leading-relaxed rounded-2xl ${
                      msg.role === "user"
                        ? "bg-zinc-800 text-zinc-100 rounded-tr-sm"
                        : "text-zinc-300 bg-zinc-900/30 border border-zinc-900 rounded-tl-sm"
                    }`}>
                      <p className="whitespace-pre-line break-words">{text}</p>
                    </div>
                    {table && (
                      <Suspense fallback={<div className="mt-3 h-16 rounded-lg bg-zinc-900/30 animate-pulse" />}>
                        <ChatExporter
                          table={{ title: table.title, headers: table.headers, rows: table.rows }}
                          subtitle={table.subtitle}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="shrink-0 mt-0.5"><KronosAvatar size={28} spinning /></div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-900/30 border border-zinc-900">
                  {isSearching ? (
                    <div className="flex items-center gap-2">
                      <Globe strokeWidth={1.5} className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                      <span className="text-xs text-zinc-500">Buscando na internet...</span>
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

        {/* Footer — fixo no mobile */}
        <footer className="border-t border-zinc-900 px-4 py-3 bg-zinc-950 shrink-0 safe-area-bottom">
          <div className="max-w-2xl mx-auto space-y-2">

            {/* Previews de arquivos */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {attachedFiles.map((af, i) => (
                  <div key={i} className="relative group">
                    {af.preview
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={af.preview} alt={af.file.name} className="w-14 h-14 rounded-lg object-cover border border-zinc-800" />
                      : (
                        <div className="w-14 h-14 rounded-lg border border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center gap-1">
                          <FileText strokeWidth={1.5} className="w-4 h-4 text-zinc-500" />
                          <span className="text-[9px] text-zinc-600 px-1 truncate w-full text-center">{af.file.name.slice(0, 7)}</span>
                        </div>
                      )
                    }
                    <button onClick={() => removeFile(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-700 hover:bg-red-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <X strokeWidth={2} className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors shrink-0 active:scale-95 touch-manipulation">
                <Paperclip strokeWidth={1.5} className="w-4 h-4" />
              </button>
              <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleFileChange} />

              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={attachedFiles.length > 0 ? "Instrução opcional..." : "Mensagem..."}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg py-3 pl-4 pr-11 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:bg-zinc-900 transition-colors"
                  disabled={isLoading}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />

                {isLoading ? (
                  <button type="button" onClick={handleStop}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-red-900/60 hover:bg-red-800 text-red-400 transition-colors touch-manipulation" title="Parar">
                    <Square strokeWidth={1.5} className="w-4 h-4" />
                  </button>
                ) : (
                  <button type="submit" disabled={!input.trim() && !attachedFiles.length}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md bg-zinc-200 text-zinc-900 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors touch-manipulation">
                    <Send strokeWidth={1.5} className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>

            <p className="text-center text-[10px] text-zinc-800 hidden sm:block">
              Kronos AI · {modeCfg.emoji} {modeCfg.label} · Visão · Busca web · Exportação
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
