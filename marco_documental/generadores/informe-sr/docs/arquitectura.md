---
tipo: doc
titulo: "Arquitectura del generador de Informes de Semana de Representación (informe-sr): decisiones, capas, modelo de datos, ediciones"
estado: activo
---
# Arquitectura del sistema de Informes de Semana de Representación

> **2026-09-15 (M10 D5):** este documento vive con el generador (`generadores/informe-sr/docs/`). Los expedientes son del despacho, en `representacion/AAAA-MM_SR-NN_slug/` con `expediente.yaml` (`ISR_RAIZ`); el motor tipográfico es `marco_documental` (dentro del repo `sgdp`).

Documento de decisiones. Si algo aquí contradice al código, manda el código y
hay que corregir este archivo.

## 1. Decisión tecnológica (2026-09-03)

Se evaluaron cuatro rutas con pruebas reales de compilación e incrustación de
las fuentes de marca:

| Ruta | Resultado |
|---|---|
| **LuaLaTeX sobre el MDD** (elegida) | Reutiliza membretes, sello, fuentes vendorizadas, colores por rol, `build.sh` y nomenclatura; índice, marcadores y anexado de PDF automáticos; microtipografía de imprenta; coherente con AWF, Academic_Class y SGDP. |
| Typst 0.14 (empaquetado en Quarto) | Segundo mejor: compila en ms, lee YAML nativo, incrusta PDF. Obligaría a reescribir los componentes del despacho y a mantener dos motores. |
| HTML + CSS → Chrome | Reutiliza `tokens.css`; pero índice con páginas, referencias y anexado de PDF exigen herramientas extra; peor tipografía impresa. |
| Quarto | Capa de Markdown que estorba en un documento mayormente estructurado y de diseño fino. |

**Salvaguarda:** los datos viven en YAML y las secciones son plantillas Jinja2.
Si en el futuro se cambia el motor, se reescriben las plantillas, no el archivo
histórico ni los datos.

## 2. Capas

```
identidad-visual/tokens/colors.json (repo)        fuente de verdad del color
        ↓ (replicado por ROL en core/config/colores.tex: colorisr*)
marco_documental/                              motor tipográfico (subtree del repo sgdp)
   classes/informe-sr.cls                      clase delgada: geometría editorial, defaults
   structures/informe-sr/structure.tex         paquetes, títulos, índice, cabecera/pie
   structures/informe-sr/portada.tex           portada, \articulo, membrete en línea, contraportada
   structures/informe-sr/componentes.tex       kicker, cifra, cita, fotos (apertura, grande, sangre, foto+texto, columna, galería), columnas, listas (+ edición interna)
   structures/informe-sr/tablas.tex            tablas (solo edición interna)
   structures/informe-sr/anexos.tex            anexos PDF (solo edición interna)
   templates/informe-sr/                       plantilla de prueba (make plantillas)
   assets/iconos/*.pdf · retratos del perfil (MDD_PERFIL)
        ↑ TEXINPUTS (build.sh)
generadores/informe-sr/                        generador
   config.py                                   rutas, nomenclatura, recortes, vocabularios
   lib/datos.py                                carga, validación, cifras derivadas, crónicas por fecha
   lib/fotos.py                                EXIF, recorte 3:2 / 2:3, 1400 px, portada 3:2, versiones «_g» (galería, 900 px) y «_h» (apertura vertical) 3:2 con ancla `recorte`
   lib/graficos.py                             matplotlib → PDF vectorial con paleta de tokens
   lib/latex.py                                escape, Markdown mínimo → LaTeX, fechas y horas
   lib/render.py                               Jinja2 con delimitadores \BLOCK{} \VAR{} \#{}
   lib/compilar.py                             build.sh del MDD + archivo en salida/
   plantillas_tex/*.j2                         una plantilla por sección (módulos independientes)
   main.py                                     orquestación; PARTES por edición; --nuevo
<despacho>/representacion/AAAA-MM_SR-NN_slug/   expedientes (datos + fotos + PDF), ISR_RAIZ
```

## 3. Modelo de datos

- **`informe.yaml`** — identidad del informe (código, número, año, mes, versión,
  estado, edición), textos en prosa (presentación, resumen, marco, crónicas por
  día, balance, compromisos, conclusiones), fotos elegidas (`foto_portada`,
  `foto_evidencia`, `dias[].foto`), equipo, fuentes, pendientes; el gráfico del
  balance (`grafico_balance`: `pedidos_sector` por defecto, o `entidades`,
  `prioridad`, `tipo`, `por_dia`, `actividades_sector`, con `grafico_balance_titulo`;
  añadido el 2026-09-28 porque una Semana monosectorial deja el gráfico por sector con
  una sola barra); la tercera cifra del resumen (`cifra_resumen`: `horas` por defecto, o
  `provincias`, o `ie`; añadido el 2026-09-30 porque sin relato cronológico las horas no
  dicen nada); `ficha_sin_notas: true` oculta en la ficha técnica «Notas de esta versión» y
  «Registro fotográfico» (2026-09-30: para enviar un borrador a revisión sin la lista de
  tareas; los `pendientes` siguen en el YAML); y, para la edición interna,
  `documentos_por_actividad` y `anexos`.
  La pauta de seguimiento es solo prosa, `pauta_prosa` (no hay `pauta_intro` ni lista
  `pauta`); con `criterio_competencia`, `metodologia` y `prioridad_explicacion` la
  imprime solo la interna, porque la pública, desde la v1.2 del ISR-01, deja en el
  marco únicamente `marco_normativo`. `ambito_descripcion` y `matriz_intro` son intros
  opcionales de la interna (2026-09-30). Cada crónica lleva
  `foto` (apertura, ancho de texto) y `galeria` (lista ordenada de ids o
  `{id, pie}`: al menos una foto por actividad del día; si se omite, se arma
  con las fotos seleccionadas del día no usadas); `foto_columna` (al ancho de
  la columna, tras el párrafo `foto_columna_tras`) es una alternativa ligera.
- **`actividades.yaml`** — `dias[]` (fecha, nombre, ámbito) y `actividades[]`
  (A-NN: fecha, tipo, sector, lugar/localidad/distrito/provincia, horas,
  participantes, contexto, hallazgos, pedidos, observaciones).
- **`pedidos.yaml`** — P-NNN: actividad, pedido, entidades (canónicas y texto
  original), actuación sugerida, responsable, prioridad propuesta, estado,
  documento de salida, plazo, observaciones.
- **`fotos.yaml`** — banco, y por foto: origen, actividad, estado
  (`publica | reservada | revisar`), tipo, selección, pie, dimensiones y, en
  las verticales, `recorte` (`arriba | centro | abajo`: franja que
  conserva la versión 3:2 de la galería).

`../lib/datos.py` valida referencias cruzadas y vocabularios y calcula: totales,
horas (solo actividades con inicio y fin), actividades y pedidos por sector,
por tipo, por prioridad, entidades más requeridas, distritos, y une la crónica
de `informe.yaml` a cada día por fecha.

## 4. Ediciones

| | pública | interna |
|---|---|---|
| Destino | Portal del Congreso, prensa, ciudadanía | Trabajo del despacho |
| Extensión | Según el contenido, sin tope (2026-09-30): razonable, sin relleno ni redundancia | Sin límite |
| Contenido | Prosa a dos columnas, cifras, 1 gráfico, 3–4 fotos grandes | Fichas por actividad, matriz, gráficos, tabla de seguimiento, anexos PDF |
| Plantillas | portada, creditos, presentacion, resumen, marco (solo `marco_normativo`), cronica (apertura + galería), balance, seguimiento («Compromisos del diputado»), conclusiones (+ «Agenda inmediata»), contraportada | + metodologia, ambito, dias (fichas), matriz, analisis, anexos |

La edición pública tiene además una **variante de lectura a una columna**
(`--columnas 1` → `…-1col.pdf`, 2026-09-11): el maestro emite `\isrunacolumnatrue`
y el entorno `columnas` del MDD pasa de `multicols{2}` a una sola columna con
1 cm de sangría por lado e interlínea 14,2 pt; las galerías van en filas de tres
(`\isrgaleriatres`) porque la prosa es más larga y las filas de dos dejaban filas
huérfanas. Mismos datos, mismas fotos, mismo número de versión.

**Cada edición archiva con su propio nombre** (2026-09-30). `salida/` recibe
`ISR-NN_AAAA-MM_vX.Y[-estado][-interna][-1col].pdf`: la pública sin sufijo de
edición y la interna con `-interna` (`config.SUFIJO_EDICION`, que se compone
en `config.NOMBRE_PDF` igual que `SUFIJO_COLUMNAS`). `generar()` de `../main.py`
pasa la edición efectiva (la de `--edicion` o, si no, la de `informe.yaml`) a
`archivar()` y `nombre_salida()` de `../lib/compilar.py`. Antes el nombre no tenía en cuenta
la edición, y `--edicion interna` sobrescribía el PDF público de la misma
versión (en la SR-01, el aprobado `ISR-01_2026-08_v1.3.pdf`). Los anexos solo
se copian (a `anexos/` dentro de `editables/`) en la edición que los imprime y
cuando hay alguno: la pública no crea esa carpeta. Ojo: la interna sigue reescribiendo
`editables/` (los `parte_*.tex` de la otra edición se borran), así que tras
una interna hay que volver a generar la pública antes de tocar su `.tex`.

## 5. Sistema visual (edición pública)

- **Tipografía:** Archivo (titulares, kickers, cifras de identidad), Source
  Serif 4 (prosa, 9,9/13,9 pt a dos columnas), Inter tabular (cifras, pies,
  cabecera). Las mismas de `core/config/fuentes.tex`: no se añadieron fuentes.
- **Color:** tinta (texto), Puka 600 (kickers, cifras, folio, marca de
  capítulo), gris cálido (secundario), Vino solo en la contraportada. Sin
  Q'illu, sin franja pallay, sin patrones.
- **Página:** A4, márgenes 20 mm, cabecera de solo texto sin filete, pie con
  nombre y folio. Titulares a bandera y sin partición.
- **Portada:** blanca; línea institucional, kicker, título en Archivo Black
  46 pt, ámbito, fotografía 3:2 a sangre horizontal (21 × 14 cm), nombre del
  diputado y emblemas.
- **Crónica:** foto de apertura (opcional), kicker, titular, entrada en
  cursiva, prosa a dos columnas (opcionalmente con una foto de columna,
  `\isrfotocolumna`) y la galería «En imágenes»: filas indivisibles de dos
  fotos 3:2 al 48,5 % del ancho con pie (`\isrgaleriatitulo`,
  `\isrgaleriafila`); una fila que no cabe pasa entera a la página siguiente.
- **Contraportada:** Vino, retrato oficial de cuerpo, identificación y contacto,
  emblemas en blanco.

## 6. Trampas técnicas (verificadas)

- `pgfkeys` recorta **un solo** espacio inicial por clave: en las macros con
  `\pgfkeys{/isr/…,default,#1}` no debe haber espacio antes de `#1`.
- `tabularray` no expande macros dentro de la especificación interior ni al
  separar celdas: el estilo va escrito en cada entorno y las filas se emiten
  con `&` y `\\` literales.
- `polyglossia` fija «Índice general» al iniciar el documento: el generador
  emite `\renewcommand{\contentsname}{Contenido}` justo antes de
  `\tableofcontents`.
- El membrete institucional no va en `fancyhdr` (ensancharía la cabecera de
  todo el documento): `\membreteinforme` lo compone en línea.
- La apertura (`\isrfotoapertura`) exige casi una página libre: el día
  anterior termina con «aire» donde termine. Para regular cuánto, la palanca
  es la foto de columna (una vertical alarga el día ≈ ⅛ de página; una
  horizontal, la mitad) y el párrafo tras el que va. `multicol` mueve la foto
  a la columna o página siguiente si no cabe, así que una columna puede
  cerrar unas líneas antes que la otra: es normal. Se ajusta mirando el PDF,
  no calculando (ISR-01 v0.3: la vertical de Pichiwillca en el día 2 dejó
  los cinco días sin ninguna página medio vacía). Con galería (v0.4) la
  palanca es el número de filas: cada fila ocupa ≈ ¼ de página.
- `\needspace` (minúscula) deja una penalización blanda (−100) que, con
  `\raggedbottom` y prosa corriente, TeX prefiere como punto de corte: a una
  columna separaba la foto de apertura de su titular. Los componentes que
  deben quedar pegados a lo que sigue (`\articulo`, `\isrfotoapertura`,
  galería) usan `\Needspace` (corte forzado solo si de verdad no cabe).
- Las fotos de celular traen rotación EXIF: `../lib/fotos.py` la aplica antes de
  recortar.
- Resolución (2026-09-30, ISR-02): las fotos reenviadas por WhatsApp llegan a 1280 px y
  en portada (21 cm) quedan a 155 ppi y en apertura (17 cm) a 191 ppi: blandas. El
  generador avisa bajo `PPI_MINIMO` (200) y ya no las degrada más: `FOTO_LADO_MAX` sube
  a 2000 px y las calidades JPEG a 90 (fotos) y 85 (galería), porque la segunda
  compresión sobre un JPEG de WhatsApp se veía en bloques. El remedio de fondo es el
  original de la cámara. Los nombres institucionales de los PDF (espacios, «°») se copian a
  `editables/anexos/anexo-NN-KK.pdf` antes de `\includepdf`.

## 7. La prosa (2026-09-11)

La prosa de `informe.yaml` se escribe con el `prompt_12` de `06 legislativo`: la voz
y la posición política del diputado, hechos del registro intocables, biblioteca
consultada como fundamento no citado (nota `fuentes/03-fundamentacion-politica-<fecha>.md`),
fuentes externas verificadas en `fuentes`, crítica integrada en la narración, sin
procedimientos, sin rayas. Las reescrituras se hacen con un script en `fuentes/`
(`_reescritura_*.py`) que reemplaza bloques sin reserializar el YAML y comprueba que
ningún número, sigla ni nombre propio se pierda; la extensión la fija el contenido
(sin tope de páginas desde 2026-09-30): nunca se reducen márgenes, cuerpo ni sangrías.
La galería va siempre a dos columnas; con dos fotos, grandes.

## 8. Hoja de ruta

1. Validar con el diputado prioridades, responsables y plazos → `pedidos.yaml`
   → versión 1.0.
2. Cartografía de la ruta (Centro de Inteligencia Legislativa) → nueva
   componente de mapa a ancho de texto.
3. Integrar `informe-sr` como tipo del SGDP (numeración de serie `ISR`,
   bandeja, estados) reutilizando esta clase: hecho (2026-10-02). El módulo Semana de
   representación del SGDP guarda estos mismos datos en su base, exporta los YAML de
   `datos/` (marca GENERADO) y lanza este generador por el `generar.sh` del despacho;
   el PDF aprobado entra a la serie ISR (`sgdp/docs/decisiones.md`).
4. Versionar los expedientes con git: hecho, viven en el repo del despacho (M10 D5, 2026-09-15).
