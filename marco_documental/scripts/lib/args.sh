#!/usr/bin/env bash
# =====================================================================
#  lib/args.sh  --  Parseo de argumentos (una responsabilidad)
# ---------------------------------------------------------------------
#  Sale: ARG_MASTER, ARG_CLEAN, ARG_HELP
# =====================================================================

args_parse() {
  ARG_MASTER=""
  ARG_CLEAN=false
  ARG_HELP=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --clean)   ARG_CLEAN=true ;;
      -h|--help) ARG_HELP=true ;;
      -*)
        log_error "Opcion desconocida: $1"
        return 2
        ;;
      *)
        if [[ -n "$ARG_MASTER" ]]; then
          log_error "Solo se admite un maestro; sobra: $1"
          return 2
        fi
        ARG_MASTER="$1"
        ;;
    esac
    shift
  done
  return 0
}

args_usage() {
  cat <<EOF
Uso: ${ARG_PROG:-build.sh} [opciones] <ruta/al/maestro.tex>

Compila un documento del Marco Documental del Despacho (LuaLaTeX).
El PDF queda junto al maestro.

Opciones:
  --clean      solo borra los auxiliares del maestro y sale
  -h, --help   esta ayuda

Ejemplos:
  scripts/build.sh templates/oficio/oficio.tex
  scripts/build.sh "documentos/oficios/2026-08-03-invitacion-plenario/oficio.tex"
  scripts/build.sh --clean templates/oficio/oficio.tex
EOF
}
