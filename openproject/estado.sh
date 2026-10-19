#!/usr/bin/env bash
# estado.sh — openproject_despacho: estado del contenedor, salud, consumo de recursos y despliegue.
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

echo "=== Estado del contenedor ==="
compose ps
echo ""
echo "=== Salud (health) ==="
docker inspect --format '{{.State.Health.Status}}' "$OP_CONTENEDOR" 2>/dev/null \
  && echo "   (starting = aún arrancando/migrando; healthy = listo)" \
  || echo "   contenedor no encontrado — ¿está arrancado?"
echo ""
echo "=== Consumo de CPU / memoria ==="
docker stats --no-stream "$OP_CONTENEDOR" 2>/dev/null || true
echo ""
echo "=== Despliegue ==="
echo "   operaciones: $OP_OPS"
echo "   perfil:      $OP_PERFIL $( [[ -f "$OP_PERFIL" ]] && echo '(ok)' || echo '(NO EXISTE)')"
echo "   respaldos:   $(ls -1 "$OP_RESPALDOS"/openproject_*.tar.gz 2>/dev/null | wc -l) archivos; último: $(ls -1t "$OP_RESPALDOS"/openproject_*.tar.gz 2>/dev/null | head -1 | xargs -r basename)"
