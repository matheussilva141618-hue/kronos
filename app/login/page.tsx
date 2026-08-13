"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import KronosAvatar from "@/components/KronosAvatar";
import { ArrowRight, Mail, Lock, Chrome, Sparkles } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push("/");
      }
    };
    checkAuth();
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name }
          }
        });
        if (error) throw error;
        if (data.user) {
          router.push("/");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          router.push("/");
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "Erro ao entrar com Google");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] text-zinc-100 p-6 relative overflow-hidden"
      style={{ fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-blue-900/20" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="w-full max-w-sm space-y-8 relative z-10">
        
        {/* Logo & Title */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600 rounded-full blur-xl opacity-50" />
            <KronosAvatar size={56} />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              Kronos AI
            </h1>
            <p className="text-xs text-zinc-500">Assistente pessoal de elite</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/50 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-900/30 border border-violet-700/30 mb-2">
              <Sparkles strokeWidth={1.5} className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] font-medium text-violet-300 uppercase tracking-wider">Premium AI</span>
            </div>
            <p className="text-sm text-zinc-300 font-medium">
              {isSignUp ? "Crie sua conta" : "Bem-vindo de volta"}
            </p>
            <p className="text-xs text-zinc-600">
              {isSignUp ? "Comece sua jornada com o Kronos" : "Entre para continuar"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 ml-1">Nome completo</label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    autoFocus
                    maxLength={40}
                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600/50 focus:ring-2 focus:ring-violet-600/20 transition-all"
                  />
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 ml-1">Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600/50 focus:ring-2 focus:ring-violet-600/20 transition-all"
                />
                <Mail className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 ml-1">Senha</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-600/50 focus:ring-2 focus:ring-violet-600/20 transition-all"
                />
                <Lock className="absolute left-3 top-3 w-4 h-4 text-zinc-600" />
              </div>
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-800/50 rounded-xl p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim() || (isSignUp && !name.trim())}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-medium hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/20 hover:shadow-xl hover:shadow-violet-900/30"
            >
              {loading ? "Processando..." : isSignUp ? "Criar conta" : "Entrar"}
              {!loading && <ArrowRight strokeWidth={1.5} className="w-4 h-4" />}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800/50"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-4 bg-zinc-900/60 text-zinc-600">ou continue com</span>
            </div>
          </div>

          {/* Google Login */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-950/50 border border-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-900/50 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Chrome strokeWidth={1.5} className="w-4 h-4" />
            Google
          </button>

          {/* Toggle Sign Up / Sign In */}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
            className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isSignUp ? "Já tem uma conta? Entre aqui" : "Não tem conta? Cadastre-se"}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-zinc-800">
          Kronos AI · Seu assistente pessoal de elite
        </p>
      </div>
    </div>
  );
}