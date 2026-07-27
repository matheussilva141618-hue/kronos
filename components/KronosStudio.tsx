"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, Sparkles, Send, Download, Square, Copy, Check } from "lucide-react";
import KronosAvatar from "@/components/KronosAvatar";

interface KronosStudioProps {
  username: string;
  mode: string;
  onBack: () => void;
}

interface StudioResult {
  summary: string;
  code: string;
  framework: string;
  components: string[];
}

export default function KronosStudio({ username, mode, onBack }: KronosStudioProps) {
  const [prompt, setPrompt]       = useState("");
  const [goal, setGoal]           = useState("landing page");
  const [result, setResult]       = useState<StudioResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState("");
  const [copied, setCopied]       = useState(false);
  const [tab, setTab]             = useState<"code" | "preview">("code");
  const abortRef                  = useRef<AbortController | null>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [prompt]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError("");
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, goal, theme: "corporate", username, mode }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Falha ao gerar."); return; }
      setResult({
        summary:    data.summary    || "",
        code:       data.code       || "",
        framework:  data.framework  || "React + Tailwind",
        components: data.components || [],
      });
      setTab("code");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Erro de conexão.");
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleCopy = () => {
    if (!result?.code) return;
    navigator.clipboard.writeText(result.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!result?.code) return;
    const blob = new Blob([result.code], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `kronos-studio-${goal.replace(/\s+/g, "-")}.tsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Build preview HTML from generated code
  const previewHtml = result?.code
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"/><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-white">${extractJSX(result.code)}</body></html>`
    : "";

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ─── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-all text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <KronosAvatar size={22} />
          <span className="text-xs font-semibold text-zinc-300 tracking-tight">Kronos Studio</span>
          <span className="text-[10px] text-zinc-600 px-2 py-0.5 rounded-full border border-zinc-800">beta</span>
        </div>
      </div>

      {/* ─── Input area ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm p-4 mb-4">
        <div className="flex gap-3 mb-3">
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none transition-colors"
          >
            <option value="landing page">Landing page</option>
            <option value="dashboard">Dashboard</option>
            <option value="web app">Web app</option>
            <option value="admin portal">Admin portal</option>
            <option value="mobile app">Mobile app</option>
          </select>
          <span className="text-[10px] text-zinc-600 self-center">React + Tailwind · geração instantânea</span>
        </div>

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder="Descreva o que quer criar... (Ctrl+Enter para gerar)"
            className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 pr-14 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none transition-colors leading-relaxed"
            disabled={isLoading}
          />
          <div className="absolute bottom-3 right-3">
            {isLoading ? (
              <button
                onClick={handleStop}
                className="p-2 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-400 transition-all"
                title="Parar"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="p-2 rounded-lg bg-zinc-100 text-zinc-900 hover:bg-white disabled:bg-zinc-800/60 disabled:text-zinc-600 transition-all"
                title="Gerar (Ctrl+Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* ─── Loading state ───────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-zinc-800/40 bg-zinc-900/30 mb-4">
          <KronosAvatar size={20} spinning />
          <span className="text-xs text-zinc-500">Gerando código...</span>
          <div className="flex gap-1 ml-auto">
            {[0,1,2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Result area ─────────────────────────────────────── */}
      {result && (
        <div className="flex-1 flex flex-col rounded-2xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm overflow-hidden">

          {/* Tab bar + actions */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/60 shrink-0">
            <div className="flex gap-1">
              {(["code", "preview"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    tab === t
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t === "code" ? "Código" : "Preview"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              {result.framework && <span className="px-2 py-0.5 rounded-full border border-zinc-800">{result.framework}</span>}
              {result.components.length > 0 && <span className="px-2 py-0.5 rounded-full border border-zinc-800">{result.components.length} componentes</span>}
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
                title="Copiar código"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleDownload}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all"
                title="Baixar .tsx"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {tab === "code" ? (
              <pre className="px-5 py-4 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
                {result.code}
              </pre>
            ) : (
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full min-h-[400px] border-0"
                sandbox="allow-scripts"
                title="Preview"
              />
            )}
          </div>

          {/* Summary strip */}
          {result.summary && (
            <div className="px-4 py-2.5 border-t border-zinc-800/40 text-xs text-zinc-500 leading-relaxed shrink-0">
              {result.summary}
            </div>
          )}
        </div>
      )}

      {/* ─── Empty state ─────────────────────────────────────── */}
      {!result && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-600 max-w-xs">
            Descreva o que quer construir acima. O Kronos gera o código completo pronto para usar.
          </p>
        </div>
      )}
    </div>
  );
}

// Extrai JSX renderizável para o iframe preview (simplificado)
function extractJSX(code: string): string {
  // Remove imports, exports e wrappers React para extrair HTML puro
  return code
    .replace(/^import\s+.*$/gm, "")
    .replace(/^export\s+(default\s+)?function\s+\w+[^{]*\{/, "")
    .replace(/^export\s+default\s+\w+;?$/gm, "")
    .replace(/return\s*\(\s*/, "")
    .replace(/\);\s*}?\s*$/, "")
    .replace(/className=/g, "class=")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .trim();
}
