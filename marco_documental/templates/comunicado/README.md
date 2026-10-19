---
tipo: readme
estado: activo
---
# comunicado/ — plantilla de los documentos públicos: comunicado, pronunciamiento, nota de prensa y anuncio (un solo tipo)

`\documentclass{comunicado}`; series `COM`/`PRO`/`NP`/`ANU` según `\setmeta{tipodoc}` (`Comunicado`
por defecto | `Pronunciamiento` | `Nota de Prensa` | `Anuncio`). Membrete `prensa` y banda de prensa
al pie con el retrato, la identidad y la consigna del perfil; **sin firma ni posfirma**.

## Datos (`metadata.tex`)

`tipodoc`, `numero` (comentado = sin número), `anio`, `lugar`, `fecha`, `sumilla` o `nombrearchivo`;
para notas de prensa, `prensanombre`, `prensacorreo`, `prensacelular` (contacto propio).

## Partes

`\cabeceradocumento` · `\titular{…}` y `\bajada{…}` (recomendados en notas de prensa) · párrafo de
apertura (la plantilla usa «El despacho del \meta{cargo} \meta{autor}…») · entorno `puntos` con
`\item` · cierre · `\cierrelugarfecha` · opcional `\contactoprensa` (notas de prensa) o
`\firmainstitucional` (pronunciamiento formal con cierre firmado).

## Selecciones

`\sinfotobanda`, `\sinconsignabanda`, `\sinbandaprensa`, `\setbandafotoaltura{4.0cm}`,
`\sinmarcaagua`, `\setinterlineado{1.05}`, `\setespacioparrafos{5pt}`.
