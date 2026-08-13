"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, Loader2, X, Waves } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type VoiceStatus = "idle" | "listening" | "processing" | "speaking" | "error";

interface VoiceWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
  onResponse?: (text: string) => void;
  autoSend?: boolean;
}

// ─── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = "http://127.0.0.1:8001";

// ─── Componente ───────────────────────────────────────────────────────────────

export default function VoiceWidget({
  isOpen,
  onClose,
  onTranscript,
  onResponse,
  autoSend = true,
}: VoiceWidgetProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasSentRef = useRef(false);

  // ── Cleanup ao fechar ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      stopSpeaking();
      setStatus("idle");
      setError(null);
      setTranscript("");
      setInterim("");
      hasSentRef.current = false;
    }
  }, [isOpen]);

  // ── Inicializa microfone automaticamente quando abre ────────────────────────
  useEffect(() => {
    if (isOpen && status === "idle") {
      startListening();
    }
  }, [isOpen]);

  // ── Áudio: visualizador de ondas ───────────────────────────────────────────
  const visualize = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(100, (avg / 255) * 100 * 2.5));
      animFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  // ── Iniciar escuta ─────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Visualizador
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      visualize();

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        await sendToSTT(blob);
      };

      mediaRecorder.start(250); // coleta em chunks de 250ms
      setStatus("listening");
      hasSentRef.current = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao acessar microfone";
      setError(msg);
      setStatus("error");
      console.error("[VoiceWidget] Erro microfone:", err);
    }
  }, [visualize]);

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const currentAudio = document.querySelector("audio");
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.remove();
    }
  }, []);

  // ── Parar escuta ────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      try { mediaRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
      analyserRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // ── Enviar áudio para STT (backend Python) ─────────────────────────────────
  const sendToSTT = useCallback(async (blob: Blob) => {
    setStatus("processing");
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const res = await fetch(`${API_BASE}/stt`, {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: arrayBuffer,
      });
      if (!res.ok) throw new Error(`STT falhou: ${res.status}`);
      const data = await res.json();
      const text = data.transcript?.trim() ?? "";
      if (text) {
        setTranscript(text);
        onTranscript(text);
        if (autoSend && !hasSentRef.current) {
          hasSentRef.current = true;
          // Dispara o envio para o chat principal
          window.dispatchEvent(new CustomEvent("kronos:voice-transcript", { detail: text }));
        }
      }
      // Reinicia escuta para fluxo contínuo
      startListening();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no reconhecimento";
      setError(msg);
      setStatus("error");
      console.error("[VoiceWidget] STT erro:", err);
      // Tenta recuperar
      setTimeout(() => {
        if (isOpen) startListening();
      }, 2000);
    }
  }, [onTranscript, autoSend, isOpen, startListening]);

  // ── Speak: reproduz resposta em áudio via backend Python TTS ───────────────
  const speak = useCallback(async (text: string) => {
    setStatus("speaking");
    stopListening(); // pausa microfone enquanto fala
    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "pt_BR", tone: "neutral", rate: 1.0, pitch: 1.0 }),
      });
      if (!res.ok) throw new Error(`TTS falhou: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        audio.play().catch(reject);
      });
      onResponse?.(text);
    } catch (err) {
      console.error("[VoiceWidget] TTS erro:", err);
      setError("Falha na síntese de voz");
      setStatus("error");
    } finally {
      // Retoma escuta
      if (isOpen && status !== "error") {
        startListening();
      }
    }
  }, [isOpen, onResponse, startListening, status]);

  // ── Expor função speak para o componente pai ────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    (window as unknown as Record<string, unknown>).__kronos_voice_speak = speak;
    return () => { delete (window as unknown as Record<string, unknown>).__kronos_voice_speak; };
  }, [isOpen, speak]);

  // ── Auto-stop após silêncio prolongado ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen || status !== "listening") return;
    const timer = setInterval(() => {
      if (audioLevel < 3 && !hasSentRef.current) {
        // Silêncio detectado — não faz nada, apenas aguarda
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [isOpen, status, audioLevel]);

  // ── Fallback: se Backend cair, usa Web Speech API ──────────────────────────
  const fallbackSpeak = useCallback((text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "pt-BR";
      utter.rate = 1.0;
      window.speechSynthesis.speak(utter);
    }
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  const statusLabel: Record<VoiceStatus, string> = {
    idle: "Inativo",
    listening: "Ouvindo...",
    processing: "Processando...",
    speaking: "Falando...",
    error: "Erro",
  };

  const statusColor: Record<VoiceStatus, string> = {
    idle: "text-zinc-400",
    listening: "text-emerald-400",
    processing: "text-blue-400",
    speaking: "text-violet-400",
    error: "text-red-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-md mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5 text-violet-400" />
            <span className="text-sm font-medium text-zinc-200">Conversa por voz</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visualizador e Status */}
        <div className="px-5 py-8 flex flex-col items-center gap-4">
          {/* Animação de ondas */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full bg-violet-900/30 blur-xl transition-all duration-300"
              style={{ transform: `scale(${1 + audioLevel / 100})` }}
            />
            <div className={`p-4 rounded-full border ${status === "listening" ? "border-emerald-500/50 bg-emerald-900/20" : status === "speaking" ? "border-violet-500/50 bg-violet-900/20" : "border-zinc-700 bg-zinc-900"}`}>
              {status === "listening" ? (
                <Mic className="w-8 h-8 text-emerald-400" />
              ) : status === "speaking" ? (
                <Volume2 className="w-8 h-8 text-violet-400" />
              ) : status === "processing" ? (
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              ) : status === "error" ? (
                <MicOff className="w-8 h-8 text-red-400" />
              ) : (
                <Mic className="w-8 h-8 text-zinc-500" />
              )}
            </div>
          </div>

          {/* Status */}
          <div className="text-center">
            <p className={`text-sm font-medium ${statusColor[status]}`}>
              {statusLabel[status]}
            </p>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>

          {/* Transcripto parcial */}
          {(transcript || interim) && (
            <div className="w-full px-4 py-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <p className="text-xs text-zinc-400 mb-1">Você disse:</p>
              <p className="text-sm text-zinc-200">
                {transcript}
                {interim && <span className="text-zinc-500 italic"> {interim}</span>}
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-2 w-full">
            {status === "listening" ? (
              <button
                onClick={stopListening}
                className="flex-1 py-2.5 rounded-xl bg-red-900/60 text-red-200 text-sm hover:bg-red-800 transition"
              >
                Parar
              </button>
            ) : (
              <button
                onClick={startListening}
                disabled={status === "processing" || status === "speaking"}
                className="flex-1 py-2.5 rounded-xl bg-emerald-900/60 text-emerald-200 text-sm hover:bg-emerald-800 transition disabled:opacity-50"
              >
                {status === "processing" || status === "speaking" ? "Aguarde..." : "Ouvir novamente"}
              </button>
            )}
            <button
              onClick={() => { stopSpeaking(); onClose(); }}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition"
            >
              Fechar
            </button>
          </div>

          {/* Fallback info */}
          <p className="text-[10px] text-zinc-600 text-center">
            Backend: {API_BASE} • Fallback: Web Speech API
          </p>
        </div>
      </div>
    </div>
  );
}