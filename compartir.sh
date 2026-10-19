#!/usr/bin/env bash
# =====================================================================
#  compartir.sh  --  Abre un enlace PÚBLICO (túnel Cloudflare) para que
#  las secretarias y tú entren al SGDP desde CUALQUIER lugar (otra
#  ciudad, sus casas), sin instalar nada y sin abrir puertos del router.
#
#  Requisitos: el sistema ya encendido (./iniciar.sh).
#  Uso:   ./compartir.sh
#         -> imprime un enlace https://algo.trycloudflare.com
#            Cópielo y páselo a las secretarias.
#
#  Para DEJAR de compartir: cierre esta ventana (Ctrl+C) o ./detener.sh --todo
#
#  ⚠️ ESTE ENLACE ES TEMPORAL y CAMBIA cada vez que se ejecuta. Ya no hace
#  falta usarlo: para un enlace PERMANENTE (el mismo siempre, gratis, que
#  se vuelve a publicar solo al encender la laptop) instale una sola vez:
#         ./instalar_enlace_fijo.sh
#  y después use  ./enlace.sh  (ver docs/acceso-permanente.md).
#  Este script queda como respaldo por si el enlace fijo falla.
# =====================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! curl -s -m2 http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "[error] La web no está encendida. Ejecute primero:  ./iniciar.sh"
  exit 1
fi
if [[ ! -x bin/cloudflared ]]; then
  echo "[error] Falta bin/cloudflared. Descárguelo con:"
  echo "  curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o bin/cloudflared && chmod +x bin/cloudflared"
  exit 1
fi

echo "Abriendo el enlace público (túnel Cloudflare)... espere unos segundos."
echo "Cuando aparezca 'https://....trycloudflare.com', ese es el enlace para las secretarias."
echo "Para dejar de compartir: presione Ctrl+C."
echo "----------------------------------------------------------------------"
exec bin/cloudflared tunnel --url http://127.0.0.1:5173 --no-autoupdate
