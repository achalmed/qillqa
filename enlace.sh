#!/usr/bin/env bash
# =====================================================================
#  enlace.sh  --  Publica el SGDP en internet con un enlace PERMANENTE.
# ---------------------------------------------------------------------
#  El problema que resuelve: hasta ahora había que mandar un enlace NUEVO
#  cada día (compartir.sh abre un túnel «trycloudflare» con nombre al
#  azar). Aquí el enlace es SIEMPRE EL MISMO: se manda una sola vez al
#  grupo del despacho y sirve para siempre.
#
#  Cómo funciona (sin pagar nada y sin servidor):
#    - Tailscale Funnel presta una dirección fija del tipo
#          https://<nombre-de-la-laptop>.<red>.ts.net
#      RESERVADA para esta laptop. La laptop abre la conexión hacia
#      afuera (por eso no hace falta IP fija ni tocar el router).
#    - Cuando la laptop se apaga o pierde internet, el enlace deja de
#      responder, pero NO CAMBIA: al volver, el mismo enlace funciona.
#
#  Instalación (una sola vez):   ./instalar_enlace_fijo.sh
#  Uso normal:                   ./enlace.sh        (o solo, al arrancar)
#  Ver el enlace:                ./enlace.sh --ver
#  Apagar la publicación:        ./enlace.sh --apagar
#
#  Si Tailscale todavía no está instalado, este script cae al túnel
#  temporal de Cloudflare (el de siempre) para no dejar al despacho sin
#  acceso, y lo avisa.
# =====================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PUERTO_WEB=5173
ACCION="${1:-abrir}"

# --- Aviso por Telegram (opcional) -----------------------------------
# Si en .env están TELEGRAM_TOKEN y TELEGRAM_CHAT, se avisa al grupo del
# despacho cuando el sistema queda arriba. Con enlace fijo el aviso ya no
# es imprescindible, pero sirve para saber que la laptop está encendida.
avisar_telegram() {
  local texto="$1"
  # shellcheck disable=SC1091
  source "$DIR/entorno.sh" && sgdp_cargar_env 2>/dev/null || true
  [[ -z "${TELEGRAM_TOKEN:-}" || -z "${TELEGRAM_CHAT:-}" ]] && return 0
  curl -s -m 10 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT}" \
    -d "disable_web_page_preview=true" \
    --data-urlencode "text=${texto}" >/dev/null 2>&1 || true
}

# --- ¿Está la web encendida? -----------------------------------------
web_viva() { curl -s -m 2 "http://127.0.0.1:${PUERTO_WEB}/" >/dev/null 2>&1; }

# --- Dirección fija que presta Tailscale ------------------------------
url_tailscale() {
  command -v tailscale >/dev/null 2>&1 || return 1
  local host
  host="$(tailscale status --json 2>/dev/null | grep -oP '"DNSName"\s*:\s*"\K[^"]+' | head -1)"
  [[ -z "$host" ]] && return 1
  echo "https://${host%.}"
}

# ---------------------------------------------------------- --ver
if [[ "$ACCION" == "--ver" ]]; then
  if url="$(url_tailscale)"; then
    echo "Enlace permanente del SGDP:  $url"
    tailscale funnel status 2>/dev/null | sed 's/^/  /'
  else
    echo "Todavía no hay enlace permanente. Instálelo con: ./instalar_enlace_fijo.sh"
  fi
  exit 0
fi

# -------------------------------------------------------- --apagar
if [[ "$ACCION" == "--apagar" ]]; then
  if command -v tailscale >/dev/null 2>&1; then
    tailscale funnel --https=443 off 2>/dev/null || tailscale funnel off 2>/dev/null || true
    echo "Publicación en internet APAGADA (el enlace queda reservado para cuando la vuelva a encender)."
  fi
  pkill -f "cloudflared tunnel --url" 2>/dev/null || true
  exit 0
fi

# ---------------------------------------------------------- abrir
if ! web_viva; then
  echo "[aviso] La web no responde en el puerto ${PUERTO_WEB}. Arrancando el sistema..."
  # La salida va al LOG y no a /dev/null: este es el unico momento en que el
  # sistema arranca sin nadie mirando, o sea justo cuando hace falta saber
  # POR QUE fallo. El 2026-09-09 fallaron los 10 intentos del arranque y el
  # motivo se habia tirado a /dev/null: hubo que deducirlo horas despues.
  # Y se espera DE VERDAD: compilar la interfaz en una laptop recien
  # encendida (disco frio, Docker y Tailscale arrancando a la vez) pasa de
  # los 30 s con holgura, y el corte deja al despacho sin sistema.
  mkdir -p "$DIR/logs"; ./iniciar.sh >>"$DIR/logs/arranque.log" 2>&1
  for _ in $(seq 1 180); do web_viva && break; sleep 1; done
fi
if ! web_viva; then
  echo "[error] No se pudo arrancar la web. Revise logs/web.log y logs/api.log."
  avisar_telegram "⚠️ SGDP: la laptop se encendió pero el sistema NO arrancó. Revisar."
  exit 1
fi

# --- Camino 1: enlace PERMANENTE con Tailscale Funnel ----------------
# ¿La publicación ya está guardada en Tailscale? `funnel --bg` la deja
# PERSISTENTE (se reaplica sola al arrancar tailscaled), y consultarla no
# necesita root, mientras que volver a activarla sí (salvo que se haya
# corrido `tailscale set --operator=$USER`). Sin esta comprobación, el
# arranque automático —que corre sin sudo— tomaba el «Access denied» como
# fallo y abría el túnel temporal aunque el enlace fijo estuviera activo.
funnel_activo() {
  tailscale funnel status 2>/dev/null | grep -q "127.0.0.1:${PUERTO_WEB}"
}
if command -v tailscale >/dev/null 2>&1 && tailscale status >/dev/null 2>&1; then
  # --bg deja la publicación GUARDADA: se vuelve a aplicar sola cada vez
  # que arranca Tailscale, o sea cada vez que se enciende la laptop.
  if funnel_activo || tailscale funnel --bg "${PUERTO_WEB}" >/dev/null 2>&1 || funnel_activo; then
    url="$(url_tailscale)"
    echo "======================================================================"
    echo "  SGDP PUBLICADO EN INTERNET — ENLACE PERMANENTE"
    echo "      $url"
    echo ""
    echo "  Este enlace NO cambia. Mándelo una sola vez al grupo del despacho."
    echo "  Mientras la laptop esté encendida y con internet, el enlace abre."
    echo "======================================================================"
    avisar_telegram "✅ SGDP encendido. Entren por: $url"
    exit 0
  fi
  echo "[aviso] Tailscale está instalado pero Funnel no pudo activarse."
  echo "        Ejecute:  ./instalar_enlace_fijo.sh   para terminar de configurarlo"
  echo "        (o, para no necesitar sudo:  sudo tailscale set --operator=\$USER)."
fi

# --- Camino 2 (respaldo): túnel TEMPORAL de Cloudflare ---------------
echo "[aviso] Aún no hay enlace permanente; abriendo el túnel temporal de siempre."
echo "        Para dejar de mandar enlaces todos los días: ./instalar_enlace_fijo.sh"
if [[ ! -x bin/cloudflared ]]; then
  echo "[error] Falta bin/cloudflared."
  exit 1
fi
: > logs/cloudflared.log
nohup bin/cloudflared tunnel --url "http://127.0.0.1:${PUERTO_WEB}" --no-autoupdate \
  > logs/cloudflared.log 2>&1 &
for _ in $(seq 1 30); do
  url="$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' logs/cloudflared.log | head -1)"
  [[ -n "$url" ]] && break
  sleep 1
done
if [[ -z "${url:-}" ]]; then
  echo "[error] El túnel no devolvió un enlace. Revise logs/cloudflared.log."
  exit 1
fi
echo "Enlace TEMPORAL de hoy:  $url"
avisar_telegram "🔗 SGDP encendido. Enlace de HOY (cambia cada vez): $url"
