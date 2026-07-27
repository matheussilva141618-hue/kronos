"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, Mail, Loader2, CheckCircle2, AlertCircle, Paperclip, FileText, ShieldAlert, ArrowLeft } from "lucide-react";

type AttachmentFile = { file: File; base64: string };
type Step = "form" | "confirm" | "sending" | "sent" | "error";
const MAX_BYTES = 5 * 1024 * 1024;

function fmtBytes(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

type Props = {
  username: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  defaultAttachments?: File[];
  onClose: () => void;
  onSent: (to: string, subject: string) => void;
};

export default function EmailComposer(props: Props) {
  const { username, defaultTo = "", defaultSubject = "", defaultBody = "", defaultAttachments = [], onClose, onSent } = props;
  const [to, setTo]         = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody]     = useState(defaultBody);
  const [atts, setAtts]     = useState<AttachmentFile[]>([]);
  const [step, setStep]     = useState<Step>("form");
  const [errMsg, setErrMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!defaultAttachments.length) return;
    let alive = true;
    Promise.all(defaultAttachments.map(async (f) => ({ file: f, base64: await toBase64(f) })))
      .then((r) => { if (alive) setAtts(r); })
      .catch(() => { if (alive) { setErrMsg("Erro ao ler anexos."); setStep("error"); } });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      if (f.size > MAX_BYTES) { setErrMsg(`"${f.name}" ultrapassa 5 MB.`); setStep("error"); return; }
      setAtts((p) => [...p, { file: f, base64: "" }]);
      toBase64(f).then((b64) => setAtts((p) => p.map((a) => a.file === f ? { ...a, base64: b64 } : a)));
    }
    setErrMsg("");
    if (step === "error") setStep("form");
  };

  const send = async () => {
    setStep("sending");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(), subject: subject.trim(), text: body.trim(), username,
          attachments: atts.map((a) => ({ filename: a.file.name, content: a.base64, mimeType: a.file.type || "application/octet-stream" })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("sent");
        setTimeout(() => { onSent(to.trim(), subject.trim()); onClose(); }, 1500);
      } else {
        setErrMsg(data.error || "Erro ao enviar."); setStep("error");
      }
    } catch {
      setErrMsg("Erro de conexão. Tente novamente."); setStep("error");
    }
  };

  const busy = step === "sending" || step === "sent";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!busy ? onClose : undefined} />
      <div className="relative w-full sm:max-w-lg bg-[#111113] border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <Mail strokeWidth={1.5} className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200">Novo E-mail</span>
            {step === "confirm" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-950 border border-yellow-900 text-yellow-400">Confirmar</span>}
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30">
            <X strokeWidth={1.5} className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {(step === "form" || step === "error") && (
            <div className="space-y-4">
              {step === "error" && errMsg && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-900">
                  <AlertCircle strokeWidth={1.5} className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-red-400">{errMsg}</span>
                </div>
              )}
              {(["Para", "Assunto"] as const).map((lbl) => (
                <div key={lbl} className="space-y-1.5">
                  <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{lbl}</label>
                  <input
                    type={lbl === "Para" ? "email" : "text"}
                    value={lbl === "Para" ? to : subject}
                    onChange={(e) => lbl === "Para" ? setTo(e.target.value) : setSubject(e.target.value)}
                    placeholder={lbl === "Para" ? "destinatario@email.com" : "Assunto do e-mail"}
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Mensagem</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Digite sua mensagem..." rows={4}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Anexos</label>
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                    <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
                <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv" onChange={addFiles} />
                {atts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <FileText strokeWidth={1.5} className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span className="text-xs text-zinc-300 flex-1 truncate">{a.file.name}</span>
                    <span className="text-[10px] text-zinc-600">{fmtBytes(a.file.size)}</span>
                    <button type="button" onClick={() => setAtts((p) => p.filter((_, j) => j !== i))} className="p-0.5 text-zinc-600 hover:text-red-400 transition">
                      <X strokeWidth={2} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 hover:text-zinc-200 transition-colors">Cancelar</button>
                <button type="button" onClick={() => setStep("confirm")} disabled={!to || !subject || !body}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <Send strokeWidth={1.5} className="w-4 h-4" /> Revisar
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-yellow-950/30 border border-yellow-900/60">
                <ShieldAlert strokeWidth={1.5} className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-300">Confirme antes de enviar</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Revise os dados abaixo.</p>
                </div>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg px-4 py-3 space-y-2">
                {([["Para", to], ["Assunto", subject], ["Mensagem", body.slice(0, 100) + (body.length > 100 ? "..." : "")]] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex gap-2">
                    <span className="text-zinc-600 text-xs w-16 shrink-0 pt-0.5">{l}</span>
                    <span className="text-zinc-300 text-xs">{v}</span>
                  </div>
                ))}
                {atts.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-zinc-600 text-xs w-16 shrink-0 pt-0.5">Anexos</span>
                    <span className="text-zinc-300 text-xs">{atts.map((a) => `${a.file.name} (${fmtBytes(a.file.size)})`).join(", ")}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep("form")} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
                  <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Editar
                </button>
                <button type="button" onClick={send} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors">
                  <Send strokeWidth={1.5} className="w-4 h-4" /> Enviar agora
                </button>
              </div>
            </div>
          )}

          {step === "sending" && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 strokeWidth={1.5} className="w-8 h-8 text-zinc-400 animate-spin" />
              <p className="text-sm text-zinc-400">Enviando{atts.length > 0 ? " com anexo..." : "..."}</p>
            </div>
          )}

          {step === "sent" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-900 flex items-center justify-center">
                <CheckCircle2 strokeWidth={1.5} className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-emerald-300">E-mail enviado!</p>
            </div>
          )}

          <p className="text-center text-[10px] text-zinc-800">Enviado via Kronos AI · Gmail</p>
        </div>
      </div>
    </div>
  );
}
