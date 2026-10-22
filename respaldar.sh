#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# =====================================================================
#  respaldar.sh  --  Copia de seguridad de Qillqa.
#  Guarda: (1) la base de datos (usuarios, numeración, historial,
#  versiones) y (2) la base de la Mediateca. Los PDFs y .tex viven en el
#  archivo documental del despacho (documentos/, enlazado como
#  $MDD_RUTA/documentos): respáldelo aparte.
#
#  Uso:   ./respaldar.sh            -> crea <operaciones>/respaldos/AAAA-MM-DD_HHMM/ (QILLQA_RESPALDOS; entorno.sh, ADR-15)
# =====================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# shellcheck disable=SC1091
source "$DIR/entorno.sh"; qillqa_cargar_env || exit 1

FECHA="$(date +%Y-%m-%d_%H%M)"
DEST="$QILLQA_RESPALDOS/$FECHA"
mkdir -p "$DEST"

echo "Respaldando la base de datos..."
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-qillqa}" "${POSTGRES_DB:-qillqa}" \
  > "$DEST/base_de_datos.sql"

echo "Copia creada en: $DEST/base_de_datos.sql"

# La Mediateca tiene su propia base en el mismo servidor (2026-10-19): personas, lugares, versiones y
# usos de cada foto. Los archivos van en el espejo de la carpeta de imágenes; sin esta base se pierde
# su organización. El nombre se resuelve como backend/app/config.py::url_mediateca.
if [ -n "${MEDIATECA_DATABASE_URL:-}" ]; then
  MEDIATECA_DB="${MEDIATECA_DATABASE_URL##*/}"; MEDIATECA_DB="${MEDIATECA_DB%%\?*}"
elif [ "${POSTGRES_DB:-qillqa}" = "qillqa" ]; then
  MEDIATECA_DB="mediateca"
else
  MEDIATECA_DB="${POSTGRES_DB}_mediateca"
fi
if docker compose exec -T db psql -U "${POSTGRES_USER:-qillqa}" -d "${POSTGRES_DB:-qillqa}" -Atc \
     "SELECT 1 FROM pg_database WHERE datname = '$MEDIATECA_DB'" | grep -q 1; then
  echo "Respaldando la base de la Mediateca ($MEDIATECA_DB)..."
  docker compose exec -T db pg_dump -U "${POSTGRES_USER:-qillqa}" "$MEDIATECA_DB" \
    > "$DEST/base_de_datos_mediateca.sql"
  echo "Copia creada en: $DEST/base_de_datos_mediateca.sql"
else
  echo "Sin base de la Mediateca ($MEDIATECA_DB): nada que respaldar de ella."
fi
echo ""
echo "IMPORTANTE: los documentos (PDF y .tex) están en"
echo "  ${MDD_RUTA:-<MDD_RUTA>}/documentos/  (archivo documental del despacho)"
echo "Respáldelos también (por ejemplo, copiándolos a un disco externo)."
echo ""
echo "Para RESTAURAR la base de datos:"
echo "  docker compose exec -T db psql -U ${POSTGRES_USER:-qillqa} ${POSTGRES_DB:-qillqa} < $DEST/base_de_datos.sql"
if [ -f "$DEST/base_de_datos_mediateca.sql" ]; then
  echo "y la de la Mediateca (si no existe, créela antes con createdb):"
  echo "  docker compose exec -T db createdb -U ${POSTGRES_USER:-qillqa} $MEDIATECA_DB"
  echo "  docker compose exec -T db psql -U ${POSTGRES_USER:-qillqa} $MEDIATECA_DB < $DEST/base_de_datos_mediateca.sql"
fi
