#!/usr/bin/env bash
# scripts/verde.sh — el ENTORNO VERDE de la migración (fase 10.1 de docs/plataforma/propuesta-repositorios.md).
#
# Producción («azul») sigue en su propia carpeta, con su base y su enlace, hasta el corte (10.6); aquí se
# arma la versión nueva de Qillqa, aparte, contra una COPIA de los datos de producción, sin que nadie lo note:
#
#   API 127.0.0.1:8020 · edición simultánea 8021 · web 127.0.0.1:5190 (sin compilar; el 5199 es de producción)
#   bases `qillqa_verde`, `qillqa_verde_mediateca` y `qillqa_verde_yupay` (Rendición de cuentas, separada de la
#   documental por su propia orden al restaurar) en el mismo PostgreSQL de Docker (contenedor de producción)
#   archivos en $ESTADO (fuera de todo repo, permiso 700): copia del archivo documental, de las semanas,
#   de las rendiciones y de la Mediateca
#
# Uso:
#   scripts/verde.sh instalar    pone en su entorno los proyectos de la plataforma (Tiqsi), en modo editable
#   scripts/verde.sh restaurar   copia producción al verde (base, Mediateca y archivos), cuadra la copia,
#                                apaga las integraciones salientes y reescribe las rutas hacia la copia
#   scripts/verde.sh iniciar     levanta el verde (la web, con --web)
#   scripts/verde.sh detener     lo detiene, por PUERTO (nunca por patrón: el de producción es otro)
#   scripts/verde.sh cuadrar     filas por tabla: producción frente al verde
#   scripts/verde.sh recorrido   la foto y el recorrido de punta a punta contra el verde
#   scripts/verde.sh sola [construir|detener]   la Mediateca SOLA (anfitrión mínimo de Tiqsi) en 8030, con base y carpeta propias
#   scripts/verde.sh sola-rendicion [construir|detener]   Rendición de cuentas SOLA en 8031, con base, carpeta y página propias
#   scripts/verde.sh sola-minka [construir|detener]   Tareas y Agenda SOLA en 8032, con base, carpeta y página propias
#   scripts/verde.sh sola-rimay [construir|detener]   el chat SOLO en 8033, con base, carpeta y página propias
#   scripts/verde.sh sola-qhawana [construir|detener]   el Observatorio SOLO en 8035, con su carpeta, su página y el tema de Unancha
#   scripts/verde.sh sola-wayra [construir|detener]   el kit de transmisiones (OBS) SOLO en 8036, con su página
#   scripts/verde.sh sola-tullpu [construir|detener]   el editor de fotos SOLO en 8037, con su carpeta y su página
#   scripts/verde.sh sola-kuyuy [construir|detener]   el editor de videos SOLO en 8038, con su carpeta y su página
#   scripts/verde.sh sola-awana [construir|detener]   el editor de piezas SOLO en 8039, con base, carpeta y página propias
#   scripts/verde.sh sola-qillqasqa [construir|detener]   Gestión documental, Proyectos de ley y la Semana SOLOS en 8040, con base, carpeta, marco y página propios
#   scripts/verde.sh observatorio [--aplicar]   la página del Observatorio (Qhawana) con el tema de Qillqa, en su carpeta
#   scripts/verde.sh sola-punku [construir|detener]   la Mesa de Partes SOLA en 8034, con base, carpeta y página propias
#
# Lo que NUNCA hace: escribir en la base o en los archivos de producción, levantar o detener contenedores
# (`docker compose up/stop` desde esta copia recrearía los de producción), mandar avisos push, Telegram u
# OpenProject a nadie (el verde lleva una copia de las suscripciones reales: se borran al restaurar).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ESTADO="${XDG_STATE_HOME:-$HOME/.local/state}/qillqa-verde"
PUERTO=8020
PUERTO_COLAB=8021
PUERTO_ESTUDIO=8028          # el estudio de Prensa aparte, retirado en E5 (2026-10-21): solo se apaga si quedó vivo
PUERTO_WEB=5190          # no 5197, 5198 ni 5199: son de producción y de su instancia de prueba
PUERTO_SOLA=8030          # la Mediateca SOLA (anfitrión mínimo de Tiqsi), con su base propia y vacía
BASE_SOLA=rikchay_solo
PUERTO_SOLA_RENDICION=8031  # Rendición de cuentas SOLA (Yupay), con su base propia y vacía
BASE_SOLA_RENDICION=yupay_solo
PUERTO_SOLA_MINKA=8032      # Tareas y Agenda SOLA (Minka), con su base propia y vacía
BASE_SOLA_MINKA=minka_solo
BASE_SOLA_AWANA=awana_solo   # el editor de piezas SOLO (Awana E4b): sus piezas de prensa
BASE_SOLA_QILLQASQA=qillqasqa_solo   # Qillqasqa SOLA (Q6a): sus documentos, proyectos y semanas
PUERTO_SOLA_RIMAY=8033      # el chat SOLO (Rimay), con su base propia y vacía
BASE_SOLA_RIMAY=rimay_solo
PUERTO_SOLA_PUNKU=8034      # la Mesa de Partes SOLA (Punku), con su base propia y vacía
BASE_SOLA_PUNKU=punku_solo
PUERTO_SOLA_QHAWANA=8035    # el Observatorio SOLO (Qhawana), sin base: su carpeta y su página
PUERTO_SOLA_WAYRA=8036      # el kit de transmisiones SOLO (Wayra), sin base: sus cuentas y su página
PUERTO_SOLA_TULLPU=8037     # el editor de fotos SOLO (Tullpu), sin base ni Mediateca: su carpeta, sus cuentas y su página
PUERTO_SOLA_KUYUY=8038      # el editor de videos SOLO (Kuyuy), igual
PUERTO_SOLA_AWANA=8039      # el editor de piezas SOLO (Awana), con su base (sus piezas de prensa)
PUERTO_SOLA_QILLQASQA=8040  # Qillqasqa SOLA (Gestión documental, Proyectos de ley y la Semana), con su base y su carpeta
BASE=qillqa_verde
BASE_MEDIATECA=qillqa_verde_mediateca
BASE_YUPAY=qillqa_verde_yupay   # Rendición de cuentas en su base propia (fase 10.2b)
BASE_MINKA=qillqa_verde_minka   # Tareas y Agenda en su base propia (fase 10.2b, M3)
BASE_RIMAY=qillqa_verde_rimay   # el chat en su base propia (fase 10.2b, Rimay R3)
BASE_PUNKU=qillqa_verde_punku   # la Mesa de Partes en su base propia (fase 10.2b, Punku P3)
BASE_AWANA=qillqa_verde_awana   # el editor de piezas en su base propia (sus piezas de prensa; editores E4c)
BASE_QILLQASQA=qillqa_verde_qillqasqa   # Gestión documental, Proyectos de ley y la Semana en su base (Qillqasqa Q5b)
# Lo que nombra a PRODUCCIÓN hasta el corte (10.6): su contenedor de PostgreSQL, su carpeta, su función de entorno y su
# base llevan aún el nombre viejo, porque son cosas que existen y corren; el verde solo las lee.
CONTENEDOR="${QILLQA_DB_CONTENEDOR:-sgdp-db-1}"

# --- producción: su carpeta y su entorno (solo se LEEN) -------------------------------------------------
if [[ -z "${DOCS_ROOT:-}" ]]; then
  up="$RAIZ"; while [[ "$up" != / && ! -f "$up/core/env.sh" ]]; do up="$(dirname "$up")"; done
  # shellcheck disable=SC1091
  [[ -f "$up/core/env.sh" ]] && source "$up/core/env.sh" >/dev/null
fi
PRODUCCION="${QILLQA_PRODUCCION:-${DOCS_ROOT:?sin DOCS_ROOT (core/env.sh)}/sgdp}"
# Gestión documental, Proyectos de ley y la Semana, con el marco documental y la edición simultánea, en su repositorio
# desde el 2026-10-22 (Qillqasqa, fase 10.3): el verde toma de allí el marco (MDD_RUTA) y el servidor de colab.
QILLQASQA="${QILLQASQA_DIR:-$DOCS_ROOT/qillqasqa}"
[[ "$PRODUCCION" -ef "$RAIZ" ]] && { echo "Esta carpeta ES producción: el verde se arma en otra." >&2; exit 1; }
# shellcheck disable=SC1091
source "$PRODUCCION/entorno.sh"
sgdp_cargar_env >/dev/null
PROD_BASE="${POSTGRES_DB:-sgdp}"
PROD_MEDIATECA="$([[ "$PROD_BASE" == sgdp ]] && echo mediateca || echo "${PROD_BASE}_mediateca")"
PROD_DOCS="${MDD_DOCUMENTOS:?el .env de producción no define MDD_DOCUMENTOS}"
PROD_DESPACHO="$(dirname "$PROD_DOCS")"
PROD_REPRESENTACION="${ISR_RAIZ:-$PROD_DESPACHO/representacion}"
PROD_RENDICIONES="${RENDICIONES_DIR:-$PROD_DESPACHO/rendiciones}"
PROD_MEDIATECA_DIR="${MEDIATECA_DIR:?sin MEDIATECA_DIR (core/env.sh)}"
for b in "$BASE" "$BASE_MEDIATECA" "$BASE_SOLA" "$BASE_YUPAY" "$BASE_SOLA_RENDICION" "$BASE_MINKA" "$BASE_SOLA_MINKA" "$BASE_RIMAY" "$BASE_SOLA_RIMAY" "$BASE_PUNKU" "$BASE_SOLA_PUNKU" "$BASE_AWANA" "$BASE_SOLA_AWANA" "$BASE_QILLQASQA" "$BASE_SOLA_QILLQASQA"; do
  [[ "$b" == "$PROD_BASE" || "$b" == "$PROD_MEDIATECA" ]] && { echo "La base del verde no puede ser la de producción." >&2; exit 1; }
done

psql_en() { local base="$1"; shift; docker exec -i "$CONTENEDOR" psql -U "$POSTGRES_USER" -d "$base" -v ON_ERROR_STOP=1 -q "$@"; }
# Sin «-i»: dentro de un «while read», docker exec -i se come la lista que el bucle está leyendo.
psql_dato() { docker exec "$CONTENEDOR" psql -U "$POSTGRES_USER" -d "$1" -Atc "$2" < /dev/null; }

VINCULOS_MINKA="tipo = 'vinculo' AND (origen LIKE 'tarea:%' OR origen LIKE 'evento:%')"
url_de() { printf 'postgresql+asyncpg://%s:%s@127.0.0.1:5432/%s' "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$1"; }

detener() {
  local pids="" p
  for p in $PUERTO $PUERTO_COLAB $PUERTO_ESTUDIO $PUERTO_WEB $PUERTO_SOLA $PUERTO_SOLA_RENDICION $PUERTO_SOLA_MINKA $PUERTO_SOLA_RIMAY $PUERTO_SOLA_PUNKU $PUERTO_SOLA_QHAWANA $PUERTO_SOLA_WAYRA $PUERTO_SOLA_TULLPU $PUERTO_SOLA_KUYUY $PUERTO_SOLA_AWANA $PUERTO_SOLA_QILLQASQA; do
    pids="$pids $(ss -ltnp 2>/dev/null | grep ":$p " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  done
  if [[ -n "${pids// /}" ]]; then kill $pids 2>/dev/null || true; sleep 1; fi
}

# Filas por tabla de una base, ordenadas: «tabla<TAB>filas».
filas() {
  psql_dato "$1" "SELECT format('%s.%s', schemaname, relname) FROM pg_stat_user_tables ORDER BY 1" | while read -r t; do
    printf '%s\t%s\n' "$t" "$(psql_dato "$1" "SELECT count(*) FROM $t")"
  done
}

# Huella de cada tabla (todas sus filas como texto, ordenadas): la copia es idéntica o no lo es.
huellas() {
  psql_dato "$1" "SELECT format('%s.%s', schemaname, relname) FROM pg_stat_user_tables ORDER BY 1" | while read -r t; do
    printf '%s\t%s\n' "$t" "$(psql_dato "$1" "SELECT count(*) || ' ' || coalesce(md5(string_agg(x::text, E'\n' ORDER BY x::text)), '-') FROM $t x")"
  done
}

cuadrar() {
  local fallos=0 par
  for par in "$PROD_BASE:$BASE" "$PROD_MEDIATECA:$BASE_MEDIATECA"; do
    local prod="${par%%:*}" verde="${par##*:}"
    echo "Cuadre $prod → $verde (filas por tabla):"
    filas "$prod" > "$ESTADO/filas-produccion-$prod.tsv"; filas "$verde" > "$ESTADO/filas-$verde.tsv"
    # Los vínculos de tareas y eventos se mudaron a Minka (M1v/M3): `relaciones` de producción se cuenta sin ellos.
    [[ "$prod" == "$PROD_BASE" ]] && sed -i "s|^public\.relaciones\t.*|public.relaciones\t$(psql_dato "$prod" \
      "SELECT count(*) FROM relaciones WHERE NOT ($VINCULOS_MINKA)")|" "$ESTADO/filas-produccion-$prod.tsv"
    echo "  $(wc -l < "$ESTADO/filas-$verde.tsv") tablas comparadas"
    diff "$ESTADO/filas-produccion-$prod.tsv" "$ESTADO/filas-$verde.tsv" > "$ESTADO/cuadre-$verde.diff" && echo "  igual" || {
      # Lo que el verde cambia a propósito: sin suscripciones push ni claves VAPID, su cuenta «verde» y las tablas
      # nuevas de la plataforma que producción aún no tiene (la bandeja de salida de cada módulo y la de Qillqa, fase 10.2b,
      # y las tablas propias de la Mesa de Partes: su bandeja y `punku_ajustes`, que se compara aparte, abajo).
      grep -vE "suscripciones_push|public\.ajustes|public\.usuarios|public\.tiqsi_bandeja|public\.qillqa_bandeja|public\.punku_(ajustes|bandeja)|public\.awana_bandeja|public\.qillqasqa_(ajustes|bandeja)" "$ESTADO/cuadre-$verde.diff" | grep -E '^[<>]' && fallos=1 \
        || echo "  igual, salvo lo esperado (suscripciones push, claves VAPID, la cuenta «verde», las bandejas nuevas y las tablas propias de Punku)"
    }
  done
  # La Mesa de Partes en su base (Punku P3): sus tablas de producción frente a ella. Su bandeja y su ajuste producción
  # no los tiene como tablas: el ajuste («mesa_virtual», en `punku_ajustes`) se compara con el de `ajustes`.
  echo "Cuadre $PROD_BASE (tablas de la Mesa de Partes) → $BASE_PUNKU (filas por tabla):"
  filas "$PROD_BASE" | grep -E '^public\.(entradas|mesa_tramites|mesa_archivos|mesa_movimientos|mesa_auditoria)\b' \
    > "$ESTADO/filas-produccion-punku.tsv"
  filas "$BASE_PUNKU" | grep -vE 'public\.punku_(ajustes|bandeja)' > "$ESTADO/filas-$BASE_PUNKU.tsv"
  echo "  $(wc -l < "$ESTADO/filas-$BASE_PUNKU.tsv") tablas comparadas"
  diff "$ESTADO/filas-produccion-punku.tsv" "$ESTADO/filas-$BASE_PUNKU.tsv" > "$ESTADO/cuadre-$BASE_PUNKU.diff" \
    && echo "  igual" || { cat "$ESTADO/cuadre-$BASE_PUNKU.diff"; fallos=1; }
  echo "Cuadre $PROD_BASE (ajuste «mesa_virtual») → $BASE_PUNKU (punku_ajustes):"
  if [[ "$(psql_dato "$PROD_BASE" "SELECT md5(valor::text) FROM ajustes WHERE despacho_id = 1 AND clave = 'mesa_virtual'")" \
        == "$(psql_dato "$BASE_PUNKU" "SELECT md5(valor::text) FROM punku_ajustes WHERE clave = 'mesa_virtual'")" ]]; then
    echo "  igual"
  else
    echo "  distinto"; fallos=1
  fi
  # El editor de piezas en su base (Awana E4c): las piezas de prensa de producción frente a ella (su bandeja es nueva).
  echo "Cuadre $PROD_BASE (piezas de prensa) → $BASE_AWANA (filas por tabla):"
  filas "$PROD_BASE" | grep -E '^public\.prensa_piezas\b' > "$ESTADO/filas-produccion-awana.tsv"
  filas "$BASE_AWANA" | grep -v 'public\.awana_bandeja' > "$ESTADO/filas-$BASE_AWANA.tsv"
  diff "$ESTADO/filas-produccion-awana.tsv" "$ESTADO/filas-$BASE_AWANA.tsv" > "$ESTADO/cuadre-$BASE_AWANA.diff" \
    && echo "  igual" || { cat "$ESTADO/cuadre-$BASE_AWANA.diff"; fallos=1; }
  # Rendición de cuentas vive en su base (fase 10.2b): sus tablas de producción frente a ella. `rendicion_ajustes` es
  # nueva (producción guarda esos ajustes en `ajustes`, que el cuadre de arriba ya compara).
  echo "Cuadre $PROD_BASE (tablas de Rendición) → $BASE_YUPAY (filas por tabla):"
  filas "$PROD_BASE" | grep -E '^public\.rendicion' | grep -v rendicion_ajustes > "$ESTADO/filas-produccion-yupay.tsv"
  filas "$BASE_YUPAY" | grep -v rendicion_ajustes > "$ESTADO/filas-$BASE_YUPAY.tsv"
  echo "  $(wc -l < "$ESTADO/filas-$BASE_YUPAY.tsv") tablas comparadas"
  diff "$ESTADO/filas-produccion-yupay.tsv" "$ESTADO/filas-$BASE_YUPAY.tsv" > "$ESTADO/cuadre-$BASE_YUPAY.diff" \
    && echo "  igual" || { cat "$ESTADO/cuadre-$BASE_YUPAY.diff"; fallos=1; }
  # Tareas y Agenda en su base (M3): sus tablas de producción frente a ella, y sus vínculos frente a los de `relaciones`
  # (uno por origen y destino). Su bandeja y sus ajustes producción no los tiene como tablas.
  echo "Cuadre $PROD_BASE (tablas de Tareas y Agenda) → $BASE_MINKA (filas por tabla):"
  filas "$PROD_BASE" | grep -E '^public\.(tareas|tareas_listas|tareas_comentarios|agenda_eventos|agenda_participantes|agenda_tokens)\b' \
    > "$ESTADO/filas-produccion-minka.tsv"
  printf 'public.minka_vinculos\t%s\n' "$(psql_dato "$PROD_BASE" \
    "SELECT count(DISTINCT (origen, destino)) FROM relaciones WHERE $VINCULOS_MINKA")" >> "$ESTADO/filas-produccion-minka.tsv"
  filas "$BASE_MINKA" | grep -vE 'public\.minka_(ajustes|bandeja)' | sort -o "$ESTADO/filas-$BASE_MINKA.tsv"
  sort -o "$ESTADO/filas-produccion-minka.tsv" "$ESTADO/filas-produccion-minka.tsv"
  echo "  $(wc -l < "$ESTADO/filas-$BASE_MINKA.tsv") tablas comparadas"
  diff "$ESTADO/filas-produccion-minka.tsv" "$ESTADO/filas-$BASE_MINKA.tsv" > "$ESTADO/cuadre-$BASE_MINKA.diff" \
    && echo "  igual" || { cat "$ESTADO/cuadre-$BASE_MINKA.diff"; fallos=1; }
  # El chat en su base (Rimay R3): sus tablas de producción frente a ella. Su bandeja y sus ajustes producción no los
  # tiene como tablas (sus ajustes los compara la separación).
  echo "Cuadre $PROD_BASE (tablas del chat) → $BASE_RIMAY (filas por tabla):"
  filas "$PROD_BASE" | grep -E '^public\.(canales|canal_miembros|mensajes|mensaje_archivos|mensaje_reacciones|encuestas|encuesta_votos)\b' \
    > "$ESTADO/filas-produccion-rimay.tsv"
  filas "$BASE_RIMAY" | grep -vE 'public\.rimay_(ajustes|bandeja)' > "$ESTADO/filas-$BASE_RIMAY.tsv"
  echo "  $(wc -l < "$ESTADO/filas-$BASE_RIMAY.tsv") tablas comparadas"
  diff "$ESTADO/filas-produccion-rimay.tsv" "$ESTADO/filas-$BASE_RIMAY.tsv" > "$ESTADO/cuadre-$BASE_RIMAY.diff" \
    && echo "  igual" || { cat "$ESTADO/cuadre-$BASE_RIMAY.diff"; fallos=1; }
  # Gestión documental, Proyectos de ley y la Semana en su base (Qillqasqa Q5b): sus tablas de producción frente a ella
  # (`relaciones` sin los vínculos de Tareas y Agenda, que se mudaron a Minka). Su bandeja y sus ajustes son nuevos (sus
  # ajustes los compara la separación).
  echo "Cuadre $PROD_BASE (tablas de Qillqasqa) → $BASE_QILLQASQA (filas por tabla):"
  filas "$PROD_BASE" | grep -E '^public\.(documentos|contadores|eventos|adjuntos|versiones_documento|documento_relaciones|comentarios|asignaciones_documento|colab_estado|actuaciones|reglas_copia|proyectos|proyecto_[a-z_]+|semanas_sr|actividades_sr|fotos_sr|pedidos_sr|relaciones)\b' \
    > "$ESTADO/filas-produccion-qillqasqa.tsv"
  sed -i "s|^public\.relaciones\t.*|public.relaciones\t$(psql_dato "$PROD_BASE" \
    "SELECT count(*) FROM relaciones WHERE NOT ($VINCULOS_MINKA)")|" "$ESTADO/filas-produccion-qillqasqa.tsv"
  filas "$BASE_QILLQASQA" | grep -vE 'public\.qillqasqa_(ajustes|bandeja)' > "$ESTADO/filas-$BASE_QILLQASQA.tsv"
  echo "  $(wc -l < "$ESTADO/filas-$BASE_QILLQASQA.tsv") tablas comparadas"
  diff "$ESTADO/filas-produccion-qillqasqa.tsv" "$ESTADO/filas-$BASE_QILLQASQA.tsv" > "$ESTADO/cuadre-$BASE_QILLQASQA.diff" \
    && echo "  igual" || { cat "$ESTADO/cuadre-$BASE_QILLQASQA.diff"; fallos=1; }
  return $fallos
}

restaurar() {
  detener
  mkdir -p "$ESTADO"; chmod 700 "$ESTADO"
  echo "1/11 Archivos de producción a la copia del verde (rsync; producción solo se lee)..."
  mkdir -p "$ESTADO/despacho" "$ESTADO/mediateca"
  rsync -a --delete "$PROD_DOCS/" "$ESTADO/despacho/documentos/"
  [[ -d "$PROD_REPRESENTACION" ]] && rsync -a --delete "$PROD_REPRESENTACION/" "$ESTADO/despacho/representacion/"
  [[ -d "$PROD_RENDICIONES" ]] && rsync -a --delete "$PROD_RENDICIONES/" "$ESTADO/despacho/rendiciones/"
  rsync -a --delete --exclude '/cache/' "$PROD_MEDIATECA_DIR/" "$ESTADO/mediateca/"

  echo "2/11 Bases: $PROD_BASE → $BASE y $PROD_MEDIATECA → $BASE_MEDIATECA..."
  local par
  for par in "$PROD_BASE:$BASE" "$PROD_MEDIATECA:$BASE_MEDIATECA"; do
    local prod="${par%%:*}" verde="${par##*:}"
    psql_en postgres -c "DROP DATABASE IF EXISTS $verde" -c "CREATE DATABASE $verde"
    docker exec "$CONTENEDOR" pg_dump -U "$POSTGRES_USER" --no-owner "$prod" | psql_en "$verde" > /dev/null
  done

  echo "3/11 Cuadre de la copia, antes de tocarla (filas y huella de cada tabla)..."
  local p
  for p in "$PROD_BASE:$BASE" "$PROD_MEDIATECA:$BASE_MEDIATECA"; do
    huellas "${p%%:*}" > "$ESTADO/huellas-produccion-${p%%:*}.tsv"
    huellas "${p##*:}" > "$ESTADO/huellas-${p##*:}.tsv"
    if diff "$ESTADO/huellas-produccion-${p%%:*}.tsv" "$ESTADO/huellas-${p##*:}.tsv" > "$ESTADO/huellas-${p##*:}.diff"; then
      echo "  ${p##*:}: idéntica a producción en sus $(wc -l < "$ESTADO/huellas-${p##*:}.tsv") tablas (filas y huella)"
    else
      echo "  ${p##*:}: DIFIERE de producción (¿alguien escribió durante la copia?): $ESTADO/huellas-${p##*:}.diff" >&2
    fi
  done

  echo "4/11 Integraciones salientes apagadas en el verde (push: suscripciones y claves VAPID)..."
  psql_en "$BASE" -c "DELETE FROM suscripciones_push" -c "DELETE FROM ajustes WHERE clave = 'webpush_vapid'"

  echo "5/11 Rutas de producción guardadas en la base → la copia del verde..."
  psql_en "$BASE" -v viejo_despacho="$PROD_DESPACHO" -v nuevo_despacho="$ESTADO/despacho" \
    -v viejo_media="$PROD_MEDIATECA_DIR" -v nuevo_media="$ESTADO/mediateca" <<'SQL'
\o /dev/null
SELECT set_config('verde.vd', :'viejo_despacho', false), set_config('verde.nd', :'nuevo_despacho', false),
       set_config('verde.vm', :'viejo_media', false), set_config('verde.nm', :'nuevo_media', false);
\o
DO $$
DECLARE c record; n bigint; total bigint := 0;
BEGIN
  FOR c IN SELECT table_name, column_name, data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb', 'json')
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = replace(replace(%I::text, $1, $2), $3, $4)::%s WHERE %I::text LIKE ''%%'' || $1 || ''%%'' OR %I::text LIKE ''%%'' || $3 || ''%%''',
      c.table_name, c.column_name, c.column_name, c.data_type, c.column_name, c.column_name)
      USING current_setting('verde.vd'), current_setting('verde.nd'), current_setting('verde.vm'), current_setting('verde.nm');
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE '  %.%: % filas', c.table_name, c.column_name, n; total := total + n; END IF;
  END LOOP;
  RAISE NOTICE '  % valores reescritos', total;
END $$;
SQL
  # Comprobación: ninguna ruta de producción queda en la base del verde.
  local quedan=0 n t col
  while IFS=$'\t' read -r t col; do
    n="$(psql_dato "$BASE" "SELECT count(*) FROM public.\"$t\" WHERE \"$col\"::text LIKE '%' || '$PROD_DESPACHO' || '%' OR \"$col\"::text LIKE '%' || '$PROD_MEDIATECA_DIR' || '%'")"
    (( n > 0 )) && { echo "  QUEDA: $t.$col ($n)" >&2; quedan=$((quedan + n)); }
  done < <(psql_dato "$BASE" "SELECT table_name || E'\t' || column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying','jsonb','json')")
  (( quedan == 0 )) && echo "  Ninguna ruta de producción en la base del verde." || { echo "  Quedan $quedan rutas de producción: NO iniciar." >&2; exit 1; }

  ( umask 077
    [[ -s "$ESTADO/jwt" ]] || head -c 48 /dev/urandom | base64 | tr -d '\n' > "$ESTADO/jwt"
    [[ -s "$ESTADO/clave_verde" ]] || head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$ESTADO/clave_verde"
    printf 'restaurado: %s\nproduccion: %s @ %s\n' "$(date -Iseconds)" "$PRODUCCION" \
      "$(git -C "$PRODUCCION" rev-parse --short HEAD)" > "$ESTADO/restaurado.txt" )
  echo "6/11 Rendición de cuentas a su base propia ($BASE → $BASE_YUPAY; copia y verifica cada tabla)..."
  psql_en postgres -c "DROP DATABASE IF EXISTS $BASE_YUPAY"
  ( cd "$RAIZ/backend" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
      DATABASE_URL="$(url_de "$BASE")" RENDICION_DATABASE_URL="$(url_de "$BASE_YUPAY")" \
      .venv/bin/python -m yupay.db separar --aplicar ) || { echo "  La separación falló: NO iniciar." >&2; exit 1; }
  echo "7/11 Tareas y Agenda a su base propia ($BASE → $BASE_MINKA; copia, verifica y trae sus vínculos y ajustes)..."
  psql_en postgres -c "DROP DATABASE IF EXISTS $BASE_MINKA"
  ( cd "$RAIZ/backend" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
      DATABASE_URL="$(url_de "$BASE")" MINKA_DATABASE_URL="$(url_de "$BASE_MINKA")" \
      .venv/bin/python -m minka.db separar --aplicar ) || { echo "  La separación falló: NO iniciar." >&2; exit 1; }
  echo "8/11 El chat a su base propia ($BASE → $BASE_RIMAY; copia, verifica y trae sus ajustes)..."
  psql_en postgres -c "DROP DATABASE IF EXISTS $BASE_RIMAY"
  ( cd "$RAIZ/backend" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
      DATABASE_URL="$(url_de "$BASE")" RIMAY_DATABASE_URL="$(url_de "$BASE_RIMAY")" \
      .venv/bin/python -m rimay.db separar --aplicar ) || { echo "  La separación falló: NO iniciar." >&2; exit 1; }
  echo "9/11 La Mesa de Partes a su base propia ($BASE → $BASE_PUNKU; copia, verifica y trae su ajuste)..."
  psql_en postgres -c "DROP DATABASE IF EXISTS $BASE_PUNKU"
  ( cd "$RAIZ/backend" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
      DATABASE_URL="$(url_de "$BASE")" PUNKU_DATABASE_URL="$(url_de "$BASE_PUNKU")" \
      .venv/bin/python -m punku.db separar --aplicar ) || { echo "  La separación falló: NO iniciar." >&2; exit 1; }
  echo "10/11 El editor de piezas a su base propia ($BASE → $BASE_AWANA; copia y verifica sus piezas de prensa)..."
  psql_en postgres -c "DROP DATABASE IF EXISTS $BASE_AWANA"
  ( cd "$RAIZ/backend" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
      DATABASE_URL="$(url_de "$BASE")" AWANA_DATABASE_URL="$(url_de "$BASE_AWANA")" \
      .venv/bin/python -m awana.db separar --aplicar ) || { echo "  La separación falló: NO iniciar." >&2; exit 1; }
  # Al final: Tareas y Agenda (7/11) ya sacó sus vínculos de `relaciones`, que ahora viaja con Gestión documental.
  echo "11/11 Gestión documental, Proyectos de ley y la Semana a su base propia ($BASE → $BASE_QILLQASQA; copia, verifica y trae sus ajustes)..."
  psql_en postgres -c "DROP DATABASE IF EXISTS $BASE_QILLQASQA"
  ( cd "$RAIZ/backend" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
      DATABASE_URL="$(url_de "$BASE")" QILLQASQA_DATABASE_URL="$(url_de "$BASE_QILLQASQA")" \
      .venv/bin/python -m qillqasqa.db separar --aplicar ) || { echo "  La separación falló: NO iniciar." >&2; exit 1; }
  echo "Verde restaurado ($(cat "$ESTADO/restaurado.txt" | tr '\n' ' '))."
}

iniciar() {
  [[ -s "$ESTADO/restaurado.txt" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  detener
  export DATABASE_URL; DATABASE_URL="$(url_de "$BASE")"
  unset MEDIATECA_DATABASE_URL
  export RENDICION_DATABASE_URL; RENDICION_DATABASE_URL="$(url_de "$BASE_YUPAY")"
  export MINKA_DATABASE_URL; MINKA_DATABASE_URL="$(url_de "$BASE_MINKA")"
  export RIMAY_DATABASE_URL; RIMAY_DATABASE_URL="$(url_de "$BASE_RIMAY")"
  export PUNKU_DATABASE_URL; PUNKU_DATABASE_URL="$(url_de "$BASE_PUNKU")"
  export AWANA_DATABASE_URL; AWANA_DATABASE_URL="$(url_de "$BASE_AWANA")"
  # Qillqasqa en su base (Q5b); con QILLQASQA_EN_LA_DOCUMENTAL=1, en la documental (para comparar las dos formas).
  if [[ "${QILLQASQA_EN_LA_DOCUMENTAL:-}" == 1 ]]; then
    unset QILLQASQA_DATABASE_URL
  else
    export QILLQASQA_DATABASE_URL; QILLQASQA_DATABASE_URL="$(url_de "$BASE_QILLQASQA")"
  fi
  # El Observatorio (Qhawana Q1): su página vive en su carpeta (la genera `verde.sh observatorio --aplicar`).
  export QHAWANA_DIR="$ESTADO/qhawana"
  # El kit de transmisiones (Wayra, editores E1): sus colores y su letra, del kit común.
  export UNANCHA_DIR="${UNANCHA_DIR:-$DOCS_ROOT/unancha}"
  export JWT_SECRET; JWT_SECRET="$(cat "$ESTADO/jwt")"
  # Cuenta propia del verde («verde»): el arranque la crea si falta; las del equipo, copiadas, no se tocan.
  export ADMIN_USUARIO=verde
  export ADMIN_CLAVE; ADMIN_CLAVE="$(cat "$ESTADO/clave_verde")"
  export MDD_RUTA="$QILLQASQA/marco_documental"
  export MDD_DOCUMENTOS="$ESTADO/despacho/documentos"
  export ISR_RAIZ="$ESTADO/despacho/representacion"
  export RENDICIONES_DIR="$ESTADO/despacho/rendiciones"
  # El generador del informe de la semana corre por el generar.sh del despacho, que carga el .env del
  # despacho: ese .env trae ISR_RAIZ y DESPACHO_DIR de PRODUCCIÓN y haría escribir el informe del verde en
  # el archivo real. El verde no lo carga nunca: su despacho es la copia, y de aquel solo toma los colores.
  local env_despacho="${DESPACHO_DIR:?sin DESPACHO_DIR (core/env.sh)}/.env"
  export ISR_TOKENS; ISR_TOKENS="$(bash -c 'set -a; source "$1" >/dev/null 2>&1; printf %s "${ISR_TOKENS:-}"' _ "$env_despacho")"
  [[ -f "${UNANCHA_DIR:-$DOCS_ROOT/unancha}/tokens/colors.json" ]] && ISR_TOKENS="${UNANCHA_DIR:-$DOCS_ROOT/unancha}/tokens/colors.json"
  export DESPACHO_DIR="$ESTADO/despacho"
  export DESPACHO_ENV="$ESTADO/despacho/sin-env-de-produccion"
  export MEDIATECA_DIR="$ESTADO/mediateca"
  export FOTOTECA_DIR="$ESTADO/fototeca"
  export IMAGENES_CACHE_DIR="$ESTADO/cache-imagenes"
  export QILLQA_URL_PUBLICA="http://127.0.0.1:$PUERTO_WEB"
  # Nada sale del verde: sin OpenProject, Telegram ni claves VAPID de producción.
  unset OPENPROJECT_URL OPENPROJECT_TOKEN OPENPROJECT_URL_PUBLICA TELEGRAM_TOKEN TELEGRAM_CHAT TELEGRAM_USUARIO \
        VAPID_PUBLICA VAPID_PRIVADA VAPID_CONTACTO

  # Estudio de Prensa del verde: perfil propio; del real (IDENTIDAD_PERFIL) solo se LEEN fuentes, logos y marcos.
  # Identidad visual del verde: Unancha (copia verde de identidad-visual, fase 10.2), nunca la de producción.
  local iv="${UNANCHA_DIR:-$DOCS_ROOT/unancha}"
  export IDENTIDAD_VISUAL_DIR="$iv" IDENTIDAD_TOKENS="$iv/tokens"
  mkdir -p "$ESTADO/estudio/banco"
  python3 - "$ESTADO/estudio" "${IDENTIDAD_PERFIL:-}" "$iv" <<'PY'
import json, os, sys
base, real, repo = sys.argv[1], sys.argv[2], sys.argv[3]
rutas = {k: os.path.join(base, k) for k in ("banco", "almacen", "proyectos_media")}
cache = os.path.join(os.path.dirname(base), "mediateca", "cache", "prensa")
rutas.update({"redes": os.path.join(cache, "salida", "redes"), "transmisiones": os.path.join(cache, "salida", "transmisiones"),
              "exports": os.path.join(cache, "trabajo")})
if repo and os.path.isfile(os.path.join(repo, "perfil.ejemplo", "marcos", "config.json")):
    rutas["plantillas_media"] = os.path.join(repo, "perfil.ejemplo", "marcos")
if real and os.path.isfile(real):
    leidas = json.load(open(real, encoding="utf-8")).get("rutas", {})
    rutas.update({k: leidas[k] for k in ("fuentes", "logos", "plantillas_media", "imgbank") if leidas.get(k)})
json.dump({"_": "perfil del estudio del ENTORNO VERDE (scripts/verde.sh)", "rutas": rutas},
          open(os.path.join(base, "perfil.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
  export IDENTIDAD_PERFIL="$ESTADO/estudio/perfil.json"
  # Dónde está cada página de los editores (los enlaces de una a otra): los tres son módulos (editores E2–E4a).
  export ESTUDIO_OTRAS_PAGINAS="foto.html=/api/fotos/,media.html=/api/fotos/,video.html=/api/videos/,editor.html=/api/piezas/editor/"

  cd "$RAIZ"
  setsid nohup backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PUERTO" --app-dir backend \
    > "$ESTADO/api.log" 2>&1 < /dev/null &
  if ! curl -s -m 3 --retry 20 --retry-delay 2 --retry-connrefused "http://127.0.0.1:$PUERTO/api/health" > /dev/null; then
    echo "La API del verde no respondió; vea $ESTADO/api.log" >&2; exit 1
  fi
  echo "API del verde en http://127.0.0.1:$PUERTO — cuenta «verde», clave en $ESTADO/clave_verde"
  QILLQA_API="http://127.0.0.1:$PUERTO" COLAB_PUERTO=$PUERTO_COLAB \
    setsid nohup node "$QILLQASQA/web/colab/servidor.ts" > "$ESTADO/colab.log" 2>&1 < /dev/null &
  echo "Edición simultánea del verde en 127.0.0.1:$PUERTO_COLAB"
  # Los editores de Prensa (Awana, Tullpu, Kuyuy) corren en la API, con su perfil (IDENTIDAD_PERFIL) y el kit común de
  # Unancha (UNANCHA_DIR): el estudio aparte se retiró en E5 (2026-10-21).
  if [[ "${1:-}" == "--web" ]]; then
    # npm --prefix y no «( cd frontend && … & )»: ahí el «&» toma la lista entera y una subcapa queda
    # esperando con la salida abierta (quien llame con una tubería se queda colgado).
    VITE_API_PROXY="http://127.0.0.1:$PUERTO" VITE_COLAB_PROXY="ws://127.0.0.1:$PUERTO_COLAB" \
      setsid nohup npm --prefix "$RAIZ/frontend" run dev -- --port "$PUERTO_WEB" --strictPort --host 127.0.0.1 \
      > "$ESTADO/web.log" 2>&1 < /dev/null &
    echo "Web del verde en http://127.0.0.1:$PUERTO_WEB (sin compilar; registro en $ESTADO/web.log)"
  fi
}

instalar() {
  # Los proyectos de la plataforma que el verde ya usa, en modo editable desde su carpeta (fase 10.2).
  "$RAIZ/backend/.venv/bin/pip" install -q -e "${TIQSI_DIR:-$DOCS_ROOT/tiqsi}"
  "$RAIZ/backend/.venv/bin/python" -c "import tiqsi; print('Tiqsi', tiqsi.VERSION, '(contrato', tiqsi.CONTRATO + ')')"
}

sola() {
  # La Mediateca SOLA (Rikchay, su repositorio desde el 2026-10-21): sin Qillqa, sin la base documental y con el
  # entorno VACÍO salvo lo suyo (env -i), con SU entorno de Python y SU página: si arranca y atiende, no depende de
  # nada de la plataforma. Base propia (nace al arrancar), carpeta propia y la cuenta «verde» del anfitrión mínimo.
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "Mediateca sola detenida."; return; }
  local dir="$ESTADO/rikchay-solo" rikchay="$DOCS_ROOT/rikchay"
  local py="$rikchay/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Rikchay: vea $rikchay/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  # Su página (la cáscara mínima de Tiqsi web con la Mediateca): se construye si falta o con «sola construir».
  if [[ "${1:-}" == "construir" || ! -s "$rikchay/web/dist/index.html" ]]; then
    npm --prefix "$rikchay" run web:construir > "$ESTADO/sola-web.log" 2>&1 \
      || { echo "No se pudo construir la página de la Mediateca sola; vea $ESTADO/sola-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" > /dev/null
  fi
  # Sin «( cd … && … & )»: el «&» tomaría la lista entera y una subcapa quedaría esperando con la salida abierta.
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    MEDIATECA_DATABASE_URL="postgresql+asyncpg://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/$BASE_SOLA" \
    MEDIATECA_DIR="$dir" MEDIATECA_CUENTAS="$dir/cuentas.json" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    MEDIATECA_WEB="$rikchay/web/dist" \
    setsid nohup "$rikchay/.venv/bin/uvicorn" rikchay.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA" > "$ESTADO/sola.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA/api/health" > /dev/null; then
    echo "Mediateca sola en http://127.0.0.1:$PUERTO_SOLA (base $BASE_SOLA, carpeta $dir, cuenta «verde»)"
  else
    echo "La Mediateca sola no respondió; vea $ESTADO/sola.log" >&2; exit 1
  fi
}

sola_rendicion() {
  # Rendición de cuentas SOLA (Yupay, su repositorio desde el 2026-10-22, con SU entorno de Python y SU página): sin Qillqa, sin la base documental y con el entorno VACÍO salvo lo
  # suyo (env -i). Base propia (nace al arrancar), carpeta propia y la cuenta «verde» del anfitrión mínimo.
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_RENDICION " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "Rendición sola detenida."; return; }
  local dir="$ESTADO/yupay-solo" yupay="$DOCS_ROOT/yupay"
  local py="$yupay/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Yupay: vea $yupay/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  # Su página (la cáscara mínima de Tiqsi web con Rendición): se construye si falta o con «sola-rendicion construir».
  if [[ "${1:-}" == "construir" || ! -s "$yupay/web/dist/index.html" ]]; then
    npm --prefix "$yupay" run web:construir > "$ESTADO/sola-rendicion-web.log" 2>&1 \
      || { echo "No se pudo construir la página de Rendición sola; vea $ESTADO/sola-rendicion-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    RENDICION_DATABASE_URL="$(url_de "$BASE_SOLA_RENDICION")" RENDICIONES_DIR="$dir" \
    RENDICION_CUENTAS="$dir/cuentas.json" JWT_SECRET="$(cat "$ESTADO/jwt")" RENDICION_WEB="$yupay/web/dist" \
    RENDICION_TOKENS="${UNANCHA_DIR:-$DOCS_ROOT/unancha}/tokens/colors.json" \
    setsid nohup "$yupay/.venv/bin/uvicorn" yupay.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_RENDICION" > "$ESTADO/sola-rendicion.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_RENDICION/api/health" > /dev/null; then
    echo "Rendición sola en http://127.0.0.1:$PUERTO_SOLA_RENDICION (base $BASE_SOLA_RENDICION, carpeta $dir, cuenta «verde»)"
  else
    echo "Rendición sola no respondió; vea $ESTADO/sola-rendicion.log" >&2; exit 1
  fi
}

sola_minka() {
  # Tareas y Agenda SOLA (Minka, fase 10.2b M3-M4): sin Qillqa, sin la base documental y con el entorno VACÍO salvo lo
  # suyo (env -i). Base propia (nace al arrancar), carpeta propia, su página y la cuenta «verde» del anfitrión mínimo.
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_MINKA " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "Tareas y Agenda sola detenida."; return; }
  local dir="$ESTADO/minka-solo" minka="$DOCS_ROOT/minka"
  local py="$minka/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Minka: vea $minka/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  # Su página (la cáscara mínima de Tiqsi web con Tareas y Agenda): se construye si falta o con «sola-minka construir».
  if [[ "${1:-}" == "construir" || ! -s "$minka/web/dist/index.html" ]]; then
    npm --prefix "$minka" run web:construir > "$ESTADO/sola-minka-web.log" 2>&1 \
      || { echo "No se pudo construir la página de Tareas y Agenda sola; vea $ESTADO/sola-minka-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    MINKA_DATABASE_URL="$(url_de "$BASE_SOLA_MINKA")" MINKA_DIR="$dir" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    MINKA_WEB="$minka/web/dist" \
    setsid nohup "$minka/.venv/bin/uvicorn" minka.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_MINKA" > "$ESTADO/sola-minka.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_MINKA/api/health" > /dev/null; then
    echo "Tareas y Agenda sola en http://127.0.0.1:$PUERTO_SOLA_MINKA (base $BASE_SOLA_MINKA, carpeta $dir, cuenta «verde»)"
  else
    echo "Tareas y Agenda sola no respondió; vea $ESTADO/sola-minka.log" >&2; exit 1
  fi
}

sola_rimay() {
  # El chat SOLO (Rimay, fase 10.2b R3): sin Qillqa, sin la base documental y con el entorno VACÍO salvo lo suyo
  # (env -i). Base propia (nace al arrancar), carpeta propia (sus archivos y sus cuentas), su página y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_RIMAY " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "El chat solo, detenido."; return; }
  local dir="$ESTADO/rimay-solo" rimay="$DOCS_ROOT/rimay"
  local py="$rimay/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Rimay: vea $rimay/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  # Su página (la cáscara mínima de Tiqsi web con el chat): se construye si falta o con «sola-rimay construir».
  if [[ "${1:-}" == "construir" || ! -s "$rimay/web/dist/index.html" ]]; then
    npm --prefix "$rimay" run web:construir > "$ESTADO/sola-rimay-web.log" 2>&1 \
      || { echo "No se pudo construir la página del chat solo; vea $ESTADO/sola-rimay-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    RIMAY_DATABASE_URL="$(url_de "$BASE_SOLA_RIMAY")" RIMAY_DIR="$dir" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    RIMAY_WEB="$rimay/web/dist" \
    setsid nohup "$rimay/.venv/bin/uvicorn" rimay.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_RIMAY" > "$ESTADO/sola-rimay.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_RIMAY/api/health" > /dev/null; then
    echo "El chat solo en http://127.0.0.1:$PUERTO_SOLA_RIMAY (base $BASE_SOLA_RIMAY, carpeta $dir, cuenta «verde»)"
  else
    echo "El chat solo no respondió; vea $ESTADO/sola-rimay.log" >&2; exit 1
  fi
}

sola_punku() {
  # La Mesa de Partes SOLA (Punku, fase 10.2b P3): sin Qillqa, sin la base documental y con el entorno VACÍO salvo lo
  # suyo (env -i). Base propia (nace al arrancar), carpeta propia (lo recibido y sus cuentas), su página (con la mesa
  # virtual pública en /mesa-de-partes) y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_PUNKU " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "La Mesa de Partes sola, detenida."; return; }
  local dir="$ESTADO/punku-solo" punku="$DOCS_ROOT/punku"
  local py="$punku/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Punku: vea $punku/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  # Su página (la cáscara mínima de Tiqsi web con la Mesa de Partes): se construye si falta o con «sola-punku construir».
  if [[ "${1:-}" == "construir" || ! -s "$punku/web/dist/index.html" ]]; then
    npm --prefix "$punku" run web:construir > "$ESTADO/sola-punku-web.log" 2>&1 \
      || { echo "No se pudo construir la página de la Mesa de Partes sola; vea $ESTADO/sola-punku-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    PUNKU_DATABASE_URL="$(url_de "$BASE_SOLA_PUNKU")" PUNKU_DIR="$dir" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    PUNKU_WEB="$punku/web/dist" \
    setsid nohup "$punku/.venv/bin/uvicorn" punku.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_PUNKU" > "$ESTADO/sola-punku.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_PUNKU/api/health" > /dev/null; then
    echo "La Mesa de Partes sola en http://127.0.0.1:$PUERTO_SOLA_PUNKU (base $BASE_SOLA_PUNKU, carpeta $dir, cuenta «verde»)"
  else
    echo "La Mesa de Partes sola no respondió; vea $ESTADO/sola-punku.log" >&2; exit 1
  fi
}

sola_qillqasqa() {
  # Qillqasqa SOLA (Q6a; su repositorio desde el 2026-10-22): sin Qillqa, sin la base documental y con el entorno VACÍO salvo lo suyo (env -i). Base propia
  # (nace al arrancar), carpeta propia (su archivo documental, los informes de la semana y sus cuentas), el marco
  # documental del repositorio con su perfil neutro, su página (Q6b-4: la cáscara mínima de Tiqsi con sus tres módulos)
  # y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_QILLQASQA " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "Qillqasqa sola, detenida."; return; }
  local dir="$ESTADO/qillqasqa-solo" py="$QILLQASQA/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Qillqasqa: vea $QILLQASQA/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir/documentos" "$dir/representacion"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  if [[ "${1:-}" == "construir" || ! -s "$QILLQASQA/web/dist/index.html" ]]; then
    npm --prefix "$QILLQASQA" run web:construir > "$ESTADO/sola-qillqasqa-web.log" 2>&1 \
      || { echo "No se pudo construir la página de Qillqasqa sola; vea $ESTADO/sola-qillqasqa-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    QILLQASQA_DATABASE_URL="$(url_de "$BASE_SOLA_QILLQASQA")" QILLQASQA_DIR="$dir" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    MDD_RUTA="$QILLQASQA/marco_documental" QILLQASQA_WEB="$QILLQASQA/web/dist" \
    setsid nohup "$QILLQASQA/.venv/bin/uvicorn" qillqasqa.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_QILLQASQA" > "$ESTADO/sola-qillqasqa.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 30 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_QILLQASQA/api/health" > /dev/null; then
    echo "Qillqasqa sola en http://127.0.0.1:$PUERTO_SOLA_QILLQASQA (base $BASE_SOLA_QILLQASQA, carpeta $dir, cuenta «verde»)"
  else
    echo "Qillqasqa sola no respondió; vea $ESTADO/sola-qillqasqa.log" >&2; exit 1
  fi
}

sola_qhawana() {
  # El Observatorio SOLO (Qhawana, fase 10.2b Q2): sin Qillqa y con el entorno VACÍO salvo lo suyo (env -i). Sin base:
  # su carpeta (su página, generada con el tema de Unancha, y sus cuentas), su página web y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_QHAWANA " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "El Observatorio solo, detenido."; return; }
  local dir="$ESTADO/qhawana-solo" qhawana="$DOCS_ROOT/qhawana"
  local py="$qhawana/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Qhawana: vea $qhawana/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  if [[ "${1:-}" == "construir" || ! -s "$qhawana/web/dist/index.html" ]]; then
    npm --prefix "$qhawana" run web:construir > "$ESTADO/sola-qhawana-web.log" 2>&1 \
      || { echo "No se pudo construir la página del Observatorio solo; vea $ESTADO/sola-qhawana-web.log" >&2; exit 1; }
  fi
  # Su página de datos, con el tema de Unancha (la de Qillqa lleva el suyo): se genera si falta o con «construir».
  if [[ "${1:-}" == "construir" || ! -s "$dir/plataforma.html" ]]; then
    ( cd "$qhawana" && env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" QHAWANA_DIR="$dir" \
        DATAFW_DIR="${DATAFW_DIR:-$DOCS_ROOT/datafw}" UNANCHA_DIR="${UNANCHA_DIR:-$DOCS_ROOT/unancha}" \
        "$py" -m qhawana.generar --aplicar > "$ESTADO/sola-qhawana-pagina.log" 2>&1 ) \
      || { echo "No se pudo generar la página del Observatorio solo; vea $ESTADO/sola-qhawana-pagina.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    QHAWANA_DIR="$dir" JWT_SECRET="$(cat "$ESTADO/jwt")" QHAWANA_WEB="$qhawana/web/dist" \
    setsid nohup "$qhawana/.venv/bin/uvicorn" qhawana.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_QHAWANA" > "$ESTADO/sola-qhawana.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_QHAWANA/api/health" > /dev/null; then
    echo "El Observatorio solo en http://127.0.0.1:$PUERTO_SOLA_QHAWANA (carpeta $dir, cuenta «verde»)"
  else
    echo "El Observatorio solo no respondió; vea $ESTADO/sola-qhawana.log" >&2; exit 1
  fi
}

sola_wayra() {
  # El kit de transmisiones SOLO (Wayra, su repositorio desde el 2026-10-21): sin Qillqa y con el entorno VACÍO salvo lo
  # suyo (env -i), con SU entorno de Python y SU página. Sin base: su carpeta (sus cuentas), el kit común (Unancha: colores
  # y letra) y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_WAYRA " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "El kit de transmisiones solo, detenido."; return; }
  local dir="$ESTADO/wayra-solo" wayra="$DOCS_ROOT/wayra"
  local py="$wayra/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Wayra: vea $wayra/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  if [[ "${1:-}" == "construir" || ! -s "$wayra/web/dist/index.html" ]]; then
    npm --prefix "$wayra" run web:construir > "$ESTADO/sola-wayra-web.log" 2>&1 \
      || { echo "No se pudo construir la página del kit solo; vea $ESTADO/sola-wayra-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    WAYRA_DIR="$dir" UNANCHA_DIR="${UNANCHA_DIR:-$DOCS_ROOT/unancha}" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    WAYRA_WEB="$wayra/web/dist" \
    setsid nohup "$wayra/.venv/bin/uvicorn" wayra.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_WAYRA" > "$ESTADO/sola-wayra.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_WAYRA/api/health" > /dev/null; then
    echo "El kit de transmisiones solo en http://127.0.0.1:$PUERTO_SOLA_WAYRA (carpeta $dir, cuenta «verde»)"
  else
    echo "El kit de transmisiones solo no respondió; vea $ESTADO/sola-wayra.log" >&2; exit 1
  fi
}

sola_tullpu() {
  # El editor de fotos SOLO (Tullpu, su repositorio desde el 2026-10-21): sin Qillqa y con el entorno VACÍO salvo lo suyo
  # (env -i), con SU entorno de Python (con Ruray, la base común) y SU página. Sin base ni Mediateca: su carpeta (perfil,
  # banco, proyectos, salida y cuentas), el kit común (Unancha) y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_TULLPU " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "El editor de fotos solo, detenido."; return; }
  local dir="$ESTADO/tullpu-solo" tullpu="$DOCS_ROOT/tullpu"
  local py="$tullpu/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Tullpu: vea $tullpu/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  if [[ "${1:-}" == "construir" || ! -s "$tullpu/web/dist/index.html" ]]; then
    npm --prefix "$tullpu" run web:construir > "$ESTADO/sola-tullpu-web.log" 2>&1 \
      || { echo "No se pudo construir la página del editor solo; vea $ESTADO/sola-tullpu-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    TULLPU_DIR="$dir" UNANCHA_DIR="${UNANCHA_DIR:-$DOCS_ROOT/unancha}" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    TULLPU_WEB="$tullpu/web/dist" \
    setsid nohup "$tullpu/.venv/bin/uvicorn" tullpu.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_TULLPU" > "$ESTADO/sola-tullpu.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_TULLPU/api/health" > /dev/null; then
    echo "El editor de fotos solo en http://127.0.0.1:$PUERTO_SOLA_TULLPU (carpeta $dir, cuenta «verde»)"
  else
    echo "El editor de fotos solo no respondió; vea $ESTADO/sola-tullpu.log" >&2; exit 1
  fi
}

sola_kuyuy() {
  # El editor de videos SOLO (Kuyuy, su repositorio desde el 2026-10-21): sin Qillqa y con el entorno VACÍO salvo lo suyo
  # (env -i), con SU entorno de Python (con Ruray, la base común) y SU página. Sin base ni Mediateca: su carpeta (perfil,
  # banco, proyectos, salida y cuentas), el kit común (Unancha) y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_KUYUY " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "El editor de videos solo, detenido."; return; }
  local dir="$ESTADO/kuyuy-solo" kuyuy="$DOCS_ROOT/kuyuy"
  local py="$kuyuy/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Kuyuy: vea $kuyuy/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  if [[ "${1:-}" == "construir" || ! -s "$kuyuy/web/dist/index.html" ]]; then
    npm --prefix "$kuyuy" run web:construir > "$ESTADO/sola-kuyuy-web.log" 2>&1 \
      || { echo "No se pudo construir la página del editor solo; vea $ESTADO/sola-kuyuy-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    KUYUY_DIR="$dir" UNANCHA_DIR="${UNANCHA_DIR:-$DOCS_ROOT/unancha}" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    KUYUY_WEB="$kuyuy/web/dist" \
    setsid nohup "$kuyuy/.venv/bin/uvicorn" kuyuy.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_KUYUY" > "$ESTADO/sola-kuyuy.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_KUYUY/api/health" > /dev/null; then
    echo "El editor de videos solo en http://127.0.0.1:$PUERTO_SOLA_KUYUY (carpeta $dir, cuenta «verde»)"
  else
    echo "El editor de videos solo no respondió; vea $ESTADO/sola-kuyuy.log" >&2; exit 1
  fi
}

sola_awana() {
  # El editor de piezas SOLO (Awana, su repositorio desde el 2026-10-21): sin Qillqa y con el entorno VACÍO salvo lo suyo
  # (env -i), con SU entorno de Python (con Ruray) y SU página. Sin Mediateca: su base (sus piezas de prensa; nace al arrancar), su carpeta (perfil, banco, proyectos, salida y cuentas),
  # su página, el kit común (Unancha) y la cuenta «verde».
  local p
  p="$(ss -ltnp 2>/dev/null | grep ":$PUERTO_SOLA_AWANA " | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
  [[ -n "$p" ]] && { kill $p; sleep 1; }
  [[ "${1:-}" == "detener" ]] && { echo "El editor de piezas solo, detenido."; return; }
  local dir="$ESTADO/awana-solo" awana="$DOCS_ROOT/awana"
  local py="$awana/.venv/bin/python"
  [[ -x "$py" ]] || { echo "Falta el entorno de Awana: vea $awana/README.md §Uso" >&2; exit 1; }
  mkdir -p "$dir"; chmod 700 "$dir"
  [[ -s "$ESTADO/jwt" && -s "$ESTADO/clave_verde" ]] || { echo "Primero: scripts/verde.sh restaurar" >&2; exit 1; }
  if [[ "${1:-}" == "construir" || ! -s "$awana/web/dist/index.html" ]]; then
    npm --prefix "$awana" run web:construir > "$ESTADO/sola-awana-web.log" 2>&1 \
      || { echo "No se pudo construir la página del editor de piezas solo; vea $ESTADO/sola-awana-web.log" >&2; exit 1; }
  fi
  if [[ ! -s "$dir/cuentas.json" ]]; then
    TIQSI_CLAVE="$(cat "$ESTADO/clave_verde")" "$py" -m tiqsi.minimo cuenta "$dir/cuentas.json" verde \
      --rol administrador --nombre "Cuenta de verificación" --nombres "Verificación" > /dev/null
  fi
  env -i HOME="$HOME" PATH="$PATH" LANG="${LANG:-C.UTF-8}" \
    AWANA_DATABASE_URL="$(url_de "$BASE_SOLA_AWANA")" AWANA_DIR="$dir" UNANCHA_DIR="${UNANCHA_DIR:-$DOCS_ROOT/unancha}" JWT_SECRET="$(cat "$ESTADO/jwt")" \
    AWANA_WEB="$awana/web/dist" \
    setsid nohup "$awana/.venv/bin/uvicorn" awana.sola:app \
    --host 127.0.0.1 --port "$PUERTO_SOLA_AWANA" > "$ESTADO/sola-awana.log" 2>&1 < /dev/null &
  if curl -s -m 3 --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$PUERTO_SOLA_AWANA/api/health" > /dev/null; then
    echo "El editor de piezas solo en http://127.0.0.1:$PUERTO_SOLA_AWANA (base $BASE_SOLA_AWANA, carpeta $dir, cuenta «verde»)"
  else
    echo "El editor de piezas solo no respondió; vea $ESTADO/sola-awana.log" >&2; exit 1
  fi
}

case "${1:-}" in
  instalar) instalar ;;
  sola) sola "${2:-}" ;;
  sola-rendicion) sola_rendicion "${2:-}" ;;
  sola-minka) sola_minka "${2:-}" ;;
  sola-rimay) sola_rimay "${2:-}" ;;
  sola-punku) sola_punku "${2:-}" ;;
  sola-qhawana) sola_qhawana "${2:-}" ;;
  sola-wayra) sola_wayra "${2:-}" ;;
  sola-tullpu) sola_tullpu "${2:-}" ;;
  sola-kuyuy) sola_kuyuy "${2:-}" ;;
  sola-awana) sola_awana "${2:-}" ;;
  sola-qillqasqa) sola_qillqasqa "${2:-}" ;;
  observatorio)
    # Simula sin --aplicar; con él, datafw escribe la página en la carpeta del verde (nunca en la de producción).
    QHAWANA_DIR="$ESTADO/qhawana" python3 "$RAIZ/scripts/observatorio.py" "${@:2}" ;;
  restaurar) restaurar ;;
  iniciar) iniciar "${2:-}" ;;
  detener) detener; echo "Verde detenido." ;;
  cuadrar) cuadrar ;;
  recorrido)
    cd "$RAIZ/backend"
    .venv/bin/python -m tests.linea_base
    RECORRIDO_API="http://127.0.0.1:$PUERTO" RECORRIDO_COLAB="ws://127.0.0.1:$PUERTO_COLAB" \
      RECORRIDO_ESTADO="$ESTADO" RECORRIDO_USUARIO=verde .venv/bin/python -m tests.recorrido "${@:2}" ;;
  *) sed -n '2,35p' "$0"; exit 2 ;;
esac
