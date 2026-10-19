#!/usr/bin/env bash
# entorno.sh — sgdp: dónde vive el despliegue (la carpeta de operaciones del despacho) y su .env; lo cargan
# iniciar.sh, respaldar.sh y enlace.sh. Contrato ADR-15 (ola 9, 2026-10-10): SGDP_OPERACIONES → por defecto
# $DESPACHO_DIR/operaciones/sgdp (DESPACHO_DIR de core/env.sh del workspace); allí viven .env y respaldos/.
# Nunca enlaces simbólicos entre repos. Un despliegue local sin despacho pone su .env en la raíz del repo.
#
# Uso:  source entorno.sh && sgdp_cargar_env      (define y exporta SGDP_RAIZ, SGDP_OPERACIONES, SGDP_ENV,
#                                                 SGDP_RESPALDOS y las variables del .env)
#       ./entorno.sh --comprobar                   (rutas resueltas y si existen; no imprime valores del .env)
sgdp_entorno() {
  SGDP_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -z "${DESPACHO_DIR:-}" ]]; then
    local up="$SGDP_RAIZ"
    while [[ "$up" != / && ! -f "$up/core/env.sh" ]]; do up="$(dirname "$up")"; done
    # shellcheck disable=SC1091
    [[ -f "$up/core/env.sh" ]] && source "$up/core/env.sh"
  fi
  if [[ -z "${SGDP_OPERACIONES:-}" ]]; then
    if [[ -f "$SGDP_RAIZ/.env" && ! -L "$SGDP_RAIZ/.env" ]]; then
      SGDP_OPERACIONES="$SGDP_RAIZ"                       # despliegue local sin despacho
    elif [[ -n "${DESPACHO_DIR:-}" ]]; then
      SGDP_OPERACIONES="$DESPACHO_DIR/operaciones/sgdp"
    fi
  fi
  SGDP_ENV="${SGDP_OPERACIONES:+$SGDP_OPERACIONES/.env}"
  SGDP_RESPALDOS="${SGDP_OPERACIONES:+$SGDP_OPERACIONES/respaldos}"
  export SGDP_RAIZ SGDP_OPERACIONES SGDP_ENV SGDP_RESPALDOS
  return 0
}

sgdp_cargar_env() {   # exporta el .env del despliegue; 1 con mensaje si no existe
  sgdp_entorno
  if [[ -z "${SGDP_ENV:-}" || ! -f "$SGDP_ENV" ]]; then
    echo "[error] No encuentro el .env del despliegue (${SGDP_ENV:-sin DESPACHO_DIR}): defina SGDP_OPERACIONES o DESPACHO_DIR (core/env.sh)." >&2
    echo "        Despliegue local sin despacho: cp .env.example .env en la raíz del repo." >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$SGDP_ENV"
  set +a
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-}" in
    --comprobar)
      sgdp_entorno; fallos=0
      for v in SGDP_RAIZ SGDP_OPERACIONES SGDP_ENV SGDP_RESPALDOS; do
        ruta="${!v}"; estado="no existe"; [[ -n "$ruta" && -e "$ruta" ]] && estado="existe"; [[ -n "$ruta" && -L "$ruta" ]] && estado="$estado (enlace)"
        [[ "$estado" == "existe" ]] || fallos=$((fallos+1))
        printf '%-18s %s · %s\n' "$v" "${ruta/#$HOME/~}" "$estado"
      done
      exit $(( fallos ? 1 : 0 )) ;;
    *) echo "uso: source entorno.sh && sgdp_cargar_env | ./entorno.sh --comprobar" >&2; exit 2 ;;
  esac
fi
