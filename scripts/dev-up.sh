#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
#  Arakne — Sobe tudo (backend + frontend + dados demo)
#
#  Uso:
#    bash scripts/dev-up.sh                # sobe back + front
#    bash scripts/dev-up.sh --seed         # reseta DB + cria dados demo antes
#    bash scripts/dev-up.sh --seed-trilhas # só recarrega o catálogo de
#                                           # trilhas (contas preservadas —
#                                           # use isto se já tem uma conta
#                                           # real com saldo que não quer perder)
#    bash scripts/dev-up.sh --multisig     # registra custódia multisig antes
#    bash scripts/dev-up.sh --all          # seed + multisig + sobe
#
#  Ctrl+C derruba ambos os servadores graciosamente.
#  Logs: backend.log e frontend.log na pasta do repo.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_LOG="$ROOT/backend.log"
FRONTEND_LOG="$ROOT/frontend.log"
BACKEND_URL="http://localhost:8000/health"
FRONTEND_URL="http://localhost:5173"

# Venv do backend (PEP 668 — Python 3.14 no Debian/Ubuntu é externally-managed)
VENV_DIR="$BACKEND_DIR/.venv"

# Cores (se terminal suportar)
if [ -t 1 ]; then
  C_GREEN="\033[0;32m"; C_YELLOW="\033[1;33m"; C_CYAN="\033[0;36m"
  C_RED="\033[0;31m"; C_RESET="\033[0m"
else
  C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_RED=""; C_RESET=""
fi

log()  { echo -e "${C_CYAN}[$(date +%H:%M:%S)]${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}[$(date +%H:%M:%S)] OK${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}[$(date +%H:%M:%S)] AVISO${C_RESET} $*"; }
err()  { echo -e "${C_RED}[$(date +%H:%M:%S)] ERRO${C_RESET} $*" >&2; }

# ── Parse args ────────────────────────────────────────────────
DO_SEED=false
DO_SEED_TRILHAS=false
DO_MULTISIG=false
for arg in "$@"; do
  case "$arg" in
    --seed)         DO_SEED=true ;;
    --seed-trilhas) DO_SEED_TRILHAS=true ;;
    --multisig)     DO_MULTISIG=true ;;
    --all)          DO_SEED=true; DO_MULTISIG=true ;;
    *) err "Argumento desconhecido: $arg"; exit 1 ;;
  esac
done

# ── PIDs a limpar no exit ─────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  log "Encerrando servidores..."
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null && ok "frontend parado"
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null && ok "backend parado"
  # Mata processos filhos que tenham sobrado (vite/uvicorn workers)
  pkill -P $$ 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

# ── 1. Venv do backend ─────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  log "Criando venv do backend em $VENV_DIR ..."
  python3 -m venv "$VENV_DIR" || { err "python3 -m venv falhou"; exit 1; }
  ok "venv criado"
fi
# Ativa o venv para os comandos seguintes
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
log "Venv ativado: $(python --version) — $(which python)"

# ── 2. Dependências ───────────────────────────────────────────
log "Instalando dependências do backend (pip no venv)..."
( cd "$BACKEND_DIR" && pip install -q -r requirements.txt ) || { err "pip install falhou"; exit 1; }
ok "dependências backend"

log "Instalando dependências do frontend (npm)..."
# --legacy-peer-deps: @vitejs/plugin-react@4.7.0 não declara suporte a vite 8,
# mas funciona na prática. Sem essa flag, npm install limpo falha (ERESOLVE).
if [ -d "$FRONTEND_DIR/node_modules" ]; then
  ok "node_modules já existe — pulando install (use --force para reinstalar)"
else
  ( cd "$FRONTEND_DIR" && npm install --legacy-peer-deps --silent ) || { err "npm install falhou"; exit 1; }
  ok "dependências frontend"
fi

# ── 3. Seed (opcional) ────────────────────────────────────────
if $DO_SEED; then
  log "Resetando DB e criando dados demo (seed_demo.py)..."
  # Para o backend se estiver rodando (evita lock no arakne.db)
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  pkill -f "uvicorn app.main" 2>/dev/null || true
  sleep 1
  ( cd "$BACKEND_DIR" && python seed_demo.py ) || { err "seed_demo.py falhou"; exit 1; }
  ok "dados demo criados (FUNDADORA + FORNECEDORA + 9 trilhas/54 aulas/127 materiais)"
elif $DO_SEED_TRILHAS; then
  # Só recarrega o catálogo de trilhas (Trilha/Aula/Material) — NUNCA
  # toca em Usuaria/Emprestimo/etc. Existe porque um banco criado do zero
  # (create_all() na primeira subida, sem --seed) tem as tabelas mas fica
  # com o catálogo vazio — "Nenhuma trilha encontrada" na tela, mesmo com
  # contas reais e dinheiro real já configurados que você não quer perder
  # resetando tudo com --seed.
  log "Recarregando só o catálogo de trilhas (seed_trilhas, contas preservadas)..."
  ( cd "$BACKEND_DIR" && python3 -c "
from app.database import SessionLocal
from seed_demo import seed_trilhas
db = SessionLocal()
seed_trilhas(db)
db.close()
" ) || { err "seed_trilhas falhou"; exit 1; }
  ok "catálogo de trilhas recarregado (contas preservadas)"
fi

# ── 4. Multisig (opcional) ────────────────────────────────────
if $DO_MULTISIG; then
  log "Registrando custódia multisig (gerar_multisig.py)..."
  if ( cd "$BACKEND_DIR" && python scripts/gerar_multisig.py ); then
    ok "custódia multisig registrada"
  else
    warn "gerar_multisig.py falhou (não bloqueia o dev) — o card de custódia mostrará 'ainda não configurada'"
  fi
fi

# ── 5. Sobe backend ───────────────────────────────────────────
log "Subindo backend (uvicorn :8000)..."
# --reload-exclude "*.db" evita reload a cada escrita no arakne.db
# Usa uvicorn do venv (ativado acima)
( cd "$BACKEND_DIR" && \
  uvicorn app.main:app --port 8000 --reload \
    --reload-exclude "*.db" --reload-exclude "*.db-*" \
) > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# ── 5. Sobe frontend ──────────────────────────────────────────
log "Subindo frontend (vite :5173)..."
( cd "$FRONTEND_DIR" && npm run dev -- --host ) > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# ── 6. Aguarda saúde ──────────────────────────────────────────
log "Aguardando backend responder..."
for i in $(seq 1 30); do
  if curl -sf "$BACKEND_URL" > /dev/null 2>&1; then
    ok "backend saudável"
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "backend não respondeu em 30s — veja $BACKEND_LOG"
    tail -20 "$BACKEND_LOG" >&2
    exit 1
  fi
  sleep 1
done

log "Aguardando frontend responder..."
for i in $(seq 1 30); do
  if curl -sf "$FRONTEND_URL" > /dev/null 2>&1; then
    ok "frontend saudável"
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "frontend não respondeu em 30s — veja $FRONTEND_LOG"
    tail -20 "$FRONTEND_LOG" >&2
    exit 1
  fi
  sleep 1
done

# ── 7. Resumo ─────────────────────────────────────────────────
echo ""
echo -e "${C_GREEN}══════════════════════════════════════════════════════════════${C_RESET}"
echo -e "${C_GREEN} Arakne no ar${C_RESET}"
echo -e "${C_GREEN}══════════════════════════════════════════════════════════════${C_RESET}"
echo ""
echo -e "  Frontend:  ${C_CYAN}http://localhost:5173${C_RESET}"
echo -e "  Backend:   ${C_CYAN}http://localhost:8000/docs${C_RESET}  (Swagger)"
echo -e "  Health:    ${C_CYAN}http://localhost:8000/health${C_RESET}"
echo ""
echo -e "  Logs:"
echo -e "    backend:  $BACKEND_LOG"
echo -e "    frontend: $FRONTEND_LOG"
echo ""
echo -e "  Credenciais demo:"
echo -e "    FUNDADORA:   identificador ${C_YELLOW}FUNDADORA${C_RESET}  PIN ${C_YELLOW}1234${C_RESET}"
echo -e "    FORNECEDORA: identificador ${C_YELLOW}FORNECEDORA${C_RESET}  PIN ${C_YELLOW}1234${C_RESET}"
echo -e "    Convite:     ${C_YELLOW}http://localhost:5173/convite/FUNDADORA_INVITE${C_RESET}"
echo ""
echo -e "  ${C_YELLOW}Ctrl+C${C_RESET} para encerrar ambos os servidores."
echo ""

# ── 8. Mantém o script vivo (espera os processos) ─────────────
wait
