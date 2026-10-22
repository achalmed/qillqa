#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# detener.sh — openproject_despacho: detiene OpenProject; los datos siguen en los volúmenes openproject_pgdata y openproject_assets.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

echo "■ Deteniendo OpenProject..."
compose down
echo "✅ Detenido. Los datos siguen intactos. Vuelve a arrancar con ./iniciar.sh"
