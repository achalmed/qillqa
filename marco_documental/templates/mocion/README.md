---
tipo: readme
estado: activo
---
# mocion/ — plantilla de la moción de orden del día: esquema `mocion` del ecosistema (Reglamento del Congreso art. 68)

`\documentclass{mocion}`; el esquema (`escritura/esquemas/mocion.tex`) lo carga la clase y el
compilador lo exige. Método: `prompts/06 legislativo/` (prompt 09). No entra al SGDP web.

## Datos (`metadata.tex`)

`numero`, `anio`, `fecha`; `firmante` y `cargofirmante` (por defecto el titular del perfil); `grupo`.

## Componentes (en orden)

`sumilla` (`\sumilla{…}`: el pedido concreto según el caso a–e del art. 68) · `considerandos`
(«CONSIDERANDO:» y un «Que, …» por hecho o norma verificados) · `acuerdo` («EL CONGRESO DE LA
REPÚBLICA ACUERDA:» y una sola proposición) · `firmas` (`\firmaslegislativas`).
