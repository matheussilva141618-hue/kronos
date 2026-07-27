"""
KRONOS — Agente Cognitivo Autônomo (Python)
Modo Hiper-Curiosidade: loop de alta frequência, consulta Cerebras, salva no Supabase.

Uso:
  python scripts/kronos_agent.py                    # loop infinito, intervalo padrão 300s
  python scripts/kronos_agent.py --interval=60      # ciclo a cada 60s
  python scripts/kronos_agent.py --cycles=10        # máximo 10 ciclos
  python scripts/kronos_agent.py --interval=30 --cycles=5  # 5 ciclos a cada 30s

Variáveis de ambiente (.env.local ou ambiente):
  CEREBRAS_API_KEY
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import os
import sys
import time
import json
import random
import argparse
import logging
from datetime import datetime, date
from pathlib import Path

# Carrega .env.local
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

from cerebras.cloud.sdk import Cerebras
from supabase import create_client, Client

# ─── Config ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("kronos-agent")

CEREBRAS_KEY   = os.getenv("CEREBRAS_API_KEY", "")
SUPABASE_URL   = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
MODEL          = "gpt-oss-120b"
TABLE          = "conhecimentos_kronos"

# ─── Banco de temas ───────────────────────────────────────────────────────────

DOMAINS = {
    "engenharia_software": [
        "Arquitetura hexagonal e ports & adapters em TypeScript",
        "Event sourcing com PostgreSQL e Supabase Realtime",
        "Zero-downtime deployments: blue-green, canary e feature flags",
        "Observabilidade com OpenTelemetry em Next.js",
        "Padrões de resiliência: circuit breaker, retry e bulkhead",
        "WebSockets vs SSE vs Long Polling — análise 2025",
        "Monorepos com Turborepo: estrutura e cache otimizado",
        "Design de APIs REST vs GraphQL vs tRPC — guia prático",
        "Testes de contrato com Pact em microserviços TypeScript",
        "Segurança em APIs: JWT, OAuth 2.1 e mTLS",
    ],
    "inteligencia_artificial": [
        "RAG avançado: reranking, hybrid search e query expansion",
        "Agentes autônomos com LangGraph e planejamento hierárquico",
        "Fine-tuning com LoRA e QLoRA em LLMs menores",
        "Embeddings vetoriais: modelos, distâncias e pgvector",
        "Prompt engineering: few-shot, CoT e self-consistency",
        "Avaliação de LLMs: benchmarks MMLU, HumanEval e HELM",
        "Multimodalidade: visão + linguagem em produção",
        "AI Safety: RLHF, Constitutional AI e DPO",
        "Mixture of Experts: arquitetura e casos de uso",
        "Speculative decoding e técnicas de inferência rápida",
    ],
    "arquitetura_sistemas": [
        "CQRS e separação de modelos de leitura e escrita",
        "Database per service em arquiteturas de microserviços",
        "Estratégias de cache: Redis, CDN edge e stale-while-revalidate",
        "Saga pattern para transações distribuídas",
        "Chaos engineering: princípios e implementação prática",
        "Infrastructure as Code com Terraform para Supabase e Vercel",
        "Service mesh com Istio: observabilidade e controle de tráfego",
        "Reactive systems: backpressure e Rx patterns",
    ],
    "ciencia_computacao": [
        "Algoritmos de consenso distribuído: Raft e Paxos",
        "Estruturas de dados: LSM Trees, B+ Trees e Bloom Filters",
        "Teoria da informação de Shannon aplicada a ML",
        "Programação funcional: monads, functors e category theory",
        "Concorrência: modelos de atores, CSP e STM",
        "Compiladores JIT: otimizações do V8 e JavaScriptCore",
        "Neurociência computacional: spiking neurons e Hebbian learning",
        "Teoria dos grafos aplicada a sistemas de recomendação",
    ],
    "mobile_frontend": [
        "Capacitor 7 com React Native — estratégias Android/iOS",
        "React Server Components e streaming SSR em Next.js 15",
        "Animações performáticas com Framer Motion e GSAP",
        "Progressive Web Apps: Service Workers e Push API 2025",
        "Micro-frontends com Module Federation",
        "Estado global: Zustand vs Jotai vs Redux Toolkit",
        "WebGL e Three.js para visualizações interativas",
    ],
}

ALL_THEMES = [(t, d) for d, ts in DOMAINS.items() for t in ts]


def pick_theme(studied: set[str]) -> tuple[str, str]:
    """Escolhe tema com gap analysis — prioriza domínios menos estudados."""
    domain_counts = {d: 0 for d in DOMAINS}
    for t, d in studied:
        if d in domain_counts:
            domain_counts[d] += 1

    # Domínio com menor cobertura relativa
    target = min(DOMAINS.keys(), key=lambda d: domain_counts[d] / len(DOMAINS[d]))

    available = [(t, d) for t, d in ALL_THEMES if t not in {s for s, _ in studied} and d == target]
    if not available:
        available = [(t, d) for t, d in ALL_THEMES if t not in {s for s, _ in studied}]
    if not available:
        available = ALL_THEMES  # recicla se tudo já foi estudado

    return random.choice(available)


# ─── Geração de conhecimento ──────────────────────────────────────────────────

def generate_knowledge(client: Cerebras, tema: str) -> str:
    prompt = f"""Você é um especialista técnico de nível principal/staff engineer.
Produza um guia técnico profundo e denso sobre:

TEMA: {tema}

Estruture assim:
CONCEITO CENTRAL
[explicação densa, 2-3 parágrafos]

RELEVÂNCIA EM 2025
[por que importa agora]

IMPLEMENTAÇÃO PRÁTICA
[código real ou arquitetura detalhada]

PADRÕES AVANÇADOS E ARMADILHAS
[o que sêniores sabem que juniores não sabem]

INTEGRAÇÃO COM ECOSSISTEMA MODERNO
[Next.js, Supabase, TypeScript, IA quando relevante]

Sem introduções genéricas. Conteúdo de elite para base de conhecimento técnica."""

    res = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        stream=False,
    )
    return res.choices[0].message.content or ""


# ─── Meta-cognição ────────────────────────────────────────────────────────────

def metacognitive_review(client: Cerebras, tema: str, content: str) -> dict:
    prompt = f"""Você é um revisor técnico crítico de nível tier-1.
Avalie este conteúdo sobre "{tema}" e responda em JSON:

{{
  "qualityScore": <1-10>,
  "issues": ["problema 1", "problema 2"],
  "refinedSummary": "<resumo técnico refinado e denso, máx 800 chars>"
}}

CONTEÚDO:
{content[:3000]}"""

    try:
        res = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            stream=False,
        )
        raw = res.choices[0].message.content or "{}"
        # Extrai JSON da resposta
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(raw[start:end])
            return {
                "score":   min(10, max(1, int(parsed.get("qualityScore", 7)))),
                "issues":  parsed.get("issues", []),
                "refined": parsed.get("refinedSummary", content[:800]),
            }
    except Exception as e:
        log.warning(f"Meta-cognição falhou (usando padrão): {e}")

    return {"score": 7, "issues": [], "refined": content[:800]}


# ─── Limpeza de conteúdo ──────────────────────────────────────────────────────

def clean_content(text: str) -> str:
    import re
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"```[\s\S]*?```", lambda m: m.group().replace("```", "").strip(), text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ─── Supabase ─────────────────────────────────────────────────────────────────

def get_studied_themes(sb: Client) -> set[tuple[str, str]]:
    try:
        res = sb.table(TABLE).select("topico, dominio").order("created_at", desc=True).limit(100).execute()
        return {(r["topico"], r.get("dominio", "outro")) for r in (res.data or [])}
    except Exception as e:
        log.warning(f"Erro ao buscar temas estudados: {e}")
        return set()


def get_cycle_count(sb: Client) -> int:
    try:
        res = sb.table(TABLE).select("id", count="exact").execute()
        return (res.count or 0) + 1
    except Exception:
        return 1


def save_knowledge(sb: Client, tema: str, dominio: str, conteudo: str, refined: str, score: int, ciclo: int) -> bool:
    try:
        sb.table(TABLE).insert({
            "topico":            tema[:200],
            "conteudo":          clean_content(conteudo)[:8000],
            "conteudo_refinado": clean_content(refined)[:2000],
            "origem":            "agente_autonomo_cerebras",
            "dominio":           dominio,
            "quality_score":     score,
            "ciclo":             ciclo,
        }).execute()
        return True
    except Exception as e:
        log.error(f"Erro ao salvar no Supabase: {e}")
        return False


# ─── Ciclo principal ──────────────────────────────────────────────────────────

def run_cycle(cerebras_client: Cerebras, sb: Client, cycle_num: int) -> dict:
    start = time.time()
    log.info(f"{'─'*55}")
    log.info(f"CICLO {cycle_num} — {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")

    # 1. Auto-direção
    studied = get_studied_themes(sb)
    tema, dominio = pick_theme(studied)
    log.info(f"Tema:    {tema}")
    log.info(f"Domínio: {dominio}")

    # 2. Geração
    log.info("Consultando Cerebras...")
    raw = generate_knowledge(cerebras_client, tema)
    if not raw or len(raw) < 200:
        log.error("Conteúdo insuficiente gerado.")
        return {"success": False, "tema": tema}

    # 3. Meta-cognição
    log.info("Aplicando meta-cognição...")
    review = metacognitive_review(cerebras_client, tema, raw)
    log.info(f"Score:   {review['score']}/10")
    if review["issues"]:
        log.info(f"Issues:  {'; '.join(review['issues'][:2])}")

    # 4. Persistência
    ciclo_db = get_cycle_count(sb)
    saved    = save_knowledge(sb, tema, dominio, raw, review["refined"], review["score"], ciclo_db)

    duration = round(time.time() - start, 1)
    status   = "✓ SALVO" if saved else "✗ ERRO AO SALVAR"
    log.info(f"Status:  {status} | {duration}s | {len(raw)} chars")

    return {"success": saved, "tema": tema, "dominio": dominio, "score": review["score"], "duration": duration}


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Kronos Cognitive Loop")
    parser.add_argument("--interval", type=int, default=300, help="Segundos entre ciclos (padrão: 300)")
    parser.add_argument("--cycles",   type=int, default=0,   help="Número máximo de ciclos (0 = infinito)")
    args = parser.parse_args()

    # Valida credenciais
    if not CEREBRAS_KEY:
        log.error("CEREBRAS_API_KEY não encontrada. Configure no .env.local")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas.")
        sys.exit(1)

    cerebras_client = Cerebras(api_key=CEREBRAS_KEY)
    sb              = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("\n" + "═"*55)
    print("  KRONOS — AGENTE COGNITIVO AUTÔNOMO")
    print("  Modo: Hiper-Curiosidade e Alta Frequência")
    print(f"  Intervalo: {args.interval}s | Ciclos: {args.cycles or '∞'}")
    print("═"*55 + "\n")

    cycle_num    = 0
    success_count = 0
    error_count   = 0

    try:
        while True:
            cycle_num += 1
            result = run_cycle(cerebras_client, sb, cycle_num)

            if result["success"]:
                success_count += 1
            else:
                error_count += 1

            log.info(f"Progresso: {success_count} salvo(s), {error_count} erro(s)")

            if args.cycles > 0 and cycle_num >= args.cycles:
                log.info(f"\n✓ {args.cycles} ciclos concluídos.")
                break

            log.info(f"Próximo ciclo em {args.interval}s...")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        log.info(f"\nAgente interrompido. Total: {cycle_num} ciclos, {success_count} salvos.")


if __name__ == "__main__":
    main()
