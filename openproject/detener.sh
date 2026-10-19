#!/usr/bin/env bash
# detener.sh — openproject_despacho: detiene OpenProject; los datos siguen en los volúmenes openproject_pgdata y openproject_assets.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

echo "■ Deteniendo OpenProject..."
compose down
echo "✅ Detenido. Los datos siguen intactos. Vuelve a arrancar con ./iniciar.sh"
