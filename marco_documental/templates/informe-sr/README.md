---
tipo: readme
estado: activo
---
# informe-sr/ — plantilla y test del Informe de Semana de Representación: tipo editorial que no se escribe a mano

`\documentclass{informe-sr}`; serie `ISR` (la numera el SGDP). Los informes reales los genera
`generadores/informe-sr/main.py` desde el YAML del expediente del despacho y los compila con
`scripts/build.sh`; esta plantilla ejercita los componentes con datos de muestra (primero la edición
pública, luego los componentes de la edición interna) y es el test de la clase (`make informe-sr`).

## Datos (`metadata.tex`)

`numero`, `titulocorrido`, `fecha`, `lugar` (en los reales los escribe el generador desde
`informe.yaml`); el titular, el cargo y la circunscripción salen del perfil (`\meta{autor}`,
`\meta{cargo}`, `\meta{distrito}`), y el retrato de la presentación de `\despachoRetratoBusto`.

## Partes

`\portadainforme[kicker=…, ambito=…, codigo=…]` · `\tableofcontents` + ficha técnica (`\isrkicker`,
`\isrdato`) · `\membreteinforme` + `\seccion{Presentación}` con retrato y `\bloquefirma` · resumen
(`\isrcifra`) · crónica (`\articulo{kicker}{titular}{entrada}`, entorno `columnas`, `\isrfotoapertura`,
`\isrfotogrande`, `\isrcita`) · `\isrgrafico` · matriz y fichas (`isrpedidos`, `isrcrono`, tablas: solo
edición interna) · anexos PDF · `\contraportadainforme`. Titulares con `\isrsinguiones`.
