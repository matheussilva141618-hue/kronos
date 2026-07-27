"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeft, GraduationCap, Sparkles, Send, Square, User, Wand2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import KronosAvatar from "@/components/KronosAvatar";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StudyKidsMode = "study" | "kids";

interface StudyKidsMessage {
  role: "user" | "assistant";
  content: string;
  imagePrompt?: string;
  imageUrl?: string;
}

// ─── Animation Variants ───────────────────────────────────────────────────────

const fadeUpVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1, y: 0,
    transition: { type: "spring" as const, stiffness: 100, damping: 16 },
  },
};

// ─── Welcome Messages ─────────────────────────────────────────────────────────

const getWelcomeStudy = (name: string) =>
  `**Bem-vindo ao Kronos Study, ${name}** 🎓\n\nSeu mentor de aprendizado inteligente. Aqui você encontra:\n\n- **Explicações didáticas** — conceitos complexos simplificados\n- **Analogias práticas** — conexões com o cotidiano\n- **Passo a passo** — aprendizado guiado e progressivo\n\n*Como posso te ajudar hoje?*`;

const getWelcomeKids = (name: string) =>
  `**Olá, ${name}!** 🌟\n\nSou o Kronos, seu amigo superesperto! Vamos aprender juntos?\n\n- **Histórias incríveis** 📖\n- **Desafios divertidos** 🧩\n- **Arte e criatividade** 🎨\n\n*O que você quer explorar hoje?* 🚀`;


// ─── Name extractor — captura nome em tempo real ─────────────────────────────

function extractNameFromMessage(text: string): string | null {
  const patterns = [
    /(?:meu nome é|me chamo|sou o|sou a|pode me chamar de|pode chamar de)\s+([A-ZÀ-Ú][a-zà-ú]{1,}(?:\s[A-ZÀ-Ú][a-zà-ú]+)?)/i,
    /^([A-ZÀ-Ú][a-zà-ú]{2,})\s+(?:aqui|presente|falando)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

const markdownComponents: Partial<Components> = {
  h1: ({ children }) => <h1 className="text-lg font-bold text-white/95 mt-3 mb-2 tracking-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold text-white/95 mt-3 mb-2 tracking-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold text-white/90 mt-2.5 mb-1.5">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/70">{children}</em>,
  p: ({ children }) => <p className="text-sm leading-relaxed text-white/80 mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="space-y-1.5 my-2.5">{children}</ul>,
  ol: ({ children }) => <ol className="space-y-1.5 my-2.5 list-decimal list-inside text-sm text-white/75">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-white/75">
      <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-to-r from-white/30 to-white/10" />
      <span>{children}</span>
    </li>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded-md bg-white/5 text-[13px] font-mono text-[#a78bfa] border border-white/5">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 overflow-x-auto text-sm text-white/80 my-3">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-blue-400/30 pl-4 italic text-white/60 my-3">{children}</blockquote>
  ),
};

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

// ─── Particle Background ──────────────────────────────────────────────────────

function StardustBackground() {
  const particles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      size: Math.random() * 3 + 1,
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 15,
      duration: 15 + Math.random() * 20,
      opacity: 0.2 + Math.random() * 0.4,
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white animate-particle"
          style={{ width: p.size, height: p.size, left: p.left, bottom: "-10%",
            animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, opacity: p.opacity }}
        />
      ))}
      <div className="absolute top-[-150px] right-[-150px] w-[400px] h-[400px] rounded-full opacity-[0.12] blur-[150px] pointer-events-none bg-blue-500 animate-drift" />
      <div className="absolute bottom-[-150px] left-[-150px] w-[400px] h-[400px] rounded-full opacity-[0.08] blur-[150px] pointer-events-none bg-purple-600 animate-drift" style={{ animationDelay: "-7s" }} />
    </div>
  );
}


// ─── Props ────────────────────────────────────────────────────────────────────

interface KronosLearningHubProps {
  username: string;
  onClose: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KronosLearningHub({ username, onClose }: KronosLearningHubProps) {
  const [mode, setMode] = useState<StudyKidsMode>("study");
  // Isolamento: cada modo tem seu próprio histórico independente
  const [studyMessages, setStudyMessages] = useState<StudyKidsMessage[]>([]);
  const [kidsMessages, setKidsMessages] = useState<StudyKidsMessage[]>([]);
  // Nome extraído em tempo real na sessão atual — não cruza entre históricos
  const [sessionName, setSessionName] = useState<string>(username);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isKids = mode === "kids";
  const messages = isKids ? kidsMessages : studyMessages;
  const setMessages = isKids ? setKidsMessages : setStudyMessages;

  // Tema derivado do modo
  const theme = useMemo(() => ({
    gradient: isKids ? "from-[#0a0015] via-[#1a0025] to-[#0d001a]" : "from-[#000814] via-[#001229] to-[#000b1a]",
    accentDim: isKids ? "rgba(168,85,247,0.08)" : "rgba(59,130,246,0.08)",
    accentBorder: isKids ? "rgba(168,85,247,0.25)" : "rgba(59,130,246,0.25)",
    accentGlow: isKids ? "rgba(168,85,247,0.25)" : "rgba(59,130,246,0.25)",
    userBubble: isKids
      ? "bg-gradient-to-r from-purple-600/90 to-fuchsia-600/90"
      : "bg-gradient-to-r from-blue-600/90 to-indigo-600/90",
    assistantBubble: isKids ? "border-purple-500/15 bg-white/[0.03]" : "border-blue-500/15 bg-white/[0.03]",
    badgeBg: isKids ? "bg-purple-500/20" : "bg-blue-500/20",
    toggleActive: isKids
      ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 shadow-lg shadow-purple-600/20"
      : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/20",
    loadingBorder: isKids ? "bg-purple-500/20 border-purple-400/20" : "bg-blue-500/20 border-blue-400/20",
    loadingBubble: isKids ? "bg-purple-500/5 border-purple-500/15" : "bg-blue-500/5 border-blue-500/15",
    dotColor: isKids ? "#a855f7" : "#3b82f6",
    sendButtonGrad: isKids
      ? "bg-gradient-to-r from-purple-600 to-fuchsia-600"
      : "bg-gradient-to-r from-blue-600 to-indigo-600",
  }), [isKids]);

  // Inicializa a mensagem de boas-vindas apenas quando o modo não tem histórico
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: isKids ? getWelcomeKids(sessionName) : getWelcomeStudy(sessionName),
      }]);
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

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;
    setInput("");

    // Extrai nome em tempo real — atualiza sessionName para esta sessão
    const detectedName = extractNameFromMessage(msg);
    const activeName = detectedName ?? sessionName;
    if (detectedName) setSessionName(detectedName);

    const snapshot = messages; // captura do estado atual do modo ativo
    const newMessages: StudyKidsMessage[] = [...snapshot, { role: "user", content: msg }];
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
          username: activeName,
          history: newMessages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
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
          { role: "assistant", content: data.response || "Pronto! 🎨",
            imageUrl: imgData.imageUrl, imagePrompt: data.imagePrompt },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response ?? "Não consegui processar." },
        ]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: isKids
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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const switchMode = (newMode: StudyKidsMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setInput("");
    // NÃO limpa o histórico — cada modo mantém o seu
  };


  return (
    <motion.div
      className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-br ${theme.gradient}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <StardustBackground />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-black/40 backdrop-blur-2xl shrink-0">
        <motion.div className="flex items-center gap-3" variants={fadeUpVariants} initial="hidden" animate="visible">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="w-px h-5 bg-white/[0.06]" />
          <div className="flex items-center gap-2.5">
            <motion.div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${theme.badgeBg} backdrop-blur-sm`}
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {isKids
                ? <Sparkles className="w-4 h-4 text-purple-300" />
                : <GraduationCap className="w-4 h-4 text-blue-300" />}
            </motion.div>
            <div>
              <div className="text-sm font-semibold text-white/90 tracking-tight">
                Kronos {isKids ? "Kids" : "Study"}
              </div>
              <div className="text-[10px] text-white/30 font-medium">
                {isKids ? "Aprendizado infantil" : "Mentoria acadêmica"}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Mode Toggle */}
        <motion.div
          className="flex items-center gap-1 bg-black/50 rounded-2xl p-1 border border-white/[0.06] shadow-lg"
          variants={fadeUpVariants} initial="hidden" animate="visible"
        >
          {(["study", "kids"] as StudyKidsMode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                  active ? `${theme.toggleActive} text-white` : "text-white/30 hover:text-white/60"
                }`}
              >
                {m === "study" ? <GraduationCap className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{m === "study" ? "Study" : "Kids"}</span>
                {active && (
                  <motion.div
                    className="w-1 h-1 rounded-full bg-white/60 ml-0.5"
                    layoutId="activeDot"
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  />
                )}
              </button>
            );
          })}
        </motion.div>
      </header>

      {/* ─── Messages ────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
            {messages.map((msg, i) => (
              <motion.div
                key={`${mode}-${i}`}
                className={`flex gap-3 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 120, damping: 16 }}
              >
                {/* Avatar da IA — sempre KronosAvatar oficial */}
                {msg.role === "assistant" && (
                  <div className="shrink-0 mt-1">
                    <motion.div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg backdrop-blur-sm border ${theme.loadingBorder}`}
                      whileHover={{ scale: 1.08 }}
                    >
                      <KronosAvatar size={22} />
                    </motion.div>
                  </div>
                )}

                {/* Avatar do usuário */}
                {msg.role === "user" && (
                  <div className="shrink-0 mt-1">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-zinc-500/30 to-zinc-600/30 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm">
                      <User className="w-4 h-4 text-white/60" strokeWidth={1.5} />
                    </div>
                  </div>
                )}

                {/* Bubble */}
                <div className={`max-w-[80%] sm:max-w-[75%] ${msg.role === "user" ? "text-right" : ""}`}>
                  <motion.div
                    className={`relative px-4 py-3.5 text-sm leading-relaxed shadow-lg ${
                      msg.role === "user"
                        ? `${theme.userBubble} text-white rounded-2xl rounded-tr-sm`
                        : `${theme.assistantBubble} backdrop-blur-xl text-white/85 rounded-2xl rounded-tl-sm border`
                    }`}
                    whileHover={{ scale: 1.005 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <div className="break-words">
                      {msg.role === "assistant"
                        ? <MarkdownContent content={msg.content} />
                        : msg.content}
                    </div>
                    {msg.imageUrl && msg.imagePrompt && (
                      <motion.div
                        className="mt-3 rounded-xl overflow-hidden ring-1 ring-white/10"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={msg.imageUrl} alt={msg.imagePrompt} className="w-full h-auto" />
                        <div className="px-3 py-2 bg-black/40 backdrop-blur-sm text-[10px] text-white/50 truncate flex items-center gap-1.5">
                          <Wand2 className="w-3 h-3" />
                          {msg.imagePrompt}
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </div>
              </motion.div>
            ))}

            {/* Loading */}
            {isLoading && (
              <motion.div className="flex gap-3 items-start" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="shrink-0 mt-1">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg backdrop-blur-sm border ${theme.loadingBorder}`}>
                    <KronosAvatar size={22} spinning />
                  </div>
                </div>
                <div className={`px-4 py-3.5 rounded-2xl rounded-tl-sm backdrop-blur-xl border shadow-lg ${theme.loadingBubble}`}>
                  <div className="flex gap-1.5 items-center h-5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: theme.dotColor, animationDelay: `${i * 150}ms`, opacity: 0.6 }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ─── Input ───────────────────────────────────────────── */}
      <motion.footer
        className="relative z-20 px-4 sm:px-6 py-3 shrink-0"
        variants={fadeUpVariants} initial="hidden" animate="visible"
      >
        <div className="max-w-3xl mx-auto">
          <motion.form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2.5 rounded-2xl p-1.5 transition-all duration-300"
            style={{
              background: isFocused
                ? `linear-gradient(135deg, ${theme.accentDim} 0%, rgba(255,255,255,0.03) 100%)`
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${isFocused ? theme.accentBorder : "rgba(255,255,255,0.06)"}`,
              boxShadow: isFocused
                ? `0 0 30px ${theme.accentGlow}, 0 4px 20px rgba(0,0,0,0.3)`
                : "0 4px 20px rgba(0,0,0,0.2)",
              backdropFilter: "blur(24px)",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={isKids ? "Digite sua pergunta, amigo! ✨" : "Digite seu tópico de estudo..."}
              className="flex-1 bg-transparent py-2.5 px-1 text-sm text-white placeholder-white/20 focus:outline-none transition-all"
              disabled={isLoading}
              autoComplete="off"
            />
            {isLoading ? (
              <motion.button
                type="button" onClick={handleStop}
                className="shrink-0 p-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white transition-all shadow-lg"
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              >
                <Square className="w-4 h-4" />
              </motion.button>
            ) : (
              <motion.button
                type="submit" disabled={!input.trim()}
                className={`shrink-0 p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed text-white ${theme.sendButtonGrad}`}
                whileHover={input.trim() ? { scale: 1.05 } : {}}
                whileTap={input.trim() ? { scale: 0.95 } : {}}
                style={{ boxShadow: input.trim() ? `0 4px 20px ${theme.accentGlow}` : "none" }}
              >
                <Send className="w-4 h-4" />
              </motion.button>
            )}
          </motion.form>
        </div>
      </motion.footer>
    </motion.div>
  );
}
