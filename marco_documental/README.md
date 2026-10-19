---
tipo: readme
estado: activo
---
# marco_documental/ — Marco Documental del Despacho (MDD): framework LuaLaTeX de los documentos oficiales

<!-- suite:inicio -->
**Suite `marco_documental`** · objetivo *latex* · estado *activo* · - · interfaz cli

Framework LuaLaTeX de documentos de despacho (clases: oficio, memorando, informe, solicitud, acta, comunicado, agenda, informe-sr, rendición de viáticos, proyecto de ley, dictamen, moción) con el perfil del despacho fuera del núcleo (MDD_PERFIL) y generadores (informe-sr desde YAML, agenda).

- Escribe en: archivos · simula por defecto: no
- Entrada: MDD_PERFIL (perfil del despacho) y MDD_RUTA/documentos (archivo documental, enlazado)
- Depende de: lualatex, core/env.sh, escritura/core/esquema (WRITING_DIR), python3 (pyyaml, jinja2, matplotlib, Pillow) para generadores/informe-sr
- Nota: Lo consumen el SGDP (MDD_RUTA) y el despacho (generar.sh de la Semana de Representación).

Comandos:

```bash
scripts/build.sh <maestro.tex>
scripts/nuevo.sh <tipo> [--sumilla …] [--numero N]
make plantillas
generadores/informe-sr/main.py [carpeta] [--nuevo AAAA-MM NN slug]
```

<sub>Bloque generado desde `suite.yml` por `core/suites.py generar` (2026-10-18); no se edita a mano.</sub>
<!-- suite:fin -->

<!-- suites:inicio -->
Suites de esta carpeta (1); índice global en `meta/INDICE_SCRIPTS.md`. Patrón: M main · C config · L lib.

| Suite | Carpeta | Objetivo | Escribe en | Simula | Timer | Estado | Patrón |
|---|---|---|---|---|---|---|---|
| `marco_documental` | [marco_documental](./) | latex | archivos | no |  | activo | `···` |

<sub>Bloque generado desde los `suite.yml` por `core/suites.py generar` (2026-09-15); no se edita a mano.</sub>
<!-- suites:fin -->

## Qué es

Framework LaTeX (**LuaLaTeX**, sin Biber) para los documentos oficiales de un despacho parlamentario:
oficios, memorandos, informes, solicitudes, actas, agenda, documentos públicos (comunicado,
pronunciamiento, nota de prensa, anuncio), el informe de Semana de Representación (editorial), la
rendición de viáticos (Anexos 3 y 4, la genera el SGDP) y los productos legislativos (proyecto de ley, dictamen, moción). Hereda la arquitectura del Academic
Writing Framework (`../../escritura/`): **el documento depende del framework, nunca al revés**; cada
documento solo *selecciona* (tipo, membrete, marca de agua) y *rellena* (datos + contenido), y todo lo
compartido vive una sola vez en el núcleo. Réplica sistemática y reproducible del machote en Word
del despacho.

Lo que **no** contiene: los datos del titular y sus activos de marca (retratos, sello, consigna,
siglas) viven en el **perfil del despacho** (`MDD_PERFIL` → `<despacho>/perfil/latex/`, modelo en
`../perfil.ejemplo/`); sin perfil, las plantillas compilan con `core/perfil-defecto/` (valores
neutros). El archivo documental (`documentos/`) es del despacho (`MDD_DOCUMENTOS`) y no está aquí.
Lo consumen el SGDP (`MDD_RUTA`) y el despacho (`generar.sh` de la Semana de Representación). Es
suite anidada del repo `sgdp` (subtree; `suite.yml` propio).

## Uso

```bash
scripts/nuevo.sh oficio respuesta-drea --sumilla "DREA"        # crea la carpeta con el siguiente número de la serie
scripts/nuevo.sh --siguiente oficio-multiple                    # consulta el próximo N°; --lista, el registro
scripts/nuevo.sh oficio desistimiento-x --sin-numero            # S/N: no consume la serie
scripts/build.sh "$MDD_DOCUMENTOS/oficios/OF-0001-AAAAMMDD-slug/oficio.tex"   # compila (nunca lualatex a secas)
scripts/build.sh --clean "<ruta>/oficio.tex"                    # limpia los auxiliares
make plantillas                                                 # compila todas las plantillas (los «tests»)
make DOC=templates/oficio/oficio.tex build                      # un maestro concreto
generadores/informe-sr/main.py <expediente> [--sin-compilar]    # informe-sr desde YAML (ver su README)
bash -n scripts/*.sh scripts/lib/*.sh                           # sintaxis de los scripts
```

`build.sh` exporta `TEXINPUTS` (perfil primero, luego clases, núcleo, membretes, estructuras, logos y
el `../../escritura/core/esquema/` del AWF por `WRITING_DIR`), las fuentes vendorizadas (`TTFONTS`, `OPENTYPEFONTS`),
compila dos pasadas y renombra el PDF al nombre institucional. `nuevo.sh` lee `MDD_SIGLAS` y
`MDD_ANIO_LEG` de `perfil.env` del perfil. El SGDP genera `metadata.tex` y el maestro desde su
formulario y llama a `build.sh` igual que un documento a mano.

## Cómo se escribe un documento

Cada carpeta `SERIE-NUMERO-AAAAMMDD-descripcion/` lleva un maestro (`oficio.tex`, `memorando.tex`…) y
un `metadata.tex` con los datos (`\setmeta{numero}`, `anio`, `fecha` —si falta, hoy—, `lugar`,
`sumilla` —nombra el PDF—, `firmante`/`cargofirmante` si firma personal del despacho; `siglas`,
`autor`, `cargo`, `lema` y el pie institucional vienen del perfil). El maestro selecciona en el
preámbulo (`\usarmembrete{congreso|despacho}`, `\sinmembrete`, `\sinmarcaagua`, `\confolio`,
`\sinsello`, `\setinterlineado{1.5}`…; para los públicos `\sinfotobanda`, `\sinconsignabanda`,
`\sinbandaprensa`, `\setbandafoto{…}`) y rellena con las partes de su tipo (README de cada
`templates/<tipo>/`). Series de `nuevo.sh`: `OF`, `OM`, `MEM`, `INF`, `SOL`, `ACT`, `COM`, `PRO`, `NP`,
`ANU`; S/N usa `SN` (las series de bancada, carta, ISR y REC las numera el SGDP). PDF final: `TIPO N°XXXX-AAAA-AAAA - Sumilla.pdf` (`scripts/lib/nombrado.sh`;
`\setmeta{nombrearchivo}{…}` lo fija a medida; sin sumilla, conserva el nombre del maestro).

| tipo | clase | partes principales | plantilla |
|---|---|---|---|
| oficio (simple, múltiple, carta, bancada) | `oficio` | `\lugaryfecha` `\numerodocumento` `\destinatario` `\asunto` `\referencia` `\saludo` `\atentamente` `\bloquefirma` `\adjunto` `\concopia` | `templates/oficio/` |
| memorando | `memorando` | `\numerodocumento` `\cabeceramemo[ref]{para}{de}{asunto}` | `templates/memorando/` |
| informe | `informe` | `\numerodocumento` `\cabecerainforme[ref]{a}{de}{asunto}` `\seccion` | `templates/informe/` |
| solicitud | `solicitud` | `\sumillasolicitud` `\destinatariosolicitud` `\lugaryfecha` `\bloquefirma` | `templates/solicitud/` |
| acta de sesión | `acta` | `\numerodocumento` `\organosesion` `\estacion` `\acuerdo` `\firmasacta` | `templates/acta/` |
| comunicado · pronunciamiento · nota de prensa · anuncio | `comunicado` | `\cabeceradocumento` `\titular` `\bajada` `puntos` `\cierrelugarfecha` (`\contactoprensa`, `\firmainstitucional`) | `templates/comunicado/` |
| agenda diaria | `agenda` | bloques de `structures/agenda/` sobre `contenido.tex` | `templates/agenda/` |
| informe de Semana de Representación | `informe-sr` | `\portadainforme` `\membreteinforme` `\articulo` `columnas` `\isrcifra` `\isrcita` `\isrgrafico` `\contraportadainforme` (**generado**) | `templates/informe-sr/` |
| rendición de viáticos (Anexos 3 y 4) | `rendicion-viaticos` | `\cabeceraanexo` `\textodeclaracion` `tablamovilidad` `tablaotros` `\cierredeclaracion` `\datosrendicion` `seccionrendicion` `\firmarendicion` (**generado** por el SGDP) | `templates/rendicion-viaticos/` |
| proyecto de ley · dictamen · moción | `proyecto-de-ley` `dictamen` `mocion` | `\componente{clave}` según el esquema del AWF + forma de `structures/legislativo/` | `templates/<tipo>/` |

## Estructura

| carpeta | qué es | dueño / generador |
|---|---|---|
| `core/` | `despacho.cls` (núcleo único), `lib/` (metadatos, partes comunes), `config/` (un archivo = una responsabilidad), `perfil-defecto/` | este repo |
| `classes/` | una clase delgada por tipo (~15–30 líneas): carga el núcleo y fija defaults | este repo |
| `structures/` | esqueleto retórico de cada tipo (partes, cabeceras, firmas) | este repo |
| `membretes/` | papel membretado seleccionable: `congreso`, `despacho`, `camara`, `prensa` | este repo |
| `templates/` | una plantilla por tipo, con README: son los «tests» (`make plantillas`) | este repo |
| `assets/` | fuentes vendorizadas (SIL OFL), logos institucionales, iconos Tabler en PDF | este repo; `scripts/generar-*.py` |
| `scripts/` | `build.sh`, `nuevo.sh`, `lib/`, generadores de marca de agua, sello y logo mono | este repo |
| `generadores/` | `informe-sr/`: el generador del ISR (YAML → Jinja2 → `.tex` → `build.sh`) | este repo |
| `docs/` | escollos y trampas del motor, decisiones, índice | este repo; `core/docs.py` |
| `Makefile`, `suite.yml` | atajos de compilación; manifiesto de la suite | este repo |

## Documentación

| documento | para qué leerlo |
|---|---|
| `docs/README.md` | índice (generado) |
| `docs/escollos-y-trampas.md` | lo que muerde al tocar `core/`, `structures/` o la banda de prensa |
| `docs/decisiones.md` | decisiones de diseño con fecha (sello, firma, públicos, nomenclatura, informe-sr) |
| `generadores/informe-sr/docs/arquitectura.md` | el generador del ISR: motor elegido, capas, modelo de datos |
| `templates/<tipo>/README.md` | qué exige cada tipo documental |
| `../docs/formato-latex.md` | maquetación de los `.tex` que el SGDP no expresa |

## Límite honesto

- **Sin test suite**: la corrección se comprueba compilando todas las plantillas (`make plantillas`) y mirando el PDF
  (membrete completo, marca de agua centrada, firma junta, folio; en el comunicado, la banda al pie).
- **No todos los tipos se redactan en la web del SGDP**: la web cubre los de su registro de tipos
  (`../backend/app/tipos.py`, entre ellos la solicitud) y el proyecto de ley por partes
  (`../backend/app/latex/proyecto_ley.py`); el dictamen y la moción se escriben a mano (o con los
  prompts de `prompts/06 legislativo/`) y se compilan con `build.sh`.
- `generar-agenda.py` está **retirado** (leía una carpeta de correo disuelta en M10 D4): la agenda se
  escribe a mano sobre `templates/agenda/contenido.tex`.
- Los esquemas legislativos vienen del AWF por `WRITING_DIR` (`core/env.sh`): sin `escritura` a la
  vista, `proyecto-de-ley`, `dictamen` y `mocion` no compilan. Contrato: `escritura/docs/esquemas.md`.
- Las fuentes vendorizadas llevan nombres de archivo propios de sus autores (A07 del validador, a
  propósito).
