#!/usr/bin/env bash
# =====================================================================
#  iniciar.sh  --  Arranca el SGDP en "modo laptop" con UN comando.
# ---------------------------------------------------------------------
#  - Base de datos PostgreSQL (contenedor Docker)
#  - API (FastAPI, en el entorno Python local)
#  - Interfaz web (Vite), abierta a la red local para las secretarias
#
#  Uso:   ./iniciar.sh
#  Luego, en el navegador:  http://localhost:5173
#  Las secretarias (misma red WiFi):  http://<IP-de-esta-laptop>:5173
# =====================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
# El Marco Documental es un repositorio propio (2026-09-15, M10 D1): su ruta y la del
# perfil del despacho vienen de .env (MDD_RUTA, MDD_PERFIL); no vive dentro de este repo.
# shellcheck disable=SC1091
source "$DIR/entorno.sh"; sgdp_cargar_env || exit 1          # ADR-15 (ola 9): el .env vive en la carpeta de operaciones
mkdir -p "$DIR/logs"
MDD="$(cd "${MDD_RUTA:?Defina MDD_RUTA en .env (ruta del marco documental)}" && pwd)"
[[ -f "$MDD/scripts/build.sh" ]] || { echo "MDD_RUTA no apunta a un marco documental: $MDD" >&2; exit 1; }
[[ -n "${MDD_PERFIL:-}" && -f "$MDD_PERFIL/perfil-despacho.tex" ]] || echo "   [aviso] MDD_PERFIL sin perfil-despacho.tex: los documentos saldrán con el perfil neutro" >&2

# --- Un solo arranque a la vez ---------------------------------------
# El arranque automatico reintenta cada 30 s y, en una laptop recien
# encendida, compilar la interfaz tarda MAS que eso. Sin este bloqueo cada
# reintento mataba al anterior a medio arrancar —apaga la API por su puerto
# y recompila desde cero— y el sistema no levantaba nunca: el reintento se
# saboteaba a si mismo. Paso el 2026-09-09: 10 intentos fallidos seguidos y
# el despacho sin sistema de 08:50 a 16:09, viendo «Failed to fetch» al
# entrar (la pantalla de login la servia el service worker desde cache, asi
# que el servidor muerto se veia igual que uno vivo). Ahora el segundo
# proceso ESPERA al primero en vez de competir con el.
exec 9>"$DIR/.iniciar.lock"
if ! flock -w 900 9; then
  echo "[aviso] Otro arranque lleva 15 minutos en curso; se continua igual."
fi

# --- Node y npm en arranques NO interactivos -------------------------
# node/npm los instala nvm en ~/.nvm, y nvm solo entra al PATH desde
# .zshrc/.bashrc. El servicio del usuario (sgdp.service ->
# arranque_automatico.sh) arranca con el PATH minimo de systemd, sin nvm:
# el 2026-09-10 «npm run build» murio con «npm: orden no encontrada»
# —web-build.log tenia esa sola linea—, la web nunca subio al 5173 y el
# despacho quedo sin sistema aunque el enlace de Tailscale seguia
# publicado. A mano funcionaba, que es justo lo que despista: el PATH del
# terminal NO es el del arranque. Se resuelve aqui y no en sgdp.service
# para no congelar la version de node dentro del archivo del servicio.
if ! command -v npm >/dev/null 2>&1; then
  NODE_BIN=""
  # 1) la version que nvm tiene marcada como predeterminada
  if [[ -r "$HOME/.nvm/alias/default" ]]; then
    ALIAS_NODE="$(cat "$HOME/.nvm/alias/default")"
    # el alias puede decir «v24.18.0», «lts/*» o «node»: solo sirve
    # directo cuando nombra una version instalada.
    [[ -x "$HOME/.nvm/versions/node/$ALIAS_NODE/bin/npm" ]] &&
      NODE_BIN="$HOME/.nvm/versions/node/$ALIAS_NODE/bin"
  fi
  # 2) si no, la mas reciente instalada
  if [[ -z "$NODE_BIN" ]]; then
    NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  fi
  [[ -n "$NODE_BIN" ]] && export PATH="$NODE_BIN:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[error] No se encontro npm (Node). La interfaz web no se puede compilar."
  echo "        Instale Node con nvm o deje npm en el PATH, y vuelva a intentar."
  exit 1
fi

# --- La configuracion (clave de la BD, etc.) ya está cargada por entorno.sh (SGDP_ENV) -------------

echo "== 1/3  Base de datos (PostgreSQL en Docker) =="
docker compose up -d db
# Esperar a que la BD acepte conexiones
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-sgdp}" -d "${POSTGRES_DB:-sgdp}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "== 2/3  API (FastAPI) =="
# Crear el entorno Python la primera vez, o RECREARLO si quedó roto.
# Un venv graba en sus lanzadores (backend/.venv/bin/uvicorn, pip, …) la ruta
# ABSOLUTA con la que se creó; si la carpeta del proyecto se mueve o cambia de
# nombre (pasó el 2026-09-06 y en la mudanza M10 D2 a ~/Documents/sgdp), esos lanzadores apuntan a
# un python que ya no existe y la API muere al instante con «not found» en
# api.log, dejando la web en modo «Sin servidor». Es un artefacto derivado de
# requirements.txt, así que se regenera sin pérdida.
if [[ -d backend/.venv ]] && ! backend/.venv/bin/uvicorn --version >/dev/null 2>&1; then
  echo "   el entorno Python quedó roto (ruta del proyecto cambiada): regenerando..."
  rm -rf backend/.venv
fi
if [[ ! -d backend/.venv ]]; then
  echo "   (primera vez) instalando dependencias de la API..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --quiet -r backend/requirements.txt
fi
export DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER:-sgdp}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB:-sgdp}"
export MDD_RUTA="$MDD"
export MDD_PERFIL="${MDD_PERFIL:-}"
# Prensa (2026-10-06): el estudio de Identidad Visual (editor de piezas y de fotos y videos)
# corre en 127.0.0.1:$ESTUDIO_PUERTO y la API lo publica bajo /estudio/ (api/prensa.py). La
# carpeta del repo es IDENTIDAD_VISUAL_DIR del .env o, si falta, la de core/env.sh del espacio
# de trabajo. Se enciende solo con IDENTIDAD_PERFIL: el perfil dice dónde están el banco de
# fotos y las salidas de prensa (sin él, el estudio escribiría dentro de su propio repo).
if [[ -z "${IDENTIDAD_VISUAL_DIR:-}" && -f "$DIR/../core/env.sh" ]]; then
  IDENTIDAD_VISUAL_DIR="$(bash -c 'source "$1" >/dev/null 2>&1 && printf %s "${IDENTIDAD_VISUAL_DIR:-}"' _ "$DIR/../core/env.sh" || true)"
fi
ESTUDIO_PUERTO="${ESTUDIO_PUERTO:-8099}"
export ESTUDIO_URL="${ESTUDIO_URL:-http://127.0.0.1:$ESTUDIO_PUERTO}"
# Apagar una API anterior si sigue viva (por su puerto, sin auto-matarse).
API_PID="$(ss -ltnp 2>/dev/null | grep ':8000' | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
[[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null && sleep 2 || true
# OJO con el «9>&-» de los tres lanzamientos en segundo plano: cierra el
# descriptor del candado (exec 9> de arriba) en el hijo. Sin eso, uvicorn y
# vite HEREDAN el fd y el flock sigue tomado mientras la API viva, aunque
# iniciar.sh haya terminado: el 2026-09-10 «lsof .iniciar.lock» mostraba a
# python3 reteniendolo y cada arranque posterior —el reintento del servicio
# y el ./iniciar.sh que llama instalar_enlace_fijo.sh— se quedaba 15 minutos
# parado en silencio. Un candado que el proceso que lo tomo ya no puede
# soltar no es exclusion mutua, es un bloqueo. En los lanzamientos de la web
# el «9>&-» va DOS veces —en el comando y en el parentesis— porque el subshell
# «( … & )» no muere enseguida: se queda de padre de npm, y con el fd abierto
# retenia el candado igual que uvicorn. Se comprueba con el sistema arriba:
# «lsof .iniciar.lock» no debe listar a nadie.
nohup backend/.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --app-dir backend \
  > "$DIR/logs/api.log" 2>&1 9>&- &
# Esperar a que responda
for i in $(seq 1 30); do
  curl -s -m2 http://127.0.0.1:8000/api/health >/dev/null 2>&1 && break
  sleep 1
done

echo "== 3/3  Interfaz web (Vite) =="
if [[ ! -d frontend/node_modules ]]; then
  echo "   (primera vez) instalando dependencias de la web..."
  ( cd frontend && npm install )
fi
# Edición simultánea (fase 5): servidor Hocuspocus en 127.0.0.1:8001, detrás
# del proxy /colab de la web. Si no sube, la web lo nota y las partes se
# escriben por turnos (con candado): la API y la web no dependen de él.
COLAB_PID="$(ss -ltnp 2>/dev/null | grep ':8001 ' | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
[[ -n "${COLAB_PID:-}" ]] && kill "$COLAB_PID" 2>/dev/null && sleep 1 || true
# Sin subshell ni cd: node resuelve node_modules desde la carpeta del archivo,
# y un «( … & )» se queda de padre del servidor reteniendo la salida.
SGDP_API="http://127.0.0.1:8000" COLAB_PUERTO=8001 nohup node frontend/colab/servidor.ts \
  > "$DIR/logs/colab.log" 2>&1 < /dev/null 9>&- &
# Estudio de Prensa: se relanza como el de edición simultánea (sin subshell, fd 9 cerrado). Solo
# se apaga lo que en su puerto sea el servidor del estudio, nunca otra cosa.
EST_PID="$(ss -ltnp 2>/dev/null | grep ":$ESTUDIO_PUERTO " | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [[ -n "${EST_PID:-}" ]] && tr '\0' ' ' < "/proc/$EST_PID/cmdline" 2>/dev/null | grep -q 'servidor/servidor.py'; then
  kill "$EST_PID" 2>/dev/null && sleep 1 || true
fi
ESTUDIO_SRV="${IDENTIDAD_VISUAL_DIR:-}/editor/servidor/servidor.py"
if [[ -n "${IDENTIDAD_VISUAL_DIR:-}" && -f "$ESTUDIO_SRV" && -n "${IDENTIDAD_PERFIL:-}" && -f "${IDENTIDAD_PERFIL:-}" ]]; then
  EDITOR_PUERTO="$ESTUDIO_PUERTO" EDITOR_HOST=127.0.0.1 nohup python3 "$ESTUDIO_SRV" \
    > "$DIR/logs/estudio.log" 2>&1 < /dev/null 9>&- &
else
  echo "   [aviso] Prensa sin estudio: defina IDENTIDAD_PERFIL (perfil.json de identidad) en .env" >&2
fi
WEB_PID="$(ss -ltnp 2>/dev/null | grep ':5173' | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
[[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null && sleep 1 || true
# Se sirve el BUILD, no el servidor de desarrollo. Dos razones, las dos del
# despacho y no de comodidad: (1) el modo sin conexión necesita un service
# worker, que no convive con la recarga en caliente; (2) esa misma recarga en
# caliente refrescaba las pestañas de las secretarias en mitad de un documento.
# Con SGDP_DEV=1 se levanta el servidor de desarrollo (para programar).
if [[ "${SGDP_DEV:-}" == "1" ]]; then
  echo "   (modo desarrollo: recarga en caliente, SIN modo sin conexión)"
  ( cd frontend && VITE_API_PROXY="http://127.0.0.1:8000" nohup npm run dev -- --host \
    > "$DIR/logs/web.log" 2>&1 9>&- & ) 9>&-
else
  echo "   compilando la interfaz..."
  ( cd frontend && npm run build > "$DIR/logs/web-build.log" 2>&1 ) || {
    echo "[error] No se pudo compilar la interfaz. Revise logs/web-build.log"
    exit 1
  }
  ( cd frontend && VITE_API_PROXY="http://127.0.0.1:8000" nohup npm run preview -- --host \
    > "$DIR/logs/web.log" 2>&1 9>&- & ) 9>&-
fi
sleep 3

IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192|10|172\.(1[6-9]|2[0-9]|3[01]))\.' | grep -v '^172.1[78]\.' | head -1 || true)"
echo ""
echo "======================================================================"
echo "  SGDP EN MARCHA"
echo "  En esta computadora:   http://localhost:5173"
[[ -n "$IP" ]] && echo "  En la misma red local: http://$IP:5173"
echo ""
# Enlace permanente (Tailscale Funnel): si ya está instalado, se muestra el
# enlace fijo del despacho; si no, se ofrece instalarlo de una vez.
ENLACE_FIJO="$(tailscale status --json 2>/dev/null | grep -oP '"DNSName"\s*:\s*"\K[^"]+' | head -1 || true)"
if [[ -n "${ENLACE_FIJO:-}" ]]; then
  echo "  Desde cualquier lugar (enlace PERMANENTE del despacho):"
  echo "      https://${ENLACE_FIJO%.}"
  echo "      (se republica solo; comprobarlo con ./enlace.sh --ver)"
else
  echo "  Para que las secretarias entren DESDE CUALQUIER LUGAR con un enlace"
  echo "  PERMANENTE (el mismo siempre, gratis), instálelo una sola vez:"
  echo "      ./instalar_enlace_fijo.sh"
fi
echo ""
echo "  Cuentas personales por persona; las claves se reparten desde"
echo "  Administración (la que entregas es temporal: la persona elige la suya)."
echo "  Registros: logs/api.log, logs/web.log, logs/colab.log y logs/estudio.log   |   Detener:  ./detener.sh"
echo "======================================================================"
