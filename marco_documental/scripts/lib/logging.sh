#!/usr/bin/env bash
# =====================================================================
#  lib/logging.sh  --  Mensajes con color (una responsabilidad)
# =====================================================================

logging_init() {
  if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'
    C_INFO=$'\033[36m'; C_OFF=$'\033[0m'
  else
    C_OK=""; C_ERR=""; C_WARN=""; C_INFO=""; C_OFF=""
  fi
}

log_info()  { printf '%s[info]%s %s\n'  "$C_INFO" "$C_OFF" "$*"; }
log_ok()    { printf '%s[ok]%s %s\n'    "$C_OK"   "$C_OFF" "$*"; }
log_warn()  { printf '%s[aviso]%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
log_error() { printf '%s[error]%s %s\n' "$C_ERR"  "$C_OFF" "$*" >&2; }
