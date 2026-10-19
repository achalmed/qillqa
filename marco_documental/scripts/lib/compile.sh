#!/usr/bin/env bash
# =====================================================================
#  lib/compile.sh  --  Invocacion del motor (una responsabilidad)
# ---------------------------------------------------------------------
#  Ejecuta CFG_PASADAS de CFG_MOTOR dentro del directorio del maestro.
#  El PDF queda junto al maestro (mismo contrato que el AWF).
# =====================================================================

compile_master() {
  # Al menos CFG_PASADAS; despues, mientras .aux o .toc cambien (indice, lastpage), hasta CFG_PASADAS_MAX.
  local pasada firma firma_prev="" max="${CFG_PASADAS_MAX:-$CFG_PASADAS}"
  for ((pasada = 1; pasada <= max; pasada++)); do
    log_info "Pasada $pasada/$max: $CFG_MOTOR $ENV_JOB.tex"
    if ! (cd "$ENV_JOBDIR" && "$CFG_MOTOR" "${CFG_OPCIONES[@]}" "$ENV_JOB.tex" >/dev/null); then
      log_error "Fallo la compilacion. Revisa: $ENV_JOBDIR/$ENV_JOB.log"
      return 1
    fi
    firma="$(cd "$ENV_JOBDIR" && { cat "$ENV_JOB.aux" "$ENV_JOB.toc" 2>/dev/null || true; } | md5sum)"
    if (( pasada >= CFG_PASADAS )) && [[ "$firma" == "$firma_prev" ]]; then
      break
    fi
    firma_prev="$firma"
  done
  log_ok "PDF generado: $ENV_JOBDIR/$ENV_JOB.pdf"
}
