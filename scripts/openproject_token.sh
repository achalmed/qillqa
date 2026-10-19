#!/usr/bin/env bash
# scripts/openproject_token.sh — enciende la integración con OpenProject: crea un token de API para una cuenta ADMINISTRADORA de OpenProject y lo guarda en el .env del SGDP sin mostrarlo; luego reinicia la API.
#
# Lo corre una PERSONA (es una credencial): el asistente no genera ni maneja tokens.
# Equivale a «OpenProject → Mi cuenta → Tokens de acceso → API → Generar» y pegarlo en
# OPENPROJECT_TOKEN, sin copiar nada a mano. El token nunca se imprime ni queda en el historial.
#
# Uso:
#   scripts/openproject_token.sh <login-administrador-de-openproject>
#   scripts/openproject_token.sh <login> --sin-reinicio     # solo guarda el token
# Requisitos: el contenedor de OpenProject sano (OPENPROJECT_CONTENEDOR, por defecto «openproject»),
# y OPENPROJECT_URL en el .env (plantilla en .env.example). Detalle: docs/decisiones.md «OpenProject integrado».
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$RAIZ/.env"
CONTENEDOR="${OPENPROJECT_CONTENEDOR:-openproject}"
LOGIN="${1:-}"
REINICIAR=1
[[ "${2:-}" == "--sin-reinicio" ]] && REINICIAR=0

if [[ -z "$LOGIN" ]]; then
  echo "Uso: $0 <login-administrador-de-openproject> [--sin-reinicio]" >&2
  exit 2
fi
[[ -f "$ENV" ]] || { echo "❌ No existe $ENV" >&2; exit 1; }
grep -q '^OPENPROJECT_URL=' "$ENV" || { echo "❌ Falta OPENPROJECT_URL en $ENV (ver .env.example)" >&2; exit 1; }
docker inspect --format '{{.State.Health.Status}}' "$CONTENEDOR" 2>/dev/null | grep -q healthy \
  || { echo "❌ El contenedor «$CONTENEDOR» no está sano (cd ~/Documents/05\\ tasks && ./estado.sh)" >&2; exit 1; }

read -r -p "Se creará un token de API de OpenProject para «$LOGIN» y se guardará en $ENV. ¿Continuar? [s/N] " ok
[[ "$ok" =~ ^[sS]$ ]] || { echo "Cancelado."; exit 0; }

# rails runner dentro del contenedor; la salida va a una variable, nunca a la pantalla.
salida="$(OP_LOGIN="$LOGIN" docker exec -i -e OP_LOGIN "$CONTENEDOR" bash -lc 'cd /app && bundle exec rails runner -' 2>/dev/null <<'RUBY'
u = User.find_by(login: ENV["OP_LOGIN"])
if u.nil?
  puts "ERROR=no existe la cuenta"
elsif !u.admin?
  puts "ERROR=la cuenta no es administradora"
else
  t = Token::API.create!(user: u)
  puts "TOKEN=#{t.plain_value}"
end
RUBY
)" || true
token="$(printf '%s\n' "$salida" | sed -n 's/^TOKEN=//p' | tail -1)"
if [[ -z "$token" ]]; then
  echo "❌ No se pudo crear el token: $(printf '%s\n' "$salida" | sed -n 's/^ERROR=//p' | tail -1)" >&2
  exit 1
fi

# Escribe o reemplaza OPENPROJECT_TOKEN sin pasar el valor por la línea de órdenes.
OP_TOKEN="$token" python3 - "$ENV" <<'PY'
import os, sys
ruta, token = sys.argv[1], os.environ["OP_TOKEN"]
lineas = open(ruta, encoding="utf-8").read().splitlines()
lineas = [l for l in lineas if not l.startswith("OPENPROJECT_TOKEN=")]
lineas.append(f"OPENPROJECT_TOKEN={token}")
open(ruta, "w", encoding="utf-8").write("\n".join(lineas) + "\n")
PY
unset token salida
chmod 600 "$ENV"
echo "✅ Token guardado en $ENV (no se muestra)."

if [[ "$REINICIAR" == 1 ]]; then
  echo "Reiniciando la API para encender la integración…"
  pid="$(pgrep -f '[u]vicorn app.main:app --host .* --port 8000' || true)"
  [[ -n "$pid" ]] && kill $pid && sleep 3
  (cd "$RAIZ" && setsid nohup ./iniciar.sh > /dev/null 2>&1 < /dev/null &)
  if curl -s -m 5 --retry 40 --retry-delay 2 --retry-connrefused http://127.0.0.1:8000/api/health > /dev/null; then
    echo "✅ API en marcha. Vea el estado en el SGDP → Administración → OpenProject."
  else
    echo "⚠ La API no respondió todavía; revise api.log." >&2
  fi
fi
