"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, ImageOff, Loader2, RefreshCw } from "lucide-react";

interface GeneratedImageProps {
  prompt:    string;
  imageUrl:  string;
}

type Status = "loading" | "loaded" | "error";

export default function GeneratedImage({ prompt, imageUrl }: GeneratedImageProps) {
  const [status,   setStatus]   = useState<Status>("loading");
  const [attempts, setAttempts] = useState(0);
  const [elapsed,  setElapsed]  = useState(0);

  useEffect(() => {
    setStatus("loading");
    setAttempts(0);
    setElapsed(0);
  }, [imageUrl]);

  // Contador de segundos enquanto carrega
  useEffect(() => {
    if (status !== "loading") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const handleError = useCallback(() => {
    if (attempts < 2) {
      setTimeout(() => {
        setAttempts((a) => a + 1);
        setStatus("loading");
        setElapsed(0);
      }, 4000);
    } else {
      setStatus("error");
    }
  }, [attempts]);

  const handleDownload = async () => {
    try {
      const res  = await fetch(imageUrl);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `kronos-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, "_blank");
    }
  };

  const src = attempts > 0 ? `${imageUrl}&retry=${attempts}` : imageUrl;

  const loadingMsg = elapsed < 5
    ? "Gerando imagem..."
    : elapsed < 15
    ? "Processando detalhes..."
    : elapsed < 25
    ? "Quase pronto..."
    : "Finalizando renderização...";

  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900/30 max-w-sm">

      {/* Imagem */}
      <div className="relative bg-zinc-950 aspect-square flex items-center justify-center overflow-hidden">

        {/* Spinner */}
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 z-10">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-2 border-zinc-800" />
              <div className="absolute inset-0 w-14 h-14 rounded-full border-2 border-t-emerald-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 strokeWidth={1} className="w-6 h-6 text-zinc-600 animate-spin" style={{ animationDirection: "reverse", animationDuration: "2s" }} />
              </div>
            </div>
            <div className="text-center space-y-1 px-4">
              <p className="text-xs text-zinc-300 font-medium">{loadingMsg}</p>
              <p className="text-[10px] text-zinc-600">
                {attempts > 0 ? `Tentativa ${attempts + 1}/3` : `${elapsed}s`}
              </p>
            </div>
          </div>
        )}

        {/* Erro */}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 z-10 p-4">
            <ImageOff strokeWidth={1.5} className="w-8 h-8 text-zinc-700" />
            <div className="text-center space-y-3">
              <p className="text-xs text-zinc-400">A API visual não retornou uma imagem válida.</p>
              <a href={imageUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition">
                <RefreshCw strokeWidth={1.5} className="w-3 h-3" />
                Tentar abrir diretamente
              </a>
            </div>
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt={prompt}
          className={`w-full h-full object-cover transition-opacity duration-700 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setStatus("loaded")}
          onError={handleError}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-zinc-800 gap-2">
        <span className="text-[11px] text-zinc-600 truncate flex-1 italic">{prompt}</span>
        <button
          onClick={handleDownload}
          disabled={status !== "loaded"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 text-[11px] font-medium hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          <Download strokeWidth={1.5} className="w-3.5 h-3.5" />
          Salvar
        </button>
      </div>
    </div>
  );
}
