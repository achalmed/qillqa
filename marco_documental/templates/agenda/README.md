---
tipo: readme
estado: activo
---
# agenda/ — plantilla de la agenda diaria de trabajo: documento interno que se imprime rellenado y se completa a mano

`\documentclass{agenda}`; sin serie ni firma: se identifica por su **fecha**. Membrete `congreso`, sin
marca de agua, con folio. Se compila con `scripts/build.sh templates/agenda/agenda.tex`; el generador
`scripts/generar-agenda.py` que la componía desde la carpeta de correo está retirado (M10 D8): hoy
se escribe a mano copiando esta carpeta.

## Datos (`metadata.tex`)

`fecha` (texto largo), `lugar`, `nombrearchivo` opcional («Agenda diaria AAAA-MM-DD»).

## Partes (`contenido.tex`)

`\cabeceraagenda` (en el maestro) · `\bloqueagenda{Título}` por bloque: entorno `cronograma` con
`\slot{hora}{}` o `\slot{hora}{\slotevento{qué}{dónde}}`; `\reunionbox{hora}{título}{lugar}{expediente}`;
`\notabloque{…}`; `\itempendiente{…}{…}`, `\itemcomunicacion{…}`; `\rengloneslibres{n}` y
`\tablaacuerdos` para escribir a mano; `\casilla` y `\lineaescritura` como piezas.

## Arquitectura

`classes/agenda.cls` (clase delgada) · `structures/agenda/structure.tex` (formato de los bloques,
colores y fuentes de marca) · esta carpeta (maestro + `contenido.tex` de ejemplo, el «test» del tipo).
