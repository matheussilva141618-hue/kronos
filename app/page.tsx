"use client";

import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Send, Plus, LogOut, Paperclip, X, FileText, Square, Globe, Menu, Mail, Image, Copy, Check, Briefcase, BookOpen, Sparkles } from "lucide-react";
import type { AutonomousCoreStatus } from "@/utils/COGNITIVE_ENGINE";
import { useRouter } from "next/navigation";
import KronosAvatar   from "@/components/KronosAvatar";
import ProgressBar    from "@/components/ProgressBar";
import FileExplorer   from "@/components/FileExplorer";
import EmailComposer  from "@/components/EmailComposerWidget";
import CommandBarMenu, { type Command } from "@/components/CommandBar";
import WhatsAppComposer from "@/components/WhatsAppComposer";
import MediaWorkstation from "@/components/MediaWorkstation";
import KronosLearningHub from "@/components/KronosLearningHub";
import KronosStudio from "@/components/KronosStudio";
import { sanitizeText } from "@/utils/sanitize";
import type { ExportTable } from "@/utils/exporter";
import { loadMemory, formatMemoryForPrompt } from "@/utils/memory";
import type { KronosMode, KidsProfile } from "@/app/api/chat/route";

const ChatExporter = lazy(() => import("@/components/ChatExporter"));

interface Message { role: "user" | "assistant"; content: string; imageUrl?: string; imagePrompt?: string; }
interface Conversation { id: string; title: string; messages: Message[]; mode: KronosMode; updatedAt?: string; }
interface FilePayload { fileName: string; fileType: string; base64Data: string; }
interface AttachedFile { file: File; preview?: string; }
interface MediaItem { id: string; type: "image" | "file"; url: string; name: string; prompt?: string; }
interface VisualReport { id: string; type: "vision_ui" | "vision_error" | "vision_image"; content: string; imageUrl?: string; timestamp: string; }

const MODES: { value: KronosMode; label: string; emoji: string }[] = [
  { value: "profissional", label: "Profissional", emoji: "" },
  { value: "academy",      label: "Academy",      emoji: "" },
  { value: "kids",         label: "Kids",         emoji: "" },
];
const MODE_WELCOME: Record<KronosMode, (n: string) => string> = {
  profissional: (n) => `${n}, Modo Profissional ativado.\nPronto para auditorias, código e análise de documentos.`,
  academy:      (n) => `${n}, Modo Academy ativado.\nMe diga o que quer aprender.`,
  kids:         (n) => `${n}, pronto. Manda o que precisar.`,
};
function getModeConfig(m: KronosMode) { return MODES.find((x) => x.value === m) ?? MODES[0]; }

const CHATS_KEY  = (u: string) => `kronos_chats_${u}`;
const MODE_KEY   = (u: string) => `kronos_mode_${u}`;
const MEDIA_KEY  = (u: string) => `kronos_media_${u}`;
const ACCEPTED  = ["image/png","image/jpeg","image/jpg","image/webp","image/gif","text/plain","text/csv","application/pdf"].join(",");

function newConv(name: string, mode: KronosMode): Conversation {
  return { id: crypto.randomUUID(), title: "Nova conversa", mode, messages: [{ role: "assistant", content: MODE_WELCOME[mode](name) }] };
}
function parseExportTable(content: string): { text: string; table: (ExportTable & { subtitle?: string }) | null } {
  const S="%%EXPORT_TABLE_START%%",E="%%EXPORT_TABLE_END%%";
  const si=content.indexOf(S),ei=content.indexOf(E);
  if(si===-1||ei===-1) return {text:sanitizeText(content)||content,table:null};
  const before=content.slice(0,si).trim(),after=content.slice(ei+E.length).trim();
  try { return {text:sanitizeText([before,after].filter(Boolean).join("\n\n"))||content,table:JSON.parse(content.slice(si+S.length,ei).trim())}; }
  catch { return {text:sanitizeText(content)||content,table:null}; }
}

export default function Dashboard() {
  const [username, setUsername]                   = useState("");
  const [conversations, setConvs]                 = useState<Conversation[]>([]);
  const [activeId, setActiveId]                   = useState("");
  const [mode, setMode]                           = useState<KronosMode>("profissional");
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailDefaults, setEmailDefaults]         = useState({ to:"", subject:"", body:"" });
  const [emailAttachFiles, setEmailAttachFiles]   = useState<File[]>([]);
  const [kidsProfile, setKidsProfile]             = useState<KidsProfile | null>(null);
  const [kidsAwaitingName, setKidsAwaitingName]   = useState(false);
  const [showWhatsApp, setShowWhatsApp]           = useState(false);
  const [toast, setToast]                         = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [sidebarOpen, setSidebarOpen]             = useState(false);
  const [input, setInput]                         = useState("");
  const [isLoading, setIsLoading]                 = useState(false);
  const [isSearching, setIsSearching]             = useState(false);
  const [hydrated, setHydrated]                   = useState(false);
  const [redirecting, setRedirecting]             = useState(false);
  const [attachedFiles, setAttached]              = useState<AttachedFile[]>([]);
  const [showCommandBar, setShowCommandBar]       = useState(false);
  const [commandQuery, setCommandQuery]           = useState("");
  const [mediaItems, setMediaItems]               = useState<MediaItem[]>([]);
  const [visualReports, setVisualReports]         = useState<VisualReport[]>([]);
  const [showWorkstation, setShowWorkstation]     = useState(false);
  const [showStudyKids, setShowStudyKids]         = useState(false);
  const [currentView, setCurrentView]             = useState<"chat" | "study" | "kids" | "studio">("chat");
  const [notificationBadge, setNotificationBadge] = useState(0);
  const [cognitiveStatus, setCognitiveStatus]     = useState<AutonomousCoreStatus | null>(null);
  const [copiedId, setCopiedId]                   = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const touchStartX    = useRef<number>(0);
  const router         = useRouter();

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
        if (parsed.length > 0) {
          setConvs(parsed); setActiveId(parsed[0].id); setHydrated(true);
          try { const mr = localStorage.getItem(MEDIA_KEY(stored)); if (mr) setMediaItems(JSON.parse(mr)); } catch { /**/ }
          if (savedMode === "kids") {
            fetch(`/api/kids-profile?username=${encodeURIComponent(stored)}`)
              .then((r) => r.json())
              .then((d) => { if (d.profile) setKidsProfile(d.profile); })
              .catch(() => {});
          }
          return;
        }
      }
    } catch { /**/ }    const first = newConv(stored, savedMode);
    setConvs([first]); setActiveId(first.id); setHydrated(true);
  }, [router]);

  useEffect(() => {
    if (!hydrated || !username) return;
    localStorage.setItem(CHATS_KEY(username), JSON.stringify(conversations));
  }, [conversations, hydrated, username]);

  useEffect(() => {
    if (!hydrated || !username) return;
    localStorage.setItem(MEDIA_KEY(username), JSON.stringify(mediaItems));
  }, [mediaItems, hydrated, username]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages   = activeConv?.messages ?? [];
  const viewLabel  = currentView === 'studio'
    ? 'Kronos Studio'
    : activeConv?.title !== 'Nova conversa'
      ? activeConv?.title
      : 'Kronos AI';

  useEffect(() => {
    if (!username) return;
    const runLoop = async () => {
      try {
        const currentMessages = messages;
        const topics = currentMessages
          .filter((m) => m.role === "user")
          .slice(-6)
          .map((m) => m.content.replace(/\n.*$/, "").trim())
          .filter(Boolean);
        const res = await fetch(`/api/engine/loop?username=${encodeURIComponent(username)}&mode=${encodeURIComponent(mode)}&topics=${encodeURIComponent(topics.join(","))}&notificationCount=${notificationBadge}&recentErrors=${encodeURIComponent([].join("|"))}` , { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recentTopics: topics }) });
        if (!res.ok) return;
        const data = await res.json();
        setCognitiveStatus(data);
      } catch {
        // fallback silencioso
      }
    };

    const timer = window.setTimeout(runLoop, 600);
    return () => window.clearTimeout(timer);
  }, [username, mode, notificationBadge, messages]);

  const handleModeChange = (m: KronosMode) => {
    const prev = mode;
    setMode(m);
    if (username) localStorage.setItem(MODE_KEY(username), m);

    if (m === "kids") {
      fetchKidsProfile(activeId);
    } else if (prev === "kids") {
      // Voltando de kids → modo adulto: reconhece o usuário sem perguntar nome
      const welcomeBack: Record<Exclude<KronosMode,"kids">, string> = {
        profissional: `Olá, ${username}. Modo Profissional ativado.\nPronto para auditorias, código e análise de documentos.`,
        academy:      `Olá, ${username}. Modo Academy ativado.\nMe diga o que quer aprender.`,
      };
      setConvs((prev2) => prev2.map((c) => {
        if (c.id !== activeId) return c;
        return { ...c, messages: [...c.messages, {
          role: "assistant" as const,
          content: welcomeBack[m as Exclude<KronosMode,"kids">],
        }]};
      }));
    }
  };

  const fetchKidsProfile = async (convId: string) => {
    try {
      const res  = await fetch(`/api/kids-profile?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      const profile: KidsProfile | null = data.profile ?? null;
      setKidsProfile(profile);

      if (profile) {
        setConvs((prev) => prev.map((c) => {
          if (c.id !== convId) return c;
          return { ...c, messages: [...c.messages, {
            role: "assistant" as const,
            content: `Oi, ${profile.nome}! Que bom te ver de novo!\nHoje você já tem ${profile.idade} anos, né? O que vamos aprender ou criar hoje?`,
          }]};
        }));
      } else {
        setKidsAwaitingName(true);
        setConvs((prev) => prev.map((c) => {
          if (c.id !== convId) return c;
          return { ...c, messages: [...c.messages, {
            role: "assistant" as const,
            content: "Oi! Sou o Kronos, seu novo amigo superesperto!\nComo você se chama e quantos anos você tem?",
          }]};
        }));
      }
    } catch {
      // silently fail — não bloqueia o uso
    }
  };

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, []);
  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  const handleNewConv = (m?: KronosMode) => {
    const c = newConv(username, m ?? mode);
    setConvs((p) => [c, ...p]); setActiveId(c.id); setSidebarOpen(false);
    if (m && m !== mode) handleModeChange(m);
  };

  const updateConv = useCallback((id: string, msgs: Message[]) => {
    setConvs((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const first = msgs.find((m) => m.role === "user");
      const raw   = first?.content.replace(/\n.*$/,"").trim() ?? "";
      return { ...c, messages: msgs, title: raw ? raw.slice(0,40)+(raw.length>40?"…":"") : c.title, updatedAt: new Date().toISOString() };
    }));
  }, []);

  const handleDeleteConv = (id: string) => {
    setConvs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? "");
      if (next.length === 0) {
        const fresh = newConv(username, mode);
        setActiveId(fresh.id);
        return [fresh];
      }
      return next;
    });
  };

  const handleRenameConv = (id: string, title: string) => {
    setConvs((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
  };

  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(idx);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toPayload = (file: File): Promise<FilePayload> =>
    new Promise((res,rej) => {
      const r = new FileReader(); r.onerror = rej;
      if (file.type.startsWith("image/") || file.type==="application/pdf") {
        r.onload = () => res({ fileName:file.name, fileType:file.type, base64Data:r.result as string });
        r.readAsDataURL(file);
      } else {
        r.onload = () => res({ fileName:file.name, fileType:file.type, base64Data:r.result as string });
        r.readAsText(file);
      }
    });

  const addFiles = (files: File[]) => {
    const added = files.map((f) => ({ file:f, preview:f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined }));
    setAttached((p) => [...p, ...added]);
    // Confirmação minimalista
    if (files.length === 1) {
      showToast(`Arquivo ${files[0].name} recebido.`, "success");
    } else if (files.length > 1) {
      showToast(`${files.length} arquivos recebidos.`, "success");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); if (files.length) addFiles(files); e.target.value="";
  };
  const removeFile = (i: number) =>
    setAttached((p) => { const c=[...p]; if(c[i].preview) URL.revokeObjectURL(c[i].preview!); c.splice(i,1); return c; });

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!hydrated) return;
    const imgs = Array.from(e.clipboardData?.items??[]).filter((i)=>i.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault(); addFiles(imgs.map((item)=>item.getAsFile()!)); inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  useEffect(() => { document.addEventListener("paste",handlePaste); return ()=>document.removeEventListener("paste",handlePaste); }, [handlePaste]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 60) setSidebarOpen(true);
    if (dx < -60) setSidebarOpen(false);
  };

  const handleStop = () => { abortRef.current?.abort(); setIsLoading(false); setIsSearching(false); };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith("/")) {
      setShowCommandBar(true);
      setCommandQuery(val.slice(1));
    } else {
      setShowCommandBar(false);
      setCommandQuery("");
    }
  };

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCommandSelect = (cmd: Command) => {
    setShowCommandBar(false);
    setCommandQuery("");
    if (cmd.id === "/email") {
      setInput("");
      setEmailDefaults({ to: "", subject: "", body: "" });
      setShowEmailComposer(true);
      return;
    }
    if (cmd.id === "/whatsapp") {
      setInput("");
      setShowWhatsApp(true);
      return;
    }
    if (cmd.id === "/kids") {
      setInput("");
      handleModeChange("kids");
      return;
    }
    if (cmd.id === "/academy") {
      setInput("");
      handleModeChange("academy");
      return;
    }
    // /fix, /debug, /status, /imagem, /dossie preenchem o input
    const fills: Record<string, string> = {
      "/imagem": "/imagem ",
      "/dossie": "/dossie ",
      "/fix":    "/fix ",
      "/debug":  "/debug ",
      "/status": "/status ",
    };
    setInput(fills[cmd.id] ?? cmd.id + " ");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachedFiles.length) || isLoading || !activeId) return;
    const rawInput = input.trim();
    setInput("");
    setShowCommandBar(false);

    // ── Processa comandos de barra ──────────────────────────────────────────
    if (rawInput.startsWith("/fix") || rawInput.startsWith("/debug") || rawInput.startsWith("/status")) {
      const cmdMap: Record<string, string> = {
        "/fix":    "Analise a conversa e identifique e corrija o problema descrito.",
        "/debug":  "Faça um diagnóstico detalhado do problema ou código mencionado na conversa.",
        "/status": "Dê um resumo do estado atual da tarefa ou projeto que estamos desenvolvendo nesta conversa.",
      };
      const base = Object.keys(cmdMap).find((k) => rawInput.startsWith(k)) ?? "/fix";
      const extra = rawInput.slice(base.length).trim();
      const userText = extra ? `${cmdMap[base]} Contexto adicional: ${extra}` : cmdMap[base];
      const updated: Message[] = [...messages, { role: "user", content: rawInput }];
      updateConv(activeId, updated);
      setIsLoading(true);
      const controller = new AbortController(); abortRef.current = controller;
      try {
        const memoryContext = formatMemoryForPrompt(loadMemory(username, mode));
        const res = await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userText, userName: username, mode, memoryContext,
            kidsProfile: kidsProfile ?? undefined,
            history: updated.slice(0, -1).slice(-20).map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("text/event-stream")) {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let streamedText = "";
          const streamIndex = updated.length;
          updateConv(activeId, [...updated, { role: "assistant", content: "" }]);
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const p = JSON.parse(line.slice(6));
                if (p.delta) { streamedText += p.delta; setConvs((prev) => prev.map((c) => { if (c.id !== activeId) return c; const msgs = [...c.messages]; msgs[streamIndex] = { role: "assistant", content: streamedText }; return { ...c, messages: msgs }; })); }
                if (p.done) { setConvs((prev) => prev.map((c) => { if (c.id !== activeId) return c; const msgs = [...c.messages]; msgs[streamIndex] = { role: "assistant", content: p.response }; return { ...c, messages: msgs }; })); }
              } catch { /* ignorar */ }
            }
          }
        } else {
          const data = await res.json();
          updateConv(activeId, [...updated, { role: "assistant", content: data.response ?? data.error ?? "Erro." }]);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError")
          updateConv(activeId, [...updated, { role: "assistant", content: "Não foi possível completar esta ação." }]);
      } finally { setIsLoading(false); abortRef.current = null; }
      return;
    }

    if (rawInput.startsWith("/imagem ") || rawInput === "/imagem") {
      const prompt = rawInput.replace(/^\/imagem\s*/i, "").trim();
      if (!prompt) {
        // Sem prompt — pede ao usuário
        setInput("/imagem ");
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      // Injeta como se o usuário tivesse pedido "gere uma imagem de X"
      const userText = `Gere uma imagem de ${prompt}`;
      const updated: Message[] = [...messages, { role: "user", content: userText }];
      updateConv(activeId, updated);
      setIsLoading(true);
      const controller = new AbortController(); abortRef.current = controller;
      try {
        const imgRes  = await fetch("/api/generate-image", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ prompt }), signal:controller.signal });
        const imgData = await imgRes.json();
        if (imgData.imageUrl) {
          // Imagem vai APENAS para a Workstation — chat fica limpo
          setMediaItems((prev) => [...prev, {
            id: crypto.randomUUID(),
            type: "image",
            url: imgData.imageUrl,
            name: `${prompt.slice(0, 30)}.png`,
            prompt: prompt
          }]);
          }
        updateConv(activeId, [...updated,
          { role:"assistant" as const, content: imgData.imageUrl
            ? `Imagem gerada e adicionada à aba Mídias.`
            : "Não foi possível gerar a imagem." }
        ]);
      } catch (err) {
        if ((err as Error).name !== "AbortError")
          updateConv(activeId, [...updated, { role:"assistant", content:"Não foi possível gerar a imagem. Deseja tentar novamente?" }]);
      } finally { setIsLoading(false); abortRef.current = null; }
      return;
    }

    if (rawInput.startsWith("/dossie ") || rawInput === "/dossie") {
      const query = rawInput.replace(/^\/dossie\s*/i, "").trim() || "resumo do dossiê";
      const userText = `Busque no dossiê: ${query}`;
      const updated: Message[] = [...messages, { role: "user", content: userText }];
      updateConv(activeId, updated);
      setIsLoading(true);
      const controller = new AbortController(); abortRef.current = controller;
      try {
        const memoryContext = formatMemoryForPrompt(loadMemory(username, mode));
        const res  = await fetch("/api/chat", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            message: userText,
            userName: username,
            mode,
            memoryContext,
            kidsProfile: kidsProfile ?? undefined,
            history: updated.slice(0, -1).slice(-20).map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        updateConv(activeId, [...updated, { role:"assistant", content: data.response ?? data.error ?? "Erro." }]);
      } catch (err) {
        if ((err as Error).name !== "AbortError")
          updateConv(activeId, [...updated, { role:"assistant", content:"Não foi possível buscar no dossiê no momento. Deseja tentar novamente?" }]);
      } finally { setIsLoading(false); abortRef.current = null; }
      return;
    }

    const userText  = rawInput || "Analise esta imagem.";
    const fileNames = attachedFiles.map((a) => a.file.name).join(", ");
    const display   = fileNames ? `${userText}\n${fileNames}` : userText;
    const updated: Message[] = [...messages, { role:"user", content:display }];
    updateConv(activeId, updated);
    const toSend = [...attachedFiles]; setAttached([]);
    setIsLoading(true);

    // ── Intercepta resposta de cadastro kids ──────────────────────────────
    if (kidsAwaitingName && mode === "kids") {
      const nameMatch = userText.match(/([A-ZÀ-Ú][a-zà-ú]{1,}(?:\s[A-ZÀ-Ú][a-zà-ú]+)?)/);
      const ageMatch  = userText.match(/(\d{1,2})\s*anos?/i) ?? userText.match(/\b(\d{1,2})\b/);
      const nome      = nameMatch?.[1]?.trim();
      const idade     = ageMatch ? parseInt(ageMatch[1]) : null;

      if (nome && idade && idade >= 3 && idade <= 17) {
        setKidsAwaitingName(false);
        try {
          const res  = await fetch("/api/kids-profile", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, nome, idade }),
          });
          const data = await res.json();
          if (data.profile) {
            setKidsProfile(data.profile);
            updateConv(activeId, [...updated, {
              role: "assistant",
              content: `Que nome incrível, ${nome}! ${idade} anos, uau!\nAgora somos amigos oficiais. O que você quer aprender ou criar hoje?`,
            }]);
            setIsLoading(false);
            return;
          }
        } catch { /* continua para o LLM */ }
      } else {
        // Não conseguiu extrair — pede de novo via LLM normalmente
        setKidsAwaitingName(false);
      }
    }
    const searchTriggers = /hoje|agora|atual|recente|preço|cotaç|clima|busque|pesquise|2024|2025|2026/i;
    if (searchTriggers.test(userText)) setIsSearching(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const payloads = await Promise.all(toSend.map((a) => toPayload(a.file)));
      toSend.forEach((a) => { if (a.preview) URL.revokeObjectURL(a.preview); });
      const memoryContext = formatMemoryForPrompt(loadMemory(username, mode));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          userName: username,
          mode,
          files: payloads.length ? payloads : undefined,
          memoryContext,
          kidsProfile: kidsProfile ?? undefined,
          history: updated.slice(0, -1).slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      setIsSearching(false);
      const contentType = res.headers.get("content-type") ?? "";

      // ── Resposta JSON (imagem, email, visão, PDF Genesis) ─────────────────
      if (!contentType.includes("text/event-stream")) {
        const data = await res.json();

        // ── Genesis PDF: LLM gera conteúdo → /api/generate-pdf ──────────────
        if (data.generatePDF && data.enrichedMessage) {
          updateConv(activeId, [...updated, { role:"assistant", content:"Gerando documento PDF..." }]);
          try {
            // 1. Chama o LLM com a mensagem enriquecida para gerar o conteúdo
            const contentRes = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: data.enrichedMessage,
                userName: username,
                mode,
                memoryContext: "",
                history: updated.slice(-10).map((m) => ({ role: m.role, content: m.content })),
              }),
              signal: controller.signal,
            });
            const contentData = await contentRes.json();
            const generatedContent = (contentData.response ?? "").replace("%%PDF_READY%%", "").trim();

            if (!generatedContent) throw new Error("Conteúdo vazio");

            // 2. Chama /api/generate-pdf com o conteúdo
            const pdfRes  = await fetch("/api/generate-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: userText.replace(/gere?|crie?|prepara?|exporta?|pdf|documento/gi, "").trim().slice(0, 60) || "Documento Kronos",
                content: generatedContent,
                message: userText,
                author: username,
              }),
              signal: controller.signal,
            });
            const pdfData = await pdfRes.json();

            if (pdfData.success) {
              updateConv(activeId, [...updated, {
                role: "assistant",
                content: `Documento gerado.\n\nArquivo: ${pdfData.fileName}\nTamanho: ${pdfData.size}\nAcesse: ${pdfData.publicUrl}`,
              }]);
              // Adiciona na workstation como item de mídia
              setMediaItems((prev) => [...prev, {
                id: crypto.randomUUID(),
                type: "file",
                url: pdfData.publicUrl,
                name: pdfData.fileName,
              }]);
              } else {
              updateConv(activeId, [...updated, { role:"assistant", content:"Não foi possível gerar o PDF. Tente novamente." }]);
            }
          } catch (err) {
            if ((err as Error).name !== "AbortError") {
              updateConv(activeId, [...updated, { role:"assistant", content:"Erro ao gerar o documento. Tente novamente." }]);
            }
          } finally {
            setIsLoading(false);
            abortRef.current = null;
          }
          return;
        }

        if (data.generateImage && data.imagePrompt) {
          const imgRes  = await fetch("/api/generate-image", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ prompt:data.imagePrompt }), signal:controller.signal });
          const imgData = await imgRes.json();
          const disp    = data.displayPrompt || data.imagePrompt.slice(0, 80);
          if (imgData.imageUrl) {
            // Imagem vai APENAS para a Workstation — zero base64 ou URL no chat
            setMediaItems((prev) => [...prev, { id:crypto.randomUUID(), type:"image", url:imgData.imageUrl, name:`${disp.slice(0,40)}.png`, prompt:disp }]);
            }
          updateConv(activeId, [...updated,
            { role:"assistant" as const, content: imgData.imageUrl
              ? `Imagem de "${disp}" gerada e adicionada à aba Mídias.`
              : "Não foi possível gerar a imagem." }
          ]);
        } else if (data.sendEmail && data.emailData) {
          const { to, subject, text } = data.emailData;
          const filesToAttach = toSend.map((a) => a.file);
          setEmailDefaults({ to, subject, body: text });
          setEmailAttachFiles(filesToAttach);
          setShowEmailComposer(true);
          const attNote = filesToAttach.length > 0 ? ` com ${filesToAttach.length} anexo(s).` : ".";
          updateConv(activeId, [...updated, { role:"assistant", content:`Formulário aberto para ${to}${attNote} Revise e confirme antes de enviar.` }]);
        } else {
          // Captura visual report se veio da análise Omni-Vision
          if (data.visualReport) {
            const report: VisualReport = {
              id: crypto.randomUUID(),
              type: data.visualReport.type,
              content: data.visualReport.content,
              timestamp: data.visualReport.timestamp,
            };
            setVisualReports((prev) => [...prev, report]);
            }
          updateConv(activeId, [...updated, { role:"assistant", content:data.response ?? data.error ?? "Erro." }]);
        }
        return;
      }

      // ── Stream SSE — resposta aparece em tempo real ───────────────────────
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";
      // Insere mensagem vazia para ir preenchendo
      const streamIndex = updated.length;
      updateConv(activeId, [...updated, { role:"assistant", content:"" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.delta) {
              streamedText += payload.delta;
              setConvs((prev) => prev.map((c) => {
                if (c.id !== activeId) return c;
                const msgs = [...c.messages];
                msgs[streamIndex] = { role: "assistant", content: streamedText };
                return { ...c, messages: msgs };
              }));
            }
            if (payload.done) {
              // Substitui pelo texto final sanitizado
              setConvs((prev) => prev.map((c) => {
                if (c.id !== activeId) return c;
                const msgs = [...c.messages];
                msgs[streamIndex] = { role: "assistant", content: payload.response };
                return { ...c, messages: msgs };
              }));
              // Captura relatórios PDF do Deep Reader
              if (payload.pdfReports?.length) {
                const reports: VisualReport[] = payload.pdfReports.map((r: {
                  fileName: string; category: string; summary: string;
                  fields: { label: string; value: string }[]; auditFlags: string[]; pageCount: number;
                }) => ({
                  id: crypto.randomUUID(),
                  type: "vision_ui" as const,
                  content: `${r.summary}\n\nCAMPOS:\n${r.fields.map((f: { label: string; value: string }) => `${f.label}: ${f.value}`).join('\n')}${r.auditFlags.length ? `\n\n${r.auditFlags.join('\n')}` : ''}`,
                  timestamp: new Date().toISOString(),
                }));
                setVisualReports((prev) => [...prev, ...reports]);
                }
            }
            if (payload.error) {
              setConvs((prev) => prev.map((c) => {
                if (c.id !== activeId) return c;
                const msgs = [...c.messages];
                msgs[streamIndex] = { role: "assistant", content: payload.error };
                return { ...c, messages: msgs };
              }));
            }
          } catch { /* linha incompleta, ignora */ }
        }
      }
    } catch (err) {
      setIsSearching(false);
      if ((err as Error).name !== "AbortError") {
        updateConv(activeId, [...updated, { role:"assistant", content:"Não foi possível completar esta ação no momento. Deseja tentar novamente?" }]);
      }
    } finally { setIsLoading(false); setIsSearching(false); abortRef.current = null; }
  };

  const handleEmailSent = (to: string, subject: string) => {
    const conv = conversations.find((c) => c.id === activeId);
    const msgs = conv?.messages ?? [];
    updateConv(activeId, [...msgs, { role:"assistant", content:`E-mail enviado para ${to}.\nAssunto: ${subject}` }]);
  };

  const handleWhatsAppSent = (number: string) => {
    showToast(`Mensagem enviada para +${number.replace(/\D/g,"")}`, "success");
    const conv = conversations.find((c) => c.id === activeId);
    const msgs = conv?.messages ?? [];
    updateConv(activeId, [...msgs, { role:"assistant", content:`WhatsApp enviado para +${number.replace(/\D/g,"")}. Registro salvo no Supabase.` }]);
  };

  const handleLogout = () => {
    localStorage.removeItem("kronos_username");
    router.push("/login");
  };
  const initials = username.slice(0,2).toUpperCase();
  const modeCfg  = getModeConfig(mode);

  if (redirecting || !hydrated) return (
    <div className="flex h-screen bg-zinc-950 items-center justify-center"><KronosAvatar size={40} /></div>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Topo: Logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <KronosAvatar size={26} />
          <div><span className="text-sm font-semibold text-zinc-100">Kronos</span><span className="text-sm font-light text-zinc-500">.ai</span></div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto p-1 text-zinc-600 hover:text-zinc-300 md:hidden"><X strokeWidth={1.5} className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Nova Conversa */}
      <div className="px-3 pb-3">
        <button onClick={() => handleNewConv()} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-medium transition-all border border-zinc-800 hover:border-zinc-700 group">
          <div className="w-5 h-5 rounded-md bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-all border border-zinc-700 group-hover:border-zinc-600">
            <Plus strokeWidth={2} className="w-3 h-3" />
          </div>
          Nova conversa
        </button>
      </div>

      {/* Kronos Studio */}
      <div className="px-3 pb-3">
        <button onClick={() => { setCurrentView('studio'); setSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${currentView === 'studio' ? 'bg-gradient-to-r from-violet-700 to-blue-600 text-white border border-blue-500/40 shadow-lg shadow-blue-500/10' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700/50'}`}>
          <Sparkles strokeWidth={1.5} className="w-4 h-4" />
          Kronos Studio
        </button>
      </div>

      {/* Centro: Lista de conversas */}
      <div className="px-2 flex-1 overflow-y-auto">
        <p className="text-[10px] font-medium text-zinc-700 uppercase tracking-widest px-2 mb-1.5">Histórico</p>
        <FileExplorer conversations={conversations} activeId={activeId} onSelect={(id)=>{setActiveId(id);setSidebarOpen(false);}} onNew={handleNewConv} onDelete={handleDeleteConv} onRename={handleRenameConv} />
      </div>

      {/* Rodapé: Modos + Perfil */}
      <div className="border-t border-zinc-900 mt-2">
        {/* Seletor de modo — só Projetos visível */}
        <div className="px-3 pt-3 pb-2 space-y-0.5">
          {([
            { value: "profissional" as KronosMode, label: "Projetos", icon: Briefcase, color: "text-blue-400" },
          ] as { value: KronosMode; label: string; icon: React.ElementType; color: string }[]).map(({ value, label, icon: Icon, color }) => {
            const active = mode === value;
            return (
              <button
                key={value}
                onClick={() => handleModeChange(value)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                }`}
              >
                <Icon strokeWidth={1.5} className={`w-3.5 h-3.5 shrink-0 ${active ? color : "text-zinc-600"}`} />
                <span>{label}</span>
                {active && <div className={`ml-auto w-1.5 h-1.5 rounded-full ${color.replace("text-", "bg-")}`} />}
              </button>
            );
          })}
        </div>

        {/* Perfil do usuário */}
        <div className="px-3 py-3 border-t border-zinc-900">
          <div className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium text-zinc-300 truncate">{username}</span>
              <span className="text-[9px] text-zinc-600 capitalize">{modeCfg.label}</span>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded-md text-zinc-700 hover:text-red-400 hover:bg-zinc-800/60 transition-all opacity-0 group-hover:opacity-100" title="Sair">
              <LogOut strokeWidth={1.5} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden" style={{ fontFamily:"'Inter','SF Pro Display',system-ui,sans-serif" }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
    >
      {showEmailComposer && (
        <EmailComposer username={username} defaultTo={emailDefaults.to} defaultSubject={emailDefaults.subject} defaultBody={emailDefaults.body}
          defaultAttachments={emailAttachFiles}
          onClose={() => { setShowEmailComposer(false); setEmailAttachFiles([]); }} onSent={handleEmailSent} />
      )}

      {showWhatsApp && (
        <WhatsAppComposer username={username} onClose={() => setShowWhatsApp(false)} onSent={handleWhatsAppSent} />
      )}

      {/* Toast - Glass theme */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium transition-all backdrop-blur-xl
          ${toast.type === "success"
            ? "bg-emerald-950/70 border-emerald-700/50 text-emerald-300"
            : "bg-red-950/70 border-red-700/50 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      {sidebarOpen && <div className="fixed inset-0 bg-black/70 z-30 md:hidden backdrop-blur-sm" onClick={()=>setSidebarOpen(false)} />}

      {/* Sidebar Esquerda - Glass Theme */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 border-r border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl transition-transform duration-300 ease-in-out ${sidebarOpen?"translate-x-0":"-translate-x-full md:translate-x-0"}`}>
        {sidebarContent}
      </aside>

      <main className="flex-1 flex flex-col h-screen bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 relative min-w-0">
        <ProgressBar active={isLoading} searching={isSearching} />

        {/* Header minimalista */}
        <header className="h-12 border-b border-zinc-800/30 flex items-center justify-between px-4 bg-zinc-950/60 backdrop-blur-xl sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={()=>setSidebarOpen(true)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 backdrop-blur-sm transition-all md:hidden"><Menu strokeWidth={1.5} className="w-4 h-4" /></button>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 shrink-0" />
              <span className="text-xs text-zinc-400 font-medium truncate max-w-[140px] sm:max-w-xs">{viewLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(mediaItems.length > 0 || visualReports.length > 0) && (
              <button
                onClick={() => setShowWorkstation(!showWorkstation)}
                className={`p-1.5 rounded-lg border backdrop-blur-sm text-xs font-medium transition-all shadow-sm flex items-center gap-1.5 ${
                  showWorkstation
                    ? "border-blue-700/50 bg-blue-900/40 text-blue-300"
                    : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/50"
                }`}
                title="Workstation"
              >
                <Image strokeWidth={1.5} className="w-4 h-4" />
                <span className="hidden sm:inline">{mediaItems.length + visualReports.length}</span>
              </button>
            )}
            <button
              onClick={() => setShowStudyKids(true)}
              className="p-1.5 rounded-lg border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/50 transition-all shadow-sm"
              title="Kronos Study & Kids"
            >
              <BookOpen strokeWidth={1.5} className="w-4 h-4" />
            </button>
            <button onClick={()=>{setEmailDefaults({to:"",subject:"",body:""});setEmailAttachFiles([]);setShowEmailComposer(true);}} className="p-1.5 rounded-lg border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/50 transition-all shadow-sm" title="Novo e-mail">
              <Mail strokeWidth={1.5} className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-zinc-600 font-mono hidden sm:block">120B</span>
          </div>
        </header>

        {/* Área central de chat ou Studio — ampla e limpa */}
        <section className="flex-1 overflow-y-auto overscroll-contain">
          {currentView === 'studio' ? (
            <div className="max-w-5xl mx-auto px-4 py-8">
              <KronosStudio username={username} mode={mode} onBack={() => setCurrentView('chat')} />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {messages.map((msg, i) => {
              const { text, table } = msg.role==="assistant" ? parseExportTable(msg.content) : { text:msg.content, table:null };
              return (
                <div key={i} className={`flex gap-3 ${msg.role==="user"?"justify-end":"justify-start"}`}>
                  {msg.role!=="user" && <div className="shrink-0 mt-0.5"><KronosAvatar size={30} /></div>}
                  <div className={msg.role==="user"?"max-w-[85%]":"flex-1 min-w-0"}>
                    <div className={`group relative px-4 py-3.5 text-sm leading-relaxed rounded-2xl shadow-sm ${msg.role==="user"?"bg-zinc-800/60 backdrop-blur-sm text-zinc-100 rounded-tr-sm border border-zinc-700/30":"text-zinc-300 bg-zinc-900/20 backdrop-blur-sm border border-zinc-800/40 rounded-tl-sm"}`}>
                      <p className="whitespace-pre-line break-words">{text}</p>
                      {text && (
                        <button
                          onClick={() => handleCopyMessage(text, i)}
                          className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60"
                          title="Copiar"
                        >
                          {copiedId === i
                            ? <Check strokeWidth={2} className="w-3 h-3 text-emerald-400" />
                            : <Copy strokeWidth={1.5} className="w-3 h-3" />
                          }
                        </button>
                      )}
                    </div>
                    {/* Imagens vão exclusivamente para a Workstation — zero no chat */}
                    {table && (
                      <Suspense fallback={<div className="mt-3 h-16 rounded-lg bg-zinc-900/20 backdrop-blur-sm animate-pulse border border-zinc-800/30" />}>
                        <ChatExporter table={{ title:table.title, headers:table.headers, rows:table.rows }} subtitle={table.subtitle} />
                      </Suspense>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="shrink-0 mt-0.5"><KronosAvatar size={30} spinning /></div>
                <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-zinc-900/20 backdrop-blur-sm border border-zinc-800/40 shadow-sm">
                  {isSearching
                    ? <div className="flex items-center gap-2"><Globe strokeWidth={1.5} className="w-3.5 h-3.5 text-blue-400 animate-pulse" /><span className="text-xs text-zinc-500">Processando...</span></div>
                    : <div className="flex gap-1 items-center h-4">
                        <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay:"0ms"}} />
                        <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay:"150ms"}} />
                        <span className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay:"300ms"}} />
                      </div>
                  }
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          )}
        </section>

        {currentView !== 'studio' && (
          <footer className="border-t border-zinc-800/30 px-4 py-3 bg-zinc-950/60 backdrop-blur-xl shrink-0 shadow-2xl">
          <div className="max-w-3xl mx-auto space-y-2">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {attachedFiles.map((af,i) => (
                  <div key={i} className="relative group">
                    {af.preview
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={af.preview} alt={af.file.name} className="w-14 h-14 rounded-lg object-cover border border-zinc-700/50 shadow-md" />
                      : <div className="w-14 h-14 rounded-lg border border-zinc-700/50 bg-zinc-900/50 backdrop-blur-sm flex flex-col items-center justify-center gap-1 shadow-md"><FileText strokeWidth={1.5} className="w-4 h-4 text-zinc-500" /><span className="text-[9px] text-zinc-600 px-1 truncate w-full text-center">{af.file.name.slice(0,7)}</span></div>
                    }
                    <button onClick={()=>removeFile(i)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-700/90 backdrop-blur-sm hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg">
                      <X strokeWidth={2} className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <button type="button" onClick={()=>fileInputRef.current?.click()} className="p-3 rounded-xl border border-zinc-800/50 bg-zinc-900/40 backdrop-blur-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-700/50 transition-all shadow-sm shrink-0" title="Anexar arquivo"><Paperclip strokeWidth={1.5} className="w-4 h-4" /></button>
              <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleFileChange} />
              <div className="relative flex-1">
                {showCommandBar && (
                  <CommandBarMenu
                    query={commandQuery}
                    onSelect={handleCommandSelect}
                    onClose={() => { setShowCommandBar(false); setCommandQuery(""); }}
                  />
                )}
                <input ref={inputRef} type="text" value={input} onChange={handleInputChange}
                  placeholder={attachedFiles.length>0?"Instrução opcional...":"Mensagem ou / para comandos..."}
                  className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 rounded-xl py-3 pl-4 pr-11 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600/60 focus:bg-zinc-900/60 transition-all shadow-sm"
                  disabled={isLoading} autoComplete="off" autoCorrect="off" autoCapitalize="off"
                />
                {isLoading
                  ? <button type="button" onClick={handleStop} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-red-900/60 backdrop-blur-sm hover:bg-red-800 text-red-400 transition-all shadow-md" title="Parar"><Square strokeWidth={1.5} className="w-4 h-4" /></button>
                  : <button type="submit" disabled={!input.trim()&&!attachedFiles.length} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-zinc-200 text-zinc-900 hover:bg-white disabled:bg-zinc-800/60 disabled:text-zinc-600 transition-all shadow-md"><Send strokeWidth={1.5} className="w-4 h-4" /></button>
                }
              </div>
            </form>
            <p className="text-center text-[10px] text-zinc-800 hidden sm:block">{modeCfg.label}</p>
          </div>
        </footer>
        )}
      </main>

      {/* Sidebar Direita - Workstation */}
      {showWorkstation && (
        <MediaWorkstation
          media={mediaItems}
          visualReports={visualReports}
          mode={mode}
          username={username}
          notificationBadge={notificationBadge}
          cognitiveStatus={cognitiveStatus}
          onNotificationCount={(count) => setNotificationBadge(count)}
          recentTopics={messages
            .filter((m) => m.role === "user")
            .slice(-6)
            .map((m) => m.content.replace(/\n.*$/,"").trim().slice(0, 50))
            .filter(Boolean)
          }
          onClose={() => setShowWorkstation(false)}
        />
      )}

      {/* Kronos Learning Hub */}
      {showStudyKids && (
        <KronosLearningHub username={username} onClose={() => setShowStudyKids(false)} />
      )}
    </div>
  );
}
