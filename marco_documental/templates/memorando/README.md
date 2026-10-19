---
tipo: readme
estado: activo
---
# memorando/ — plantilla del memorando: comunicación interna del despacho, firmada por su personal

`\documentclass{memorando}`, serie `MEM`, interno (circula por el STD, sin cargo de recepción).

## Datos (`metadata.tex`)

`numero`, `anio`, `fecha` (comentada = hoy); **`firmante` y `cargofirmante`** (quien firma, personal
del despacho; si faltan, firma el titular del perfil).

## Partes

`\numerodocumento` · `\cabeceramemo[Referencia]{Para}{De}{Asunto}` (el opcional es la línea REF.) ·
cuerpo (párrafos, `enumerate`) · `\atentamente` · `\bloquefirma[1.8cm]` · `\adjunto{…}` ·
`\concopia{…}`. El número se compone `tipodoc N°numero-anio/siglas` con las siglas del perfil.
