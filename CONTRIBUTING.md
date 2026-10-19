# Cómo contribuir a Qillqa

Gracias por tu interés. Qillqa crece con el aporte de quienes lo usan: reportes de errores, mejoras de la
documentación, plantillas de documentos nuevas, traducciones y código. Esta guía explica cómo hacerlo para
que tu aporte se pueda revisar e integrar rápido.

Al participar aceptas el [Código de conducta](CODE_OF_CONDUCT.md).

## Antes de empezar

- **¿Encontraste un error?** Busca primero en los [issues](https://github.com/achalmed/qillqa/issues); si no
  está, abre uno con la plantilla «Reporte de error»: qué hiciste, qué esperabas, qué pasó y cómo
  repetirlo.
- **¿Tienes una idea?** Abre un issue con la plantilla «Propuesta» antes de escribir código grande: así
  acordamos el enfoque y nadie pierde trabajo.
- **¿Una vulnerabilidad?** No abras un issue público: sigue [`SECURITY.md`](SECURITY.md).
- **Nunca subas datos reales** (nombres de personas, documentos, números de expediente, claves, IP). Las
  pruebas y los ejemplos usan datos ficticios: «Ana Torres», `ana@ejemplo.pe`, `987 654 321`.

## Preparar el entorno

```bash
cp .env.example .env
docker compose up -d --build db             # solo la base de datos
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cd ../frontend && npm ci
```

Para la API y la web fuera de Docker, y para compilar PDF con TeX Live en tu máquina, sigue
[`docs/desarrollo.md`](docs/desarrollo.md).

## Lo que debe pasar antes de abrir un pull request

```bash
( cd backend && .venv/bin/python -m pytest -q tests )   # pruebas del backend (sin base de datos)
( cd frontend && node --test pruebas/*.test.ts )        # pruebas de la web (Node 22)
( cd frontend && npx tsc --noEmit )                      # tipos
make -C marco_documental plantillas                      # todas las plantillas compilan
```

Si cambias el comportamiento, añade o ajusta la prueba que lo demuestra.

## Estilo

- **Idioma**: el código, los comentarios, los mensajes y la documentación están en **español con tildes**.
  Los nombres de funciones y variables también (`numerar_documento`, no `number_document`).
- **Python**: PEP 8 y tipado donde ayude.
- **TypeScript/React**: componentes funcionales, MUI; sin dependencias nuevas sin justificarlas en el PR.
- **LaTeX**: solo LuaLaTeX + Biber; se compila con `marco_documental/scripts/build.sh`, nunca con
  `lualatex` directo.
- **Ninguna ruta absoluta de una máquina** en el código: todo llega por variables de entorno (`.env`).
- **Numeración**: el número oficial lo asigna el sistema (`POST /api/documentos/{id}/generar`); ningún
  cambio debe permitir numerar a mano ni dejar huecos.

## Commits y pull requests

- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) en español:
  `feat(mesa): cargo en PDF con código QR`, `fix(numeración): …`, `docs(readme): …`.
- Un pull request por tema, pequeño y con descripción: qué cambia, por qué y cómo lo probaste. Incluye
  capturas si cambia la interfaz (con datos ficticios), en escritorio y en celular (375 px).
- Anota el cambio en `CHANGELOG.md`, sección *[Sin publicar]*.

## Cómo escribir el README de una carpeta

Cada carpeta con código propio tiene un `README.md` que responde, en este orden, a lo que un recién
llegado necesita. Copia esta plantilla:

```markdown
# <carpeta>/ — <qué es, en una línea>

Uno o dos párrafos: para qué existe esta carpeta y qué problema resuelve. Qué NO es (qué vive en otra parte).

## Uso

    comando de ejemplo        # qué hace

## Estructura

| archivo o carpeta | qué es |
|---|---|
| `archivo.py` | una línea |

## Límite honesto

Lo que no hace todavía o lo que cuesta redescubrir (trampas, supuestos).
```

Reglas:

1. **El título dice qué es**, no cómo se llama: «`backend/` — la API: modelos, servicios y rutas».
2. **Lo primero es el uso**: un comando que funcione copiándolo tal cual.
3. **Una tabla de estructura**, una línea por archivo o subcarpeta; si una carpeta tiene su README, enlázalo.
4. **Sin historia**: lo que cambió va a `CHANGELOG.md`; el porqué de una decisión, a `docs/arquitectura.md`.
5. **Sin datos reales** ni rutas de tu máquina.
6. **Corto**: si pasa de una pantalla y media, lo que sobra va a `docs/`.

La documentación general sigue la misma idea: `docs/README.md` es el índice; un tema nuevo va a su
documento, no a un archivo suelto en la raíz.

## Licencia de tus aportes

Al enviar un pull request aceptas que tu aporte se publique bajo la [AGPL-3.0](LICENSE), la licencia del
proyecto.
