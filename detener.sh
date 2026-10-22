#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# =====================================================================
#  detener.sh  --  Detiene Qillqa (API, edición simultánea, web y, opcionalmente, la BD).
#  Uso:   ./detener.sh          (detiene API y web; la BD sigue)
#         ./detener.sh --todo   (detiene también la base de datos)
# =====================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 8001: servidor de edición simultánea (fase 5); 8099: estudio de Prensa (identidad-visual).
for puerto in 8000 8001 8099 5173; do
  PID="$(ss -ltnp 2>/dev/null | grep ":$puerto" | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  if [[ -n "${PID:-}" ]]; then
    kill "$PID" 2>/dev/null && echo "Detenido el servicio del puerto $puerto (PID $PID)."
  fi
done
# Vite lanza un proceso hijo (esbuild/node); rematar los que queden.
pkill -f "frontend.*vite" 2>/dev/null || true

if [[ "${1:-}" == "--todo" ]]; then
  docker compose stop db && echo "Base de datos detenida."
else
  echo "La base de datos sigue encendida (use --todo para detenerla)."
fi
