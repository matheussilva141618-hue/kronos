"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import KronosAvatar from "@/components/KronosAvatar";
import { ArrowRight } from "lucide-react";

export default function Login() {
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    localStorage.setItem("kronos_username", trimmed);
    router.push("/");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6"
      style={{ fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <div className="w-full max-w-sm space-y-8">

        <div className="flex flex-col items-center gap-3">
          <KronosAvatar size={48} />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Kronos AI</h1>
            <p className="text-xs text-zinc-500 mt-1">Assistente pessoal de elite</p>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-sm text-zinc-300 font-medium">Bem-vindo</p>
            <p className="text-xs text-zinc-600">Como quer ser chamado?</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite seu nome..."
              autoFocus
              maxLength={40}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition text-center"
            />
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Entrando..." : "Entrar no Kronos AI"}
              {!loading && <ArrowRight strokeWidth={1.5} className="w-4 h-4" />}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-zinc-800">Kronos AI · Seu assistente pessoal</p>
      </div>
    </div>
  );
}
