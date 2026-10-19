---
tipo: readme
estado: activo
---
# membretes/ — papel membretado seleccionable: `congreso` (oficial), `despacho` (moderno), `camara` (proyectos de ley) y `prensa` (públicos)

`\usarmembrete{congreso|despacho|camara|prensa}` en el preámbulo; cada `membrete.tex` solo usa `\meta{…}` y
`\fancyhead` (idempotente: puede cargarse varias veces), nunca `\newcommand`. `congreso`: escudo +
logo del Congreso (defecto); `despacho`: logo de la Cámara de Diputados; `camara`: escudo y logo de la Cámara en blanco y negro, nombre en barra gris, sin filete (proyectos de ley, con `\usarpiecongreso`: pie institucional del Congreso y franja guinda, 2026-10-01); `prensa`: emblemas centrados,
lema y doble filete, con la banda de prensa al pie (`../core/config/banda-prensa.tex`) en lugar del
pie institucional. El pie institucional vive una sola vez en `../core/config/membrete.tex`. El
membrete `prensa` es más alto: `comunicado.cls` ensancha `headheight` a 3,55 cm solo para él.
