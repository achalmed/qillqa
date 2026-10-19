#!/usr/bin/env bash
# =====================================================================
#  build.sh  --  Compilador del Marco Documental del Despacho
# ---------------------------------------------------------------------
#  Punto de entrada DELGADO: solo orquesta. La logica vive en modulos
#  de responsabilidad unica bajo lib/ y los parametros en config.sh
#  (mismo patron que el Academic Writing Framework).
#
#  Uso:
#     scripts/build.sh [opciones] <ruta/al/maestro.tex>
#     scripts/build.sh templates/oficio/oficio.tex
#     scripts/build.sh --clean templates/oficio/oficio.tex
#     scripts/build.sh --help
#
#  Motor: LuaLaTeX (unico soportado: fontspec + fuentes vendorizadas).
# =====================================================================
set -euo pipefail

# --- Carga de configuracion y modulos --------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "$SCRIPT_DIR/config.sh"
# shellcheck source=lib/logging.sh
source "$SCRIPT_DIR/lib/logging.sh"
# shellcheck source=lib/args.sh
source "$SCRIPT_DIR/lib/args.sh"
# shellcheck source=lib/env.sh
source "$SCRIPT_DIR/lib/env.sh"
# shellcheck source=lib/clean.sh
source "$SCRIPT_DIR/lib/clean.sh"
# shellcheck source=lib/compile.sh
source "$SCRIPT_DIR/lib/compile.sh"
# shellcheck source=lib/nombrado.sh
source "$SCRIPT_DIR/lib/nombrado.sh"

logging_init

# --- 1. Parseo de argumentos -----------------------------------------
ARG_PROG="$(basename "$0")"
args_parse "$@" || exit $?

if [[ "$ARG_HELP" == true ]]; then
  args_usage
  exit 0
fi

if [[ -z "$ARG_MASTER" ]]; then
  args_usage >&2
  exit 2
fi

# --- 2. Resolucion del entorno ---------------------------------------
env_resolve "$SCRIPT_DIR" "$ARG_MASTER" || exit 1

# --- 3. Modo limpieza (solo limpia y sale) ---------------------------
if [[ "$ARG_CLEAN" == true ]]; then
  clean_aux_files "$ENV_JOBDIR" "$ENV_JOB"
  exit 0
fi

# --- 4. Compilacion --------------------------------------------------
env_export_rutas
compile_master

# --- 5. Nombre institucional del PDF ---------------------------------
nombrado_final

# --- 6. Limpieza de auxiliares (NORMATIVA §5: ni .aux ni .log junto a la fuente) ---
if [[ "${CFG_LIMPIAR_TRAS_COMPILAR:-false}" == true ]]; then
  clean_aux_files "$ENV_JOBDIR" "$ENV_JOB"
fi
