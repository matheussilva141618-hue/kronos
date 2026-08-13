/**
 * KRONOS — Hook de voz neural
 * Estado unificado para Speech-to-Text + Text-to-Speech com backend Python.
 */

import { useState, useEffect, useRef, useCallback } from "react";

type VoiceStatus = "idle" | "listening" | "processing" | "speaking" | "error";

const API_BASE = `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"}`;

export function useVoice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasSentRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.remove();
      } catch {}
      currentAudioRef.current = null;
    }
  }, []);

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
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

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

      mediaRecorder.start(250);
      setStatus("listening");
      hasSentRef.current = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao acessar microfone";
      setError(msg);
      setStatus("error");
    }
  }, []);

  const sendToSTT = useCallback(async (blob: Blob) => {
    setStatus("processing");
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const res = await fetch(`${API_BASE}/api/voice/stt`, {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: arrayBuffer,
      });
      if (!res.ok) throw new Error(`STT falhou: ${res.status}`);
      const data = await res.json();
      const text = (data.transcript || "").trim();
      if (text) {
        setTranscript(text);
        setInterim("");
        window.dispatchEvent(new CustomEvent("kronos:voice-transcript", { detail: text }));
      }
      startListening();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no reconhecimento";
      setError(msg);
      setStatus("error");
      setTimeout(() => { if (status !== "error") startListening(); }, 2000);
    }
  }, [startListening]);

  const speak = useCallback(async (text: string) => {
    setStatus("speaking");
    stopListening();
    try {
      const res = await fetch(`${API_BASE}/api/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "pt_BR", rate: 1.0, pitch: 1.0 }),
      });
      if (!res.ok) throw new Error(`TTS falhou: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Falha ao reproduzir áudio")); };
        audio.play().catch(reject);
      });
    } catch (err) {
      console.error("[useVoice] TTS erro:", err);
      setError("Falha na síntese de voz");
      setStatus("error");
    } finally {
      if (status !== "error") {
        startListening();
      }
    }
  }, [startListening, stopListening, status]);

  const toggle = useCallback(() => {
    if (status === "listening" || status === "processing") {
      stopListening();
      stopSpeaking();
      setStatus("idle");
    } else if (status === "speaking") {
      stopSpeaking();
      setStatus("idle");
    } else {
      setError(null);
      startListening();
    }
  }, [status, startListening, stopListening, stopSpeaking]);

  const cleanup = useCallback(() => {
    stopListening();
    stopSpeaking();
    setStatus("idle");
    setError(null);
    setTranscript("");
    setInterim("");
    hasSentRef.current = false;
  }, [stopListening, stopSpeaking]);

  return {
    status,
    error,
    transcript,
    interim,
    toggle,
    speak,
    startListening,
    stopListening,
    stopSpeaking,
    cleanup,
    isActive: status === "listening" || status === "processing" || status === "speaking",
  };
}