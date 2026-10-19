---
tipo: readme
estado: activo
---
# structures/ — esqueleto retórico de cada tipo: las partes que un documento rellena

Una carpeta por tipo con `structure.tex` (el `informe-sr` reparte en `portada.tex`, `componentes.tex`,
`tablas.tex`, `anexos.tex`; `legislativo/` sirve a proyecto de ley, dictamen y moción). Definen las
macros de las partes (`\destinatario`, `\asunto`, `\cabeceramemo`, `\estacion`, `\titular`,
`\articulo`…) y su aire (`\espaciopartes`…). Se cargan desde el preámbulo con `@` no letra: sin
nombres con `@` (si hace falta, guardar y restaurar el catcode, como `legislativo`); llevan guardia
anti doble carga (`\ifcsname despachoEstructura…`). Lo común a todos los tipos (firma, sello,
adjuntos, copias) no se define aquí sino en `../core/lib/partes-comunes.tex`.

| estructura | sirve a |
|---|---|
| `oficio/` | oficio, oficio múltiple, carta, bancada (familia del oficio) |
| `memorando/`, `informe/`, `solicitud/`, `acta/`, `comunicado/`, `agenda/`, `rendicion-viaticos/` | su tipo |
| `informe-sr/` | informe de Semana de Representación (edición pública e interna) |
| `legislativo/` | proyecto de ley, dictamen, moción (forma del Manual de Técnica Legislativa) |
