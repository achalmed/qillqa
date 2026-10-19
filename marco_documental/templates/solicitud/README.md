---
tipo: readme
estado: activo
---
# solicitud/ — plantilla de la solicitud: petición formal encabezada por la sumilla, sin número impreso ni antefirma

`\documentclass{solicitud}`, serie `SOL` (solo para el nombre del PDF y el registro: la norma no
imprime «N°»). Firma sin «Atentamente,».

## Datos (`metadata.tex`)

`numero`, `anio`, `lugar`, `fecha` (comentada = hoy), `sumilla` opcional.

## Partes

`\sumillasolicitud{SOLICITO: …}` · `\destinatariosolicitud{Señor …}{Institución}{S.D.}` ·
apertura «Quien suscribe, en representación del despacho del titular…» (la plantilla usa
`\meta{autor}`) · exposición · `\textbf{POR LO EXPUESTO:}` · petición · `\vfill` · `\lugaryfecha` ·
`\bloquefirma[2.0cm]` · `\adjunto{…}`.
