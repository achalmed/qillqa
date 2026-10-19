---
tipo: readme
estado: activo
---
# perfil.ejemplo/ — lo que un despacho aporta para usar el SGDP y el marco: perfil LaTeX, `perfil.env` y rutas

Copie esta carpeta como `<despacho>/perfil/latex/`, complete los valores y apunte `MDD_PERFIL` a
ella en el `.env` (`.env.example`). El marco la busca por `TEXINPUTS` antes que
`marco_documental/core/perfil-defecto/`, así que cualquier archivo con el mismo nombre (retratos,
sello, consigna) gana al neutro; los que no aporte se toman del neutro. Nada de esto entra en el repo.

## Estructura

| archivo | qué es | lo lee |
|---|---|---|
| `perfil-despacho.tex` | `\setmeta` del titular (autor, autorbanda, cargo, lema, lugar, siglas, consigna, distrito, correo, dirección, celular, teléfono) y los `\set…` de los activos gráficos | `marco_documental/core/despacho.cls`, en cada compilación |
| `perfil.env` | `MDD_SIGLAS` y `MDD_ANIO_LEG`: siglas y periodo anual que `nuevo.sh` pone en los documentos creados a mano | `marco_documental/scripts/nuevo.sh` |
| `retrato-banda.png`, `retrato-cuerpo.png`, `retrato-busto.png`, `consigna.png`, `sello.png` | retrato del titular para la banda de prensa, la contraportada y la presentación del informe-sr; arte de la consigna; sello (PNG con transparencia real) | los `\set…` de `perfil-despacho.tex` |
| `fotos/`, `logos/` | opcional: carpetas propias; el marco las alcanza igual (`MDD_PERFIL//` en `TEXINPUTS`) | el perfil |

Lo que el SGDP web toma del `.env`, no del perfil: `MDD_PERFIL`, `MDD_DOCUMENTOS` (archivo documental),
`VITE_NOMBRE_DESPACHO` (nombre en la interfaz) y las siglas del número oficial (`SIGLAS`; hoy con
valor por defecto en `backend/app/config.py`).

## Límite honesto

- El perfil no cambia colores ni tipografías: eso es `identidad-visual/tokens/` y
  `marco_documental/core/config/`.
- Un cambio del perfil se ve al recompilar; los PDF ya generados no se tocan.
