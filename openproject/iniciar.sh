#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# iniciar.sh — openproject_despacho: arranca el contenedor de OpenProject con el .env de operaciones.
# La PRIMERA vez descarga ~3 GB y tarda varios minutos en migrar la base de datos y sembrar datos.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

echo "▶ Arrancando OpenProject (compose: $OP_RAIZ · operaciones: $OP_OPS)..."
compose up -d

echo ""
echo "✅ Contenedor lanzado. El primer arranque tarda varios minutos."
echo "   Sigue el progreso con:   ./estado.sh"
echo "   Logs en vivo:            docker logs -f $OP_CONTENEDOR"
echo ""
echo "   Cuando el estado sea 'healthy', entra desde el despacho a:"
echo "       $OP_URL"
echo "       http://${OPENPROJECT_HOST_NAME:-localhost:8080}   (por IP)"
