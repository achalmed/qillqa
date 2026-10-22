#!/usr/bin/env bash
# config.sh — openproject_despacho: rutas y ajustes del despliegue que cargan todos los scripts (iniciar, detener, estado, respaldar, actualizar, sembrar).
#
# La suite es infraestructura reutilizable (anidada en el repo qillqa desde la ola 8, 2026-10-10); lo que es
# de UN despliegue vive fuera, en la carpeta de operaciones del despacho (`<despacho>/operaciones/openproject/`):
# `.env` (host, secreto, perfil, token), `respaldos/` y `op_ids.json`. Se localiza así, en orden:
#   1. OPENPROJECT_OPERACIONES (variable de entorno)
#   2. $DESPACHO_DIR/operaciones/openproject, con DESPACHO_DIR de core/env.sh del workspace (nunca un enlace entre repos)
# Variables del `.env` de operaciones (ver .env.example):
#   OPENPROJECT_HOST_NAME, OPENPROJECT_SECRET_KEY_BASE, OPENPROJECT_HOSTS_ADICIONALES  → docker compose
#   OPENPROJECT_PERFIL       → YAML con proyectos, campos y roster del despacho (seeds)
#   OPENPROJECT_URL, OPENPROJECT_TOKEN → puentes (bridges/)
#   OPENPROJECT_RESPALDOS_CONSERVAR (14) → rotación de respaldar.sh
#   OP_TEMP_PASSWORD         → contraseña temporal de los usuarios sembrados (70_usuarios.rb)
set -o pipefail

OP_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# core/env.sh del workspace (DESPACHO_DIR): se sube desde esta carpeta hasta encontrarlo
if [[ -z "${DESPACHO_DIR:-}" ]]; then
  _op_up="$OP_RAIZ"
  while [[ "$_op_up" != / && ! -f "$_op_up/core/env.sh" ]]; do _op_up="$(dirname "$_op_up")"; done
  # shellcheck disable=SC1091
  [[ -f "$_op_up/core/env.sh" ]] && source "$_op_up/core/env.sh"
  unset _op_up
fi
OP_OPS="${OPENPROJECT_OPERACIONES:-${DESPACHO_DIR:+$DESPACHO_DIR/operaciones/openproject}}"
if [[ -z "$OP_OPS" || ! -d "$OP_OPS" ]]; then
  echo "❌ No encuentro la carpeta de operaciones (${OP_OPS:-sin DESPACHO_DIR}): defina OPENPROJECT_OPERACIONES o DESPACHO_DIR (core/env.sh)" >&2
  echo "   (ver README.md §Qué es y docs/despliegue.md: .env, respaldos/ y op_ids.json viven en el despacho, fuera del repo)" >&2
  exit 1
fi
OP_OPS="$(cd "$OP_OPS" && pwd)"
OP_ENV="$OP_OPS/.env"
if [[ ! -f "$OP_ENV" ]]; then
  echo "❌ No existe $OP_ENV. Copie .env.example allí y complételo." >&2
  exit 1
fi
set -a; # shellcheck disable=SC1090
source "$OP_ENV"; set +a

OP_CONTENEDOR="${OPENPROJECT_CONTENEDOR:-openproject}"
OP_RESPALDOS="$OP_OPS/respaldos"
OP_IDS="${OPENPROJECT_IDS:-$OP_OPS/op_ids.json}"
OP_PERFIL="${OPENPROJECT_PERFIL:-$OP_OPS/perfil.yml}"
OP_CONSERVAR="${OPENPROJECT_RESPALDOS_CONSERVAR:-14}"
OP_URL="${OPENPROJECT_URL:-http://localhost:8080}"

# docker compose siempre con el compose del repo y el .env de operaciones
compose() { docker compose --project-directory "$OP_RAIZ" --env-file "$OP_ENV" "$@"; }
