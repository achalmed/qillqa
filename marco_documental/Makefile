# =====================================================================
#  Makefile  --  Atajos del Marco Documental del Despacho
# ---------------------------------------------------------------------
#  make plantillas   compila las 12 plantillas (los "tests" del sistema); requiere MDD_PERFIL
#  make DOC=documentos/oficios/2026-.../oficio.tex build
#  make clean        borra auxiliares en templates/ y documentos/
# =====================================================================

BUILD := scripts/build.sh

.PHONY: plantillas oficio memorando informe comunicado informe-sr acta solicitud agenda proyecto-de-ley dictamen mocion rendicion-viaticos build clean

plantillas: oficio memorando informe comunicado informe-sr acta solicitud agenda proyecto-de-ley dictamen mocion rendicion-viaticos

acta:
	$(BUILD) templates/acta/acta.tex

solicitud:
	$(BUILD) templates/solicitud/solicitud.tex

agenda:
	$(BUILD) templates/agenda/agenda.tex

proyecto-de-ley:
	$(BUILD) templates/proyecto-de-ley/proyecto-de-ley.tex

dictamen:
	$(BUILD) templates/dictamen/dictamen.tex

mocion:
	$(BUILD) templates/mocion/mocion.tex

# Rendicion de viaticos (Anexos 3 y 4; la genera el SGDP desde el modulo Rendicion de cuentas,
# 2026-10-18). La plantilla, con datos ficticios, es el test de la clase.
rendicion-viaticos:
	$(BUILD) templates/rendicion-viaticos/rendicion-viaticos.tex

# Informe de Semana de Representacion (tipo editorial; generador en
# generadores/informe-sr/). La plantilla es el "test" de la clase.
informe-sr:
	$(BUILD) templates/informe-sr/informe-sr.tex

oficio:
	$(BUILD) templates/oficio/oficio.tex

memorando:
	$(BUILD) templates/memorando/memorando.tex

informe:
	$(BUILD) templates/informe/informe.tex

comunicado:
	$(BUILD) templates/comunicado/comunicado.tex

build:
ifndef DOC
	$(error Falta DOC. Uso: make DOC=ruta/al/maestro.tex build)
endif
	$(BUILD) "$(DOC)"

clean:
	@find templates -name '*.aux' -o -name '*.log' -o -name '*.out' \
	  -o -name '*.toc' -o -name '*.synctex.gz' -o -name '*.fls' \
	  -o -name '*.fdb_latexmk' 2>/dev/null | xargs -r rm -v
