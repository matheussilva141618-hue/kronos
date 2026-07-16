"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight } from "lucide-react";

export default function Login() {
  const [name, setName] = useState("");
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans p-6">
      <div className="w-full max-w-md space-y-8 bg-zinc-900/40 p-8 rounded-2xl border border-zinc-900 backdrop-blur-md text-center">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-zinc-200 animate-pulse" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            Kronos AI
          </h1>
          <p className="text-xs text-zinc-500 mt-2">
            Seu assistente pessoal de elite
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Para personalizar sua experiência, como quer ser chamado?
          </p>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Digite seu nome..."
            autoFocus
            maxLength={40}
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-3.5 px-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition text-center"
          />

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 hover:border-zinc-600 transition font-medium text-sm text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Entrando..." : "Entrar no Kronos AI"}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
