#!/usr/bin/env bash
# =====================================================================
#  lib/nombrado.sh  --  Nombre institucional del PDF (una responsabilidad)
# ---------------------------------------------------------------------
#  Estandar de nomenclatura del despacho (2026-09-08, pedido de Edison):
#
#     SERIE-NUMERO-PERIODO_Descripcion-breve.pdf
#     p. ej.  OM-0002-2026-2027_APAFA.pdf
#
#  Antes era «OFICIO MULTIPLE N°0002-2026-2027 - APAFA.pdf»: el tipo escrito
#  entero y con espacios empujaba el numero y el asunto, y al compartirlo por
#  WhatsApp o verlo en un USB no se identificaba de un vistazo. La misma
#  convencion la aplica el SGDP a los documentos de la plataforma
#  (backend/app/servicios/nombres.py, que es la fuente unica de la regla);
#  esto es su equivalente para los .tex compilados a mano.
#
#  El nombre se compone desde metadata.tex del documento:
#     \setmeta{serie}{OM}                  <- sigla corta de la serie
#     \setmeta{tipodoc}{Oficio Multiple}   <- respaldo si no hay serie
#     \setmeta{numero}{0002}
#     \setmeta{anio}{2026-2027}
#     \setmeta{sumilla}{APAFA}             <- descripcion breve
#
#  Override total (si el estandar no aplica):
#     \setmeta{nombrearchivo}{NOMBRE EXACTO SIN EXTENSION}
#
#  Sin `sumilla` ni `nombrearchivo`, el PDF conserva el nombre del
#  maestro (oficio.pdf) -- caso de las plantillas.
# =====================================================================

# nombrado_meta <archivo> <clave>  -> imprime el valor o vacio
nombrado_meta() {
  sed -n "s/^\\\\setmeta{$2}{\(.*\)}[[:space:]]*$/\1/p" "$1" | head -1
}

# nombrado_final  -- renombra ENV_JOBDIR/ENV_JOB.pdf al estandar
nombrado_final() {
  local metafile="$ENV_JOBDIR/metadata.tex"
  [[ -f "$metafile" ]] || return 0

  local nombre
  nombre="$(nombrado_meta "$metafile" nombrearchivo)"

  if [[ -z "$nombre" ]]; then
    local serie tipodoc numero anio sumilla
    serie="$(nombrado_meta "$metafile" serie)"
    tipodoc="$(nombrado_meta "$metafile" tipodoc)"
    numero="$(nombrado_meta "$metafile" numero)"
    anio="$(nombrado_meta "$metafile" anio)"
    sumilla="$(nombrado_meta "$metafile" sumilla)"
    # sin sumilla no hay estandar que aplicar (p. ej. plantillas)
    [[ -n "$sumilla" && -n "$numero" && -n "$anio" ]] || return 0
    # Sin \setmeta{serie}, se derivan las siglas de las iniciales del tipo
    # («Oficio Multiple» -> OM), que es como se llaman las series del despacho.
    if [[ -z "$serie" ]]; then
      [[ -n "$tipodoc" ]] || return 0
      serie="$(python3 -c 'import sys, unicodedata
t = unicodedata.normalize("NFKD", sys.argv[1]).encode("ascii", "ignore").decode()
print("".join(p[0] for p in t.split() if p).upper())' "$tipodoc")"
    fi
    # numero «S/N» (borrador) -> «SN»: la barra abriria una subcarpeta.
    numero="${numero//\//}"
    # El asunto, sin tildes ni caracteres raros y con un solo guion.
    sumilla="$(python3 -c 'import re, sys, unicodedata
t = unicodedata.normalize("NFKD", sys.argv[1]).encode("ascii", "ignore").decode()
t = re.sub(r"[^A-Za-z0-9]+", "-", t).strip("-")
print(re.sub(r"-{2,}", "-", t)[:60].strip("-"))' "$sumilla")"
    nombre="${serie}-${numero}-${anio}_${sumilla}"
  fi

  # sanear: sin barras (romperian la ruta)
  nombre="${nombre//\//-}"

  local destino="$ENV_JOBDIR/$nombre.pdf"
  mv "$ENV_JOBDIR/$ENV_JOB.pdf" "$destino"
  log_ok "Nombre institucional: $nombre.pdf"
}
