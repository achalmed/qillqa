#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# respaldar.sh — openproject_despacho: respaldo consistente de los volúmenes (base de datos + adjuntos) en operaciones/respaldos, con rotación.
#
# Detiene brevemente el contenedor (para que la base de datos quede coherente), archiva los dos
# volúmenes en un solo .tar.gz y lo vuelve a arrancar. Conserva los OPENPROJECT_RESPALDOS_CONSERVAR
# (14) más recientes y poda el resto (misma política que core/shell-lib/backup_rotado.sh).
#
# Uso:   ./respaldar.sh [--silencioso]      (--silencioso: para cron, sin sugerencias)
# Restaurar: ver docs/restaurar.md.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
SILENCIOSO=0; [[ "${1:-}" == "--silencioso" ]] && SILENCIOSO=1

mkdir -p "$OP_RESPALDOS"
TS=$(date +%Y-%m-%d_%H%M)
ARCHIVO="$OP_RESPALDOS/openproject_${TS}.tar.gz"

echo "[$(date '+%F %T')] ■ Deteniendo OpenProject para un respaldo consistente..."
compose stop

echo "📦 Archivando volúmenes (base de datos + adjuntos) → $ARCHIVO"
docker run --rm \
  -v openproject_pgdata:/data/pgdata:ro \
  -v openproject_assets:/data/assets:ro \
  -v "$OP_RESPALDOS":/backup \
  alpine sh -c "tar czf /backup/openproject_${TS}.tar.gz -C /data pgdata assets"

echo "▶ Reiniciando OpenProject..."
compose start

# Rotación: conservar los N más recientes; podar el resto.
podar=$(ls -1t "$OP_RESPALDOS"/openproject_*.tar.gz 2>/dev/null | tail -n +"$((OP_CONSERVAR + 1))")
podados=0
if [[ -n "$podar" ]]; then
  podados=$(printf '%s\n' "$podar" | wc -l)
  printf '%s\n' "$podar" | xargs -r rm -f
fi

echo "✅ Respaldo creado: $(du -h "$ARCHIVO" | cut -f1) $ARCHIVO"
echo "   conservados: $(ls -1 "$OP_RESPALDOS"/openproject_*.tar.gz | wc -l) (máx. $OP_CONSERVAR) · podados: $podados"
if [[ $SILENCIOSO -eq 0 ]]; then
  echo ""
  echo "💡 Copie los respaldos a un disco externo: en el mismo disco no protegen ante robo o falla."
fi
