---
tipo: readme
estado: activo
---
# informe-sr/ — generador del Informe de Semana de Representación (ISR): YAML → Jinja2 → `.tex` → `build.sh`

## Uso

```bash
main.py 2026-08_SR-01_slug                  # expediente de ISR_RAIZ (representacion/ del despacho) o una ruta
main.py <carpeta> --sin-compilar            # solo escribe editables/
main.py <carpeta> --sin-fotos | --forzar-fotos
main.py <carpeta> --version 0.2 --estado revision
main.py <carpeta> --columnas 1              # variante de lectura a una columna
main.py --nuevo 2026-09 02 slug             # crea el expediente desde _plantilla/
```

Desde el despacho lo llama `<despacho>/representacion/generar.sh`, que carga el `.env` con `MDD_RUTA`,
`MDD_PERFIL`, `ISR_RAIZ`, `DESPACHO_DIR` e `ISR_TOKENS` (tokens de color del perfil de marca).
Dependencias: `python3` con `pyyaml`, `jinja2`, `matplotlib`, `Pillow`.

## Estructura

| archivo | qué es |
|---|---|
| `main.py` | orquestación: partes por edición (`publica` / `interna`), `--nuevo` |
| `config.py` | rutas por entorno, nomenclatura, recortes de foto, vocabularios (sectores, tipos) |
| `lib/datos.py`, `lib/fotos.py`, `lib/graficos.py`, `lib/latex.py`, `lib/render.py`, `lib/compilar.py` | carga y validación del YAML; EXIF y recortes; gráficos a PDF; escape y Markdown mínimo; Jinja2 con `\BLOCK{}`/`\VAR{}`; `build.sh` y archivo en `salida/` |
| `plantillas_tex/*.j2` | una plantilla por sección (`parte_*.tex.j2`), `informe.tex.j2` (maestro), `metadata.tex.j2` |
| `docs/arquitectura.md` | motor elegido, capas, modelo de datos, ediciones |

El retrato de la presentación y el pie de foto salen del perfil (`\despachoRetratoBusto`, `\meta{autor}`,
`\meta{cargo}`, `\meta{distrito}`) salvo que el YAML traiga `retrato_pie`.

## Límite honesto

- Los expedientes (datos, fotos, salida) son del despacho, no de este repo; sin `ISR_RAIZ` se usa el
  directorio actual.
- El generador no valida el YAML contra un esquema formal: los errores salen al renderizar.
