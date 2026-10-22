#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# =====================================================================
#  instalar_enlace_fijo.sh  --  UNA SOLA VEZ. Deja Qillqa con un enlace
#  de internet PERMANENTE y con arranque automático al prender la laptop.
# ---------------------------------------------------------------------
#  Después de correr esto:
#    * El despacho entra SIEMPRE por la misma dirección
#      (https://<laptop>.<red>.ts.net). Nunca más hay que mandar enlaces.
#    * Al encender la laptop, el sistema arranca solo y se publica solo.
#    * No se paga nada: Tailscale Funnel es gratis en el plan personal.
#
#  Qué hace, paso a paso (pide la contraseña de la laptop en el paso 1):
#    1. Instala Tailscale (el programa que presta la dirección fija).
#    2. Conecta esta laptop a tu cuenta (se abre el navegador una vez).
#    3. Activa la publicación en internet del puerto de la web.
#    4. Deja el arranque automático configurado (servicio del usuario).
#
#  Uso:   ./instalar_enlace_fijo.sh
# =====================================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================================"
echo "  Qillqa — instalación del ENLACE PERMANENTE (gratis)"
echo "======================================================================"
echo ""

# --- 1. Tailscale -----------------------------------------------------
if ! command -v tailscale >/dev/null 2>&1; then
  echo "== 1/4  Instalando Tailscale (pide la contraseña de la laptop) =="
  curl -fsSL https://tailscale.com/install.sh | sh || {
    echo "[error] No se pudo instalar Tailscale. ¿Hay internet?"
    exit 1
  }
else
  echo "== 1/4  Tailscale ya está instalado. =="
fi

# --- 2. Conectar la laptop a la cuenta -------------------------------
if ! tailscale status >/dev/null 2>&1; then
  echo ""
  echo "== 2/4  Conectando esta laptop a tu cuenta =="
  echo "   Se abrirá un enlace en el navegador: entra con tu correo (Google"
  echo "   sirve) y autoriza la laptop. Es gratis y de una sola vez."
  echo ""
  # El nombre del nodo ES el enlace público (https://<nodo>.<red>.ts.net): el equipo lo guarda en sus marcadores y en la
  # aplicación instalada. Es qillqa-despacho desde el corte de la plataforma (10.6); cambiarlo es una mudanza con aviso
  # (docs/acceso-permanente.md §Mudanza del enlace).
  sudo tailscale up --hostname="${QILLQA_NODO:-qillqa-despacho}" || {
    echo "[error] No se completó la conexión. Vuelva a ejecutar este script."
    exit 1
  }
else
  echo "== 2/4  La laptop ya está conectada a Tailscale. =="
fi

DOMINIO="$(tailscale status --json 2>/dev/null | grep -oP '"DNSName"\s*:\s*"\K[^"]+' | head -1)"
DOMINIO="${DOMINIO%.}"

# --- 3. Publicar en internet (Funnel) --------------------------------
echo ""
echo "== 3/4  Publicando el sistema en internet =="
if ! curl -s -m 2 http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "   (la web no está encendida; arrancando el sistema primero)"
  ./iniciar.sh >/dev/null 2>&1
  for _ in $(seq 1 30); do curl -s -m 2 http://127.0.0.1:5173/ >/dev/null 2>&1 && break; sleep 1; done
fi
# Funnel viene APAGADO de fábrica en toda cuenta nueva, y a propósito: el paso
# anterior solo hizo visible la laptop para TUS dispositivos; Funnel la abre a
# internet, y Tailscale exige que esa decisión se tome desde el panel de la
# cuenta y no desde un script. Cuando falta, imprime arriba el enlace para
# habilitarlo. No es un error de la instalación: es el clic que falta.
# Que el usuario pueda manejar Tailscale sin sudo: el arranque automático
# corre como usuario y necesita consultar/activar la publicación.
sudo tailscale set --operator="$USER" 2>/dev/null || true
if ! sudo tailscale funnel --bg 5173; then
  echo ""
  echo "======================================================================"
  echo "  FALTA UN CLIC — no es un error, la instalación va bien."
  echo ""
  echo "  Publicar en internet hay que habilitarlo UNA vez desde la web de"
  echo "  Tailscale (es gratis). Justo arriba de este mensaje aparece un"
  echo "  enlace del tipo:"
  echo "      https://login.tailscale.com/f/funnel?node=..."
  echo ""
  echo "  1. Ábrelo y entra con la MISMA cuenta con la que conectaste la"
  echo "     laptop; pulsa el botón que habilita Funnel."
  echo "  2. Si además pide certificados HTTPS, actívalos en:"
  echo "        https://login.tailscale.com/admin/dns"
  echo "     (interruptor «HTTPS Certificates»)."
  echo "  3. Vuelve aquí y ejecuta otra vez:  ./instalar_enlace_fijo.sh"
  echo "     Se salta lo ya hecho y sigue desde este punto."
  echo ""
  [[ -n "${DOMINIO:-}" ]] && echo "  Al terminar, el enlace del despacho será:"
  [[ -n "${DOMINIO:-}" ]] && echo "      https://${DOMINIO}"
  echo "======================================================================"
  exit 1
fi

# --- 4. Arranque automático al encender la laptop --------------------
echo ""
echo "== 4/4  Arranque automático al encender la laptop =="
mkdir -p "$HOME/.config/systemd/user"
# OJO: las rutas van ENTRE COMILLAS. La carpeta del proyecto tenía espacios (hasta M10 D2)
# y systemd, sin comillas, cortaba ExecStart en la primera palabra de la ruta y
# fallaba con «203/EXEC» — era la razón de que el enlace no se activara solo
# al encender (Edison 2026-09-05). La espera de internet, Docker y Tailscale
# vive en arranque_automatico.sh, que además reintenta.
cat > "$HOME/.config/systemd/user/qillqa.service" <<UNIT
[Unit]
Description=Qillqa — sistema de gestión documental del despacho (arranque y publicación)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DIR}
ExecStart="${DIR}/arranque_automatico.sh"
ExecStop="${DIR}/detener.sh"
# arranque_automatico.sh espera hasta 20 min a cada cosa y reintenta.
TimeoutStartSec=3600

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable qillqa.service >/dev/null 2>&1
# «Linger» = los servicios del usuario arrancan al encender la máquina,
# sin esperar a que alguien inicie sesión gráfica.
sudo loginctl enable-linger "$USER" 2>/dev/null || true

echo ""
echo "======================================================================"
echo "  LISTO — el enlace del despacho es, de ahora en adelante:"
echo ""
echo "      https://${DOMINIO}"
echo ""
echo "  * Mándalo UNA sola vez al grupo. No cambia nunca más."
echo "  * Al encender la laptop, el sistema arranca y se publica solo."
echo "  * Si se cae el internet, el enlace vuelve a funcionar al volver la"
echo "    señal: no hay que hacer nada ni reenviar nada."
echo ""
echo "  Comprobar el enlace:   ./enlace.sh --ver"
echo "  Dejar de publicar:     ./enlace.sh --apagar"
echo "======================================================================"
