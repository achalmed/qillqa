---
tipo: readme
estado: activo
---
# classes/ — una clase delgada por tipo documental: carga el núcleo y fija los defaults del tipo

`\documentclass{oficio|memorando|informe|solicitud|acta|comunicado|agenda|informe-sr|rendicion-viaticos|proyecto-de-ley|dictamen|mocion}`.
Cada clase (~15–30 líneas) carga `../core/despacho.cls`, elige membrete y estructura por defecto,
fija `tipodoc`, `anio` y opciones de página, y nada más: la lógica vive en `core/` y el esqueleto en
`../structures/`. Un tipo nuevo = clase aquí + estructura + plantilla con README + objetivo en el
`Makefile` (`../docs/decisiones.md` §«Cómo se amplía»). Los legislativos (`proyecto-de-ley`,
`dictamen`, `mocion`) exigen además su esquema del AWF (`\usaresquema`).
