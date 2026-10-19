---
tipo: readme
estado: activo
---
# dictamen/ — plantilla del dictamen de comisión: esquema `dictamen` del ecosistema (art. 70; Manual §XI, anexos A–F)

`\documentclass{dictamen}`; el esquema (`escritura/esquemas/dictamen.tex`) lo carga la clase y el
compilador lo exige (`\componente{clave}`). Variantes de formato del Manual: aprobación en sus
términos, texto sustitutorio, no aprobación… No entra al SGDP web.

## Datos (`metadata.tex`)

`numero`, `anio`, `fecha`; `firmante` y `cargofirmante` (por defecto el titular del perfil);
`comision`, `periodo` (periodo anual de sesiones). En el maestro,
`\esquemacondicion{aprobacion|sustitutorio|acumulacion}`.

## Componentes (en orden)

`sumilla` (`\sumilla{…}`) · `encabezado` · `presentacion` · `situacion` (`procedimentales`,
`parlamentarios`) · `contenido` · `marco` (`nacional`; opcionales `comparada`, `convencional`) ·
`opiniones` · `analisis` (`tecnico`, `necesidad`, `efecto`, `analisis-opiniones`, `costo-beneficio`) ·
`conclusion` · `formula` (solo con `aprobacion`) · `estilo` (`\formuladeestilo`) · `firmas`
(`\firmaslegislativas`).
