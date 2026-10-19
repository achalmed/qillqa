---
tipo: readme
estado: activo
---
# informe/ — plantilla del informe: documento interno que el personal eleva al titular, con secciones numeradas y folio

`\documentclass{informe}`, serie `INF`; folio «Pág. x de y» activado por defecto.

## Datos (`metadata.tex`)

`numero`, `anio`, `fecha` (comentada = hoy); `firmante` y `cargofirmante` (quien eleva el informe).

## Partes

`\numerodocumento` · `\cabecerainforme[Referencia]{A}{De}{Asunto}` (la plantilla usa
`\meta{autor} — \meta{cargo}` como destinatario y `\meta{firmante} — \meta{cargofirmante}` como
remitente) · `\seccion{Antecedentes}`, `\seccion{Análisis}`, `\seccion{Conclusiones y
recomendaciones}` (numeradas I., II., …) · `\atentamente` · `\bloquefirma[1.8cm]` · `\adjunto{…}` ·
`\concopia{…}`.
