---
tipo: readme
estado: activo
---
# core/ — núcleo único del Marco Documental: `despacho.cls`, metadatos, partes comunes y configuración modular

Todo lo compartido vive aquí una sola vez; las clases de `../classes/` solo lo cargan y fijan
defaults. Cambiar algo aquí afecta a todos los tipos: recompilar `make plantillas` y revisar los PDF
(`../docs/escollos-y-trampas.md`).

## Estructura

| carpeta o archivo | qué es |
|---|---|
| `despacho.cls` | la clase madre (sobre `article`): opciones de tamaño, carga de `lib/` y `config/`, `\usarmembrete`, `\usarestructura`, el esquema del AWF para los legislativos y, al final, el perfil (`perfil-despacho.tex` por `TEXINPUTS`) |
| `lib/metadata.tex` | `\setmeta`, `\meta`, `\ifmetadef`: el contrato de datos (los del titular vienen del perfil; aquí solo defaults neutros como `tipodoc`) |
| `lib/partes-comunes.tex` | `\bloquefirma`, `\adjunto`, `\concopia`, el sello (`\selloconsigna`, `\selloalfondo`), retratos (`\setretratocuerpo`, `\setretratobusto`), tamaños e interlineados por parte |
| `config/` | un archivo = una responsabilidad: `colores` (paleta por rol), `fuentes` (vendorizadas), `margenes` (geometría con `includehead`), `membrete` (membretes y pie institucional), `banda-prensa`, `marca-agua`, `espaciado`, `listas`, `idioma`, `enlaces` |
| `perfil-defecto/` | perfil neutro (`perfil-despacho.tex`, retratos, sello, consigna) para compilar sin despacho; lo pisa `MDD_PERFIL` |

## Límite honesto

- Los colores se copian de `identidad-visual/tokens/colors.json` a mano (por rol), no se generan.
- `despacho.cls` no funciona con pdfLaTeX ni XeLaTeX (fontspec + polyglossia + LuaLaTeX).
