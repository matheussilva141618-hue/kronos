"use client";

import { useState, useEffect } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle, MessageCircle, ArrowLeft, ShieldAlert } from "lucide-react";

interface WhatsAppComposerProps {
  username: string;
  onClose:  () => void;
  onSent:   (number: string) => void;
}

type Step = "form" | "confirm" | "sending" | "done" | "error";

export default function WhatsAppComposer({ username, onClose, onSent }: WhatsAppComposerProps) {
  const [step,    setStep]    = useState<Step>("form");
  const [number,  setNumber]  = useState("");
  const [message, setMessage] = useState("");
  const [errMsg,  setErrMsg]  = useState("");

  // Fecha no Escape (exceto durante envio)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "sending") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [step, onClose]);

  const handleConfirm = () => {
    const clean = number.replace(/\D/g, "");
    if (clean.length < 10) { setErrMsg("Número inválido. Ex: 5511999998888"); return; }
    if (!message.trim())   { setErrMsg("Mensagem não pode estar vazia."); return; }
    setErrMsg("");
    setStep("confirm");
  };

  const handleSend = async () => {
    setStep("sending");
    try {
      const res  = await fetch("/api/whatsapp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ number, message, username }),
      });
      const data = await res.json();

      if (data.success) {
        setStep("done");
        setTimeout(() => { onSent(number); onClose(); }, 2000);
      } else {
        setErrMsg(data.error ?? "Falha no envio.");
        setStep("error");
      }
    } catch {
      setErrMsg("Erro de conexão com o servidor.");
      setStep("error");
    }
  };

  const displayNumber = number.replace(/\D/g, "");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={step !== "sending" ? onClose : undefined} />

      <div className="relative w-full sm:max-w-md bg-[#111113] border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <MessageCircle strokeWidth={1.5} className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-zinc-200">WhatsApp</span>
            {step === "confirm" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-950 border border-yellow-900 text-yellow-400">Confirmar</span>
            )}
          </div>
          <button onClick={onClose} disabled={step === "sending"}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30">
            <X strokeWidth={1.5} className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── STEP: form ── */}
          {(step === "form" || step === "error") && (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Número</label>
                <input
                  type="tel"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="5511999998888"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors font-mono"
                />
                <p className="text-[10px] text-zinc-700">DDI + DDD + número, sem espaços ou hífens</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Mensagem</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  rows={4}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
                />
              </div>

              {(errMsg || step === "error") && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900">
                  <AlertCircle strokeWidth={1.5} className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-red-400">{errMsg}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={handleConfirm} disabled={!number || !message}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Send strokeWidth={1.5} className="w-4 h-4" />
                  Continuar
                </button>
              </div>
            </>
          )}

          {/* ── STEP: confirm ── */}
          {step === "confirm" && (
            <>
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-yellow-950/30 border border-yellow-900/60">
                <ShieldAlert strokeWidth={1.5} className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-yellow-300">Confirme antes de enviar</p>
                  <p className="text-xs text-zinc-500">Esta ação disparará uma mensagem real de WhatsApp.</p>
                </div>
              </div>

              <div className="space-y-2 bg-zinc-900/40 border border-zinc-800 rounded-lg px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <span className="text-zinc-600 text-xs w-20 shrink-0 pt-0.5">Para</span>
                  <span className="text-zinc-300 font-mono text-xs">+{displayNumber}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-zinc-600 text-xs w-20 shrink-0 pt-0.5">Mensagem</span>
                  <span className="text-zinc-300 text-xs leading-relaxed line-clamp-4">{message}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setStep("form"); setErrMsg(""); }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
                  <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button type="button" onClick={handleSend}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors">
                  <Send strokeWidth={1.5} className="w-4 h-4" />
                  Enviar agora
                </button>
              </div>
            </>
          )}

          {/* ── STEP: sending ── */}
          {step === "sending" && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 strokeWidth={1.5} className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-sm text-zinc-400">Enviando mensagem...</p>
            </div>
          )}

          {/* ── STEP: done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-900 flex items-center justify-center">
                <CheckCircle2 strokeWidth={1.5} className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-emerald-300">Mensagem enviada!</p>
              <p className="text-xs text-zinc-600">Registrado no log do Kronos</p>
            </div>
          )}

          <p className="text-center text-[10px] text-zinc-800">
            Kronos AI · WhatsApp via Evolution API · Log salvo no Supabase
          </p>
        </div>
      </div>
    </div>
  );
}
