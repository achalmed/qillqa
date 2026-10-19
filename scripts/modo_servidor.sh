#!/usr/bin/env bash
# scripts/modo_servidor.sh — la laptop sigue sirviendo el SGDP con la tapa cerrada y sin que nadie
# la toque (Edison 2026-10-08: «dejé el laptop prendido en una comunidad y después de un tiempo
# dejó de funcionar; quiero que funcione como servidor hasta que lo apague a mano, incluso con la
# tapa cerrada»).
#
# Qué hace (pide la contraseña de la laptop una vez):
#   1. systemd-logind: cerrar la tapa no suspende (con o sin cargador) y la inactividad no apaga nada.
#   2. Los destinos de suspensión e hibernación quedan enmascarados: ni un programa ni el escritorio
#      pueden dormir la laptop por su cuenta.
#   3. GNOME (si es el escritorio): sin suspensión automática por inactividad; la pantalla sí se
#      apaga sola (eso no afecta al sistema).
#   4. El servicio del SGDP queda con «linger»: arranca aunque nadie inicie sesión gráfica.
#
# Uso:
#   scripts/modo_servidor.sh            aplica
#   scripts/modo_servidor.sh --quitar   vuelve a lo normal (la tapa suspende)
#   scripts/modo_servidor.sh --ver      muestra el estado actual, sin tocar nada
set -euo pipefail

CONF=/etc/systemd/logind.conf.d/sgdp-servidor.conf

ver() {
  echo "logind:"
  if [[ -f $CONF ]]; then sed 's/^/  /' "$CONF"; else echo "  (sin ajuste del SGDP: la tapa suspende como de fábrica)"; fi
  echo "suspensión:"
  for u in sleep.target suspend.target hibernate.target hybrid-sleep.target; do
    printf '  %-22s %s\n' "$u" "$(systemctl is-enabled "$u" 2>/dev/null || true)"
  done
  if command -v gsettings >/dev/null 2>&1; then
    echo "GNOME:"
    echo "  con cargador: $(gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 2>/dev/null || echo '?')"
    echo "  con batería:  $(gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 2>/dev/null || echo '?')"
  fi
  echo "linger: $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo '?')"
  echo "SGDP:   $(systemctl --user is-active sgdp.service 2>/dev/null || echo 'sin servicio')"
}

if [[ ${1:-} == --ver ]]; then
  ver
  exit 0
fi

if [[ ${1:-} == --quitar ]]; then
  sudo rm -f "$CONF"
  sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target
  sudo systemctl kill -s HUP systemd-logind
  if command -v gsettings >/dev/null 2>&1; then
    gsettings reset org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type || true
    gsettings reset org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type || true
  fi
  echo "Listo: la laptop vuelve a suspenderse al cerrar la tapa."
  exit 0
fi

echo "Configurando la laptop como servidor del SGDP (pide la contraseña una vez)…"
sudo install -d -m 755 "$(dirname "$CONF")"
sudo tee "$CONF" >/dev/null <<'EOF'
# Puesto por scripts/modo_servidor.sh del SGDP: la laptop sirve el sistema con la tapa cerrada.
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
# logind relee su configuración con HUP (sin reiniciar la sesión).
sudo systemctl kill -s HUP systemd-logind
if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' || true
  gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' || true
fi
loginctl enable-linger "$USER" 2>/dev/null || sudo loginctl enable-linger "$USER"
echo
ver
echo
echo "Listo. Con la tapa cerrada la pantalla se apaga, pero el SGDP sigue atendiendo."
echo "Déjela enchufada: con batería sola, el sistema se apaga cuando ella se agota."
