#!/usr/bin/env bash
# entorno.sh — qillqa: dónde vive el despliegue (la carpeta de operaciones del despacho) y su .env; lo cargan
# iniciar.sh, respaldar.sh y enlace.sh. Contrato ADR-15 (ola 9, 2026-10-10): QILLQA_OPERACIONES → por defecto
# $DESPACHO_DIR/operaciones/qillqa (DESPACHO_DIR de core/env.sh del workspace); allí viven .env y respaldos/.
# Nunca enlaces simbólicos entre repos. Un despliegue local sin despacho pone su .env en la raíz del repo.
#
# Uso:  source entorno.sh && qillqa_cargar_env      (define y exporta QILLQA_RAIZ, QILLQA_OPERACIONES, QILLQA_ENV,
#                                                 QILLQA_RESPALDOS y las variables del .env)
#       ./entorno.sh --comprobar                   (rutas resueltas y si existen; no imprime valores del .env)
qillqa_entorno() {
  QILLQA_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -z "${DESPACHO_DIR:-}" ]]; then
    local up="$QILLQA_RAIZ"
    while [[ "$up" != / && ! -f "$up/core/env.sh" ]]; do up="$(dirname "$up")"; done
    # shellcheck disable=SC1091
    [[ -f "$up/core/env.sh" ]] && source "$up/core/env.sh"
  fi
  # Lectura doble (2026-10-22): la unidad del servicio en producción la define con su nombre viejo.
  QILLQA_OPERACIONES="${QILLQA_OPERACIONES:-${SGDP_OPERACIONES:-}}"
  if [[ -z "${QILLQA_OPERACIONES:-}" ]]; then
    if [[ -f "$QILLQA_RAIZ/.env" && ! -L "$QILLQA_RAIZ/.env" ]]; then
      QILLQA_OPERACIONES="$QILLQA_RAIZ"                       # despliegue local sin despacho
    elif [[ -n "${DESPACHO_DIR:-}" ]]; then
      # La carpeta del despacho conserva su nombre viejo hasta que el despacho la renombre (es suya).
      QILLQA_OPERACIONES="$DESPACHO_DIR/operaciones/qillqa"
      [[ -d "$QILLQA_OPERACIONES" || ! -d "$DESPACHO_DIR/operaciones/sgdp" ]] || QILLQA_OPERACIONES="$DESPACHO_DIR/operaciones/sgdp"
    fi
  fi
  QILLQA_ENV="${QILLQA_OPERACIONES:+$QILLQA_OPERACIONES/.env}"
  QILLQA_RESPALDOS="${QILLQA_OPERACIONES:+$QILLQA_OPERACIONES/respaldos}"
  export QILLQA_RAIZ QILLQA_OPERACIONES QILLQA_ENV QILLQA_RESPALDOS
  return 0
}

qillqa_cargar_env() {   # exporta el .env del despliegue; 1 con mensaje si no existe
  qillqa_entorno
  if [[ -z "${QILLQA_ENV:-}" || ! -f "$QILLQA_ENV" ]]; then
    echo "[error] No encuentro el .env del despliegue (${QILLQA_ENV:-sin DESPACHO_DIR}): defina QILLQA_OPERACIONES o DESPACHO_DIR (core/env.sh)." >&2
    echo "        Despliegue local sin despacho: cp .env.example .env en la raíz del repo." >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$QILLQA_ENV"
  set +a
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-}" in
    --comprobar)
      qillqa_entorno; fallos=0
      for v in QILLQA_RAIZ QILLQA_OPERACIONES QILLQA_ENV QILLQA_RESPALDOS; do
        ruta="${!v}"; estado="no existe"; [[ -n "$ruta" && -e "$ruta" ]] && estado="existe"; [[ -n "$ruta" && -L "$ruta" ]] && estado="$estado (enlace)"
        [[ "$estado" == "existe" ]] || fallos=$((fallos+1))
        printf '%-18s %s · %s\n' "$v" "${ruta/#$HOME/~}" "$estado"
      done
      exit $(( fallos ? 1 : 0 )) ;;
    *) echo "uso: source entorno.sh && qillqa_cargar_env | ./entorno.sh --comprobar" >&2; exit 2 ;;
  esac
fi
