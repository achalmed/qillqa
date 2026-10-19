#!/usr/bin/env bash
# =====================================================================
#  nuevo.sh  --  Crear un documento con numeracion automatica
# ---------------------------------------------------------------------
#  Cada TIPO lleva su propia serie secuencial e independiente:
#  los oficios simples corren aparte de los oficios multiples, etc.
#  El "registro" de numeracion son los propios documentos: se escanea
#  \setmeta{tipodoc}/\setmeta{numero} de todos los metadata.tex, se
#  toma el maximo del tipo y se suma 1 (nunca se desincroniza).
#
#  Uso:
#     scripts/nuevo.sh <tipo> <descripcion-breve> [opciones]
#
#  Tipos:  oficio | oficio-multiple | memorando | informe
#          comunicado | pronunciamiento | nota-prensa | anuncio
#
#  Carpeta creada:  SERIE-NUMERO-AAAAMMDD-descripcion
#     p. ej.  documentos/oficios/OF-0011-20260804-visita-ie-jcm
#     Series: OF (oficio) | OM (oficio multiple) | MEM | INF |
#             COM | PRO | NP | ANU (publicos); S/N -> SN.
#     Asi las carpetas ordenan por la numeracion correlativa oficial.
#
#  Opciones:
#     --sumilla "TEXTO"    descripcion breve para el nombre del PDF
#     --numero XXXX        numero personalizado (en vez del automatico)
#     --sin-numero         oficio S/N (no consume numero de la serie)
#     --fecha "TEXTO"      fecha impresa (defecto: hoy, en espanol)
#     --siguiente <tipo>   solo consulta el proximo numero libre y sale
#     --lista              registro de todos los documentos y sale
#
#  Ejemplos:
#     scripts/nuevo.sh oficio-multiple encuentro-apafa --sumilla "APAFA"
#     scripts/nuevo.sh oficio respuesta-drea --numero 0015 --sumilla "DREA"
#     scripts/nuevo.sh oficio desistimiento-x --sin-numero
#     scripts/nuevo.sh --siguiente oficio-multiple
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FW="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Archivo documental ------------------------------------------------
#  Los documentos del despacho NO viven en el repo (D13): viven donde
#  apunta MDD_DOCUMENTOS. `documentos/` dentro del marco es el sitio
#  HEREDADO y solo se usa si no hay archivo declarado. Esto importa para
#  la NUMERACION: escanear la carpeta equivocada devuelve siempre «0001»
#  aunque la serie real vaya por 0031 (corregido 2026-09-23).
#  Del .env se lee SOLO esa clave: el resto (JWT_SECRET, ADMIN_*) no se
#  carga en el entorno de un script de compilacion.
if [[ -z "${MDD_DOCUMENTOS:-}" && -f "$FW/../.env" ]]; then
  MDD_DOCUMENTOS="$(sed -n 's/^[[:space:]]*MDD_DOCUMENTOS[[:space:]]*=[[:space:]]*//p' \
                      "$FW/../.env" | tail -n1 | sed 's/^"\(.*\)"$/\1/;s/^'"'"'\(.*\)'"'"'$/\1/')"
fi
ARCHIVO="${MDD_DOCUMENTOS:-$FW/documentos}"
[[ -d "$ARCHIVO" ]] || ARCHIVO="$FW/documentos"
# shellcheck source=lib/logging.sh
source "$SCRIPT_DIR/lib/logging.sh"
logging_init

# --- Etiqueta tipodoc y carpeta por tipo ------------------------------
tipo_etiqueta() {
  case "$1" in
    oficio)          echo "Oficio" ;;
    oficio-multiple) echo "Oficio Múltiple" ;;
    memorando)       echo "Memorando" ;;
    informe)         echo "Informe" ;;
    solicitud)       echo "Solicitud" ;;
    acta)            echo "Acta de Sesión" ;;
    comunicado)      echo "Comunicado" ;;
    pronunciamiento) echo "Pronunciamiento" ;;
    nota-prensa)     echo "Nota de Prensa" ;;
    anuncio)         echo "Anuncio" ;;
    *) return 1 ;;
  esac
}
tipo_carpeta() {
  case "$1" in
    oficio|oficio-multiple) echo "oficios" ;;
    memorando)              echo "memorandos" ;;
    informe)                echo "informes" ;;
    solicitud)              echo "solicitudes" ;;
    acta)                   echo "actas" ;;
    comunicado|pronunciamiento|nota-prensa|anuncio) echo "comunicados" ;;
  esac
}
# Marcador de serie para el nombre de carpeta (varias series conviven
# en una carpeta: OF/OM en oficios/, COM/PRO/NP/ANU en comunicados/)
tipo_prefijo() {
  case "$1" in
    oficio)          echo "OF" ;;
    oficio-multiple) echo "OM" ;;
    memorando)       echo "MEM" ;;
    informe)         echo "INF" ;;
    solicitud)       echo "SOL" ;;
    acta)            echo "ACT" ;;
    comunicado)      echo "COM" ;;
    pronunciamiento) echo "PRO" ;;
    nota-prensa)     echo "NP" ;;
    anuncio)         echo "ANU" ;;
  esac
}

# --- Leer un \setmeta de un archivo ----------------------------------
meta_de() {
  sed -n "s/^\\\\setmeta{$2}{\(.*\)}[[:space:]]*$/\1/p" "$1" | head -1
}

# --- Siguiente numero libre de un tipo (escaneo del registro vivo) ---
siguiente_numero() {
  local etiqueta="$1" max=0 n num tipod
  while IFS= read -r -d '' meta; do
    tipod="$(meta_de "$meta" tipodoc)"
    [[ "$tipod" == "$etiqueta" ]] || continue
    num="$(meta_de "$meta" numero)"
    [[ "$num" =~ ^[0-9]+$ ]] || continue      # ignora S/N y no numericos
    n=$((10#$num))
    (( n > max )) && max=$n
  done < <(find "$ARCHIVO" -name metadata.tex -print0 2>/dev/null)
  printf '%04d' $((max + 1))
}

# --- Registro completo ------------------------------------------------
listar_registro() {
  printf '%-16s %-6s %-11s %-14s %s\n' "TIPO" "N°" "AÑO" "FECHA(carp.)" "SUMILLA"
  while IFS= read -r -d '' meta; do
    local carp; carp="$(basename "$(dirname "$meta")")"
    # carpeta = SERIE-NUMERO-AAAAMMDD-desc -> la fecha es el 3er campo
    local fcarp; fcarp="$(echo "$carp" | cut -d- -f3)"
    printf '%-16s %-6s %-11s %-14s %s\n' \
      "$(meta_de "$meta" tipodoc)" \
      "$(meta_de "$meta" numero)" \
      "$(meta_de "$meta" anio)" \
      "$fcarp" \
      "$(meta_de "$meta" sumilla)"
  done < <(find "$ARCHIVO" -name metadata.tex -print0 2>/dev/null) | sort -k1,1 -k2,2
}

# --- Fecha de hoy en espanol -----------------------------------------
fecha_hoy() {
  local meses=(enero febrero marzo abril mayo junio julio agosto setiembre octubre noviembre diciembre)
  echo "$(date +%-d) de ${meses[$(date +%-m)-1]} del $(date +%Y)"
}

# --- Modos de consulta ------------------------------------------------
if [[ "${1:-}" == "--lista" ]]; then
  listar_registro
  exit 0
fi
if [[ "${1:-}" == "--siguiente" ]]; then
  etiqueta="$(tipo_etiqueta "${2:?falta el tipo}")" || { log_error "Tipo desconocido: $2"; exit 2; }
  echo "Siguiente $etiqueta: N°$(siguiente_numero "$etiqueta")"
  exit 0
fi

# --- Parseo de creacion ----------------------------------------------
TIPO="${1:-}"; DESC="${2:-}"
if [[ -z "$TIPO" || -z "$DESC" ]]; then
  sed -n '2,30p' "$0" | sed 's/^# \{0,2\}//'
  exit 2
fi
shift 2
ETIQUETA="$(tipo_etiqueta "$TIPO")" || { log_error "Tipo desconocido: $TIPO"; exit 2; }

SUMILLA=""; NUMERO=""; SINNUMERO=false; FECHA="$(fecha_hoy)"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sumilla)    SUMILLA="$2"; shift 2 ;;
    --numero)     NUMERO="$2"; shift 2 ;;
    --sin-numero) SINNUMERO=true; shift ;;
    --fecha)      FECHA="$2"; shift 2 ;;
    *) log_error "Opcion desconocida: $1"; exit 2 ;;
  esac
done

# Periodo anual de sesiones y siglas del despacho: del perfil (MDD_PERFIL/perfil.env)
[[ -n "${MDD_PERFIL:-}" && -f "$MDD_PERFIL/perfil.env" ]] && source "$MDD_PERFIL/perfil.env"
ANIO_LEG="${MDD_ANIO_LEG:?Defina MDD_ANIO_LEG (perfil.env del despacho, MDD_PERFIL)}"
SIGLAS="${MDD_SIGLAS:?Defina MDD_SIGLAS (perfil.env del despacho, MDD_PERFIL)}"

# --- Numero: automatico, personalizado o S/N -------------------------
# (se resuelve ANTES de armar la carpeta: su nombre lleva el numero)
if [[ "$SINNUMERO" == true ]]; then
  NUMERO="S/N"
  NUMEROCOMPLETO="$ETIQUETA S/N-${SIGLAS%%-*}-$(date +%Y)-L"
else
  [[ -n "$NUMERO" ]] || NUMERO="$(siguiente_numero "$ETIQUETA")"
  NUMEROCOMPLETO="$ETIQUETA N°$NUMERO-$ANIO_LEG-$SIGLAS"
fi

# --- Carpeta: SERIE-NUMERO-FECHACOMPACTA-descripcion -----------------
# (estandar 2026-08-04: ordena por numeracion correlativa oficial;
#  la fecha va sin guiones para ocupar menos: AAAAMMDD)
NUMCARP="$NUMERO"; [[ "$NUMCARP" == "S/N" ]] && NUMCARP="SN"
HOY="$(date +%Y%m%d)"
CARPETA="$ARCHIVO/$(tipo_carpeta "$TIPO")/$(tipo_prefijo "$TIPO")-$NUMCARP-$HOY-$DESC"
[[ -e "$CARPETA" ]] && { log_error "Ya existe: $CARPETA"; exit 1; }

# --- Crear carpeta + metadata.tex ------------------------------------
mkdir -p "$CARPETA"
cat > "$CARPETA/metadata.tex" <<EOF
%% =====================================================================
%%  metadata.tex  --  DATOS del documento (lo unico que se edita aqui)
%% =====================================================================

%% Numeracion (se imprime tal cual, en mayusculas y subrayada)
\\setmeta{numerocompleto}{$NUMEROCOMPLETO}

\\setmeta{tipodoc}{$ETIQUETA}
\\setmeta{numero}{$NUMERO}
\\setmeta{anio}{$ANIO_LEG}
\\setmeta{siglas}{$SIGLAS}

%% Descripcion breve para el nombre institucional del PDF
\\setmeta{sumilla}{${SUMILLA:-EDITAR-SUMILLA}}

\\setmeta{lugar}{Lima}
\\setmeta{fecha}{$FECHA}
EOF

# --- Maestro ----------------------------------------------------------
case "$TIPO" in
  oficio|oficio-multiple)
    cat > "$CARPETA/oficio.tex" <<'EOF'
\documentclass{oficio}

\input{metadata.tex}

%% Ajustes tipicos para caber en UNA hoja (quitar si no hacen falta)
\setinterlineado{1.05}
\setespacioparrafos{4pt}
\setselloaltura{0.15cm}

\begin{document}

\lugaryfecha
\numerodocumento

\destinatario{\textbf{Señores:}}%
  {DESTINATARIO}%
  {}

\asunto{ASUNTO DEL DOCUMENTO}

% \referencia{Documento de la referencia, de fecha ...}

\saludo

Cuerpo del oficio.

Sin otro particular por el momento, me despido reiterándole los
sentimientos de mi especial consideración y estima.

\atentamente
%% \vfill ancla la firma al FONDO: misma altura en todos los oficios.
%% Los 2 cm son el minimo sobre el nombre (espacio de la firma digital).
\vfill
\bloquefirma[2.0cm]

\end{document}
EOF
    MAESTRO="oficio.tex"
    ;;
  memorando)
    cp "$FW/templates/memorando/memorando.tex" "$CARPETA/"
    MAESTRO="memorando.tex"
    ;;
  informe)
    cp "$FW/templates/informe/informe.tex" "$CARPETA/"
    MAESTRO="informe.tex"
    ;;
  solicitud)
    cp "$FW/templates/solicitud/solicitud.tex" "$CARPETA/"
    MAESTRO="solicitud.tex"
    ;;
  acta)
    cp "$FW/templates/acta/acta.tex" "$CARPETA/"
    MAESTRO="acta.tex"
    ;;
  comunicado|pronunciamiento|nota-prensa|anuncio)
    cp "$FW/templates/comunicado/comunicado.tex" "$CARPETA/"
    MAESTRO="comunicado.tex"
    ;;
esac

log_ok "Documento creado: ${CARPETA#"$FW/"}"
log_ok "Numeracion:       $NUMEROCOMPLETO"
[[ -z "$SUMILLA" ]] && log_warn "Falta la sumilla: editar metadata.tex (\\setmeta{sumilla}{...})"
log_info "Siguiente paso:   editar el cuerpo y compilar:"
log_info "  scripts/build.sh \"${CARPETA#"$FW/"}/$MAESTRO\""
