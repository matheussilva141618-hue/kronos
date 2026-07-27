"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  BookOpen, Sparkles, Send, Square, GraduationCap,
  Brain, User, Wand2, ArrowLeft
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type StudyKidsMode = "study" | "kids";

interface StudyKidsMessage {
  role: "user" | "assistant";
  content: string;
  imagePrompt?: string;
  imageUrl?: string;
}

// ─── Welcome Messages ─────────────────────────────────────────────────────────

const WELCOME_STUDY = `Bem-vindo ao **Kronos Study** 🎓

Seu mentor de aprendizado inteligente. Aqui você encontra:

▸ **Explicações didáticas** — conceitos complexos simplificados  
▸ **Analogias práticas** — conexões com o cotidiano  
▸ **Passo a passo** — aprendizado guiado e progressivo  
▸ **Estrutura de estudos** — planos organizados por tópico  

**Como posso te ajudar hoje?**`;

const WELCOME_KIDS = `**Kronos Kids** 🌟

Olá, explorador! Vamos nos divertir enquanto aprendemos?

▸ **Histórias incríveis** 📖  
▸ **Desafios divertidos** 🧩  
▸ **Arte e criatividade** 🎨  
▸ **Descobertas do mundo** 🌍  

**O que você quer explorar hoje?** 🚀`;

// ─── Theme Config ─────────────────────────────────────────────────────────────

interface ThemeColors {
  id: StudyKidsMode;
  gradient: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  glow: string;
  userBubble: string;
  assistantBubble: string;
  inputBg: string;
  inputBorder: string;
  inputFocus: string;
  buttonGradient: string;
  buttonHover: string;
  suggestionBg: string;
  suggestionHover: string;
  suggestionBorder: string;
  headerBg: string;
  iconColor: string;
  badgeColor: string;
}

const THEMES: Record<StudyKidsMode, ThemeColors> = {
  study: {
    id: "study",
    gradient: "from-slate-950 via-blue-950 to-indigo-950",
    accent: "#3b82f6",
    accentLight: "rgba(59,130,246,0.15)",
    accentDark: "rgba(30,58,138,0.4)",
    glow: "rgba(59,130,246,0.3)",
    userBubble: "bg-gradient-to-r from-blue-600 to-indigo-500",
    assistantBubble: "bg-white/5 border border-blue-500/15",
    inputBg: "bg-white/5",
    inputBorder: "border-blue-500/25",
    inputFocus: "border-blue-500/60",
    buttonGradient: "bg-gradient-to-r from-blue-600 to-indigo-600",
    buttonHover: "hover:from-blue-500 hover:to-indigo-500",
    suggestionBg: "bg-white/[0.04]",
    suggestionHover: "hover:bg-white/[0.08]",
    suggestionBorder: "border-blue-500/10 hover:border-blue-400/30",
    headerBg: "bg-[#0a0e1a]/80",
    iconColor: "text-blue-400",
    badgeColor: "bg-blue-500/20 text-blue-300",
  },
  kids: {
    id: "kids",
    gradient: "from-purple-950 via-fuchsia-950 to-pink-950",
    accent: "#a855f7",
    accentLight: "rgba(168,85,247,0.15)",
    accentDark: "rgba(112,26,117,0.4)",
    glow: "rgba(168,85,247,0.3)",
    userBubble: "bg-gradient-to-r from-purple-600 to-fuchsia-500",
    assistantBubble: "bg-white/5 border border-purple-500/15",
    inputBg: "bg-white/5",
    inputBorder: "border-purple-500/25",
    inputFocus: "border-purple-500/60",
    buttonGradient: "bg-gradient-to-r from-purple-600 to-fuchsia-600",
    buttonHover: "hover:from-purple-500 hover:to-fuchsia-500",
    suggestionBg: "bg-white/[0.04]",
    suggestionHover: "hover:bg-white/[0.08]",
    suggestionBorder: "border-purple-500/10 hover:border-purple-400/30",
    headerBg: "bg-[#0d031a]/80",
    iconColor: "text-purple-400",
    badgeColor: "bg-purple-500/20 text-purple-300",
  },
};

// ─── Quick Suggestions ────────────────────────────────────────────────────────

interface Suggestion {
  icon: string;
  title: string;
  desc: string;
}

const STUDY_SUGGESTIONS: Suggestion[] = [
  { icon: "🧮", title: "Matemática", desc: "Conceitos fundamentais" },
  { icon: "💻", title: "Programação", desc: "Lógica e algoritmos" },
  { icon: "🔬", title: "Ciências", desc: "Física, química, biologia" },
  { icon: "🌍", title: "Geografia", desc: "Mundo e culturas" },
  { icon: "📝", title: "Redação", desc: "Técnicas de escrita" },
  { icon: "🧠", title: "Raciocínio", desc: "Problemas e desafios" },
];

const KIDS_SUGGESTIONS: Suggestion[] = [
  { icon: "🦕", title: "Histórias", desc: "Aventuras incríveis" },
  { icon: "🎨", title: "Desenhar", desc: "Arte e criatividade" },
  { icon: "🧩", title: "Desafios", desc: "Enigmas divertidos" },
  { icon: "🌌", title: "Espaço", desc: "Planetas e estrelas" },
  { icon: "🐾", title: "Animais", desc: "Bichos curiosos" },
  { icon: "🌈", title: "Ciência", desc: "Experimentos legais" },
];

const KIDS_AVATARS = ["🤖", "🦄", "🐉", "🚀", "⭐", "🌈", "🧙‍♂️", "🦋", "🐨"];

function getKidsAvatar(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
  }
  return KIDS_AVATARS[Math.abs(hash) % KIDS_AVATARS.length];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface StudyKidsHubProps {
  username: string;
  onClose: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StudyKidsHub({ username, onClose }: StudyKidsHubProps) {
  const [mode, setMode] = useState<StudyKidsMode>("study");
  const [messages, setMessages] = useState<StudyKidsMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const theme = THEMES[mode];

  // Initialize with welcome
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: mode === "kids" ? WELCOME_KIDS : WELCOME_STUDY }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    setShowSuggestions(false);
    setTimeout(() => handleSend(text), 80);
  };

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;

    setInput("");
    setShowSuggestions(false);

    const newMessages: StudyKidsMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/study-kids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          mode,
          username,
          history: newMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.generateImage && data.imagePrompt) {
        const imgRes = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: data.imagePrompt }),
          signal: controller.signal,
        });
        const imgData = await imgRes.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response || "Pronto! 🎨",
            imageUrl: imgData.imageUrl,
            imagePrompt: data.imagePrompt,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response ?? "Não consegui processar." }]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              mode === "kids"
                ? "Ops! Algo deu errado. Pode tentar de novo? 🙈"
                : "Não foi possível completar a solicitação. Tente novamente.",
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const switchMode = (newMode: StudyKidsMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setMessages([]);
    setShowSuggestions(true);
    setInput("");
  };

  const suggestions = mode === "kids" ? KIDS_SUGGESTIONS : STUDY_SUGGESTIONS;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-br ${theme.gradient}`}>
      {/* ─── Ambient Glow ─────────────────────────────────── */}
      <div
        className="absolute top-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{ background: theme.glow }}
      />
      <div
        className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{ background: theme.glow }}
      />

      {/* ─── Header ────────────────────────────────────────── */}
      <header className={`relative z-10 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] ${theme.headerBg} backdrop-blur-2xl shrink-0`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="w-px h-5 bg-white/[0.06]" />
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${theme.badgeColor} backdrop-blur-sm`}>
              {mode === "kids" ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <GraduationCap className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-white/90 tracking-tight">
                {mode === "kids" ? "Kronos Kids" : "Kronos Study"}
              </div>
              <div className="text-[10px] text-white/30 font-medium">
                {mode === "kids" ? "Aprendizado infantil" : "Mentoria acadêmica"}
              </div>
            </div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1 bg-black/40 rounded-2xl p-1 border border-white/[0.06] shadow-lg">
          <button
            onClick={() => switchMode("study")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
              mode === "study"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Study</span>
            {mode === "study" && <div className="w-1 h-1 rounded-full bg-white/60 ml-0.5" />}
          </button>
          <button
            onClick={() => switchMode("kids")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
              mode === "kids"
                ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-600/20"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Kids</span>
            {mode === "kids" && <div className="w-1 h-1 rounded-full bg-white/60 ml-0.5" />}
          </button>
        </div>
      </header>

      {/* ─── Messages Area ─────────────────────────────────── */}
      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {/* Avatar */}
              {msg.role !== "user" && (
                <div className="shrink-0 mt-1">
                  {mode === "kids" ? (
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 border border-purple-400/20 flex items-center justify-center text-xl shadow-lg backdrop-blur-sm">
                      {getKidsAvatar(msg.content)}
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-400/20 flex items-center justify-center shadow-lg backdrop-blur-sm">
                      <Brain className="w-4.5 h-4.5 text-blue-400" strokeWidth={1.5} />
                    </div>
                  )}
                </div>
              )}

              {msg.role === "user" && (
                <div className="shrink-0 mt-1">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-zinc-500/30 to-zinc-600/30 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm">
                    <User className="w-4.5 h-4.5 text-white/60" strokeWidth={1.5} />
                  </div>
                </div>
              )}

              {/* Message Bubble */}
              <div className={`max-w-[80%] sm:max-w-[75%] group ${msg.role === "user" ? "text-right" : ""}`}>
                <div
                  className={`relative px-4 py-3.5 text-sm leading-relaxed shadow-lg ${
                    msg.role === "user"
                      ? `${theme.userBubble} text-white rounded-2xl rounded-tr-sm`
                      : `${theme.assistantBubble} backdrop-blur-xl text-white/85 rounded-2xl rounded-tl-sm`
                  }`}
                >
                  <div className="whitespace-pre-line break-words">
                    {msg.role === "assistant" ? (
                      <RenderContent content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>

                  {/* Image */}
                  {msg.imageUrl && msg.imagePrompt && (
                    <div className="mt-3 rounded-xl overflow-hidden ring-1 ring-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.imageUrl} alt={msg.imagePrompt} className="w-full h-auto" />
                      <div className="px-3 py-2 bg-black/40 backdrop-blur-sm text-[10px] text-white/50 truncate flex items-center gap-1.5">
                        <Wand2 className="w-3 h-3" />
                        {msg.imagePrompt}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Loading */}
          {isLoading && (
            <div className="flex gap-3 items-start animate-in fade-in duration-200">
              <div className="shrink-0 mt-1">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg backdrop-blur-sm border ${
                  mode === "kids"
                    ? "bg-purple-500/20 border-purple-400/20"
                    : "bg-blue-500/20 border-blue-400/20"
                }`}>
                  {mode === "kids" ? (
                    <span className="text-xl">🤖</span>
                  ) : (
                    <Brain className="w-4.5 h-4.5 text-blue-400" strokeWidth={1.5} />
                  )}
                </div>
              </div>
              <div className={`px-4 py-3.5 rounded-2xl rounded-tl-sm backdrop-blur-xl border shadow-lg ${
                mode === "kids"
                  ? "bg-purple-500/5 border-purple-500/15"
                  : "bg-blue-500/5 border-blue-500/15"
              }`}>
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{
                        backgroundColor: mode === "kids" ? "#a855f7" : "#3b82f6",
                        animationDelay: `${i * 150}ms`,
                        opacity: 0.6,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ─── Suggestions Grid ──────────────────────────────── */}
      {showSuggestions && messages.length <= 1 && (
        <div className="relative z-10 px-4 sm:px-6 pb-3">
          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(s.title + " — " + s.desc)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-medium transition-all duration-200 border backdrop-blur-sm ${theme.suggestionBg} ${theme.suggestionBorder} ${theme.suggestionHover} group`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="text-lg shrink-0">{s.icon}</span>
                  <div className="text-left min-w-0">
                    <div className="text-white/80 font-medium truncate">{s.title}</div>
                    <div className="text-white/30 text-[10px] truncate">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Input Area ────────────────────────────────────── */}
      <footer className="relative z-10 px-4 sm:px-6 py-3.5 border-t border-white/[0.06] bg-black/40 backdrop-blur-2xl shrink-0">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === "kids"
                    ? "Digite sua pergunta, amigo! ✨"
                    : "Digite seu tópico de estudo..."
                }
                className={`w-full rounded-2xl py-3.5 pl-5 pr-12 text-sm text-white placeholder-white/25 focus:outline-none transition-all duration-200 border backdrop-blur-sm ${theme.inputBg} ${theme.inputBorder} ${theme.inputFocus} shadow-lg`}
                disabled={isLoading}
                autoComplete="off"
              />
            </div>

            {isLoading ? (
              <button
                type="button"
                onClick={handleStop}
                className="shrink-0 p-3.5 rounded-2xl bg-red-500/80 hover:bg-red-500 text-white transition-all shadow-lg hover:shadow-red-500/20"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className={`shrink-0 p-3.5 rounded-2xl transition-all duration-200 shadow-lg disabled:opacity-30 disabled:cursor-not-allowed ${theme.buttonGradient} ${theme.buttonHover} text-white hover:shadow-lg`}
                style={{ boxShadow: input.trim() ? `0 4px 20px ${theme.glow}` : "none" }}
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      </footer>
    </div>
  );
}

// ─── Content Renderer ─────────────────────────────────────────────────────────

function RenderContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={key} className="space-y-1.5 my-2.5">
          {listBuffer}
        </ul>
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, i) => {
    // Header
    if (line.startsWith("**") && line.endsWith("**")) {
      flushList(`h-${i}`);
      elements.push(
        <h2 key={i} className="text-base font-bold text-white/95 mt-4 mb-2 tracking-tight">
          {line.replace(/\*\*/g, "")}
        </h2>
      );
      return;
    }

    // List item
    if (line.startsWith("▸ ")) {
      listBuffer.push(
        <li key={`li-${i}`} className="flex items-start gap-2 text-sm text-white/75">
          <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-white/20" />
          <RenderInline text={line.slice(2)} />
        </li>
      );
      return;
    }

    // Empty line
    if (line.trim() === "") {
      flushList(`empty-${i}`);
      return;
    }

    // Regular paragraph
    flushList(`p-${i}`);
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-white/80 mb-1.5">
        <RenderInline text={line} />
      </p>
    );
  });

  flushList("final");

  return <div>{elements}</div>;
}

// ─── Inline Renderer (bold, italic, code) ──────────────────────────────────────

function RenderInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__")) {
      return <em key={i} className="italic text-white/70">{part.slice(2, -2)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded-md bg-white/5 text-[13px] font-mono text-[#a78bfa] border border-white/5">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}