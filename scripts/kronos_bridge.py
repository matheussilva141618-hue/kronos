"""
KRONOS OS Bridge v1.0
Servidor local que executa ações físicas na máquina via API HTTP.
Roda em http://127.0.0.1:8000

Ações suportadas:
  criar_projeto   → cria estrutura de projeto na Área de Trabalho
  abrir_vscode    → abre VS Code no diretório alvo
  terminal        → executa comandos de shell
  status_sistema  → retorna métricas de CPU e RAM

Iniciar: python scripts/kronos_bridge.py
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import os
import sys
import platform
import shutil
from pathlib import Path
from datetime import datetime

# ─── Helpers ──────────────────────────────────────────────────────────────────

DESKTOP = Path.home() / "Desktop"
SYSTEM  = platform.system()  # Windows, Linux, Darwin


def ok(data: dict) -> dict:
    return {"success": True, "timestamp": datetime.now().isoformat(), **data}


def err(msg: str) -> dict:
    return {"success": False, "error": msg, "timestamp": datetime.now().isoformat()}


# ─── Ações ────────────────────────────────────────────────────────────────────

def acao_criar_projeto(target: str, extra_data: str) -> dict:
    """Cria estrutura de projeto na Área de Trabalho."""
    if not target:
        return err("target (nome do projeto) é obrigatório")

    project_path = DESKTOP / target
    template     = (extra_data or "generico").lower()

    try:
        project_path.mkdir(parents=True, exist_ok=True)

        if "python" in template:
            (project_path / "src").mkdir(exist_ok=True)
            (project_path / "tests").mkdir(exist_ok=True)
            (project_path / "src" / "__init__.py").write_text("")
            (project_path / "src" / "main.py").write_text(
                f'"""Projeto {target}"""\n\ndef main():\n    print("Kronos: {target} iniciado")\n\nif __name__ == "__main__":\n    main()\n'
            )
            (project_path / "tests" / "__init__.py").write_text("")
            (project_path / "requirements.txt").write_text("# dependências do projeto\n")
            (project_path / "README.md").write_text(f"# {target}\n\nProjeto Python criado pelo Kronos.\n")
            (project_path / ".gitignore").write_text("__pycache__/\n*.pyc\n.env\nvenv/\n")

        elif "react" in template or "next" in template:
            (project_path / "src").mkdir(exist_ok=True)
            (project_path / "public").mkdir(exist_ok=True)
            (project_path / "src" / "App.tsx").write_text(
                'export default function App() {\n  return <div>Kronos: {target}</div>\n}\n'.replace("{target}", target)
            )
            (project_path / "package.json").write_text(
                json.dumps({"name": target.lower().replace(" ", "-"), "version": "0.1.0", "private": True}, indent=2)
            )
            (project_path / "README.md").write_text(f"# {target}\n\nProjeto React criado pelo Kronos.\n")
            (project_path / ".gitignore").write_text("node_modules/\n.next/\ndist/\n.env.local\n")

        else:
            # Template genérico
            (project_path / "README.md").write_text(f"# {target}\n\nProjeto criado pelo Kronos em {datetime.now().strftime('%d/%m/%Y')}.\n")
            (project_path / ".gitignore").write_text("*.log\n.env\n")

        # Inicia git
        subprocess.run(["git", "init"], cwd=project_path, capture_output=True)

        return ok({
            "message": f"Projeto '{target}' criado em {project_path}",
            "path": str(project_path),
            "template": template,
        })

    except Exception as e:
        return err(str(e))


def acao_abrir_vscode(target: str, extra_data: str) -> dict:
    """Abre VS Code no diretório alvo."""
    if not target:
        return err("target (caminho) é obrigatório")

    # Resolve caminho relativo à home do usuário
    path = Path.home() / target if not Path(target).is_absolute() else Path(target)

    if not path.exists():
        # Tenta como caminho absoluto direto
        path = Path(target)
        if not path.exists():
            return err(f"Caminho não encontrado: {target}")

    try:
        if SYSTEM == "Windows":
            subprocess.Popen(["code", str(path)], shell=True)
        else:
            subprocess.Popen(["code", str(path)])
        return ok({"message": f"VS Code aberto em {path}"})
    except FileNotFoundError:
        return err("VS Code não encontrado. Verifique se 'code' está no PATH.")
    except Exception as e:
        return err(str(e))


def acao_terminal(target: str, extra_data: str) -> dict:
    """Executa comando de shell."""
    if not target:
        return err("target (comando) é obrigatório")

    # Diretório de execução — usa extra_data como cwd se fornecido
    cwd = None
    if extra_data and Path(extra_data).exists():
        cwd = extra_data

    try:
        use_shell = SYSTEM == "Windows"
        result = subprocess.run(
            target,
            shell=use_shell,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=cwd,
        )
        return ok({
            "stdout":      result.stdout.strip(),
            "stderr":      result.stderr.strip(),
            "returncode":  result.returncode,
            "command":     target,
        })
    except subprocess.TimeoutExpired:
        return err(f"Comando expirou após 60s: {target}")
    except Exception as e:
        return err(str(e))


def acao_status_sistema(target: str, extra_data: str) -> dict:
    """Retorna métricas de CPU e RAM."""
    try:
        import psutil
        cpu    = psutil.cpu_percent(interval=0.5)
        mem    = psutil.virtual_memory()
        disk   = psutil.disk_usage("/")
        return ok({
            "cpu_percent":  cpu,
            "ram_total_gb": round(mem.total / 1e9, 2),
            "ram_used_gb":  round(mem.used  / 1e9, 2),
            "ram_percent":  mem.percent,
            "disk_total_gb": round(disk.total / 1e9, 2),
            "disk_used_gb":  round(disk.used  / 1e9, 2),
            "disk_percent":  disk.percent,
        })
    except ImportError:
        # Fallback sem psutil
        try:
            if SYSTEM == "Windows":
                r = subprocess.run("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value",
                                   shell=True, capture_output=True, text=True)
                return ok({"raw": r.stdout.strip(), "note": "Instale psutil para métricas detalhadas"})
            else:
                r = subprocess.run(["free", "-h"], capture_output=True, text=True)
                return ok({"raw": r.stdout.strip(), "note": "Instale psutil para métricas detalhadas"})
        except Exception as e:
            return err(str(e))


# ─── Dispatcher ───────────────────────────────────────────────────────────────

ACTIONS = {
    "criar_projeto":  acao_criar_projeto,
    "abrir_vscode":   acao_abrir_vscode,
    "terminal":       acao_terminal,
    "status_sistema": acao_status_sistema,
}


# ─── Handler HTTP ─────────────────────────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[Bridge {ts}] {format % args}")

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type",                "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length",              str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "online", "version": "1.0", "system": SYSTEM})
        else:
            self._send_json({"actions": list(ACTIONS.keys())})

    def do_POST(self):
        if self.path != "/execute":
            self._send_json(err("Endpoint inválido. Use /execute"), 404)
            return

        try:
            length  = int(self.headers.get("Content-Length", 0))
            raw     = self.rfile.read(length)
            payload = json.loads(raw)
        except Exception as e:
            self._send_json(err(f"JSON inválido: {e}"), 400)
            return

        action     = payload.get("action", "").strip()
        target     = payload.get("target", "")
        extra_data = payload.get("extra_data", "")

        if not action:
            self._send_json(err("Campo 'action' é obrigatório"), 400)
            return

        if action not in ACTIONS:
            self._send_json(err(f"Ação desconhecida: '{action}'. Disponíveis: {list(ACTIONS.keys())}"), 400)
            return

        result = ACTIONS[action](target, extra_data)
        self._send_json(result, 200 if result["success"] else 500)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    HOST, PORT = "127.0.0.1", 8000
    server = HTTPServer((HOST, PORT), BridgeHandler)
    print(f"\n{'='*50}")
    print(f"  KRONOS OS Bridge v1.0")
    print(f"  http://{HOST}:{PORT}")
    print(f"  Sistema: {SYSTEM} | Python {sys.version.split()[0]}")
    print(f"{'='*50}\n")
    print("Aguardando requisições... (Ctrl+C para parar)\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBridge encerrado.")
        server.server_close()
