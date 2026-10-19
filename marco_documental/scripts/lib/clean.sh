#!/usr/bin/env bash
# =====================================================================
#  lib/clean.sh  --  Limpieza de auxiliares (una responsabilidad)
# =====================================================================

clean_aux_files() {
  local jobdir="$1" job="$2" ext borrados=0
  for ext in "${CFG_AUX_EXTS[@]}"; do
    if [[ -f "$jobdir/$job.$ext" ]]; then
      rm -f "$jobdir/$job.$ext"
      borrados=$((borrados + 1))
    fi
  done
  log_ok "Auxiliares borrados: $borrados ($job.*)"
}
