---
tipo: readme
estado: activo
---
# proyecto-de-ley/ — plantilla del proyecto de ley: iniciativa legislativa con el esquema `proyecto-de-ley` del ecosistema

`\documentclass{proyecto-de-ley}`; el esquema (`escritura/esquemas/proyecto-de-ley.tex`, Reglamento
del Congreso arts. 75–76 y Manual de Técnica Legislativa 2021 §X y §VI) lo carga la clase y el
compilador lo exige: cada pieza se abre con `\componente{clave}` y una obligatoria ausente o fuera
de orden es error. Método de redacción: `prompts/06 legislativo/` (prompt 08). El SGDP lo compone
desde las partes de un proyecto (`../../../backend/app/latex/proyecto_ley.py`, módulo Proyectos);
esta plantilla es el test de la clase y el modelo para redactarlo a mano.

## Datos (`metadata.tex`)

`numero`, `anio`, `fecha`; `firmante` y `cargofirmante` (por defecto `\meta{autor}`, el titular);
`grupo` (grupo parlamentario). Condiciones en el maestro: `\esquemacondicion{modificatoria|ambiental|agenda|anexo}`.

## Componentes (en orden)

`presentacion` · `titulo` (`\titulodelaley{…}`) · `formula` (`sustantiva` con `\articulo{n}{epígrafe}`;
opcionales `preliminar`, `dcf`, `dct`, `dcm`, `dcd`, `anexo-formula` con `\bloquedisposiciones{…}` +
`\disposicion{Primera}{…}`; `firmas` con `\firmaslegislativas`) · `exposicion` (`fundamentos`,
`antecedentes`, `efecto`, `costo-beneficio`; condicionales `ambiental`, `agenda`, `anexo`) ·
`comparativo` (si `modificatoria`).
