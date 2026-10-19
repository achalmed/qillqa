#!/usr/bin/env bash
# =====================================================================
#  scripts/config.sh  --  Parametros configurables del compilador
# ---------------------------------------------------------------------
#  TODO ajuste del usuario vive aqui (nunca en lib/). Mismo contrato
#  que el Academic Writing Framework.
# =====================================================================

# Niveles a subir desde scripts/ hasta la raiz del framework
CFG_FW_LEVELS=1

# Motor de compilacion (unico soportado: LuaLaTeX, por fontspec)
CFG_MOTOR="lualatex"

# Pasadas (2: la primera fija referencias/lastpage, la segunda las usa). Como los auxiliares se borran
# tras compilar (CFG_LIMPIAR_TRAS_COMPILAR), toda compilacion es en frio: un documento con indice (informe-sr)
# necesita una tercera pasada. Se sigue compilando hasta que .aux y .toc dejen de cambiar, con este tope.
CFG_PASADAS=2
CFG_PASADAS_MAX=4

# Opciones del motor
CFG_OPCIONES=(-interaction=nonstopmode -halt-on-error -file-line-error)

# Extensiones auxiliares que limpia --clean
CFG_AUX_EXTS=(aux log out toc lof lot synctex.gz fls fdb_latexmk)

# Borrar los auxiliares tras una compilacion con exito (meta/NORMATIVA_ARCHIVOS.md §5: el motor
# no admite -output-directory con TEXINPUTS relativos, asi que se envuelve). Si la compilacion
# falla, el .log se conserva para diagnosticar. M10 D8 (2026-09-15).
CFG_LIMPIAR_TRAS_COMPILAR=true
