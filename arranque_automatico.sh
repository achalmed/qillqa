#!/usr/bin/env bash
# =====================================================================
#  arranque_automatico.sh  --  Lo que corre el servicio al ENCENDER la
#  laptop: espera a que haya internet y publica el enlace permanente.
# ---------------------------------------------------------------------
#  Por qué existe (Edison 2026-09-05): al prender la laptop el enlace
#  https://<laptop>.<red>.ts.net no se activaba solo y había que correr
#  ./instalar_enlace_fijo.sh a mano. Dos causas, las dos ya corregidas:
#    1. El archivo del servicio (sgdp.service) llamaba a enlace.sh SIN
#       comillas y la carpeta del proyecto tenía espacios (hasta M10 D2): systemd
#       cortaba la ruta en la primera palabra y fallaba con 203/EXEC.
#    2. `tailscale funnel` sin sudo es denegado; enlace.sh lo tomaba como
#       fallo y abría el túnel temporal de Cloudflare. Ahora reconoce que
#       la publicación YA está guardada en Tailscale (se aplica sola).
#
#  Este script es paciente a propósito: al encender, la WiFi tarda, Docker
#  tarda y Tailscale tarda en conectarse. Espera hasta 20 minutos a cada
#  cosa y reintenta la publicación varias veces antes de darse por vencido.
#
#  Uso normal: lo lanza systemd (sgdp.service). A mano: ./arranque_automatico.sh
# =====================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

mkdir -p "$DIR/logs"
LOG="$DIR/logs/arranque.log"
registrar() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a "$LOG"; }

# --- 1. Esperar a que haya INTERNET (hasta 20 min) --------------------
# Se prueba contra Tailscale, que es justamente a quien hay que llegar.
hay_internet() {
  curl -s -m 5 -o /dev/null https://login.tailscale.com/ 2>/dev/null \
    || curl -s -m 5 -o /dev/null https://1.1.1.1/ 2>/dev/null
}
registrar "Esperando conexión a internet…"
for _ in $(seq 1 240); do hay_internet && break; sleep 5; done
if ! hay_internet; then
  registrar "Sin internet tras 20 minutos. Se arranca el sistema igual (red local) y se seguirá intentando publicar."
fi

# --- 2. Esperar a Docker (la base de datos vive ahí) ------------------
registrar "Esperando a Docker…"
for _ in $(seq 1 120); do docker info >/dev/null 2>&1 && break; sleep 5; done
docker info >/dev/null 2>&1 || registrar "[aviso] Docker no responde; iniciar.sh lo intentará de todos modos."

# --- 3. Esperar a que Tailscale esté conectado ------------------------
if command -v tailscale >/dev/null 2>&1; then
  registrar "Esperando a Tailscale…"
  for _ in $(seq 1 120); do
    tailscale status >/dev/null 2>&1 && break
    sleep 5
  done
fi

# --- 4. Arrancar y publicar, con reintentos ---------------------------
# enlace.sh arranca el sistema si hace falta (iniciar.sh) y confirma la
# publicación. Si algo falla (Docker aún despertando, DNS lento…), se
# reintenta cada 30 s hasta 10 veces.
for intento in $(seq 1 10); do
  registrar "Publicando el enlace permanente (intento $intento)…"
  if ./enlace.sh >>"$LOG" 2>&1; then
    registrar "Listo: sistema en marcha y enlace publicado."
    exit 0
  fi
  sleep 30
done
registrar "[error] No se pudo publicar tras 10 intentos. Revise logs/arranque.log, logs/api.log y logs/web.log."
exit 1
