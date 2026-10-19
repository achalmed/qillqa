#!/usr/bin/env bash
# sembrar.sh — openproject_despacho: aplica los seeds (configuración como código) a la instancia viva leyendo el perfil del despacho; simula por defecto.
#
# Uso:
#   ./sembrar.sh                      # dry run de TODOS los seeds en orden (nada cambia)
#   ./sembrar.sh --aplicar            # aplica todos
#   ./sembrar.sh [--aplicar] seeds/20_proyectos.rb seeds/30_activacion_por_proyecto.rb
#   ./sembrar.sh --ids                # regenera op_ids.json en la carpeta de operaciones (solo lectura)
#
# Cómo funciona: cada seed se ejecuta como `rails runner` dentro del contenedor, precedido por
# seeds/_prelude.rb, que (1) carga el perfil YAML desde OP_PERFIL_YAML en la constante PERFIL,
# (2) abre una transacción de base de datos y (3) al salir la revierte (dry run) o la confirma
# (--aplicar). Un seed que aborta también se revierte. Los seeds son idempotentes: correrlos dos
# veces no duplica nada.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
cd "$OP_RAIZ"

MODO=dry-run; IDS=0; SEEDS=()
for a in "$@"; do
  case "$a" in
    --aplicar) MODO=aplicar ;;
    --dry-run) MODO=dry-run ;;
    --ids)     IDS=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *)         SEEDS+=("$a") ;;
  esac
done

[[ -f "$OP_PERFIL" ]] || { echo "❌ No existe el perfil $OP_PERFIL (OPENPROJECT_PERFIL en $OP_ENV)" >&2; exit 1; }
docker inspect --format '{{.State.Health.Status}}' "$OP_CONTENEDOR" 2>/dev/null | grep -q healthy \
  || { echo "❌ El contenedor $OP_CONTENEDOR no está healthy (./estado.sh)" >&2; exit 1; }

correr() {  # correr SEED MODO
  local seed="$1" modo="$2" dry=1
  [[ "$modo" == aplicar ]] && dry=0
  echo "### $(basename "$seed")  [$modo]"
  cat seeds/_prelude.rb "$seed" | docker exec -i \
      -e OP_DRY_RUN="$dry" \
      -e OP_PERFIL_YAML="$(cat "$OP_PERFIL")" \
      -e OP_TEMP_PASSWORD="${OP_TEMP_PASSWORD:-}" \
      "$OP_CONTENEDOR" bundle exec rails runner /dev/stdin
}

if [[ $IDS -eq 1 ]]; then
  salida="$(correr seeds/05_volcar_ids.rb dry-run)"
  echo "$salida" | grep -v '^__OP_IDS__' || true
  json="$(echo "$salida" | sed -n 's/^__OP_IDS__//p')"
  [[ -n "$json" ]] || { echo "❌ 05_volcar_ids.rb no devolvió el JSON" >&2; exit 1; }
  printf '%s\n' "$json" > "$OP_IDS"
  echo "✅ $OP_IDS regenerado ($(wc -c < "$OP_IDS") bytes)"
  exit 0
fi

if [[ ${#SEEDS[@]} -eq 0 ]]; then
  mapfile -t SEEDS < <(ls seeds/[1-9]*.rb | sort)
fi
for s in "${SEEDS[@]}"; do
  [[ -f "$s" ]] || { echo "❌ no existe $s" >&2; exit 1; }
  correr "$s" "$MODO"
  echo
done
[[ "$MODO" == dry-run ]] && echo "(Simulación: ninguna transacción se confirmó. Repita con --aplicar para escribir.)"
exit 0
