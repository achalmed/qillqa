---
tipo: readme
estado: activo
---
# scripts/ — compilador (`build.sh`), creador de documentos (`nuevo.sh`) y generadores de activos gráficos

## Uso

```bash
scripts/build.sh <maestro.tex>            # dos pasadas de lualatex con TEXINPUTS y fuentes; renombra el PDF
scripts/build.sh --clean <maestro.tex>    # borra los auxiliares
scripts/nuevo.sh <tipo> <slug> [--sumilla …] [--numero N | --sin-numero]   # carpeta + metadata en el archivo
scripts/nuevo.sh --siguiente <tipo> | --lista
python3 scripts/generar-marca-agua.py [--piso …]   # marca de agua (opacidad horneada) en assets/logos/
python3 scripts/generar-sello.py                   # sello de consigna (puño + frase) para el perfil
python3 scripts/generar-logo-mono.py               # logo de la Cámara monocromo en guinda
```

## Estructura

| archivo | qué es |
|---|---|
| `build.sh` | punto de entrada delgado: orquesta `lib/` |
| `config.sh` | parámetros del compilador |
| `lib/env.sh` | `TEXINPUTS` (perfil primero, marco, esquema del AWF por `WRITING_DIR`), `TTFONTS`/`OPENTYPEFONTS` |
| `lib/args.sh`, `lib/compile.sh`, `lib/clean.sh`, `lib/logging.sh` | argumentos, pasadas de compilación, limpieza de auxiliares, mensajes |
| `lib/nombrado.sh` | nombre institucional del PDF desde `metadata.tex` (`sumilla`, `nombrearchivo`, `serie`) |
| `nuevo.sh` | series y carpetas; lee `MDD_SIGLAS` y `MDD_ANIO_LEG` de `perfil.env` del perfil |
| `generar-agenda.py` | **retirado** (M10 D8): se conserva como referencia del tipo `agenda` |
| `generar-marca-agua.py`, `generar-sello.py`, `generar-logo-mono.py` | activos gráficos (Pillow; el puño se rasteriza con `pdftoppm`) |

## Límite honesto

- `build.sh` exige `lualatex` en el PATH y `python3` (para el nombrado); no admite `-output-directory`
  con `TEXINPUTS` relativos, por eso envuelve la compilación.
- `nuevo.sh` numera escaneando el archivo documental: no conoce los documentos que solo existen en
  la base del SGDP.
