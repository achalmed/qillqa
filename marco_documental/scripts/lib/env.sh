#!/usr/bin/env bash
# =====================================================================
#  lib/env.sh  --  Entorno de compilacion (una responsabilidad: rutas)
# ---------------------------------------------------------------------
#  Detecta la raiz del framework, resuelve el maestro y exporta las
#  variables kpathsea para que LuaLaTeX encuentre TODO el framework:
#
#    TEXINPUTS      -> clases, nucleo, membretes, estructuras, logos
#    TTFONTS        -> fuentes .ttf vendorizadas (assets/fonts/)
#    OPENTYPEFONTS  -> idem .otf (por si se agregan)
#
#  OJO: la ruta del despacho contiene ESPACIOS; kpathsea los tolera
#  (verificado con LuaLaTeX), por eso NO se citan dentro del valor.
#
#  Sale: ENV_FW, ENV_MASTER_ABS, ENV_JOBDIR, ENV_JOB.
# =====================================================================

env_resolve() {
  local script_dir="$1" master="$2"

  local up="$script_dir" i
  for ((i = 0; i < CFG_FW_LEVELS; i++)); do
    up="$up/.."
  done
  ENV_FW="$(cd "$up" && pwd)"

  [[ -f "$master" ]] || { log_error "No existe: $master"; return 1; }
  ENV_MASTER_ABS="$(cd "$(dirname "$master")" && pwd)/$(basename "$master")"
  ENV_JOBDIR="$(dirname "$ENV_MASTER_ABS")"
  ENV_JOB="$(basename "$ENV_MASTER_ABS" .tex)"
  return 0
}

env_export_rutas() {
  # El esquema documental (core/esquema/) y los esquemas (esquemas/*.tex) viven en
  # el Academic Writing Framework y se comparten, no se copian. Se localiza POR
  # NOMBRE con core/env.sh del workspace (WRITING_DIR), nunca por ruta relativa,
  # y va al FINAL: lo propio del MDD (core/lib/metadata.tex...) gana siempre.
  local awf="${WRITING_DIR:-}"
  if [[ -z "$awf" ]]; then
    local up="$ENV_FW"
    while [[ "$up" != / && ! -f "$up/core/env.sh" ]]; do up="$(dirname "$up")"; done
    [[ -f "$up/core/env.sh" ]] && awf="$(source "$up/core/env.sh" >/dev/null && printf '%s' "$WRITING_DIR")"
  fi
  local awf_paths=""
  [[ -n "$awf" && -d "$awf/core/esquema" ]] && awf_paths="${awf}:"
  # El perfil del despacho (MDD_PERFIL) va PRIMERO: sus archivos ganan a los de
  # core/perfil-defecto/ con el mismo nombre (perfil-despacho.tex, retratos, sello).
  local perfil_paths=""
  [[ -n "${MDD_PERFIL:-}" && -d "${MDD_PERFIL}" ]] && perfil_paths="${MDD_PERFIL}//:"
  export TEXINPUTS=".:${perfil_paths}${ENV_FW}:${ENV_FW}//:${awf_paths}${TEXINPUTS:-}"
  export TTFONTS=".:${ENV_FW}//:${TTFONTS:-}"
  export OPENTYPEFONTS=".:${ENV_FW}//:${OPENTYPEFONTS:-}"
}
