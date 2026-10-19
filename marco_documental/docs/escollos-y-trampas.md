---
tipo: doc
titulo: "Escollos y trampas del Marco Documental: lo que muerde al tocar el núcleo, las estructuras, la banda de prensa y el informe-sr"
estado: activo
---
# Escollos y trampas del Marco Documental

Catálogo con medidas, fechas y porqués (antes vivía en `CLAUDE.md`; aquí desde DOC7, 2026-09-20).
Se lee antes de tocar `core/`, `structures/` o `membretes/`. Los pedidos del autor citados con fecha
son decisiones vigentes; su registro está en `docs/decisiones.md`. Los activos de marca (retratos,
sello, consigna) los fija el perfil del despacho (`MDD_PERFIL`), no `assets/`.

- **La ruta del despacho contiene ESPACIOS.** kpathsea los tolera en
  `TEXINPUTS` (verificado); no "arreglar" citando dentro del valor.
- **`geometry` usa `includehead`**: `top` = borde→membrete. Sin esa
  opción el membrete (3 cm en `headheight`) se sale del papel.
- Los membretes se anclan con `\begin{minipage}[b]` (crecen hacia
  arriba desde la línea del encabezado). No volver a `[c]`.
- Los archivos de `membretes/` deben poder cargarse VARIAS veces
  (cambio de membrete en el preámbulo): solo `\fancyhead`, **nunca**
  `\newcommand`. Las `structures/` llevan guardia anti-doble-carga
  (`\ifcsname despachoEstructura...`).
- `structures/` y `membretes/` se cargan con `@` NO-letra (preámbulo
  del documento): no usar nombres con `@` ahí; en `core/config/` sí se
  puede (se cargan desde la clase). Si una estructura NECESITA `@`
  (`legislativo` redefine `\esq@cabecera`), guarda y restaura el catcode
  (`\edef\xCatcode{\catcode`\noexpand\@=\the\catcode`\@\relax}` … `\xCatcode`):
  un `\makeatother` suelto rompe la clase que la cargó.
- La **marca de agua** lleva la opacidad horneada en el PNG
  (`scripts/generar-marca-agua.py`, parámetro `--piso` elimina el tinte
  del fondo guinda). El PDF no usa transparencias → se ve igual en
  cualquier visor/impresora.
- El **pie institucional** (filete + dirección en línea 1; correo,
  celular y folio en línea 2) vive UNA sola vez en
  `core/config/membrete.tex` (`\pieinstitucional`),
  no en los membretes. `\confolio`/`\sinfolio` solo mueven la bandera
  `\ifdespachofolio`; el pie la consulta. El lema del membrete va
  DEBAJO de la caja del nombre, alineado a la derecha (pedido de Edison,
  2026-08-03) — no volver a centrarlo.
- En el folio usar `\pageref*{LastPage}` (asterisco): sin él, hyperref
  pinta el número como enlace.
- `\bloquefirma`, `\adjunto`, `\concopia` y el **sello de consigna**
  viven UNA vez en `core/lib/partes-comunes.tex` — NO volver a
  definirlos en `structures/`. El sello es el ARTE
  que fija el perfil con `\setselloimagen` (neutro: `sello.png`) — versión MONOCROMA aprobada
  por el autor (2026-08-03, final): puño negro + «Solo el pueblo / salva al
  pueblo» en YELLOWTAIL (script de rotulista, vendorizada), DOS
  líneas. Regenerable con `scripts/generar-sello.py` (la frase va
  horneada en el PNG). Va DEBAJO del bloque de firma, ALINEADO AL
  MARGEN DERECHO (iterado: centrado ✗, Edison lo devolvió a la
  derecha): overlay `\rlap`+`raisebox[0pt][0pt]` que CUELGA de la
  línea de firma (dimensión cero) + un PUNTAL invisible (`\rule` de
  profundidad tam+alt+0.5cm−0.9cm de tolerancia) que fuerza el salto
  de página si el sello tocaría el pie. `\setselloposicion` =
  separación desde el margen derecho (defecto 0); `\setselloaltura` =
  separación bajo el cargo. Defaults: tam 1.35cm, alt 0.30cm.
  **Interruptor por documento (2026-08-04):** `\setmeta{sello}{no}` en
  el metadata.tex apaga TODAS las variantes del sello de ese documento
  (colgante Y `\selloalfondo`); `{si}` lo fuerza; sin la clave, con
  sello. Es una bandera aparte (`\ifdespachosellodoc`) porque
  `\sinsello` en el patrón multipágina solo significa "no colgar de la
  firma". Primer uso real: el OF-0008 del archivo documental va sin sello.
- **Documento largo que debe caber en 1 hoja:** compactar EN EL
  MAESTRO (no en el núcleo): `\setinterlineado{1.05}` +
  `\setespacioparrafos{4pt}` — así lo hacen los oficios reales del
  1er Encuentro.
- **La firma va SIEMPRE a la misma altura** (pedido de Edison,
  2026-08-04): `\vfill` antes de `\bloquefirma[2.0cm]` la ancla al
  fondo de la página (la plantilla de oficio ya lo trae). El argumento
  2cm = mínimo garantizado sobre el nombre para la firma digital.
- **Documentos MULTIPÁGINA** (pedido 2026-08-04, oficios 6 y 7): SIN
  `\vfill` (la firma seguiría al fondo de una última página vacía);
  patrón: `\sinsello` en preámbulo + `\bloquefirma[2cm]` tras el texto
  + `\selloalfondo` (comando de partes-comunes: `\vfill` + sello a la
  derecha) — firma arriba con el texto, sello abajo. + `\confolio`.
- **Nada se escribe DESPUÉS de `\bloquefirma` si el sello cuelga**
  (2026-09-23, al componer un oficio con iniciales): el sello colgante
  reserva bajo la línea de firma, con un `\rule` de profundidad, el alto
  de su arte; unas `\iniciales{NA/na}` puestas a continuación empiezan
  por debajo de esa reserva y se van solas a una segunda hoja —con el
  membrete entero detrás— aunque el texto quepa de sobra. `Adj.`, `c.c.`
  e `\iniciales` exigen el mismo patrón que el multipágina: `\sinsello`
  + `\bloquefirma` + pie + `\selloalfondo`. Es lo que emite
  `_cierre_normativo` del generador del SGDP, y un `.tex` a mano debe
  copiarlo.
- **El sello va ENCIMA de las notas al pie, y por eso es una inserción**
  (2026-10-01, Edison: «justo encima de la nota de página, no debajo»).
  Hasta entonces `\selloalfondo` registraba un overlay de eso-pic «para la
  próxima página que salga» en la banda del pie, y las notas (`\footins`)
  se componen DENTRO del área de texto, más arriba: el sello quedaba
  siempre debajo de ellas. Ahora deja en el flujo una inserción vacía
  (`\insert\despachoInsSello`, `\count`=0: no reserva nada) y un gancho
  en `\@makecol` (`\pretocmd`, etoolbox) decide en la rutina de salida:
  sin notas, el overlay de siempre en la banda; con notas, el sello se
  antepone a la caja `\footins` seguido de la raya de notas, y la raya
  original se apaga solo para esa página (todo local a la rutina). Es un
  INTERCAMBIO: las notas bajan a la banda el alto que el sello deja libre
  (1,20 cm + 0,10 cm < 1,50 cm de `footskip`), el texto no se mueve y la
  paginación no cambia. Dos trampas: (1) una inserción viaja con SU
  página, cosa que «la próxima página» de eso-pic no garantiza cuando el
  constructor de páginas va atrasado; (2) con `\count`≠0 el sello
  reservaría su alto en TODAS las páginas de firma y un oficio justo
  saltaría a dos hojas. Si un sello más alto que la banda llegara a
  usarse, las notas pisarían el filete del pie.
- **Las notas al pie no se parten** (2026-10-06, Edison, PL-2026-009: la
  nota «se repartió a dos páginas»). LaTeX parte por defecto una nota
  larga (`\interfootnotelinepenalty` = 100) y deja su resto al pie de la
  hoja siguiente. `../core/config/espaciado.tex` la sube a 10000: la nota va
  entera y, si no cabe, la línea con la llamada baja con ella. El precio
  es una hoja que termina antes; si una nota sola no cupiera en una hoja
  vacía, TeX la partiría igual (no hay otra salida).
- **Probar compilaciones sin pisar el `.out`**: redirigir la salida de
  `build.sh` a `<documento>.out` destruye el archivo de marcadores de
  hyperref y la segunda pasada muere con «Text line contains an invalid
  character» (`^^@`). Usar otra extensión (`.salida`).
- **Numeración no estándar** (p. ej. oficios múltiples):
  `\setmeta{numerocompleto}{Oficio Múltiple N°0001-2026-2027-SIGLAS}`
  se imprime TAL CUAL (mayúsculas + subrayado) en `\numerodocumento` y
  en el pdftitle; si falta, se compone `tipodoc + numero-anio/siglas`.
  Primer documento real: el OM-0001 del archivo documental. El sello se coloca vía `\rlap`+`\smash` (caja de
  dimensión CERO: sin `\smash` la altura empuja la firma de página) y
  se ancla por su BASE (elevado su propia `\dp` vía savebox): jamás
  pisa el pie. Ajustes: `\setsellotamano/angulo/posicion/altura`.
- El puño (`puno.svg` → `puno-negro.pdf`/`puno-guinda.pdf`) se
  regenera con LibreOffice: `soffice --headless --convert-to pdf`
  (recolorear antes con `sed 's/fill:#000000/fill:#4D1018/'`); no hay
  rsvg/inkscape en el sistema. `generar-sello.py` lo rasteriza vía
  `pdftoppm`.
- La firma va en una minipage inquebrantable (no se parte entre páginas).
- El **lema del año** («Año de …») lo declara el perfil (`perfil-despacho.tex`, `\setmeta{lema}`):
  actualizarlo ahí cada enero; `core/lib/metadata.tex` ya no lleva datos del titular.

- **Documentos PÚBLICOS** (clase `comunicado`, 2026-08-06): UN tipo
  para 4 géneros — la palabra de la cabecera sale de
  `\setmeta{tipodoc}{Comunicado|Pronunciamiento|Nota de Prensa|Anuncio}`.
  Membrete `prensa` (emblemas centrados + lema + doble filete; el
  nombre NO va arriba: vive en la banda) + **banda de prensa** al pie a
  SANGRE COMPLETA (`core/config/banda-prensa.tex`): overlay TikZ
  `remember picture` desde `\fancyfoot` — dimensión cero, exige 2
  pasadas (las que build.sh ya da). La banda REEMPLAZA al pie
  institucional (el contacto correo/celular viaja dentro);
  `\sinbandaprensa` restaura el pie normal. Franja *pallay* (campo
  `colorpallay` + rombos blanco/`colorpallayacento` alternados; roles
  en colores.tex), cajita `DIPUTADO POR \meta{distrito}`, arte de la
  consigna A COLOR (`\despachoBandaConsigna` del perfil, extremo derecho)
  y **retrato de cuerpo con FONDO TRANSPARENTE**
  (el `\despachoBandaFoto` del perfil, 4.15 cm > banda 2.90 cm: se apoya
  en el borde inferior y SOBRESALE). El retrato va a la IZQUIERDA
  ocupando el lugar del ex-logo de la Cámara (quitado 2026-08-06,
  pedido de Edison: «poner la foto en vez del logo y sacar la otra
  foto» — antes había logo izq. + un 2.º retrato de perfil der.; ambos
  eliminados). El emblema institucional queda solo en el membrete
  superior. Con `\sinfotobanda` la columna de identidad se corre al
  margen izq. (bandera interna `\despachoBandaTextoX`: 4.70 con foto,
  1.40 sin ella). Interruptores: `\sinfotobanda`, `\sinconsignabanda`,
  `\setbandafoto{...}`, `\setbandafotoaltura{...}`, `\setbandaaltura{...}`.
  La clase sube el margen (`\geometry{bottom=4.45cm}`) — no bajarlo: el
  retrato invade. La consigna a color se recortó de
  `photo_5154663339295182194_w transparente.png`; el retrato de
  una foto de perfil recortada (preservada en el banco gráfico del despacho). OJO al elegir
  foto: DEBE ser PNG
  con transparencia REAL (`getextrema()` del canal alfa incluye 0);
  las fotos de estudio con fondo blanco tienen alfa pero TODO en 255 (fondo
  blanco opaco) — NO sirven, y una camisa blanca impide recortar el
  fondo a mano con seguridad. El membrete `prensa` es MÁS ALTO que los
  demás (emblemas en columna + lema + doble filete): fancyhdr exige
  `headheight` ≥ 3.51 cm — ensanchado a 3.55 cm SOLO en `comunicado.cls`
  (`\geometry{headheight=3.55cm, headsep=0.60cm, ...}`, NO en el global
  de margenes.tex: rompería los oficios). Sin ese ensanche el 2.º
  filete se desborda del encabezado y cae SOBRE el título. Los públicos
  van **sin firma ni posfirma** (pedido de Edison, 2026-08-06): la voz
  institucional —nombre, cargo y foto— ya vive en la banda al pie, así
  que la plantilla NO llama `\firmainstitucional` (sigue definido en
  `structures/comunicado/` por si un pronunciamiento formal lo pidiera).
  Ajustes 2026-08-09 (Edison): (1) el logo de la Cámara del membrete va
  **monocromo en guinda sobre transparente** (`logo-camara-mono.png`,
  regenerable con `scripts/generar-logo-mono.py` — separa diseño/fondo
  por luminancia y re-tiñe en `guindaoficial`); el original con recuadro
  guinda sólido se veía pesado junto al escudo. (2) La banda usa el
  nombre CORTO de marca `\meta{autorbanda}` (nombre y primer apellido); si
  falta cae a `\meta{autor}` (nombre completo, que conservan los
  oficios/memorandos/informes formales). (3) El retrato subió a 4.50 cm
  (`\setbandafotoaltura` default) y el `bottom` del comunicado a 4.70 cm
  para conservar el colchón coronilla↔cuerpo.
  Prosa en bloque (sangría 0, parskip 7pt). En la estructura los
  bloques centrados usan `{\centering...\par}` con `\parskip` local 0
  (NUNCA entornos `center`: metían aire y desbordaban la página); los
  cierres (`\cierrelugarfecha`, `\firmainstitucional`,
  `\contactoprensa`) abren con `\par` defensivo. La cabecera compone
  `N.º numero-anio-siglas` (no `numerocompleto`, que repetiría la
  palabra del tipo); `numero` = `S/N` o ausente → línea oculta. Sin
  firma manuscrita ni sello: cierra `\firmainstitucional`.
- **Numeración por series independientes** (`scripts/nuevo.sh`):
  oficios simples, múltiples, memorandos, informes y los 4 públicos
  (series COM/PRO/NP/ANU, carpeta `$MDD_DOCUMENTOS/comunicados/`) llevan
  cada uno su serie secuencial propia. El registro ES el escaneo en vivo de los
  `metadata.tex` (max numero del tipodoc + 1) — no hay archivo de
  contador que se desincronice. S/N no consume número. Crear
  documentos con `nuevo.sh` (no copiar plantillas a mano):
  `--siguiente <tipo>` consulta, `--lista` registro, `--numero` fija,
  `--sin-numero` para S/N.
- **Nomenclatura institucional del PDF** (estándar 2026-08-04):
  `scripts/lib/nombrado.sh` renombra el PDF tras compilar a
  `TIPODOC N°numero-anio - sumilla.pdf` (tipodoc en MAYÚSCULAS vía
  python3, respeta acentos) si `metadata.tex` declara
  `\setmeta{sumilla}{...}`; override con `\setmeta{nombrearchivo}{...}`;
  sin ambos, conserva el nombre del maestro (plantillas). Las barras
  `/` se sanean a `-`. OJO: el nombre NUNCA incluye las siglas
  (`\meta{siglas}`) — solo numero-anio.

- **Informe de Semana de Representación (`informe-sr`, 2026-09-03):**
  tipo EDITORIAL (revista institucional de 16–20 páginas, máx. 25) que NO
  se escribe a mano: lo genera `generadores/informe-sr/main.py`
  desde YAML (Jinja2 → módulos `.tex` → `build.sh`). Clase delgada
  `classes/informe-sr.cls` (geometría 20 mm, cabecera ligera de 1.15 cm,
  sin marca de agua, `secnumdepth=0`) + `structures/informe-sr/` en cinco
  archivos: `structure.tex` (títulos, índice, cabecera/pie SOLO texto,
  mapa sector→icono), `portada.tex` (portada blanca con foto 3:2 a sangre
  horizontal, `\articulo`, `\membreteinforme` en línea, `\capitulo` vino
  solo edición interna, contraportada vino con el retrato OFICIAL de cuerpo del perfil,
  `\despachoRetratoCuerpo`), `componentes.tex`,
  `tablas.tex` y `anexos.tex` (estos dos solo edición interna). Iconos
  Tabler en `assets/iconos/<nombre>-{puka,tinta,blanco}.pdf` (generados
  con `soffice --convert-to pdf` desde los SVG de `identidad-visual`).
  Colores por rol `colorisr*` y escalas 50–300 en `colores.tex`.
  Concepto v2 (pedido de Edison 2026-09-03): **menos elementos** — sin
  filetes, sin cajas ni líneas verticales, sin franja pallay, sin
  consigna en portada/contraportada, paleta tinta+puka+gris (vino solo
  contraportada), prosa a dos columnas, pocas fotos grandes, 1 gráfico;
  el diputado SOLO con sus dos fotos oficiales (busto en presentación,
  cuerpo en contraportada). Trampas verificadas: (1) **pgfkeys recorta
  UN solo espacio** por clave → `\pgfkeys{/isr/x,default,#1}` sin espacio
  antes de `#1`; (2) **tabularray no expande macros** en la spec interior
  ni al partir celdas → estilo escrito en cada entorno, filas con `&`/`\\`
  literales; (3) polyglossia pisa `\contentsname` al arrancar → el
  generador emite `\renewcommand{\contentsname}{Contenido}` en el cuerpo;
  (4) el membrete NO va en fancyhdr (ensancharía headheight) → en línea;
  (5) titulares con `\isrsinguiones` (sin partición, a bandera). El
  documento maestro se compila desde FUERA del framework
  (`<despacho>/representacion/AAAA-MM_SR-NN_slug/editables/informe.tex`) con
  `build.sh` (TEXINPUTS resuelve clase, structures y assets; las fotos van
  por `\graphicspath{{../fotos/seleccion/}{graficos/}{anexos/}}`).

- **El sello nunca encima de una nota: con notas, sube sobre ellas** (2026-10-12, restituye la regla
  del 2026-10-01). La «segunda vuelta» del 2026-10-10 dejaba el sello siempre en la banda del pie,
  pero las notas también bajan a esa banda (`\despachoNotasBajan`, 1,32 cm): en una hoja con notas
  el sello quedaba DEBAJO de la nota y la pisaba (foto de Edison, oficio con nota en la hoja de la
  firma). Ahora `\despachoSelloAntesDeColumna` tiene dos lugares fijos: sin notas, el overlay de la
  banda (junto a «Adj.» y «c.c.», sin pisarlos); con notas, el sello dentro de `\footins`, a la
  derecha y encima de la raya, que se dibuja debajo de él (`\despachoRayaNotas`). El gancho de las
  notas en `\@makecol` no pone tope al hueco negativo en esa hoja (`\footnoterule` = `\relax`): las
  notas suben sobre el hueco que reservó `\bloquefirma`. `\setsellosobrenotas` (0,25 cm) es el aire
  hasta la raya; con 0,10 el sello rozaba la primera línea de la nota. La variante «al lado de las
  notas cortas» queda retirada: el sello no se pone al lado de una nota. Y la raya nunca toca la firma
  (2026-10-14, oficio compactado a una hoja): en la hoja del sello, entre la última línea del texto
  y la raya queda al menos `\setnotasairemin` (0,30 cm); para lograrlo las notas bajan dentro de la
  banda del pie como mucho `\despachoNotasExtraMax` (0,35 cm), para no pisar el filete.
