#!/usr/bin/env bash
# =====================================================================
#  respaldar.sh  --  Copia de seguridad del SGDP.
#  Guarda: (1) la base de datos (usuarios, numeración, historial,
#  versiones) y (2) la lista de documentos. Los PDFs y .tex viven en el
#  archivo documental del despacho (documentos/, enlazado como
#  $MDD_RUTA/documentos): respáldelo aparte.
#
#  Uso:   ./respaldar.sh            -> crea <operaciones>/respaldos/AAAA-MM-DD_HHMM/ (SGDP_RESPALDOS; entorno.sh, ADR-15)
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# shellcheck disable=SC1091
source "$DIR/entorno.sh"; sgdp_cargar_env || exit 1

FECHA="$(date +%Y-%m-%d_%H%M)"
DEST="$SGDP_RESPALDOS/$FECHA"
mkdir -p "$DEST"

echo "Respaldando la base de datos..."
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-sgdp}" "${POSTGRES_DB:-sgdp}" \
  > "$DEST/base_de_datos.sql"

echo "Copia creada en: $DEST/base_de_datos.sql"
echo ""
echo "IMPORTANTE: los documentos (PDF y .tex) están en"
echo "  ${MDD_RUTA:-<MDD_RUTA>}/documentos/  (archivo documental del despacho)"
echo "Respáldelos también (por ejemplo, copiándolos a un disco externo)."
echo ""
echo "Para RESTAURAR la base de datos:"
echo "  docker compose exec -T db psql -U ${POSTGRES_USER:-sgdp} ${POSTGRES_DB:-sgdp} < $DEST/base_de_datos.sql"
