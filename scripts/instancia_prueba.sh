#!/usr/bin/env bash
# Entorno verde (fase 10.1 de docs/plataforma/propuesta-repositorios.md): esta copia NO opera producción;
# su API se maneja con scripts/verde.sh. La marca .verde (local, sin versionar) lo indica.
for _v in "$(dirname "${BASH_SOURCE[0]}")/.verde" "$(dirname "${BASH_SOURCE[0]}")/../.verde"; do
  [[ -f "$_v" ]] && { echo "Entorno verde: este script opera producción; use scripts/verde.sh." >&2; exit 1; }
done
# scripts/instancia_prueba.sh — instancia AISLADA de Qillqa para verificar un cambio sin tocar producción.
#
# API en 127.0.0.1:8010 (y su servidor de edición simultánea en 8011) con el código y el marco de ESTA carpeta, contra la base `qillqa_prueba`
# (la misma PostgreSQL de Docker, otra base) y con documentos en una carpeta propia. Producción
# (puerto 8000, base del .env) no se toca. La cuenta de prueba es «prueba»; su clave y el secreto de
# sesión se generan la primera vez y viven FUERA del repo, en $ESTADO (permiso 700), nunca aquí.
#
# Uso:
#   scripts/instancia_prueba.sh             levanta la API de prueba (crea la base la primera vez)
#   scripts/instancia_prueba.sh --limpia    borra y recrea la base de prueba (y su clave)
#   scripts/instancia_prueba.sh --detener   detiene la API de prueba y su servidor de colaboración
# El estudio de Prensa de prueba (identidad-visual, 127.0.0.1:8098) usa un perfil PROPIO en
# $ESTADO/estudio: su banco y sus salidas son de prueba; del perfil real (IDENTIDAD_PERFIL del
# .env, si existe) solo se LEEN tipografías, logos y marcos.
# La web de prueba, sin compilar (compilar en esta carpeta PUBLICA la web de producción):
#   cd frontend && VITE_API_PROXY=http://127.0.0.1:8010 VITE_COLAB_PROXY=ws://127.0.0.1:8011 \
#     npm run dev -- --port 5198 --strictPort
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ESTADO="${XDG_STATE_HOME:-$HOME/.local/state}/qillqa-prueba"
PUERTO=8010
PUERTO_COLAB=8011
PUERTO_ESTUDIO=8098

detener() {
  # [u]vicorn: el patrón no se encuentra a sí mismo; --port 8010: nunca la API de producción.
  local pids
  pids="$(pgrep -f "[u]vicorn app.main:app .*--port $PUERTO" || true)"
  # El de colaboración se reconoce por su puerto (8011: nunca el de producción).
  pids="$pids $(ss -ltnp 2>/dev/null | grep ":$PUERTO_COLAB " | grep -oP 'pid=\K[0-9]+' || true)"
  # El estudio de prueba, por su puerto (8098: nunca el de producción).
  pids="$pids $(ss -ltnp 2>/dev/null | grep ":$PUERTO_ESTUDIO " | grep -oP 'pid=\K[0-9]+' || true)"
  if [[ -n "${pids// /}" ]]; then kill $pids; sleep 1; fi
}

if [[ "${1:-}" == "--detener" ]]; then
  detener
  echo "API de prueba, edición simultánea y estudio detenidos."
  exit 0
fi

set -a
# shellcheck disable=SC1091
. "$RAIZ/.env"
set +a
psql_admin() { (cd "$RAIZ" && docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q "$@"); }

mkdir -p "$ESTADO"
chmod 700 "$ESTADO"
if [[ "${1:-}" == "--limpia" || ! -s "$ESTADO/clave_admin" ]]; then
  detener
  psql_admin -c "DROP DATABASE IF EXISTS qillqa_prueba" -c "CREATE DATABASE qillqa_prueba"
  rm -rf "$ESTADO/docs"
  (umask 077
   head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$ESTADO/clave_admin"
   head -c 48 /dev/urandom | base64 | tr -d '\n' > "$ESTADO/jwt")
  echo "Base qillqa_prueba creada de cero."
fi
mkdir -p "$ESTADO/docs"

detener
export DATABASE_URL="postgresql+asyncpg://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/qillqa_prueba"
export JWT_SECRET; JWT_SECRET="$(cat "$ESTADO/jwt")"
export ADMIN_USUARIO=prueba
export ADMIN_CLAVE; ADMIN_CLAVE="$(cat "$ESTADO/clave_admin")"
export MDD_DOCUMENTOS="$ESTADO/docs"
# El marco documental y el servidor de colab viven en Qillqasqa desde el 2026-10-22 (carpeta hermana o QILLQASQA_DIR).
QILLQASQA="${QILLQASQA_DIR:-$RAIZ/../qillqasqa}"
export MDD_RUTA="$QILLQASQA/marco_documental"
export FOTOTECA_DIR="$ESTADO/fototeca"
# La Mediateca de prueba (2026-10-19): carpeta propia; su base, qillqa_prueba_mediateca (la deriva la API).
MEDIATECA_REAL="${MEDIATECA_DIR:-}"
if [[ -z "$MEDIATECA_REAL" && -f "$RAIZ/../core/env.sh" ]]; then
  MEDIATECA_REAL="$(bash -c 'source "$1" >/dev/null 2>&1 && printf %s "${MEDIATECA_DIR:-}"' _ "$RAIZ/../core/env.sh" || true)"
fi
export MEDIATECA_DIR="$ESTADO/mediateca"
# El marco busca el sello, los logotipos y los retratos del despacho en <Mediateca>/marca/{logo,retrato}
# (marco_documental/scripts/lib/env.sh de Qillqasqa): sin una copia, ningún oficio con sello compila en la prueba.
# Se copian de la Mediateca real sin pisar lo que ya haya (2026-10-20, recorrido de la fase 0).
for cat in logo retrato; do
  if [[ -n "$MEDIATECA_REAL" && -d "$MEDIATECA_REAL/marca/$cat" ]]; then
    mkdir -p "$MEDIATECA_DIR/marca/$cat"
    cp -r --update=none "$MEDIATECA_REAL/marca/$cat/." "$MEDIATECA_DIR/marca/$cat/"
  fi
done
# Caché de páginas rasterizadas del visor rápido: el suyo, nunca el de producción (~/.cache/qillqa/imagenes).
export IMAGENES_CACHE_DIR="$ESTADO/cache-imagenes"

# Los editores de Prensa de prueba (en la API, editores E2–E5): perfil propio (banco y salidas en $ESTADO/estudio).
IV_DIR="${IDENTIDAD_VISUAL_DIR:-}"
if [[ -z "$IV_DIR" && -f "$RAIZ/../core/env.sh" ]]; then
  IV_DIR="$(bash -c 'source "$1" >/dev/null 2>&1 && printf %s "${IDENTIDAD_VISUAL_DIR:-}"' _ "$RAIZ/../core/env.sh" || true)"
fi
mkdir -p "$ESTADO/estudio/banco"
python3 - "$ESTADO/estudio" "${IDENTIDAD_PERFIL:-}" "$IV_DIR" <<'PY'
import json, os, sys
base, real, repo = sys.argv[1], sys.argv[2], sys.argv[3]
rutas = {k: os.path.join(base, k) for k in ("banco", "almacen", "proyectos_media")}
# Lo que exporta el estudio y su caché de trabajo, en la caché de la Mediateca de prueba, como en producción
# (2026-10-20): Qillqa registra cada pieza en la Mediateca y esta carpeta se limpia sola.
cache = os.path.join(os.path.dirname(base), "mediateca", "cache", "prensa")
rutas.update({"redes": os.path.join(cache, "salida", "redes"), "transmisiones": os.path.join(cache, "salida", "transmisiones"),
              "exports": os.path.join(cache, "trabajo")})
# Sin perfil real, los formatos y textos neutros del perfil de ejemplo del repo (solo lectura).
if repo and os.path.isfile(os.path.join(repo, "perfil.ejemplo", "marcos", "config.json")):
    rutas["plantillas_media"] = os.path.join(repo, "perfil.ejemplo", "marcos")
if real and os.path.isfile(real):
    leidas = json.load(open(real, encoding="utf-8")).get("rutas", {})
    rutas.update({k: leidas[k] for k in ("fuentes", "logos", "plantillas_media", "imgbank") if leidas.get(k)})
json.dump({"_": "perfil de PRUEBA del estudio (scripts/instancia_prueba.sh)", "rutas": rutas},
          open(os.path.join(base, "perfil.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
export IDENTIDAD_PERFIL="$ESTADO/estudio/perfil.json"
# Su kit común (Unancha; o la identidad de producción con la misma forma) y dónde está cada página de los editores.
export UNANCHA_DIR="${UNANCHA_DIR:-$IV_DIR}"
export ESTUDIO_OTRAS_PAGINAS="${ESTUDIO_OTRAS_PAGINAS:-foto.html=/api/fotos/,media.html=/api/fotos/,video.html=/api/videos/,editor.html=/api/piezas/editor/}"

cd "$RAIZ"
setsid nohup backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PUERTO" --app-dir backend \
  > "$ESTADO/api.log" 2>&1 < /dev/null &
if curl -s -m 3 --retry 20 --retry-delay 2 --retry-connrefused "http://127.0.0.1:$PUERTO/api/health" > /dev/null; then
  echo "API de prueba en http://127.0.0.1:$PUERTO — usuario «prueba», clave en $ESTADO/clave_admin"
  # Sin subshell: uno se quedaría de padre del servidor reteniendo la salida.
  QILLQA_API="http://127.0.0.1:$PUERTO" COLAB_PUERTO=$PUERTO_COLAB \
    setsid nohup node "$QILLQASQA/web/colab/servidor.ts" > "$ESTADO/colab.log" 2>&1 < /dev/null &
  echo "Edición simultánea de prueba en 127.0.0.1:$PUERTO_COLAB (registro en $ESTADO/colab.log)"
else
  echo "La API de prueba no respondió; vea $ESTADO/api.log" >&2
  exit 1
fi
