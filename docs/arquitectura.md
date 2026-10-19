---
tipo: doc
titulo: "Arquitectura del SGDP"
estado: activo
---

# Arquitectura del SGDP

Describe el sistema **como es**. Nació como el documento de decisiones de la Fase 0 (2026-08-06);
las decisiones posteriores, con fecha, están en [`decisiones.md`](decisiones.md) y el avance de la
plataforma en [`plataforma/hoja-de-ruta.md`](plataforma/hoja-de-ruta.md).

## 1. Propósito y principios

El SGDP es la capa web colaborativa del despacho: ~7 secretarias, el
diputado y asesores trabajando a la vez desde el navegador, sin ver
jamás LaTeX, Markdown ni Git.

Principios innegociables:

1. **LaTeX sigue siendo el motor oficial de formato.** El Marco
   Documental (`marco_documental`) no se reemplaza ni se bifurca:
   la API no lo modifica e invoca su `marco_documental/scripts/build.sh` tal cual.
   Si un membrete cambia, se cambia en el framework y el SGDP lo hereda.
2. **Separación total contenido/formato.** El usuario produce
   contenido estructurado; la presentación la deciden las clases del
   framework. Nadie edita `.tex` desde la web.
3. **Solo software libre y autoalojado.** Sin SaaS, sin APIs de pago,
   sin nubes. GitHub únicamente para código fuente, nunca documentos.
4. **KISS.** La escala real es 7–50 usuarios y ~10 000 documentos:
   PostgreSQL y una compilación a la vez dentro de la API bastan; no
   hay Redis, colas externas ni microservicios.
5. **El SGDP es el núcleo de la plataforma del despacho; los demás sistemas se enlazan,
   no se fusionan.** Inicio es la única puerta; cada sistema externo (tareas en OpenProject,
   Identidad Visual) se abre con la dirección que da el `.env` (`VITE_URL_*`), y la información
   se conecta por **referencias estables** (`clave_externa`: `calibre:<id>`,
   `datafw:<estudio>@vN#<indicador>`, `sgdp:doc:<id>`), nunca copiando (decisión del
   2026-10-01, `plataforma/propuesta.md` §1).

**Aspecto de la web (2026-10-19).** La interfaz sigue la filosofía de macOS (`plataforma/rediseno-macos.md`):
una sola fuente de color, `frontend/src/paleta.ts` (neutros, la tinta como único acento, color solo cuando
dice algo), y el tema de MUI, `frontend/src/theme.ts`, que fija la letra del aparato, los radios, las sombras
y el aspecto por defecto de botones, pastillas, avisos, menús, diálogos, pestañas, campos y tablas. Una
pantalla no define colores propios: toma los de la paleta; lo que señala algo (estado, cruce, por confirmar)
es una pastilla tenue o un punto, nunca una barra lateral ni un relleno con texto blanco. La identidad del
despacho (vino, dorado) vive en el marco LaTeX y en los PDF, no en la web.

## 2. Vista de servicios

Dos modos con la misma arquitectura; solo cambia dónde corre cada proceso.

```
 navegador (cada persona del equipo)
        │  :5173 (red local) o el enlace de Tailscale Funnel
        ▼
 ┌─────────────┐  proxy /api   ┌─────────────┐      ┌──────────────┐
 │  web        │ ────────────► │  api        │ ───► │  db          │
 │  React+Vite │  proxy /colab │  FastAPI    │      │  PostgreSQL  │
 └─────┬───────┘               └─────┬───────┘      └──────────────┘
       │                             │ build.sh del marco (subproceso, uno a la vez)
       ▼                             ▼
 ┌─────────────┐               marco_documental/ (MDD_RUTA) ──► archivo documental (MDD_DOCUMENTOS)
 │ colab :8001 │  Hocuspocus (§14)
 └─────────────┘
```

- **Modo laptop** (el de producción): `./iniciar.sh` levanta PostgreSQL en Docker y, en el host, la
  API (`127.0.0.1:8000`), el servidor de colaboración (`127.0.0.1:8001`) y la web (`vite preview` del
  build, `:5173`, abierta a la red local); la API compila con el TeX Live del host.
- **Modo completo** (`docker compose up -d --build`): `db`, `api`, `web` y un contenedor `latex`
  (imagen TeX Live) que monta el marco; no levanta el servidor de colaboración.

PostgreSQL y la API escuchan solo en loopback; la web es la única puerta, y hacia fuera la publica
Tailscale Funnel con HTTPS (`docs/acceso-permanente.md`).

## 3. Contenido canónico: JSON de TipTap

- El editor TipTap (ProseMirror) produce **JSON estructurado**; ese
  JSON se guarda en PostgreSQL (JSONB) y es la fuente de verdad del
  contenido. No existe Markdown en ninguna capa.
- Un **serializador propio** (backend) traduce ese JSON a las macros
  del framework: negrita→`\textbf`, listas→`itemize/enumerate`,
  tablas→`longtable` con el estilo de datos del framework,
  enlaces→`\url`/`\href`, escapando siempre `& % # _ { } ~ ^ \`.
- El serializador funciona por **lista blanca de nodos**: lo que no
  reconoce, se rechaza. Así es imposible inyectar LaTeX desde la web
  — la separación contenido/formato queda garantizada por construcción.
- Pegar desde Word/Excel/LibreOffice: lo resuelve TipTap (interpretan
  el HTML del portapapeles). La API no importa `.docx`: un Word del despacho lo transcribe el
  asistente (`procesar-un-documento.md` §2) y un proyecto de ley en Word o PDF lo reparte en partes
  `scripts/importar_proyecto_ley.py`.
- **Integridad del texto**: el serializador y el generador NUNCA
  auto-corrigen el contenido (ver [redaccion-administrativa.md](redaccion-administrativa.md)
  §12). La revisión ortográfica y de redacción administrativa es un paso
  **editorial** sobre el modelo (`campos`/`cuerpo`) antes de guardar, con
  reglas precisas en esa guía; el pipeline solo traduce y escapa.

## 3bis. Documentos heredados (origen `framework`)

Los documentos ya generados con el Marco Documental (los que existían
antes del SGDP) se **importan sin alterarlos**. Cada `Documento` lleva
una columna `origen`:

- `sgdp` — nacido en la plataforma: contenido = JSON de TipTap, PDF lo
  genera el serializador. Editable en el editor visual.
- `framework` — importado del archivo: su carpeta (`metadata.tex`,
  `oficio.tex`, PDF, anexos) se copia **verbatim** al área de trabajo;
  su formato y personalización LaTeX se conservan intactos.

Reglas de los heredados:

- El editor visual **no los reescribe**: `previsualizar/generar/guardar`
  los rechazan con 409 (reescribirlos por el serializador perdería su
  personalización — tablas `longtable`, sellos, espaciados…).
- El PDF que sirve la plataforma es **byte-idéntico** al original
  (`pdf_archivo` fija el PDF institucional exacto, ignorando anexos y
  variantes `[R]`).
- Editables desde la web: **estado** (incluye archivar) y **recompilar**
  del `.tex` original (produce un PDF idéntico en formato). Los datos
  (destinatario, asunto, fecha) se muestran de solo lectura; para
  cambiarlos con formato se usa el sistema LaTeX.
- La importación (`POST /api/documentos/importar`, solo administrador)
  es **idempotente** (por nombre de carpeta, estable ante cambios de
  ruta) y **no consume números** del contador: respeta la numeración
  oficial ya impresa (incluida la no estándar, «Oficio Múltiple N°…» o
  «S/N»).

## 3bis-b. Documentos elaborados fuera del sistema (origen `manual`)

Cuando el sistema no está disponible, el despacho numera y redacta a mano
(Word). Esos documentos ya existen con número impreso y hay que meterlos al
flujo **sin editor ni LaTeX** (Edison 2026-09-11): el PDF que se hizo ES el
documento.

- `origen = 'manual'`: el PDF subido es la **fuente**; no hay `.tex`. Todo lo
  que compila (`guardar` el cuerpo, `previsualizar`, `generar`, `recompilar`,
  `convertir`) responde 409 con un mensaje propio. Todo lo que es trámite
  (firmado, cargos, STD, relaciones, expediente, sincronización, copia como
  imagen) funciona igual: opera sobre `pdf_archivo` + carpeta y no mira el
  origen.
- Lo que SÍ se edita: los **datos** de bandeja (`PUT /api/documentos/{id}`,
  rama manual: sin cuerpo, sin compilar, sin tocar la firma — corregir una
  transcripción no cambia lo firmado) y el **PDF** (`PUT
  /{id}/archivo-manual`: el anterior va a `anteriores/` con marca de tiempo y,
  si había firma, se anula como al editar un documento de la plataforma).
- **El número no se asigna: se declara** (`numeracion.asignar_declarado`,
  invariante 6). Solo se acepta `último + 1` bajo el mismo lock del contador;
  un número ya emitido o uno que dejaría hueco se rechazan con el motivo. Un
  número saltado se declara **sin PDF**: queda reservado y `ARCHIVADO` como
  «número no utilizado» (el ANULADO de un libro de registro), y el
  correlativo sigue sin huecos.
- Carpeta y nombre del PDF por la convención de siempre
  (`carpetas.py`, `nombres.py`); al eliminar (solo el último número) se borra
  la carpeta como en los `sgdp`.
- Servicio: `backend/app/servicios/incorporacion.py`; router `backend/app/api/incorporacion.py`
  (`POST /api/documentos/incorporar`, multipart); `GET
  /api/tipos/{codigo}/siguiente-numero` informa qué número espera la serie.
  Front: `frontend/src/componentes/DialogoIncorporar.tsx` (última opción del menú «Nuevo
  documento») y `VistaHeredada.tsx` en modo manual.

## 3ter. Un solo árbol: sin copias (`ruta_original`)

**No hay duplicados.** Todos los documentos —heredados y nacidos en la
web— viven en el MISMO árbol, el archivo documental del despacho
(`$MDD_DOCUMENTOS/oficios/`, antes dentro del marco). La plataforma **no copia**
documentos a ninguna carpeta propia.

- Cada `Documento` guarda en `ruta_original` la ruta de SU carpeta real
  en el framework, y en `pdf_archivo` el nombre de su PDF institucional.
- Heredados: `ruta_original` apunta a la carpeta que ya existía; se
  sirven y recompilan **en el lugar**.
- Nuevos (web): al primer compilado se crea su carpeta bajo
  `$MDD_DOCUMENTOS/oficios/` con la convención del framework
  (`OF-<n>-<AAAAMMDD>-<slug>`, idéntica a `marco_documental/scripts/nuevo.sh`). Un
  borrador aún sin número usa `OF-BORRADORnnnn-…` y se **renombra** a su
  nombre oficial al generar. Así un oficio hecho por la web es
  indistinguible de uno hecho a mano.
- La ruta y el número se **persisten antes de compilar**, para que disco
  y BD nunca queden desalineados si la compilación falla.
- Modo Docker: el framework se monta **lectura-escritura** (§10).

## 4. Integración con el Marco Documental

El framework ya define el contrato perfecto de compilación:

```
carpeta-del-documento/
├── metadata.tex   ← lo genera el SGDP desde los campos del formulario
└── oficio.tex     ← lo genera el serializador desde el JSON TipTap
        ↓
scripts/build.sh → PDF con nombre institucional
```

- La API escribe `metadata.tex` y el maestro en la carpeta del documento dentro del archivo
  documental (`MDD_DOCUMENTOS`), ejecuta `build.sh` del marco (§9) y renombra el PDF con la
  convención de `backend/app/servicios/nombres.py`.
- Los errores de LaTeX nunca llegan crudos al usuario: `compilador.py` los traduce a un mensaje
  legible con el detalle técnico al final.
- El marco viaja en el mismo repo (subtree `marco_documental/`): la versión del SGDP fija la del
  marco.

## 5. Numeración oficial sin huecos

- Tabla `contadores(serie, periodo, ultimo)` — series independientes
  (OF, OM, MEM, INF, …) por periodo legislativo, igual que
  `marco_documental/scripts/nuevo.sh` hoy.
- El número se asigna **solo al aprobar/generar oficialmente**, nunca
  en borrador, dentro de la misma transacción que cambia el estado:
  `UPDATE contadores SET ultimo = ultimo + 1 … RETURNING ultimo`.
  El bloqueo de fila serializa aprobaciones concurrentes; un rollback
  devuelve el número → correlativo sin huecos.
- **No** se usan `SEQUENCE` nativas (dejan huecos al hacer rollback).
- Respaldo: índice único sobre `(despacho, tipo, periodo, numero)`.
- Documentos S/N siguen existiendo y no consumen número.
- Un número **ya impreso** en un documento hecho fuera del sistema no se
  asigna: se **declara** y solo se acepta si es `último + 1`
  (`asignar_declarado`, §3bis-b). Un número saltado se declara sin PDF y
  queda archivado, para que el contador siga siendo la única verdad.

## 6. Estados, historial y versiones

- Estados: BORRADOR → EN REVISIÓN → OBSERVADO → APROBADO → FIRMADO →
  ENVIADO (→ OBSERVADO POSTERIOR, `OBSERVADO_ENVIADO`) → ARCHIVADO. Las transiciones válidas y
  quién puede ejecutarlas se validan en el backend (`backend/app/flujo.py`).
- **Pasos automáticos** (`backend/app/servicios/envio.py`, `backend/app/servicios/revision.py`): complementan al
  manual, nunca lo reemplazan. Con su firmado vigente un APROBADO pasa solo a FIRMADO (al subirlo, al
  incorporarlo desde la carpeta sincronizada, al reconocerlo en la carpeta y al reactivarlo desde
  ARCHIVADO: `envio.al_dia`), y con el envío probado, a ENVIADO. Todo cambio de estado, manual o
  automático, se anuncia igual (`envio.anunciar_estado`: evento `documento.estado` y conciliación de los
  recibidos que el oficio responde). Lo que quedó atrás se pone al día con `POST
  /api/documentos/firmados/poner-al-dia` (simula por defecto; sin publicar en el chat).
- `eventos` es una bitácora **append-only**: (documento, usuario,
  acción, detalle, fecha-hora). Nada se borra.
- `versiones_documento`: cada guardado crea una fila con el JSONB
  completo (contenido + metadata). Nunca se sobrescribe; el diff se
  calcula al consultarlo.

## 7. Usuarios y permisos

- Roles: administrador, secretaria, asesor, diputado, prensa, invitado (prensa: el estudio de §17, la
  Fototeca, el mapa y el directorio; no tramita documentos).
- JWT propio (sin autoregistro: las cuentas las crea el administrador,
  lo natural en un despacho). Claves con PBKDF2-SHA256 de `hashlib`, con sal por cuenta y sin
  dependencias de hashing (`backend/app/seguridad.py`).
- Autenticación por DNI: posible después, es solo el nombre de usuario.

## 8. Modelo de datos

Las tablas que existen (`backend/app/modelos.py`), por módulo:

| módulo | tablas |
|---|---|
| cuentas y ajustes | `usuarios`, `solicitudes_clave`, `ajustes` |
| documentos | `documentos`, `versiones_documento`, `contadores`, `eventos`, `adjuntos`, `documento_relaciones`, `comentarios`, `notificaciones`, `asignaciones_documento`, `reglas_copia` |
| directorio institucional | `instituciones`, `personas`, `enlaces_institucionales` |
| proyectos de ley | `proyectos`, `proyecto_miembros`, `proyecto_fases`, `proyecto_tareas`, `proyecto_secciones`, `proyecto_seccion_versiones`, `proyecto_fuentes`, `proyecto_documentos`, `proyecto_archivos`, `proyecto_actividad` |
| edición simultánea | `colab_estado` (§14) |
| OpenProject | `op_enlaces`, `op_asignaciones_vistas` |
| Semana de representación | `semanas_sr`, `actividades_sr`, `pedidos_sr`, `fotos_sr` |

Los **tipos documentales no son una tabla**: son el registro `backend/app/tipos.py` (tipo, serie,
carpeta, esquema del formulario). Los cambios de esquema son aditivos y se aplican como dice
[`desarrollo.md`](desarrollo.md) §Migraciones de esquema.

## 9. Compilación

No hay cola en la base de datos: la API ejecuta `marco_documental/scripts/build.sh` como subproceso
(`backend/app/latex/compilador.py`), **uno a la vez** (un semáforo en el proceso; a esta escala una
cola simple es suficiente y predecible) y con un tiempo máximo (`tiempo_max_compilacion` de
`backend/app/config.py`). Un render LuaLaTeX tarda 10–20 s: la vista previa es **bajo demanda**,
nunca por tecla. La Semana de representación compila aparte, en segundo plano y con un candado por
semana (`backend/app/servicios/generador_sr.py`).

## 10. Seguridad

- **Compilar LaTeX con contenido de usuarios es ejecutar código.** Lo que entra al `.tex` desde la
  web pasa por el serializador de lista blanca y `escapar()` (`backend/app/latex/`); `build.sh` llama a
  LuaLaTeX sin `-shell-escape` (rige el modo restringido de TeX Live) y la API corta la compilación
  al pasar el tiempo máximo. La compilación corre con el usuario del servicio, sin aislamiento de red.
- **El marco no está protegido por el montaje**: en `docker-compose.yml` se monta en lectura-escritura
  (`/framework`), y en modo laptop la API lo lee del disco. Lo que impide tocarlo es que la API no
  tiene ningún endpoint que escriba en él; los documentos se escriben en `MDD_DOCUMENTOS`.
- **Red**: base de datos, API y servidor de colaboración solo en loopback; hacia fuera, la web por
  HTTPS (Tailscale Funnel), detrás de usuario y contraseña (JWT).
- **Permisos en el servidor** (`backend/app/flujo.py`): ocultar un botón en la web es cosmético.
- **Adjuntos**: extensión y tamaño validados, servidos solo autenticados y siempre por
  `backend/app/api/archivos.py`.
- **Secretos** solo en el `.env` (fuera del repo, enlazado desde el despacho); el servidor de
  colaboración usa un secreto derivado de `JWT_SECRET`.

## 11. Despliegue

Modo laptop en producción: `./iniciar.sh` levanta PostgreSQL en Docker y la API, la web (build de
Vite) y el servidor de colaboración en el host, con el TeX Live del host; el enlace permanente lo da
Tailscale Funnel ([`acceso-permanente.md`](acceso-permanente.md)) y el arranque automático,
`sgdp.service` (`sistema/README.md`). Cómo llega un cambio al despacho, cómo se respalda y el modo
completo en contenedores: [`desarrollo.md`](desarrollo.md) y `README.md` §Uso.

## 12. Decisiones descartadas (y por qué)

| Descartado | Razón |
|---|---|
| Numeración en archivo de Google Drive | condiciones de carrera → números duplicados; servicio de terceros |
| GitHub como almacén de documentos | documentos del despacho en nube ajena; git no responde "quién cambió qué campo" |
| Markdown como formato interno | intermediario con pérdida; TipTap ya produce JSON estructurado |
| Redis / cola externa | innecesario a esta escala; basta una compilación a la vez en la API |
| `SEQUENCE` de PostgreSQL para numerar | deja huecos con rollbacks; se usa tabla de contadores transaccional |
| Compilación "en tiempo real" por tecla | un render LuaLaTeX tarda 10–20 s; se usa debounce + botón |

## 13. Fases

El avance se marca en [`plataforma/hoja-de-ruta.md`](plataforma/hoja-de-ruta.md); lo que sigue sin
fecha ni dueño (firma digital integrada, multi-despacho) está en `README.md` §Límite honesto. La tabla
de fases de agosto de 2026 la conserva git.

## 14. Edición simultánea

Varias personas escriben a la vez en la misma parte de un proyecto de ley o en el mismo documento
(oficio, memorando…; desde el 2026-10-05), cada una con el cursor y el nombre de las demás; «Guardar» sigue creando una versión con nota y lo escrito entre versiones se
conserva solo. Está construida sobre **Yjs** (CRDT) con el editor TipTap 2 (`collaboration` y
`collaboration-cursor`) y un servidor **Hocuspocus 2.15** (`frontend/colab/servidor.ts`, Node, puerto
8001, `colab.log` (en `logs/`)), que vive en `frontend/` para que haya una sola copia de TipTap, ProseMirror y Yjs
y el esquema del servidor sea el del navegador (`frontend/src/extensiones/esquema.ts`, compartido con
los dos editores).

```
navegador A ─┐                                   ┌─ GET /api/colab/acceso   (¿puede escribir aquí?)
navegador B ─┼─ WebSocket /colab ─ Hocuspocus ───┤
navegador C ─┘   (JWT del SGDP)                  └─ PUT /api/colab/estado   (JSON derivado → borrador vivo)
                                                       tabla colab_estado   (bytes Yjs, por parte o documento)
```

- **La API sigue siendo la única que escribe contenido.** El servidor no valida la JWT: se la
  presenta a la API (`GET /api/colab/acceso`), que aplica las reglas de siempre (cuenta activa, clave
  no temporal, invitado solo lee), y para guardar usa un secreto derivado de `JWT_SECRET` por HMAC
  (`backend/app/servicios/colab.py`); no hay variable nueva en el `.env`.
- **El nombre del texto compartido lleva la generación**: `pl:<proyecto>:<parte>:<generación>`.
  Todo lo que reemplaza el contenido por fuera de Yjs —encender o apagar el modo, restaurar una
  versión, guardar por turnos— pasa por `reiniciar()`, que sube la generación y cierra a los
  conectados (4205), porque un estado Yjs viejo unido a uno reconstruido desde el JSON duplicaría el
  texto.
- **Interruptor por proyecto** (`proyectos.colaboracion`), **encendido por omisión** desde el 2026-10-05
  (lo existente se encendió una vez al arrancar, marca `colab_por_omision` en `ajustes`); apagarlo se niega si
  queda texto sin versionar.
- **Documentos** (`doc:<id>:<generación>`, paso 5.6): interruptor por documento
  (`documentos.colaboracion`, «Editar en simultáneo» en el editor; `PATCH /api/documentos/{id}/colaboracion`),
  que solo rige mientras el documento es **compartible**: origen `sgdp` y estado de borrador a
  numerado sin firmar (`backend/app/servicios/colab.py` (`documento_compartible`)). Al firmar, enviar o archivar deja
  de regir solo: el servidor rechaza el siguiente guardado y las pestañas vuelven a turnos. El cuerpo
  es el texto compartido y los datos del formulario viajan en el mapa Yjs `campos` del mismo estado;
  el borrador vivo es `documentos.borrador` = {campos, cuerpo}. «Guardar», «Vista previa» y «Generar»
  desde el editor compartido mandan la `generacion` y, si es la vigente, no se exige `version_base`
  (lo que llega es el texto unido de todos); por fuera, rige el 409 de siempre y el texto compartido
  se reinicia (`backend/app/api/documentos.py` (`_preparar_escritura`)). Los anexos (figuras y tablas) son editores
  aparte y siguen por turnos: viajan al guardar.
- **Salas de presencia** (`sala:<sr|pl|doc>:<id>`, 2026-10-05): cada página de semana, proyecto o documento
  abre una sala que solo reparte awareness —quién está y en qué campo tiene el cursor— para las etiquetas con
  nombre de los formularios (`frontend/src/componentes/Presencia.tsx`). El servidor no la carga ni la guarda y
  la API solo exige una sesión válida (`es_sala` de `backend/app/servicios/colab.py`).
- **Vista previa y PDF**: la vista previa usa los borradores vivos; «Generar PDF» usa solo las
  versiones y avisa qué partes tienen texto sin guardar.
- **Sin servidor**: si no sincroniza en 8 s, la pestaña pasa al modo por turnos partiendo del
  borrador vivo y reintenta cada minuto; la API de producción no depende de Hocuspocus.
- **Ida y vuelta exacta** verificada sobre toda la base (`scripts/colab_ida_y_vuelta.py`): el JSON
  que ve el editor y el LaTeX que sale de él son los mismos con y sin modo compartido.
- Límites: lo escrito sin conexión vive en la pestaña hasta que vuelve la conexión; el modo Docker
  completo no levanta el servidor de colaboración (ahí se trabaja por turnos). Pruebas:
  `backend/tests/test_colab.py`, `frontend/colab/prueba_dos_clientes.ts`. La conexión del navegador
  (recarga, caída, quién está, cursores) es una sola para los dos editores:
  `frontend/src/componentes/textoCompartido.ts`.

## 15. Consumidores

Lo que otros proyectos leen del SGDP. Cambiar cualquiera de estas piezas exige avisar al consumidor y
cambiar los dos lados a la vez.

| consumidor | qué lee | dónde lo usa |
|---|---|---|
| `openproject/` (puente antiguo, sin uso desde que el reflejo vive en la API) | la tabla `documentos` —`id`, `tipo`, `serie`, `numero`, `periodo`, `estado`, `campos->>'asunto'`, `campos->>'destinatario_nombre'`, `pdf_archivo`, `actualizado_en`— del contenedor `sgdp-db-1`, y la clave `sgdp:doc:<id>` | `openproject/bridges/sync_documentos.py` |
| el despacho (cliente) | `.env.example` (las variables que `<despacho>/operaciones/sgdp/.env` debe declarar) y `respaldar.sh` (escribe en `respaldos`, enlazado a `<despacho>/operaciones/sgdp/`; el despacho lo programa a diario con un `cron` y rota los volcados) | `<despacho>/operaciones/sgdp/` y su `README.md` |
| el despacho (cliente) | el marco por `MDD_RUTA`: `marco_documental/generadores/informe-sr/main.py` | `<despacho>/representacion/generar.sh` |
| el despacho (cliente) | el contrato del perfil que espera `MDD_PERFIL` | `perfil.ejemplo/README.md` |

Lo que el SGDP consume de otros, con su contrato en el proveedor, está en `README.md` §Contratos con
otros repos.

## 16. Mapa de relaciones

La página `/mapa` (módulo «Mapa de relaciones», `frontend/src/paginas/Mapa.tsx`) dibuja todo lo que el
sistema sabe que está conectado, al estilo del gráfico de Obsidian: documentos del sistema y externos,
proyectos de ley, semanas de representación, personas e instituciones del directorio y el equipo. Lo
arma `GET /api/grafo` (`backend/app/api/grafo.py`) con `backend/app/servicios/grafo.py`, que solo lee.

- **Aristas fiables**: relaciones guardadas (respuesta o relación entre documentos y con externos,
  documentos y fuentes `sgdp:doc:N` de un proyecto, informe y oficios de una semana, persona →
  institución, responsables y miembros).
- **Aristas inferidas** del texto, punteadas en el mapa: destinatario y copias que coinciden por nombre
  con una persona del directorio (sin grados ni cargo), institución del destinatario y referencia
  «Oficio N° …» que coincide con el número de un documento. Hoy casi todo lo que une a los documentos
  está ahí: sin ellas el mapa quedaría vacío.
- Personas e instituciones entran solo si se conectan con algo (el directorio entero no es un mapa). Los
  documentos ocultos, solo para el administrador; el equipo, para quien ve la autoría.
- La web: física de fuerzas en un lienzo (`react-force-graph-2d`), capas por tipo de nodo y de relación
  (las copias de rutina y el equipo apagados por omisión), búsqueda, ficha con las conexiones y
  «Enfocar» a 1 o 2 saltos (`/mapa?foco=doc:<id>`, al que lleva «Ver en el mapa de relaciones» del
  editor). Con `?foco=<id>` la API devuelve solo su vecindad (sin copias ni equipo): es la ventanita
  `frontend/src/componentes/grafo/MapaLocal.tsx` del editor de documentos y de la ficha del proyecto; el
  estilo (colores sobrios, formas, rótulos) es uno solo, `frontend/src/componentes/grafo/estilo.ts`. Pruebas de las
  coincidencias y de la vecindad: `backend/tests/test_grafo.py`.
- **Correspondencia, compartida con Estadísticas** (2026-10-19): `grafo.correspondencia` cuenta, de los
  oficios enviados, los que tienen respuesta (externo «respondido por», documento que «responde a», recibido
  que contesta) y en cuántos días desde la fecha del oficio, por institución y persona destinataria (aristas
  «dirigido a»), y los más antiguos sin respuesta. `GET /api/grafo` la deja en los nodos (`correspondencia`
  en instituciones y personas, `respuesta` en cada oficio enviado) y `GET /api/estadisticas` la devuelve en
  `correspondencia`, con el `foco` del nodo en cada institución y destinatario frecuentes
  (`grafo.foco_por_nombre`). Cómo se dice y a dónde lleva, en un solo módulo de la web
  (`frontend/src/correspondencia.ts`): `/mapa?foco=…` desde Estadísticas y `/estadisticas#correspondencia`
  desde la ficha del mapa.

## 17. Prensa: el estudio de Identidad Visual

El estudio (editor de piezas `editor.html` y de fotos y videos `media.html`) es del repo
`identidad-visual` (`identidad-visual/editor/servidor/servidor.py`, solo librería estándar, sin cuentas). Corre aparte, en
127.0.0.1 (`ESTUDIO_URL`, 8099 por omisión; lo lanza `iniciar.sh` cuando el `.env` tiene
`IDENTIDAD_PERFIL`, con la carpeta del repo de `IDENTIDAD_VISUAL_DIR` o de `core/env.sh`), y la web lo
muestra en un marco (`frontend/src/paginas/Prensa.tsx`).

- **Un solo puerto.** El enlace público solo publica el de la web: el proxy de Vite manda `/estudio` a la
  API, y la API (`backend/app/api/prensa.py`) reenvía al estudio en flujo (cuerpo y respuesta, `Range`)
  con `X-Forwarded-Prefix: /estudio`, que el estudio antepone a toda URL que emite. No viajan `Cookie`,
  `Authorization` ni `Origin`; vuelven `X-Frame-Options: SAMEORIGIN` y `frame-ancestors 'self'`.
- **Sesión.** El marco no puede mandar el token: `POST /api/prensa/sesion` (Bearer; roles prensa, diputado,
  administrador) deja la cookie `sgdp_estudio`, un JWT con `aud=estudio` firmado con `JWT_SECRET`
  (HttpOnly, SameSite=Strict, `Path=/estudio`, 2 h; la página la renueva cada 30 min y cerrar sesión la
  borra). El token de la web no sirve de cookie ni al revés (`leer_sesion` de `backend/app/servicios/prensa.py`).
- **Ruta.** `ruta_segura` decodifica otra vez y rechaza `..`, `.`, `//`, `\\`, NUL y rutas absolutas; el
  estudio, además, no sale de sus carpetas ni sirve su código.
- **La Fototeca es la única biblioteca.** El proxy completa `/api/media` y `/api/imagenes` del estudio con
  las fotos públicas y del álbum «Prensa» (`ESTUDIO_LIMITE_FOTOS`), como
  `/estudio/banco/fototeca/ft-<id>-<versión de ajustes>.jpg`; al pedir uno que falta lo escribe en
  `<banco>/fototeca/` (derivado `original` con sus ajustes; banco de `ESTUDIO_BANCO` o `rutas.banco` del
  perfil) y la miniatura la sirve la Fototeca. Las respuestas correctas de `/api/exportar-foto`,
  `/api/imagenes` (POST) y `/api/subir` (imágenes) se registran en la Fototeca (`ft.registrar`, sin
  duplicar por huella; piezas al álbum «Piezas de prensa»). Un fallo al registrar no rompe la respuesta
  del estudio: se anota en `api.log` (en `logs/`). El editor de piezas descarga en el navegador: el proxy añade
  `fototeca: true` a `/api/health` y atiende él mismo `POST /estudio/api/fototeca-pieza` (dataURL, título
  de la edición, fotos de origen), que el editor solo ofrece con esa marca.
- **Videos** (2026-10-06): la Fototeca los guarda con las reglas de las fotos (original único por
  SHA-256, papelera, álbumes, etiquetas), sin editarlos ni exportarlos por tamaños. El navegador los
  reproduce con un enlace firmado de vida corta (un `<video>` no manda el token; audiencia propia, como la
  cookie del estudio) y con `Range` solo para ellos (los PDF siguen igual). Las exportaciones de video de
  Prensa son trabajos en segundo plano: el proxy los anota y los registra al verlos listos en
  `/api/trabajo`; la lista vive en memoria (un reinicio la olvida; el video sigue en su canal).
- **Sin estudio** la sesión responde `estudio: false` y la página lo explica; el proxy responde 503.
- Pruebas: `backend/tests/test_prensa.py` (cookie, ruta, nombres, listados, piezas) y, en el estudio,
  `identidad-visual/tests/test_servidor.py` (prefijo, Host/Origin, JSON).

## 18. Vigencia de la firma y del expediente

Una sola regla, en `backend/app/servicios/vigencia.py` (2026-10-06), para todo lo que puede dejar sin
valor una firma o un expediente. Las huellas se **calculan**, no se recuerdan:

- **Huella impresa** (`huella_impresa`): lo que la firma garantiza. En un documento `sgdp`, el SHA-256
  del JSON canónico de tipo, número, periodo, campos (sin claves `_…` ni vacíos; los `fmt_*` cuentan),
  cuerpo, los **adjuntos de la línea «Adj.» ya resueltos** (`combinar_adjuntos`: escritos + archivos,
  como conjunto ordenado) y el SHA-256 de las imágenes incrustadas (`es_anexo`). En uno `manual`, el
  SHA-256 del PDF; en uno `framework`, el de sus `.tex`. Lleva esquema (`v1:sgdp:…`, `v1:manual:…`,
  `v1:tex:…`).
- **Huella del expediente** (`huella_expediente`): la base (`firmado` id + SHA-256, o la huella impresa si
  aún no hay firmado) y la lista ordenada de piezas PDF (id, nombre, SHA-256). Se guarda en el
  manifiesto `expediente/EXP-….json`, junto al PDF.
- **Datos guardados**: `adjuntos.sha256` (al subir; los anteriores, la primera vez que hace falta) y
  `adjuntos.huella_impresa` en el firmado (lo que certifica, fijado al subirlo; un firmado antiguo sin
  huella toma la del momento). Columnas nulas, añadidas con `ALTER … IF NOT EXISTS` en `main.py`.

`vigencia.aplicar(sesion, doc, usuario, antes, motivo, confirmado)` corre **después** de cada cambio y
antes del commit, en todos los caminos que escriben: `PUT`, `/previsualizar`, `/generar`, restaurar
versión, recompilar heredado, reemplazar PDF manual, subir / quitar / reemplazar archivo / renombrar /
incrustar adjunto. Si cambió lo impreso **y** hay ciclo de firma (firmado, cargo, registro STD o estado
FIRMADO/ENVIADO/OBSERVADO_ENVIADO aunque se haya puesto a mano) llama a `firma.anular_firma`: firmados a
«adjuntos/anulados/», cargos a la categoría `recepcion_anulada` (se ven, no cuentan: todo lo que cuenta
cargos filtra `recepcion`), registro STD retirado (queda en `std_nota` y la bitácora), expediente firmado
a «expediente/anulados/» y estado a APROBADO. Si solo cambió la composición del expediente, la firma
sigue y `estado_expediente` lo da por desactualizado con sus motivos.

`confirmado`: `None` (scripts, pestañas viejas) anula e informa; `False` responde 409 `anula_firma` con
las consecuencias sin tocar nada; `True` anula. La web manda `False` y pregunta (`frontend/src/vigencia.ts`).

Los movimientos de archivo pasan por `vigencia.mover` / `vigencia.creado`: si la transacción termina sin
commit (409, error antes de compilar), los archivos vuelven a su lugar (eventos `after_commit` /
`after_transaction_end` de la sesión). `GET /api/documentos/{id}/vigencia` devuelve el estado de la
firma, el del expediente y qué se perdería al anular.

Proyectos de ley: cada PDF generado guarda la huella de su contenido guardado
(`vigencia.huella_proyecto`, `proyecto_archivos.huella`) y el firmado hereda la del generado sobre el que
se firmó (`base_id`); «al día» compara huellas, no fechas.

- **Formato predeterminado del tipo** (`ajustes`, «Usar como predeterminado»): se COPIA a los `fmt_*`
  del documento al crearlo; ni el generador ni la huella lo vuelven a consultar, así que cambiarlo no
  toca la huella de los documentos existentes. «Restablecer» en un documento es una edición más (pasa
  por `vigencia.aplicar`). Lo fija `backend/tests/test_cierre_2026_10_06.py`.
- **Indicador del expediente en la bandeja**: `GET /api/expedientes/vigencia?ids=…` (fuera de
  `/api/documentos` para no chocar con `/{documento_id}`), en lote al abrir «Seguimiento», con la misma
  regla que `estado_expediente` (manifiesto + composición) pero sin contar páginas ni escribir el
  manifiesto de los antiguos, y una sola consulta de adjuntos. No se guarda.
- **Heredado eliminado**: lo que la reimportación no reconoce (adjuntos genéricos, imágenes, anulados) va
  a `.sgdp-retirados/adjuntos-<fecha>/` con `adjuntos.json` (qué era cada archivo) y `adjuntos/`
  desaparece.
- **Adjuntos**: quitar uno lo pasa a «adjuntos/anulados/»; reemplazarlo deja el anterior en
  «adjuntos/anteriores/». Un adjunto sin nombre toma el del archivo (antes la línea «Adj.» imprimía
  «ADJ-OF-…»).

## 19. Referencias y relaciones automáticas

Lo que un texto cita y lo que el sistema asocia solo vive en UNA tabla, `relaciones` (`Relacion` en `backend/app/modelos.py`,
creada por `create_all`): `origen` y `destino` con el identificador del mapa (`doc:12`, `pl:3`, `sr:2`,
`persona:7`, `inst:4`, `pedido:9`, `norma:ley-27795`, `libro:10086`), `tipo` (`referencia_normativa`,
`cita`, `menciona`, `presenta_informe`), `contexto` (`cuerpo`, `seccion:<clave>`, `informe:<campo>`),
`fuente` (`editor`, `texto`, `auto`, `manual`), `texto` y `datos` (cita APA, enlace, adjunto). Reglas puras
en `backend/app/servicios/referencias.py` (pruebas en `backend/tests/test_referencias.py`); la base, en `backend/app/servicios/relaciones.py`.

- **Nodo `referencia`** (`frontend/src/extensiones/Referencia.ts`, en `esquema.ts`: el servidor de
  edición simultánea lo conoce): inline y atómico, atributos `tipo`, `id`, `texto`, `nota`. El serializador
  escribe solo `texto` (escapado) y, si hay `nota` (libro), `\footnote{nota}`.
- **Autocompletado** (`frontend/src/extensiones/AutocompletarReferencias.ts` + `frontend/src/componentes/PopupReferencias.tsx`): un plugin de
  ProseMirror mira el párrafo hasta el cursor (`detectarConsulta` de `frontend/src/extensiones/consultaReferencias.ts`, pura, pruebas en
  `frontend/pruebas/referencias.test.ts`) y la lista pide `GET /api/referencias/buscar?q=&contexto=`
  (normas del catálogo `backend/app/catalogos/normas.csv`, leyes de los distritos y fuentes norma de los
  proyectos; documentos; proyectos; semanas; pedidos; personas e instituciones activas; libros por
  `backend/app/servicios/biblioteca.py` si está). Lo escrito decide los grupos («Ley» → normas); `contexto` da una
  ventaja leve a lo que suele citarse en ese editor (`referencias.ordenar_resultados`).
- **Sincronización al guardar**: `relaciones.sincronizar(origen, contexto, contenido)` en `PUT`,
  `/previsualizar`, `/generar` y restaurar de documentos, y en guardar y restaurar una parte de proyecto
  (`_citas` de `backend/app/api/proyectos.py`, que además vuelve fuente del proyecto la norma o el libro citado y retira las
  fuentes que agregó solo cuando ya nadie las cita). Solo toca las filas `fuente='editor'` de ese origen y
  contexto: las manuales y las automáticas no.
- **Textos planos** (informe SR, `frontend/src/componentes/semana/AreaMarkdown.tsx`): elegir llama a `POST /api/referencias/texto`
  (`fuente='texto'`); al guardar la semana, `relaciones.depurar_textos` quita las que ya no aparecen en los
  textos del informe, las actividades o los pedidos.
- **Informe SR y su oficio**: `GET /api/documentos/{id}/informe-sr` (con `asunto`, `referencia`, `sumilla`
  en pantalla) usa `parece_presentacion_informe` y `candidatos_informe`; `POST …/informe-sr` relaciona el
  oficio con la semana y su ISR y adjunta el PDF por `subir` de `backend/app/api/adjuntos.py` (bitácora, línea «Adj.» y la
  vigencia de §18: con el documento firmado, pregunta antes de anular); `DELETE …/informe-sr/{semana}`
  deshace la relación (el adjunto se quita por su propia ruta). `POST /api/referencias/semanas/{id}/
  oficio-presentacion` crea el borrador redactado (bajo `/api/referencias` porque `POST /api/semanas/{id}/
  {lista}` tomaría el nombre por una lista). La web asocia sola solo si `confiable` y el documento no tiene
  número (`frontend/src/componentes/SugerenciaInformeSR.tsx`).
- **Mapa**: `backend/app/servicios/grafo.py` suma las filas de `relaciones` como aristas fiables y crea los nodos
  `norma`, `libro` y `pedido`. El mapa local escucha `sgdp:relaciones` (se guardó: vuelve a pedir, los puntos
  conservan su lugar) y `sgdp:referencias` (citas en pantalla sin guardar: aristas `pendiente`, punteadas).
- **Zotero** (2026-10-06; `backend/app/servicios/zotero.py`, `GET /api/zotero/{estado,buscar,KEY}`): el
  autocompletado ofrece «Zotero» (nodo `referencia` de tipo `zotero`, relación `zotero:KEY`); inserta la
  cita en el texto que da Zotero y su referencia como nota al pie. El formulario de Fuentes de un
  proyecto busca en Zotero y guarda `zotero:KEY`; si Zotero enlaza la obra a un archivo de Calibre
  (`attachments:<Autor>/<Título> (<id>)/…`), la fuente resuelta muestra `calibre:N`. Con Zotero abierto
  (y «Permitir que otras aplicaciones de este equipo se comuniquen con Zotero») se usa su API local en
  `127.0.0.1:23119`: el procesador CSL (`include=bib,citation`, `style=apa`, `locale=es-ES`) y la clave
  de Better BibTeX (campo `citationKey`; si falta, `item.citationkey` por JSON-RPC). Cerrado, se lee una
  copia de `zotero.sqlite` (y su `-wal`) en una carpeta temporal y la cita la arma el respaldo APA del
  SGDP, marcada `formateado_por = 'sgdp-respaldo'`; sin nada, «Zotero no está abierto». Las fuentes
  `calibre:N` y los nodos `libro` antiguos se resuelven con `backend/app/servicios/biblioteca.py`
  (`mode=ro`; su APA 7 espeja `core/py-common/biblioteca.py`).
- **Lo eliminado**: al eliminar un documento o retirar un proyecto se borran sus relaciones propias (las
  que salen de él) y las automáticas que llegan a él; las citas que otros textos le hacen se marcan
  `destino_eliminado` y el mapa no las dibuja. Un proyecto recuperado desde la base recupera sus citas al
  guardar cada parte.
- **Campo «Referencia» del formulario**: el mismo autocompletado del cuerpo. Un documento elegido se
  vincula «relacionado»; si es un recibido se propone «responde a» con un clic, que reemplaza al
  «relacionado»; a un documento propio no se le propone.

## 20. Bandeja de entrada: documentos recibidos

**Qué es** (2026-10-06): lo que llega al despacho —cartas, oficios, invitaciones, citaciones, respuestas
de entidades— como registro con estado, responsable y plazo. Entidad propia `Entrada` (tabla `entradas`,
`backend/app/modelos.py`), no un `Documento`: por qué, en `decisiones.md` §Bandeja de entrada.

- **Archivo**: el PDF va al archivo documental, en la carpeta del tipo `recibido` del registro de tipos
  (`backend/app/tipos.py`: `recibidos/`) y dentro `entradas/AAAA-MM/`, con el nombre de `nombres.entrada`
  (`ENT-<STD>-<fecha>_<Remitente>_<Asunto>.pdf`). `Entrada.archivo` guarda la ruta RELATIVA a
  `raiz_documentos()`: una mudanza no toca la base (`ruta_de` de `backend/app/servicios/entradas.py`, que además rechaza una
  ruta fuera de la raíz). Se sirve por `enviar_archivo`. La huella SHA-256 es única.
- **Subida en dos pasos**: `POST /api/entradas/analizar` guarda cada PDF en `entradas/.por-confirmar/<sha>.pdf`
  (se limpian a las 24 h) y devuelve la ficha automática y el duplicado; `POST /api/entradas` registra las
  fichas revisadas (vuelve a comprobar duplicados) y mueve el PDF a su carpeta. `GET /api/entradas/
  por-confirmar/{sha}/pdf` es la vista previa. `POST /api/entradas/subir` hace los dos pasos (para un puente).
- **Ficha automática** (`backend/app/servicios/entradas.py`, puras, `backend/tests/test_entradas.py`): texto de las cuatro
  primeras páginas con `pdftotext` (poppler, el mismo de `pdf.contar_paginas`); n.º STD por el prefijo de
  6 a 8 cifras del nombre (sin el sufijo «(1)») o por un número rotulado como STD, registro, expediente u
  hoja de trámite; fecha escrita antes que numérica; «Asunto»/«Referencia» con hasta tres líneas de
  continuación; «Oficio/Carta/Informe… N° …» del encabezado; clase; atención por palabras (invitación o
  citación → agendar; opinión; interceder; respuesta a un oficio propio —la referencia trae las siglas del
  despacho, `config.siglas`— → conocimiento; solicita → responder); plazo en días hábiles (5 responder, 7
  opinión e interceder, 2 agendar); remitente: persona del directorio con nombre de tres palabras o más en
  el membrete o la firma, si no institución por nombre (o siglas de 4+ letras) en el membrete, si no la
  línea del membrete que nombra una organización; campaña si el asunto se parece (Jaccard ≥ 0,5) al de una
  entrada que ya tiene campaña. Un PDF sin texto (escaneo) avisa y toma el asunto del nombre.
- **Vínculo con los documentos propios**: tabla genérica `relaciones` (§19): `doc:N` → `entrada:M`,
  tipo `responde`, fuente `auto`, contexto `responder` (lo creó «Responder»), `referencia` (el oficio cita la
  entrada en su campo Referencia) o `manual`. `conciliar_documento` corre en `PUT`, `/generar` y
  `/estado` de documentos (`conciliar_seguro`: punto de guardado propio y un fallo solo se registra en el
  log, nunca impide guardar el oficio): agrega los vínculos por referencia, retira los de referencia que ya
  no cita y, con el oficio FIRMADO, ENVIADO u OBSERVADO_ENVIADO, pasa la entrada de «en atención» a
  «respondida». La cita se reconoce por el n.º STD como número completo o por el número del documento de
  origen (`cita_entrada`). `conciliar_todo` y `avisar_vencidas` corren, como mucho una vez por minuto, al
  pedir la lista o el resumen (cubren lo guardado por otros caminos). `Entrada.respuesta_documento_id` es
  el atajo al oficio de respuesta.
- **Referencias y mapa**: `relaciones.buscar` ofrece las entradas no archivadas junto con los documentos
  (grupo «Recibidos», tipo `entrada`, texto `texto_cita`); `grafo.construir` crea el nodo `entrada:M` con
  aristas a su remitente del directorio y `/recibidos?ver=M` como ruta.
- **Avisos**: `notificaciones` con `tipo='entrada'` y `destino='entrada:M'` (la campana abre
  `/recibidos?ver=M`): al asignar responsable, al vencer el plazo (una vez por vencimiento:
  `aviso_vencida_en`; cambiar el plazo lo rearma) y al quedar respondida.
- **Categoría, «por revisar» y «responde a»** (2026-10-18, Edison: clasificación inteligente en Mesa de
  Partes): `entradas.categoria` dice qué es el documento para el despacho (`comunicacion` nueva ·
  `respuesta` a un documento propio · `invitacion` o citación · `seguimiento` de un expediente o trámite ·
  `pronunciamiento` de una institución o gremio · `anexo` o informe; `backend/app/servicios/entradas.py` (`CATEGORIAS`,
  `categoria_de` por reglas para la ficha automática); `requiere_revision` marca la ficha cuya categoría
  propuso la IA con poca confianza o nadie confirmó (chip «Por revisar» en la lista, casilla en la ficha);
  `responde_a_documento_id` es el oficio PROPIO al que el recibido responde (lo contrario de
  `respuesta_documento_id`): al registrar, `_vincular_respuesta_a` deja la relación `entrada:M → doc:N`
  (`responde`) y una actuación «respuesta» de origen `sistema` en el seguimiento del oficio. La cita de la
  referencia se reconoce con el número completo («Oficio N.° 0123-2026-…»: serie por su nombre, número y
  año; `referencia_citada`), no solo con la serie abreviada.
- **Permisos**: todos los roles leen; `invitado` y `prensa` no escriben.

## 21. Tareas y Agenda

Módulo propio (2026-10-06; decisión en `docs/decisiones.md` §Tareas y Agenda): el SGDP es la fuente
de las tareas y de la agenda; OpenProject queda como espejo opcional por `.env` (§15 y
`backend/app/servicios/openproject_sync.py`, sin cambios). Tablas en `backend/app/modelos_tareas.py`
(archivo propio con la misma `Base`, para no tocar `backend/app/modelos.py`; las crea `create_all` porque
`backend/app/main.py` importa `backend/app/api/tareas.py` y `backend/app/api/agenda.py` antes del arranque):

- `tareas`: título, detalle, `estado` (`por_hacer`, `en_curso`, `en_espera`, `hecha`, `cancelada`),
  `prioridad` (`baja`, `normal`, `alta`, `urgente`), `responsable_id` único, `vence_en` + `con_hora`
  (sin hora = las 23:59 locales de ese día; vence al terminar el día), `lista_id`, `orden` (tablero),
  `etiquetas` y `checklist` (JSONB), `plantilla`, `entregable` (`doc:N` o enlace), `origen` +
  `externo_id` (importaciones idempotentes), `version` (409 `tarea_modificada`), `cerrada_por/en`,
  `clase` (`interna`, `externa` o vacía = la del sistema, `tareas_reglas.clase_tarea`; 2026-10-18).
- `tareas_listas` (listas opcionales), `tareas_comentarios` (conversación y bitácora `sistema=True`).
- `agenda_eventos`: `tipo` (`pleno`, `comision`, `despacho`, `externa`, `semana_representacion`,
  `medio`, `otro`), `estado` (`propuesto` = por confirmar, `confirmado`, `suspendido`, `realizado`,
  `cancelado`, `descartado`; ver «Por confirmar» abajo), `actualizado_por` (quién lo cambió por última vez),
  `inicio`/`fin`/`todo_el_dia` (todo el día: `fin` = último día 00:00, inclusive), lugar, modalidad,
  enlace, `recurrencia` JSONB (`none_as_null`: NULL = único) y `excepciones` (fechas omitidas).
  La tabla `eventos` es la bitácora de documentos: por eso el nombre.
- `agenda_participantes` (cuenta, persona del directorio o nombre; papel `titular`, `acompana`,
  `responsable`, `invitado`) y `agenda_tokens` (dirección secreta del ICS por persona).

**Vínculos**: filas de `relaciones` (§19) con `origen='tarea:N'|'evento:N'`, `tipo='vinculo'`,
`fuente='manual'` y destino con el identificador del mapa (`doc`, `pl`, `sr`, `persona`, `inst`,
`foto`, `pedido`, `entrada`, `tarea`, `evento`). `backend/app/servicios/tareas.py` los pone (`poner_vinculos`),
los resuelve a texto (`etiquetas_de`) y filtra por entidad (`origenes_con`). La web busca qué
vincular con `GET /api/referencias/buscar` (el mismo buscador de las citas).

**Reglas puras** (pruebas sin BD): `backend/app/servicios/tareas_reglas.py` (alta rápida en lenguaje natural,
plazos, vistas, plantillas genéricas; `backend/tests/test_tareas.py`), `backend/app/servicios/agenda_reglas.py`
(recurrencia semanal en hora local, choques, ICS de ida y vuelta; `backend/tests/test_agenda.py`),
`backend/app/servicios/superproductivity.py` (respaldo JSON → plan; `backend/tests/test_superproductivity.py`). En la
web, `frontend/src/componentes/tareas/calendario.ts` (`frontend/pruebas/calendario.test.ts`).

**API** (`backend/app/api/tareas.py`, `backend/app/api/agenda.py`; el rol `invitado` solo lee; borrar, quien creó o el
administrador):

- `GET /api/tareas?vista=todas|mias|hoy|vencidas|semana|sin_fecha|hechas&responsable_id=&estado=&lista_id=&entidad=&etiqueta=&q=&cerradas_dias=`,
  `GET /api/tareas/resumen`, `/opciones`, `/{id}` (con comentarios); `POST /api/tareas`,
  `POST /api/tareas/rapida` (`vista_previa`), `POST /api/tareas/desde-plantilla` (`separar`),
  `PATCH /api/tareas/{id}` (parcial; `version`), `POST /{id}/comentarios`, `DELETE /{id}`;
  `POST/PATCH /api/tareas/listas`; `POST /api/tareas/importar/superproductivity?aplicar=` (simula por omisión).
- `GET /api/agenda/eventos?desde=&hasta=&tipo=&usuario_id=&entidad=` (ocurrencias expandidas con
  `clave` `id:fecha` y `choques`), `GET /api/agenda/hoy` (eventos, choques y mis tareas de hoy y
  vencidas), `POST /api/agenda/verificar` (choques de un evento sin guardar), `POST/GET/PUT/DELETE
  /api/agenda/eventos[/{id}]` (`PUT` reemplaza la serie entera; `version`), `POST
  /eventos/{id}/omitir` (una ocurrencia), `GET /api/agenda/exportar.ics` (con sesión), `GET
  /api/agenda.ics?token=` (suscripción, sin sesión; `solo_mias`, `tareas`), `GET/POST/DELETE
  /api/agenda/token`, `POST /api/agenda/importar-ics?aplicar=` (simula; omite UID ya importados y
  los `evento-N@sgdp` propios).
- **Por confirmar** (2026-10-18): `propuesto` y `descartado` son una SOLICITUD
  (`agenda_reglas.SOLICITUD`, `en_calendario`): `_eventos_en` no las trae salvo `con_solicitudes`, así
  que `GET /eventos` (salvo `?con_solicitudes=true`, el botón de agenda del documento), `/hoy`,
  `/verificar`, la programación diaria y el ICS solo ven lo confirmado; `recordatorios_eventos`, solo
  `confirmado`. `GET /api/agenda/por-confirmar` (desde 7 días atrás, con los choques de cada una contra
  lo confirmado; `?descartadas=true`, las de 60 días), `POST /eventos/{id}/confirmar` (también recupera
  una descartada), `/reprogramar` (solo fecha y hora; `version`; un fin sin enviar conserva la
  duración) y `/descartar` (solo lo por confirmar; lo detectado entra en `agenda_descartados`).
  `evento.creado` sale por `tareas.anunciar_evento` solo si el evento está confirmado (al crearlo, al
  confirmarlo o al pasarlo a confirmado por `PUT`; misma clave, sin repetir). `GET /eventos` y `/hoy`
  devuelven `por_confirmar` (cuántas esperan). Entran por confirmar lo detectado, lo propuesto por un
  recibido y lo pegado con «Confirmación» (`agenda_reglas.estado_de_pegado`, también en el chat).
- **Parecidos** (2026-10-18): `tareas_reglas.parecido` (Jaccard de palabras de 4 letras o más, +0,25
  el mismo día; 0 si citan números distintos) para `tareas.evento_parecido` y `tareas.tarea_parecida`
  (abiertas y cerradas de 30 días); `POST /api/agenda/parecido`, `POST /api/tareas/parecida`, y
  `parecida` en la vista previa de `POST /api/tareas/rapida` y en el pegado de tareas.
- **Recurrencia**: días de la semana, cada 1–8 semanas, hasta una fecha, con fechas omitidas; lo
  mensual u otras reglas RRULE se importan como evento único, con aviso.
- **Super Productivity**: importar su respaldo JSON («Exportar datos») es idempotente por
  `externo_id`: subtareas → lista de verificación, proyectos → listas, etiquetas; hechas y archivo
  opcionales; las repeticiones se avisan y se importan una vez. Él lee la agenda por la dirección ICS.
- **Plantillas**: desfases en días desde una fecha de referencia; crean una tarea con lista de
  verificación o una lista con una tarea por paso (`separar`).
- **Choques**: dos ocurrencias activas (no suspendidas ni canceladas, no de todo el día) que se
  superponen; gravedad `alta` si comparten participante o ambas son pleno o comisión.
- **Avisos**: `notificaciones` con `destino='tarea:N'` o `'evento:N'` (sin documento ni proyecto; la
  campana abre `/tareas?abrir=N` o `/agenda?abrir=N`): al asignar responsable, al incluir a alguien
  en un evento, al comentar, al cerrar lo que otro encargó, y `tipo='plazo'` una vez al día por tarea
  que vence en 24 h o venció (`backend/app/servicios/tareas.py` (`bucle`), lanzado en `backend/app/main.py`, cada 15 min).

**Web**: `frontend/src/paginas/Tareas.tsx` (`/tareas`: Mis tareas con `?mis=pendientes|prioritarias|hechas`,
tablero con Todas · Internas · Externas y la columna «Por confirmar»; las automáticas del trámite al final por paso
con título corto; `frontend/src/componentes/tareas/organizar.ts`, probado en `frontend/pruebas/organizar.test.ts`; `?ver=hoy|tablero|todas|hechas`,
`?abrir=`, `?nueva=1` con `vinculo=` o `entrada=`, `?lista=`, `?entidad=`) y `frontend/src/paginas/Agenda.tsx`
(`/agenda`: `?vista=mes|semana|dia|por_confirmar&fecha=`, `?nuevo=1`; `PorConfirmar.tsx` al lado del
calendario desde 1200 px), componentes en `frontend/src/componentes/tareas/`
(alta rápida con aviso de parecida, `AvisoParecido.tsx`, fila, tablero con arrastre HTML5 y «Mover a…» en el celular, calendario hecho con MUI,
fichas de tarea y evento, plantillas, importar, suscripción, `PanelHoy` del Inicio y
`BotonCrearTarea`, puesto en el visor de documentos y en la tarjeta de persona del directorio).

## 22. Semana de representación: pedidos y fotos

Por qué se ordenan así, en `docs/decisiones.md` §Semana de representación (2026-10-06).

- **Pedidos**: la vista principal agrupa por **paso**, deducido de los cuatro estados del generador
  (`config.ESTADOS_PEDIDO`) y del oficio enlazado: por derivar (sin oficio) → oficio en preparación
  (enlazado y aún no enviado, según el estado del documento) → esperando respuesta → respondido →
  cerrado; dentro, por **institución principal** (la primera entidad competente, la que `derivar` pone
  de destinatario) y luego urgente → alta → ordinaria y plazo. Un pedido aparece una sola vez; sus demás
  entidades se ven en la tarjeta. Otras vistas, recordadas por navegador: institución, actividad (día
  por día), lugar (provincia → distrito, de la actividad) y tabla. Los filtros (prioridad, responsable,
  institución, distrito, sin oficio, vencidos) valen en todas y los contadores de paso cuentan sobre
  ellos. Cada tarjeta lleva su acción principal (generar oficio, abrir oficio, respondido, cerrar) y en
  «⋯» el estado y la asignación (equipo de `/api/admin/equipo`).
- **Fotos**: agrupadas por día → actividad (plegables, recordado por semana); la primera elegida de
  cada actividad va en su ficha y las del día, en su galería. La cuadrícula justificada es
  `filasJustificadas` de `frontend/src/componentes/fototeca/Cuadricula.tsx`; el visor es propio porque
  edita la fila que lee el generador (pie, actividad, estado, selección, recorte). Los cambios de varias
  fotos van en una petición (`POST /api/semanas/{id}/fotos-lote`, claves permitidas, sin pisar las
  demás): elegir una «por revisar» la hace pública y marcarla reservada la saca del informe. Las
  relaciones con pedidos e instituciones se guardan en la propia foto (`pedidos`, `instituciones`: van a
  `fotos.yaml`, el generador no las lee) y el vínculo con la Fototeca, en `fototeca_id` y en los
  vínculos de la Fototeca. `POST …/fotos-ordenar` fija el orden del informe (las elegidas delante, en el
  orden pedido; el resto conserva el suyo). Al PDF llegan solo las públicas y elegidas, con la franja de
  recorte de las verticales, que el visor muestra.

## 23. Pegar el resultado de un prompt

El mecanismo común (2026-10-11/12; decisión en `docs/decisiones.md` §Pegar resultado; diseño en
`docs/plataforma/propuesta-automatizacion.md` §3). La persona usa el prompt institucional con la IA
que prefiera y pega el resultado; el SGDP no llama a ningún modelo («ficha por reglas, sin IA»).

- **Contrato**: un bloque `yaml` con `tipo:` y `version:` como primeras claves, una clave por
  línea, `null` para lo desconocido. Esquemas en `backend/app/esquemas/pegado/<tipo>.yml`
  (`documento-recibido`, `agenda-actividades`, `seguimiento-documento`, `registro-representacion`,
  `proyecto-de-ley`, `documento-administrativo`): claves, tipo de dato, vocabulario con sinónimos,
  `destino` (campo del formulario), `anexar_a`, `cruza`. Los prompts del repo `prompts` los declaran
  en `consumidores:` y en `prompts/docs/arquitectura.md` §6; cambiar una clave sube `version` en los dos.
- **Servicio puro** `backend/app/servicios/pegado/`: `interpretar` (bloque YAML o, de transición, el
  mensaje con rótulos que lee `entradas.leer_resumen`), `validar` (tipos, fechas en cualquier forma,
  opciones por sinónimo, obligatorios, `dudas`), `asignar` (destinos, anexos, informativos) y `comparar`
  (`nuevo` · `igual` · `distinto` · `dudoso` por campo). Pruebas: `backend/tests/test_pegado.py`.
- **Un endpoint por módulo, solo vista previa**: `POST /api/entradas/pegar` (remitente contra el
  directorio, duplicado por STD, documento citado, evento parecido), `POST /api/agenda/pegar` (evento
  listo, parecido, choques, participantes del equipo), `POST /api/documentos/{id}/pegar-seguimiento`
  (+ `/aplicar-seguimiento`, que sí escribe en una transacción), `POST /api/semanas/{id}/pegar`;
  `backend/app/api/pegar.py` da `/formatos`, `/interpretar` (sin cruces), `/registrar` (constancia) e
  `/historial`. **El guardado va por el endpoint que el módulo ya tiene.**
- **Web**: `frontend/src/componentes/PegarResultado.tsx` (tabla de diferencias con aceptación por fila;
  tarjetas en celular) y los diálogos `DialogoPegarAgenda`, `DialogoPegarSeguimiento`, `DialogoPegarSemana`;
  lógica pura en `frontend/src/pegado.ts` (prueba `frontend/pruebas/pegar.test.ts`).
- **Una duda se confirma, nunca se fuerza** (2026-10-18, `documento-recibido` version 2): el bloque trae
  `categoria` con `categoria_confianza` y `categoria_alternativas`; con confianza baja (o una categoría
  fuera del vocabulario) el endpoint pone la duda en `lectura.dudas[categoria]` con las opciones (la
  propuesta, sus alternativas y el resto del vocabulario) y la fila sale «dudoso» con un selector en
  `PegarResultado`; la ficha queda `requiere_revision` hasta que alguien elija. El n.º STD duplicado
  también va como duda con su opción (antes bloqueaba «Aplicar»). `relacion` (nuevo · respuesta ·
  actualización · continuación) se anexa a la nota; `expediente` y `reunion` solo cruzan: el oficio propio
  con ese expediente o registro STD (`_documento_por_expediente`) y la actividad parecida de la Agenda
  (`_reunion_parecida`, por fecha si la trae y, si no, por título entre los últimos y próximos 90 días),
  que se muestran como propuestas. El vínculo «responde a» viaja en `campos.responde_a_documento_id` y se
  guarda al registrar. `cruza:` del esquema sigue siendo documentación: los cruces viven en
  `pegar` de `backend/app/api/entradas.py`.
- **Trazabilidad**: tabla `pegados` (texto íntegro, propuesto, aplicado, rechazado, entidad, quién);
  `entradas.origen_campos` (`documento` · `pegado` · `persona`); las actuaciones de origen `pegado` no
  cuentan hasta que alguien las confirma; el estado de un documento nunca lo cambia un pegado.

## 24. Eventos del sistema y reglas

(2026-10-12, fase 7; `backend/app/servicios/eventos_sistema.py`.) Un módulo que hace algo relevante llama a
`emitir_seguro(sesion, nombre, entidad, datos, clave, usuario)` dentro de su transacción. La fila de
`eventos_sistema` lleva una `clave` única (`entrada:12:asignada:3`): el mismo hecho nunca produce dos
acciones. Las reglas activas de `reglas_evento` para ese nombre se aplican en el acto: `condicion`
(`{campo: valor | [valores]}` sobre `datos`, sin tildes), `accion` (`notificar` a la campana, `tarea`,
`publicar` en un canal del chat), `destino` (`responsable`, `autor`, `equipo`, `administradores`,
`rol:<rol>`, `usuario:N`, `canal:<id|clave>`), `texto` (plantilla con `{campos}`). Vocabulario de 15
eventos en `VOCABULARIO`; reglas de fábrica sembradas una vez (`ajustes.reglas_evento_fabrica`); todo se
apaga en Administración → Reglas (`/api/reglas`). Los avisos que cada módulo ya daba a mano no se
migraron (decisión del 2026-10-12): las reglas añaden lo configurable. Una regla rota no tumba al
módulo (se anota en `acciones`). Emiten hoy: recibidos (registrada, asignada, vencida, respondida),
documentos (numerado, estado, actuación), agenda (creado, recordatorio), tareas (asignada) y Semana
(pedido derivado). Tablas `actuaciones` (seguimiento) y recordatorios de eventos (`agenda_eventos.recordatorio_*`,
bucle de `backend/app/servicios/tareas.py` cada 15 min) entraron en la misma fase.

## 25. Chat institucional

(2026-10-12, fase 8; `backend/app/modelos_chat.py`, `backend/app/servicios/chat.py`, `backend/app/servicios/difusor.py`, `backend/app/api/chat.py`.)

- **Modelo**: `canales` (`directo` de dos personas, `grupo` privado por membresía, `tema` abierto al
  equipo; un tema puede ligarse a una entidad `pl:3`, `sr:2`, `comision:<clave>` y colgar de un `padre_id`),
  `canal_miembros` (papel, `ultimo_leido_id`, silencio), `mensajes` (hilo por `padre_id`, menciones,
  `entidad` que presenta, `evento_sistema_id` si lo publicó una regla, `acciones`, editado y eliminado:
  nada se borra), `mensaje_archivos` (referencia a lo que entró por Recibidos o la Fototeca).
  Búsqueda por `to_tsvector('spanish')`.
- **Permisos**: los del sistema. Tema de equipo: lo leen y escriben todos (los módulos no se asignan
  por rol); grupo y directo: sus miembros; `invitado` no entra; archivar y administrar temas, el
  administrador. La guarda vive en el servidor (`puede_leer`, `puede_escribir`).
- **Transporte**: REST es la verdad (`/api/chat/canales`, `/mensajes` con `antes_id` y `desde_id`,
  `/leido`, `/buscar`, `/directo/{uid}`, `/entidad`, `/no-leidos`); el WebSocket `/api/chat/ws?token=`
  (JWT de la sesión) reparte en vivo lo que publica `difusor.publicar` (en proceso, sin Redis: la API
  corre en un solo proceso, como la presencia) y lleva también los avisos de la campana
  (`notificaciones.crear` → `{tipo: 'aviso'}`); sin socket, la web sondea. Hocuspocus sigue solo para
  la edición simultánea.
- **Canales temáticos automáticos**: la acción `publicar` de una regla (§24) escribe en `canal:<clave>`
  un mensaje del sistema con el texto de la plantilla, la `entidad` y la acción «Abrir». Siete canales
  de fábrica (`general`, `recibidos`, `documentos`, `agenda`, `proyectos`, `representacion`, `prensa`),
  sembrados una vez.
- **Encuestas, notas de voz, tareas y agenda desde el chat** (2026-10-12, fase 9.6):
  - *Encuestas*: `encuestas` (ligada a UN mensaje, cuyo texto es la pregunta: se busca y se ve en la
    lista como cualquier otro; `opciones` de 2 a 10, `multiple`, `anonima`, `cierra_en`, `cerrada`) y
    `encuesta_votos` (`encuesta_id`, `usuario_id`, `opcion`). `POST /canales/{id}/encuestas` crea el
    mensaje sin difundirlo (`publicar(..., difundir=False)`) y lo difunde ya con su encuesta;
    `POST|DELETE /encuestas/{id}/voto` vota o quita (tocar la propia la quita; en respuesta única, tocar
    otra la cambia: `aplicar_voto`); `POST /encuestas/{id}/cerrar`, quien la creó o administra el canal.
    `cierra_en` cierra sola al pasar la hora (se evalúa al leer y al votar, sin temporizador). Los votos
    guardan quién votó aunque sea anónima (para poder quitarlo), pero la API no lo expone. Los
    resultados se difunden PERSONA POR PERSONA (`{tipo: 'encuesta'}`), porque cada una trae su «mía».
    Una encuesta no se edita (422). Reglas puras en `backend/tests/test_chat_encuestas.py`.
  - *Notas de voz*: son un archivo más del endpoint de adjuntos. La web graba con `MediaRecorder`
    (webm/opus; mp4/aac en Safari de iOS) y nombra `nota-de-voz-AAAAMMDD-HHMMSS.<ext>`
    (`es_nota_de_voz`). El webm de MediaRecorder no trae duración ni índice (el navegador muestra
    «Infinity» y no adelanta): al subir, si hay ffmpeg, se reempaqueta sin recodificar (`-c copy`) y
    `ffprobe` mide la duración (`mensaje_archivos.duracion_ms`, `ALTER` en `main.py`); sin ffmpeg
    queda la que midió el navegador (`duracion_ms` del formulario). Se sirve por `enviar_archivo` como
    `audio/*` con rangos (206), y no ofrece «Guardar en la Mediateca». La web la baja autenticada al
    primer play y la reproduce desde un `blob:` (adelantar no depende de los rangos).
  - *Tareas y agenda*: el «+» de la caja abre la entrada doble de siempre (`ElegirEntrada`, formatos
    `plan-de-tareas` y `agenda-actividades`): lo manual reusa `DialogoTarea` y `DialogoEvento`; el
    prompt de agenda abre «Pegar actividades» en el mismo chat y el de tareas va a
    `/tareas?nueva=1&prompt=1`. El modelo de tareas no vincula canales ni mensajes: lo creado nace
    vinculado a la entidad del canal si la tiene (`pl:3`, `doc:95`…). Al crear, `POST
    /canales/{id}/anunciar` (`entidad` `tarea:N` | `evento:N`, solo quien la creó) publica la tarjeta
    del sistema con el texto que arma el servidor desde la base («Tarea creada: … · vence …»).
  - *Bloque pegado*: el chat lo reconoce al enviar (§23, `RUTA_MODULO`) y, antes, la web avisa sobre la
    caja con la misma tabla (`mensajes.ts::FORMATOS_PEGADO`); ambas pruebas comprueban que cubran todos
    los `esquemas/pegado/*.yml`. El plan de tareas (`EN_EL_CHAT`) no se crea a ciegas: su resumen
    («2 tarea(s): …») trae UNA acción, «Registrar en Tareas» (`accion: 'pegar_tareas'`), que abre
    «Pegar tareas» en el mismo chat con el texto del mensaje para casar responsables y plazos; al
    registrar, cada tarea se anuncia con `de_mensaje`, que le quita el botón a la contestación para todos.
- **Un canal por clave** (2026-10-12): índice único parcial `canales_clase_clave_unica` sobre
  `(clase, clave)` donde `clave <> ''` (main.py; antes de crearlo, los repetidos se fusionan en el más
  viejo: mensajes e integrantes pasan a él y el repetido queda archivado como `…#dup<id>`).
  `canal_directo` toma además un candado por clave (`pg_advisory_xact_lock`), así que `POST
  /directo/{uid}` es idempotente con dos pestañas o con el efecto doble de StrictMode; la web
  comparte la petición en curso (`Chat.tsx::abrirDirecto`).
- **Avisos, visto y temas** (2026-10-13; pedidos de Edison desde el celular):
  - *Web Push* (decisión 8.8, `backend/app/servicios/push.py`, `backend/app/api/push.py`, tabla `suscripciones_push`
    por persona y dispositivo): claves VAPID del entorno (`VAPID_PUBLICA`, `VAPID_PRIVADA`,
    `VAPID_CONTACTO`) o generadas la primera vez y guardadas en `ajustes.webpush_vapid` con la privada
    cifrada por la bóveda; envío con `pywebpush` en un hilo y en segundo plano; 404/410 (o 5 fallos)
    borran la suscripción. Quién recibe: `push.destinatarios_chat` (directo y grupo, sus integrantes no
    silenciados; tema, quienes ya están en él y solo si escribe una persona; una mención atraviesa el
    silencio) y, de la campana, todo aviso salvo `chat`/`mencion` (los manda el chat). La pestaña dice
    por el socket qué mira (`{tipo:'viendo', canal_id, visible}` → `difusor.a_la_vista`/`viendo`): con
    el SGDP a la vista no hay push, llega `{tipo:'alerta'}` y suena dentro; con la conversación abierta,
    nada. `frontend/public/sw.js` §2 muestra el aviso (etiqueta `chat-<canal>` que cuenta «· N
    mensajes», vibración propia, ícono e insignia de `frontend/public/notificaciones/`), manda el acuse firmado
    (`POST /api/push/recibido`, HMAC con `JWT_SECRET`; sin sesión) y al tocarlo enfoca la ventana
    (`postMessage sgdp:abrir`, la ruta la sigue `ContadorChat`) o abre una. Exige https (el Funnel).
    **Límite**: el SONIDO de una notificación lo decide el sistema operativo (en Android, el canal de
    notificaciones de Chrome); la Web no fija uno propio por aviso. Al cerrar sesión la suscripción
    sigue (una sesión que caduca no debe apagar los avisos del celular); si otra persona entra en el
    mismo navegador, `resincronizarAvisos` la pasa a ella.
  - *Visto y leído*: `canal_miembros.ultimo_recibido_id` junto a `ultimo_leido_id` (dos números por
    integrante y canal, sin fila por mensaje). Sube al difundir a quien tiene socket, al pedir la lista o
    el contador (`_llego_la_lista`) y con el acuse del push; `/leido` sube los dos. Los cambios viajan
    como `{tipo:'lecturas', cambios}` a los integrantes; la web (`frontend/src/componentes/chat/entrega.ts`) pinta ✓,
    ✓✓ o ✓✓ en `PALETA.info` (en grupo, el del más atrasado) e «Info del mensaje» (`DialogoLecturas`).
  - *Sonidos propios* (`frontend/src/componentes/chat/sonidos.ts`): sintetizados con Web Audio, sin archivos: «plop» al
    enviar, firma la5→fa♯6 al llegar (`alerta`), tres notas si es mención; con la pestaña oculta suenan
    solo si el dispositivo no tiene push; una vez aunque haya dos pestañas; interruptor en Mi perfil.
  - *Tarjetas del sistema*: `mensajes.tarjeta` ({que, icono, titulo, detalle, meta}) la arma
    `tarjeta_de` (`backend/app/servicios/chat.py`) desde el evento (o desde el texto de un anuncio); lo viejo se arma al
    leer (`_tarjetas_viejas`). La web (`TarjetaSistema.tsx`) muestra una línea de qué pasó, el número una
    sola vez, el asunto en dos líneas con «ver más» y una sola acción; el día queda fijo arriba al recorrer.
  - *Temas por sección* (`canales.categoria`, `CATEGORIA_FABRICA`, `entrega.ts::agruparTemas`): secciones
    plegables con contador. Temas de fábrica nuevos, con su regla: Documentos listos (FIRMADO), Documentos
    enviados (ENVIADO), Seguimiento de documentos (`documento.actuacion`), Borradores y revisión
    (EN_REVISION/OBSERVADO), Pleno (evento tipo `pleno`), Noticias (piezas `noticia_*`), Programación del
    día (evento `agenda.programacion_diaria`, `backend/app/servicios/programacion.py`, desde las 7:00); sin regla:
    Reuniones y acuerdos, Fotos y videos, Atención ciudadana. Al sembrarlos, la regla vieja de
    firmado/enviado en Documentos se apaga y la de Prensa deja las noticias (`_ordenar_reglas_viejas`, solo
    si siguen como vinieron). Lo propio del despacho (bancada, grupo parlamentario, programa de radio,
    Denuncias) se siembra con `chat.temas_propios`, con el nombre del `.env` (2026-10-18).
  - *Mensajes escritos como el equipo* (2026-10-18): `publicar_por_regla` pide el texto a
    `redaccion_chat.componer(sesion, evento, entidad, datos)`, que lee la entidad vigente y arma el formato
    de Telegram (Comunicado, Agenda, Estado del expediente y el mismo estilo para el resto). La tarjeta
    lleva `estilo: 'mensaje'` y `firma`; la web la pinta como burbuja ajena (`Burbuja.tsx`,
    `mensajes.ts::esMensajeHumano`, `trozosConFormato` para la `*negrita*`). Si la regla tiene un texto distinto
    del de fábrica, se usa su plantilla (`chat.usa_redaccion`). El puente de Telegram manda el mismo texto.
    El pegado de seguimiento emite `documento.seguimiento` con la situación (`AplicarSeguimiento.situacion`
    o `pegado.campos_propuestos`). Lo publicado antes se reescribió una vez al arrancar (`chat.redactar_avisos_viejos`,
    ajuste `chat_avisos_redactados`; la regla de cada mensaje se lee de `eventos_sistema.acciones`); el
    anuncio de una tarea o actividad creada en el chat usa `redaccion_chat.anuncio`. La web pinta cada línea
    con la marca en su columna y sangría colgante (`mensajes.ts::lineasOrdenadas`, `Burbuja.tsx::TextoOrdenado`).
- **Enlaces, imágenes y mensajes que se ponen al día** (2026-10-18, pedidos de Edison):
  - *Enlaces*: `mensajes.ts::trozosConFormato` extrae las direcciones web antes de la negrita y las
    menciones (una «@» dentro de la dirección no es mención; la puntuación final vuelve al texto,
    `recortarEnlace`; «www.» abre con https, `hrefDe`); `Burbuja.tsx::Trozos` las pinta como `<a
    target=_blank rel=noopener>` deteniendo los gestos de la burbuja. El bloque `tipo: …` no pasa por ahí.
  - *Una imagen es conversación*: `acciones_de_archivo(archivo, con_bloque_recibido)` ofrece «Guardar en
    la Mediateca» para las imágenes (jpg, png, webp); «Registrar en Mesa de Partes» solo para PDF y Word, o para la
    imagen de un mensaje que trae el bloque `documento-recibido` (`trae_bloque_recibido`). Al registrar,
    manda la acción que el mensaje ofreció para ese archivo.
  - *Pegar, arrastrar y anotar antes de enviar*: `CajaMensaje` toma las imágenes del portapapeles
    (`onPaste`), del arrastre (`onDrop`) y del selector, y las deja en una tira de pendientes
    (`imagenesDeTransferencia` les da nombre `captura-AAAAMMDD-HHMMSS.png` si venían sin él); un toque
    abre `frontend/src/componentes/chat/EditorImagen.tsx` (canvas 2D nativo: lápiz, resaltador, flecha, recuadro, texto, recorte,
    cinco colores, deshacer → PNG nuevo); «Enviar» las sube con el texto como pie (`subir(archivos,
    {texto})`). Lo que no es imagen sigue subiendo al instante.
  - *Mensajes vivos*: `chat.refrescar_mensajes_de(sesion, entidad)` recompone los mensajes del sistema
    (`autor_id` nulo, `tarjeta.estilo == 'mensaje'`) de esa entidad desde su evento
    (`redaccion_chat.componer` con la fecha de entonces) o su anuncio, respeta la regla con texto propio,
    pone `tarjeta.actualizado_en` («· actualizado» en la web, no «editado») y difunde `mensaje_editado`
    (la web lo funde en vivo). Lo llama `etiquetas.propagar` para TODA entidad (§27) y, por él, los
    `PUT`/`reprogramar`/`descartar` de la agenda, el `PATCH` de tareas y el `PUT` de recibidos. Un hecho,
    un mensaje: nunca se publica otro por el cambio. La difusión ocurre antes del commit de quien cambió la
    entidad (como el resto de ediciones internas del chat).
- **Pendiente** (hoja de ruta 8.6–8.9): la «Conversación» del proyecto de ley como su canal, el puente
  con Telegram y la importación del historial, el piloto con el equipo (y probar el push en los
  celulares del equipo por el enlace del Funnel).

## 26. Perfil de la persona y tarjeta de contacto

Pedido de Edison (2026-10-12): «que los usuarios tengan un perfil donde puedan actualizar sus datos
del sistema, como en Telegram o WhatsApp». Va unido al chat (§25).

- **Datos**: `usuarios.telefono` (celular peruano de 9 dígitos, sin +51), `usuarios.foto` (ruta
  relativa a la raíz documental, `chat/perfiles/u<id>-<sha8>.jpg`) y `usuarios.acerca` («Info», una
  línea de 140 como mucho), por `ALTER … ADD COLUMN IF NOT EXISTS` en `main.py`. Las reglas puras
  (DNI, correo, celular, «Info», cargos por rol, qué ve cada quien, el recorte de la foto) viven en
  `backend/app/servicios/perfil.py`; la API, en `backend/app/api/perfil.py`; las pruebas, en `backend/tests/test_perfil.py`.
- **La propia persona** (`GET|PUT /api/cuenta/perfil`): edita nombres, apellidos, DNI, correo,
  celular, cargo e «Info»; lo que no viaja en el `PUT` no se toca. `nombre_completo` sigue siendo
  «nombres apellidos» y `cuentas.sincronizar_persona` lleva nombre, cargo, correo y celular a su
  ficha del directorio. El **rol** se muestra pero no se edita aquí (sigue en
  `PATCH /api/admin/usuarios/{id}`); el **cargo** solo se elige entre los de su mismo rol
  (`cargos_permitidos`), para que cambiarlo no dé ni quite permisos. La contraseña no pasa por aquí
  (`POST /api/auth/clave`).
- **La foto**: `POST /api/cuenta/foto` (multipart `archivo`, 15 MB como mucho) gira según el EXIF,
  recorta al centro y guarda un JPEG de 512 px (Pillow; HEIC si hay `pillow-heif`); el nombre lleva el
  hash, así que cada foto es una versión nueva y la anterior se borra. `DELETE /api/cuenta/foto` la
  quita. `GET /api/usuarios/{id}/foto` la sirve por `enviar_archivo` (ETag/304) y
  `GET /api/usuarios/fotos` devuelve `{id: versión}` de quien tiene foto: la web lo pide una vez cada
  5 minutos (`frontend/src/componentes/perfil/fotos.ts`) y baja cada imagen una sola vez por versión, de modo que
  los avatares del chat (`AvatarPersona`) no obligan a tocar la API del chat.
- **La tarjeta** (`GET /api/usuarios/{id}/perfil`, función `tarjeta` de `backend/app/servicios/perfil.py`): nombre, cargo,
  rol, «Info», foto, presencia («en línea» o la última actividad, `backend/app/servicios/presencia.py`), correo, celular y el
  enlace de WhatsApp. El DNI solo va a la propia persona y a quien administra; a un invitado, la
  tarjeta llega sin correo ni celular (`con_contacto: false`); `puede_chatear` es falso con un
  invitado, una cuenta desactivada o uno mismo. La web la abre con `abrirTarjeta(id)` desde el chat y
  la lista «en línea»; `TarjetaContacto` está montada una sola vez en el `Marco` (hoja inferior en el
  celular, diálogo en escritorio, por encima de otros diálogos). «Mensaje» llama una vez a
  `POST /api/chat/directo/{uid}` y entra al canal.
- **Web**: `/perfil` (`frontend/src/paginas/Perfil.tsx`) es un sitio de la cuenta, no un módulo: en
  `navegacion.ts` figura como `cuenta` con `oculto: true` (no sale en Inicio ni en el cajón). El
  panel de administración ve y edita también celular e «Info» (`PATCH /api/admin/usuarios/{id}`
  acepta `celular` y `acerca`, con las mismas reglas).

## 27. Lo vinculado se muestra vigente

Pedido de Edison del 2026-10-12: «todo está vinculado y nada está suelto; cuando actualice algo, se
actualiza lo vinculado», como en una hoja de cálculo. Rige en todo el sistema.

**La regla.** Lo que no es un documento oficial guarda la CLAVE de lo que nombra (`doc:12`,
`entrada:7`, `pl:3`, `sr:2`, `persona:5`, `inst:4` o `institucion:4`, `usuario:1`, `tarea:9`,
`evento:8`, `pedido:6`, `foto:3`) y se muestra con el valor VIGENTE de esa entidad.

- **Al leer**: un solo resolvedor, `backend/app/servicios/etiquetas.py`. `etiquetas_de(claves)`
  devuelve la etiqueta larga («Oficio N° 0012-… — Asunto», «Recibido: … — asunto», «Nombre
  (cargo)»); `cortas_de(claves)`, el código («OF-0012», el código del proyecto, «SR-02»). Lo usan
  los vínculos de tareas y eventos (`etiquetas_de` de `backend/app/servicios/tareas.py` delega en él), las tarjetas y
  los canales del chat (`entidad_etiqueta`), la línea de abajo de cada aviso de la campana (el texto
  del aviso es historia; lo vinculado, vigente), `relaciones.de_origen` (`etiqueta`) y los vínculos
  de la fototeca. Un recibido vinculado al directorio muestra el nombre y el cargo de hoy de su
  remitente (`remitente_vigente`; lo registrado queda en `remitente_registrado`). Los participantes
  de un evento ya se resolvían así (`participantes_de`).
- **Al cambiar**: lo que sí guarda una copia se RECOMPONE desde la entidad. Hoy, de un documento:
  el título, la descripción y (si nadie lo tocó) el lugar de sus eventos detectados, y el título de
  sus tareas automáticas («Firmar y subir el firmado de <número> · <asunto>»). `etiquetas.propagar`
  lo hace; lo llaman la sincronización de la agenda en cada guardado y generación
  (`agenda_detectada.sincronizar_documento`) y `eventos_sistema.emitir_seguro` tras
  `documento.numerado` y `documento.estado` (`PROPAGAN`). Se recompone solo la parte que el sistema
  escribió (el paréntesis con la etiqueta de un documento; el verbo seguido del número): lo que una
  persona reescribió se respeta. Los cambios del sistema no suben `version`, que dice «lo tocó una
  persona». Desde 2026-10-18 `propagar` acepta cualquier entidad (`evento:`, `tarea:`, `entrada:`,
  `doc:`…) y termina poniendo al día los mensajes del chat que la presentan (`chat.refrescar_mensajes_de`,
  §25); los endpoints que cambian un evento, una tarea o un recibido lo llaman antes de su commit.

**El límite.** El contenido de un documento oficial (numerado, firmado, enviado) y lo ya impreso no
cambian porque cambie el directorio: son historia oficial y el SGDP no los modifica en silencio. En
un BORRADOR, la revisión antes de numerar (`segun_directorio` de `backend/app/servicios/verificacion.py`, diálogo
`DialogoVerificacion.tsx`) OFRECE al lado de cada dato lo que el directorio dice hoy del destinatario
(nombre, cargo) y de cada copia (cargo) —«El directorio dice hoy: … Usar»—, sin aplicarlo solo. La
búsqueda es por nombre exacto sin tildes; si hay homónimos con datos distintos, no se adivina.

**La cuenta y su ficha.** La cuenta manda en su persona del directorio (nombre, cargo, correo,
celular, activo): `cuentas.sincronizar_persona` corre al guardar Mi perfil y en Administración. El
otro sentido no la pisa en silencio: editar esos campos desde el directorio responde 409 y dice dónde
se cambian (`cuentas.conflictos_con_cuenta`); el resto de la ficha (oficina, anexo, área…) se edita
libremente.

**La agenda detectada, sin duplicados.** Una actividad por documento y día: si el texto cambia la
hora, el propuesto que nadie tocó se mueve (no se crea otro). Dos documentos que anuncian la misma
actividad (mismo día, hora y nombre) quedan vinculados a un solo evento. Al eliminar un documento,
sus propuestos que nadie tocó se van con él (si otro documento vivo anuncia lo mismo, pasan a ese);
lo confirmado queda. Borrar un evento detectado lo descarta para todos los documentos vinculados.
`agenda_detectada.reconciliar` (al arrancar y en cada vuelta de `tareas.bucle`, idempotente)
fusiona lo ya guardado según `plan_fusion` —mismo origen y día; un origen que ya no existe y otro
evento del mismo día, hora y nombre; dos documentos vivos con el mismo día, hora y nombre—: queda el
que una persona trabajó, se juntan vínculos, participantes con su respuesta de asistencia, avisos y
tarjetas del chat, retira los propuestos huérfanos y pone la etiqueta vigente. El caso que lo
originó: un oficio se eliminó y se rehízo, y su visita del viernes salía dos veces.

**Pendiente** (en `docs/decisiones.md` cuando se decida): el destinatario del documento no guarda
la clave de la persona elegida (`FormularioCampos.elegir` la tiene en memoria y no la envía), así
que la oferta del directorio cruza por nombre; el título de las tareas automáticas de un recibido y
el nombre de los canales de proyecto aún se copian al crearse.

## 28. Mesa de partes virtual

Recibidos crece a una **mesa de partes virtual** del despacho (Edison 2026-10-12): una persona, una
institución o una empresa presenta un documento desde `/mesa-de-partes`, **sin cuenta**, recibe su
cargo y sigue su trámite. Todo lo que llega es una `Entrada` de Recibidos con `via='mesa_virtual'`
y el equipo la procesa con lo que ya existe (responder, agendar, crear tarea, pegar el resultado del
prompt, vincular); la mesa solo añade el remitente identificado, los archivos con su huella, el
estado **público** y su historia. Código: `backend/app/modelos_mesa.py`,
`backend/app/servicios/mesa_virtual.py` (puras y base), `backend/app/servicios/cargo_pdf.py`,
`backend/app/api/mesa_publica.py` (pública), `backend/app/api/mesa_virtual.py` (equipo),
`frontend/src/paginas/MesaVirtual.tsx`, `frontend/src/componentes/mesa/`,
`frontend/src/componentes/entradas/PanelMesaVirtual.tsx` y `frontend/src/componentes/AdminMesaVirtual.tsx`.
Pruebas puras: `backend/tests/test_mesa_virtual.py`, `frontend/pruebas/mesaVirtual.test.ts`.

**Modelo.** `mesa_tramites` (uno por presentación: expediente correlativo `MPV-AAAA-NNNNN` para el
cargo —candado consultivo por año, único (anio, correlativo)— y **código de seguimiento** aleatorio
`XXXX-XXXX-XXXX`, 12 símbolos de un alfabeto de 31 sin 0/O/1/I/L, ~59 bits, nunca correlativo; el
remitente; el documento; `recibido_en` y `presentado_el`; la declaración aceptada; el estado público;
la observación vigente y su plazo; la IP), `mesa_archivos` (principal, anexo, subsanación, respuesta;
ruta relativa a la raíz documental, nombre original saneado solo para mostrar, tipo por firma de
bytes, páginas, SHA-256), `mesa_movimientos` (la historia; `publico` dice si la ve el remitente) y
`mesa_auditoria` (cada envío, consulta, descarga y rechazo de la página pública, con IP y navegador).
Los archivos viven en `<raíz documental>/recibidos/entradas/mesa-virtual/AAAA-MM/<expediente>/`; la
`Entrada` apunta al principal. Si ese PDF ya estaba registrado, la entrada se crea igual (se recibe
todo) con una huella derivada, porque `entradas.sha256` es única. La configuración vive en `ajustes`
(clave `mesa_virtual`): nombre en el cargo, presentación, horario y
días de atención, días no hábiles propios, plazo de subsanación, límites de tamaño, anexos y envíos,
tipos de documento y enlace público. Encenderla o apagarla, y el mensaje que muestra apagada, es del
registro de módulos (§33).

**Estados públicos y su reflejo en Recibidos.** Recibido (entrada nueva) → En revisión (al asignar
responsable o a mano) → Observado (motivo y plazo) → subsanado: vuelve a En revisión → Derivado / En
atención → Atendido (con la respuesta; la entrada pasa a respondida) | Archivado (la entrada se
archiva). Archivar o reabrir desde Recibidos también lo dice en el seguimiento público
(`_mesa_sigue` de `backend/app/api/entradas.py`). Atender con un documento propio exige que esté **firmado o enviado**
(nunca un borrador): se entrega el firmado si lo hay, si no el PDF generado, se copia a la carpeta
del trámite (lo entregado no cambia si se recompila) y queda vinculado como respuesta. Un recibido
nuevo emite `entrada.registrada` (con `via` y `expediente`; avisa en el canal Recibidos como
siempre) y una subsanación emite `entrada.subsanada` (regla de fábrica: canal Recibidos) y avisa a
quien tiene el recibido o, si nadie, a quien administra.

**Días hábiles y horario.** Se recibe las 24 horas. En un día hábil, antes del cierre cuenta ese día
(antes de abrir también: es el primer momento hábil, y el cargo lo marca); después del cierre o en
un día no hábil, el día hábil siguiente. Los plazos en días son hábiles y se cuentan desde el día
hábil siguiente: observar el lunes con 2 días vence el miércoles; el viernes, el martes. No hábiles:
los días fuera del horario semanal, los feriados nacionales y no laborables del sector público
(`backend/app/servicios/feriados.py`) y los que registre el despacho. Una subsanación presentada después del
plazo se recibe y queda marcada «fuera de plazo»: decide el equipo (puede archivar como no presentado).

**Seguridad.** Las rutas sin sesión nuevas son SOLO las seis de `/api/publico/mesa`
(`config`, `enviar`, `seguimiento`, `cargo`, `respuesta`, `subsanar`); `test_mesa_virtual.py` recorre
la aplicación entera y falla si aparece otra ruta sin `usuario_actual` fuera de las públicas ya
conocidas. Lo del equipo (`/api/mesa-virtual`) pide sesión; la configuración, administración.

| ataque | defensa |
|---|---|
| inundar de envíos | límite por IP y por ventana (memoria y base: 5/h y 20/día configurables) y un tope global de 150 al día; 429 con `Retry-After`; con menos de 2 GB libres no se recibe (503) |
| adivinar trámites o probar documentos | código aleatorio de ~59 bits + documento de identidad; misma respuesta (404) exista o no el código, comparación en tiempo constante; 30 consultas y 10 fallidas por IP cada 10-15 min |
| disfrazar la IP | la API escucha solo en 127.0.0.1; el proxy de la web añade la IP de quien le habla a `X-Forwarded-For` (`vite.config.ts`, `configure`) y uvicorn la lee de derecha a izquierda saltando 127.0.0.1: lo que el cliente escriba queda a la izquierda |
| robots | campo trampa invisible (se responde «recibido» sin registrar nada) y ficha firmada del formulario (HMAC) con espera mínima de 3 s y vigencia de 24 h; sin captchas de terceros |
| archivos enormes | sin `Content-Length` no se lee (411); por encima del máximo del envío, 413 antes de leer; al leer, corte por archivo y por envío; número de archivos limitado en el parser |
| archivos disfrazados o dañados | tipo por la firma de bytes (`%PDF-`, JPEG, PNG), no por el nombre; el PDF debe leerlo `pdfinfo` y la imagen abrirla Pillow; el principal solo PDF |
| rutas y nombres maliciosos | el nombre original solo se muestra, saneado; en disco el nombre lo pone el sistema (`01-principal.pdf`); toda ruta se resuelve dentro de la raíz documental |
| descargar lo ajeno | ficha de acceso JWT de 2 horas con clave PROPIA (no sirve como sesión, ni una sesión abre un trámite), en el cuerpo de un POST: ni el documento ni la ficha van en la URL; la respuesta solo si el trámite está atendido |
| cachés | `Cache-Control: no-store`, `nosniff` y `no-referrer` en todo `/api/publico`; el service worker no toca `/api/publico/` ni las descargas son GET; nada del trámite se guarda en el navegador |
| abuso no detectado | `mesa_auditoria` registra envíos, rechazos (con motivo), trampas, límites, consultas y descargas |

Lo que no cubre: si Tailscale Funnel no añade `X-Forwarded-For`, todo lo que entra por internet
comparte una IP (127.0.0.1) y el límite por IP pasa a ser uno común (el tope global sigue); se
comprueba con una petición desde fuera y `mesa_auditoria.ip`. No hay correo: el cargo y el
seguimiento lo dicen.

**Fuentes** (biblioteca del vault, Calibre).
- TUO de la Ley 27444, D.S. 006-2026-JUS (calibre_id 10040), con la numeración del texto vigente:
  art. 117.1 (mesa de partes digital 24 horas, 7 días; Ley 31170), 117.2 y 124.2 (el cargo: número de
  ingreso, naturaleza, fecha, hora, remitente, fojas, documentos acompañados), 123.3 (lo transmitido no
  necesita presentarse en físico), 124.1 (se recibe todo, sin calificar), 125.1 y 125.6 (observar en
  un solo acto, subsanar en 2 días hábiles), 125.4 (sin subsanar, no presentado), 126.1 y 126.2
  (subsanado, vale desde el inicial; no observar dos veces), 133-134 (plazos en días hábiles desde el
  siguiente; último día inhábil se prorroga), 137 (días inhábiles) y 138 (horario de atención). En el
  TUO anterior (D.S. 004-2019-JUS, calibre_id 10043) esos artículos llevaban otra numeración.
- Directiva N.° 07-2022-DGP/CR, Mesa de partes digital del Congreso (calibre_id 10099, leída por OCR):
  datos de persona natural (DNI o CE) y de persona jurídica o entidad (RUC, representante, cargo)
  (5.1.b), datos del trámite: tipo, número opcional, folios, asunto, comentario y PDF (5.2.b),
  código único por registro (5.2.a), estados REGISTRADO / OBSERVADO / ENVIADO (5.2.f, 5.3.d),
  subsanación en 5 días hábiles (5.4; aquí se configura, de fábrica 2 como el TUO), seguimiento en
  línea con detalle de acciones (5.5) e ingreso en días hábiles dentro del horario (4.5).
- Ley 29733, de Protección de Datos Personales: la autorización y el aviso del formulario. No está en
  la biblioteca: se cita por su nombre.

## 29. Contactos del directorio

Pedido de Edison del 2026-10-12 (desde el celular, con capturas de Google Contacts): el directorio
«como Google Contacts y mucho mejor todavía», fácil y nada abrumador. `/directorio` abre ahora los
**contactos** (las personas); instituciones, jerarquía y distritos siguen como pestañas
(`?pestana=instituciones|jerarquia|distritos`; `?pestana=personas`, el nombre de antes, lleva a los
contactos). Código: `frontend/src/componentes/directorio/` (`VistaContactos.tsx` la lista y los filtros,
`FichaContacto.tsx`, `FormularioContacto.tsx`, `ImportarContactos.tsx`, `AvatarContacto.tsx` y la lógica
pura en `contactos.ts`), `backend/app/servicios/contactos.py` (puro: vCard, CSV, duplicados, fusión,
exportación) y las rutas nuevas al final de `backend/app/api/directorio.py`. Pruebas puras:
`backend/tests/test_contactos.py`, `frontend/pruebas/contactos.test.ts`.

**Modelo.** `personas` gana `foto` (ruta relativa a la raíz documental, `directorio/fotos/p<id>-<sha8>.jpg`,
cuadrada de 512 px con la receta de la foto de perfil, `perfil.recortar_foto`) y `etiquetas` (jsonb, lista
de textos: los «grupos» del equipo). `contactos_favoritos (usuario_id, persona_id)`: la estrella es de cada
cuenta. Migración: `ALTER … IF NOT EXISTS` en `main.py`; la tabla nueva, `create_all`.
`resumen_persona` añade `foto` (la versión: el nombre del archivo sin extensión, o vacío) y `etiquetas`;
`GET /personas` añade `usuario_id` (la cuenta del SGDP de esa persona, para «Mensaje» y la regla de §27) y
`favorito` (de quien mira). `PersonaEntrada.etiquetas` es opcional: `None` no las toca, así el autocompletado,
la ficha de la institución y cualquier otro consumidor que reenvía la ficha sin ellas no las borra.

**Rutas nuevas** (todas con sesión; escribir, salvo el favorito, rechaza al invitado):
`PUT /personas/{id}/favorito`, `POST|DELETE|GET /personas/{id}/foto` (la imagen por `enviar_archivo`),
`GET /etiquetas` (con conteo), `POST /etiquetas/renombrar` (`a` vacío la quita de todos),
`POST /contactos/previa` (multipart, 5 MB: lee y cruza, no guarda), `POST /contactos/importar` (lo
confirmado: crear | fusionar | omitir, en una transacción) y `GET /contactos/exportar?ids=&etiqueta=&favoritos=`
(vCard 3.0, `text/vcard`, `no-store`). Lo que ya consumía el directorio no cambia: `GET /personas?q=` sigue
cortando en 50, `?institucion_id=` sin límite, `/sugerencias`, `/destinos`, los organigramas.

**Importar.** `leer_archivo` decide por el contenido: vCard 2.1/3.0/4.0 (líneas plegadas,
quoted-printable de Android, `itemN.`, escapes, `N` cuando falta `FN`, `CATEGORIES`, `X-STARRED`) o el CSV
de Google (formato nuevo y antiguo, varios valores con « ::: », «Labels»/«Group Membership», la estrella
`* starred` → favorito) y el de Outlook. Un celular peruano queda en 9 dígitos; el primer celular va a
`celular` y el primer otro número a `telefono`. Las etiquetas de sistema de Google (`myContacts`,
`starred`) se descartan. **Duplicados** (`Indice`, una sola regla): mismo celular (últimos 9 dígitos de
celular o teléfono), mismo correo (cualquiera de los dos) o mismo nombre (las palabras ordenadas, sin
tildes, con al menos dos palabras: «Pérez Quispe, Juan» = «Juan Pérez Quispe»), en ese orden; también los
repetidos dentro del mismo archivo. **Fusionar** solo rellena lo vacío (`fusionar`): un segundo celular va
a teléfono, un segundo correo al alterno, las etiquetas se suman y la nota se añade; lo que dicta una cuenta
(`cuentas.dictado_por_cuenta`) no se toca. La organización se busca en el directorio por nombre o siglas
exactos (`institucion_por_nombre`, sin adivinar entre homónimos); si no está, queda en la nota
«Organización: …» (no se crean instituciones a ciegas: el directorio del Estado tiene su procedencia, §
`docs/organigramas.md`). Las fotos de los vCard no se importan.

**La interfaz.** Celular primero (375 y 768 px: lista y ficha a pantalla completa con «atrás»; desde 900 px,
lista y ficha a dos columnas). La dirección guarda lo abierto: `?contacto=ID` (la agenda, el mapa de
relaciones, la ficha de una institución y el aviso del recibido llevan ahí) y `?nuevo=1` (la opción «Nuevo
contacto» del módulo y el acceso del Inicio). Avatares sin foto: inicial sobre un color fijo de la paleta
(vino, dorado oscuro, petróleo, azul marino, azul, verde, gris cálido), sin naranja; con cuenta y sin foto
propia, la foto de perfil. El formulario muestra nombre, celular, correo, institución y cargo, y «Ver más»
para el resto (abierto si la ficha ya tiene algo ahí); el de institución, igual. La ficha de quien tiene
cuenta deja fijos nombre, cargo, correo y celular y dice dónde se cambian (§27).

## 30. Mesa de Partes: el nombre, las 24 horas y el remitente al directorio

Tres pedidos de Edison del 2026-10-12 sobre §20 y §28.

**El nombre.** El módulo «Recibidos» se llama **Mesa de Partes** en toda la interfaz: `navegacion.ts`
(nombre, nombre corto de la barra inferior —en dos líneas a 375 px; la barra alinea los íconos arriba—,
descripción y opciones), Inicio («Mesa de Partes: por atender»), el canal de fábrica del chat (clave
`recibidos`, nombre «Mesa de Partes»), el nombre de sus reglas de fábrica, el botón «Registrar en Mesa de
Partes» de un archivo del chat, el grupo de referencias y los avisos. Para lo que ya existía, `main.py`
renombra el canal y las reglas solo si conservan el nombre de fábrica (lo que alguien renombró se
respeta). «Recibido» sigue como sustantivo del documento («un recibido»); «Mesa virtual» es la insignia y
el filtro de lo que llegó por la página pública. La ruta (`/recibidos`), el id del módulo, la tabla y la
API (`entradas`) no cambian.

**Las 24 horas.** El TUO de la Ley 27444 (art. 117.1, texto de la Ley 31465; calibre_id 10040) fija para la
mesa de partes digital un horario de atención de 24 horas, los 7 días de la semana. La configuración
(`ajustes.mesa_virtual`) gana `horario.continua`, **verdadero de fábrica**: lo recibido se tiene por
presentado el día y la hora en que llegó y nunca es «fuera de horario» (`momento_presentacion`). Los plazos
siguen la ley: días hábiles de lunes a viernes sin feriados ni no laborables, desde el día hábil siguiente
(`dias_habiles`, arts. 133-134 y 137), y el último día vale hasta las 23:59 (`hora_cierre`). Con
`continua` falso vale el horario de atención de antes (lo de fuera, al día hábil siguiente). **Un horario
ya guardado no se pisa**: una configuración guardada sin `continua` (la de toda mesa que se encendió antes
de este cambio) se lee con `continua` falso; se cambia con el interruptor «Las 24 horas, todos los días» de
Administración. Los textos dicen la verdad según la configuración vigente: la página pública, el pie, el
cargo en pantalla y en PDF (la fila «Se tiene por presentado el» solo sale si difiere del día de
recepción), el seguimiento y el panel del equipo.

**El remitente al directorio.** Edison: «eso de datos personales podemos usarlo para el directorio, para
tener contacto». En la pestaña «Mesa virtual» de un recibido, `RemitenteAlDirectorio.tsx` muestra lo que se
propone (`contactos.propuesta_remitente`): de una persona natural, nombre, celular y correo; de una entidad,
razón social, RUC, correo, teléfono y dirección, y a quien la representa con su cargo. El documento de
identidad de una persona no pasa al directorio (lo mínimo para la finalidad). Busca lo que ya existe con
el mismo `Indice` de la importación (la entidad, por RUC y si no por nombre) y lo dice. Nada se crea solo:
un toque en «Vincular» (usa la ficha y completa lo vacío; si tiene cuenta, no la toca), «Crear contacto»
o «No es la misma: crear otro». `POST /api/mesa-virtual/entradas/{id}/contacto` crea o vincula, pone la
etiqueta «Mesa de Partes» a la persona creada, deja `entradas.remitente_persona_id` y
`remitente_institucion_id` (desde ahí el recibido muestra el nombre y cargo vigentes, §27) y anota un
movimiento interno «Remitente en el directorio». El consentimiento de la página pública dice ahora que los
datos se usan para atender el trámite **y para mantener contacto con el despacho** (Ley 29733), y lo mismo
queda en la declaración guardada del trámite.

**Conservación.** Los registros de seguridad de la página pública (`mesa_auditoria`: IP y navegador) se
conservan por el plazo que fija la ley; la página lo dice así. La biblioteca del vault no tiene la Ley
29733 ni su reglamento (D.S. 016-2024-JUS): se citan por su nombre y no se fija un plazo propio.

## 31. Modo sin conexión y publicación segura

Edison, 2026-10-12, desde el celular y justo después de publicar: «no carga el sistema, no puedo
acceder» (la aplicación instalada se quedó en la pantalla de inicio, con el ícono solo), «carga muy
lento» y «todos los servicios del sistema deben ser offline; […] no puede ponerse en blanco ni quedar
sin acceso». Esta sección dice cómo se cumple; amplía el modo sin conexión de 2026-09-05.

**Por qué no cargaba.** Tres piezas que se sumaban, comprobadas en una instancia de prueba:

1. `vite build` vaciaba `dist/` mientras el `vite preview` viejo seguía sirviendo; durante el build
   había momentos sin `index.html`, o con un `index.html` que nombraba JS aún no escrito.
2. `vite preview` contesta un archivo inexistente de `/assets/` con el `index.html` y un **200**
   (respaldo de aplicación de una sola página): el navegador recibía HTML donde pedía JS.
3. El service worker guardaba esa respuesta «correcta» bajo el nombre del JS y, como sirve
   `/assets/` desde su caché primero, la aplicación quedaba en blanco en cada apertura hasta la
   publicación siguiente. Además la navegación iba a la red sin plazo: con el túnel colgado (el TLS
   cortado, conexión abierta sin datos) la pantalla de inicio de Android no se iba nunca.

No hay registro de acceso del celular para saber cuál de las tres le tocó ese día; las tres se
corrigieron.

**Publicar sin dejar a nadie en blanco** (`frontend/vite.publicacion.ts`):

- El build no vacía `dist/` (`emptyOutDir: false`): lo de los builds anteriores se conserva (los
  tres últimos, y nada se borra antes de tres días, registro en `dist/.publicaciones.json`); una
  pestaña abierta antes de publicar sigue encontrando sus trozos.
- `index.html`, `sw.js` y `version.json` se escriben **al final y de golpe** (archivo temporal +
  `rename`), cuando todo lo que nombran ya está en disco. La carpeta `public/` la copia el mismo
  plugin (`copyPublicDir: false`), para que el `sw.js` crudo no aparezca antes de tiempo.
- El `sw.js` publicado lleva delante `self.__SGDP_PUBLICACION__` (versión y lista exacta de
  archivos): cada publicación es un service worker distinto que el navegador instala solo.
- `vite preview` sirve `/assets/` desde el mismo plugin: brotli o gzip precomprimidos,
  `Cache-Control: immutable` (los nombres llevan hash) y **404** si el archivo no existe, nunca el
  `index.html`. Ese middleware va antes del proxy pero solo toca `/assets/`: `/api` (con su
  `X-Forwarded-For`), `/api/chat/ws`, `/colab` y `/estudio` siguen igual.

**El service worker** (`frontend/public/sw.js`, sección 1; la 2 es la del chat):

- Al instalarse guarda la aplicación COMPLETA de su versión (`sgdp-app-<versión>`) con el
  `index.html` de esa versión, comprobado (debe nombrar la entrada de la versión). Si algo falla, no
  se activa y sigue la anterior. Lo que no cambió de una versión a otra se copia, no se baja.
- `/assets/`: lo guardado (en cualquiera de las dos versiones conservadas) y, si no, la red; solo
  se guarda lo que es lo que dice ser (nunca HTML en lugar de JS).
- Navegación: la red con plazo de 4 s; si no contesta, contesta mal o tarda, el `index.html`
  guardado. El de la red no se guarda nunca encima (nombraría archivos que esa versión no tiene).
- **La API no pasa por el worker.** Antes guardaba `/api` sin separar por cuenta; desde 2026-10-13
  «lo último visto» lo lleva la aplicación (abajo) y el worker borra el caché viejo (`sgdp-v1-*`).

**El arranque** (`frontend/index.html`, `src/arranque.ts`, `src/componentes/PantallaCarga.tsx`): la
pantalla de carga (vino, la hoja y una barra dorada) se pinta antes del JS y continúa la de Android.
Un vigía en línea, si el JS no llega, recarga una vez y luego ofrece «Reintentar» y, con red,
«Reparar la aplicación» (borra la copia de la aplicación y el worker, no los datos ni la cola). Las
páginas son trozos con `React.lazy`; si el de una página ya no existe (otra publicación), se recarga
una vez (`vite:preloadError` y `cargarPagina`). El router usa `v7_startTransition`: al cambiar de
página se queda la anterior a la vista hasta que llega la nueva.

**Trozos.** `manualChunks` (`trozos` en `vite.publicacion.ts`): `react`, `mui`, `iconos` (todos
juntos: sueltos eran un centenar de archivos de 1 KB, y con la latencia del celular pesaban más las
peticiones que los bytes), `editor` (TipTap, ProseMirror, y-prosemirror), `colab` (Yjs, Hocuspocus),
`pdf` y `grafo`; el código propio va con su página. El primer acceso baja React, MUI, los íconos, el
marco y la página abierta. Medido con Chrome sin ventana, perfil limpio y red «4G lenta» (1,6 Mb/s,
150 ms): Inicio pasó de 825 kB y 4,6 s a 228 kB y 1,7 s; la bandeja, de 825 kB y 4,6 s a 314 kB y
2,4 s; el inicio de sesión, de 825 kB y 4,4 s a 166 kB y 1,2 s.

**«Lo último visto»** (`src/cachelecturas.ts`, usado por `src/api.ts`):

- Cada GET de la API que sale bien se guarda en IndexedDB (`sgdp-sin-conexion`), con la cuenta en la
  clave. Sin red, con 5xx del proxy (`servidorCaido()`) o si el servidor tarda más de 6 s y hay
  copia, la pantalla muestra la copia; sin copia, una lectura no espera más de 45 s.
- Una franja en el marco (`FranjaSinConexion`) dice «Sin conexión · mostrando lo guardado a las
  HH:MM» (y cuántos cambios esperan); consulta `/api/health` cada 20 s y se retira sola. Con
  servidor sube la cola desde cualquier pantalla. Desde 2026-10-18 la franja (y la barra
  «Numerar y cambiar de estado esperan» del editor y la bandeja) la ve **solo el administrador**
  (abajo, «Continuidad para el equipo»); el sondeo y la subida corren para todos.
- Los PDF abiertos (`apiPdf`) y los archivos del chat se guardan igual, como Blob: 40 archivos o
  120 MB como mucho, 30 MB cada uno; las descargas a carpeta, no (son siempre las del servidor).
  Lo que ya está en la carpeta sincronizada no se guarda aquí (abajo, «Carpeta sincronizada»).
- Nunca se guarda: `/api/publico/` (mesa de partes pública), `/api/auth/`, Contraseñas, la presencia,
  el pulso, tokens, sesiones, claves ni accesos, ni los sondeos incrementales del chat. Límite de
  600 lecturas de hasta 3 MB; al pasarse, se va lo usado hace más tiempo.
- **Cuentas:** al usar el equipo con otra cuenta se borra lo de las demás; al cerrar sesión (y al
  abrir sin sesión) se borra todo. Las copias de antes (`sgdp_lectura:*` en localStorage) se retiran.

**Escribir sin red.** La cola de `src/sinconexion.ts` admite, además de los guardados del editor, los
mensajes del chat (POST, en orden, cada uno el suyo; se ven «En espera» en la conversación). Cada
cambio lleva su cuenta y solo se envía con la sesión de esa cuenta. Una sola subida a la vez (la
franja y la barra de la bandeja pueden pedirla juntas). Una escritura que topa con el proxy sin API
es «sin servidor» (503 `sin_servidor`), no «error inesperado (500)», para que se pueda encolar.
Numerar, cambiar de estado y subir archivos siguen exigiendo servidor (desde 2026-10-18 se
ofrecen «hacer al volver» y la cola admite más escrituras: abajo, «Continuidad para el equipo»).

**Continuidad para el equipo** (Edison, 2026-10-18: «la franja solo debe verla el administrador; los
demás se complican y creen que no tienen conexión»; «seguir trabajando cuando el servidor deje de
funcionar»; «los documentos sincronizados sin duplicar espacio»):

- *Quién ve qué.* El administrador, la franja de siempre. Los demás, nada mientras solo leen; si algo
  suyo espera en la cola, un ícono sin texto en la barra (`IndicadorConexion`, con su explicación al
  pasar el cursor). Cada acción que no se completa lo dice en el momento, abajo y unos segundos
  (`avisoBreve.ts` + `AvisoBreve.tsx`): «Se guardará cuando vuelva la conexión». Al volver, la línea
  de lo enviado y la de lo no aceptado la ven todos (es su trabajo).
- *La cola, ampliada* (`encolarEscritura`, cada escritura la suya y en orden, con `tipo`): comentar una
  tarea (`/api/tareas/{id}/comentarios`), observar un documento (`/api/documentos/{id}/comentarios`;
  el servidor aplica al recibirla las reglas de siempre, también el cambio de estado), crear una tarea
  (`/api/tareas` y `/api/tareas/rapida`, que lleva `escrito_el`: «mañana» se cuenta desde el día en que
  se escribió, `dia_de_referencia()` en `api/tareas.py`, 30 días como mucho) y anotar una actuación
  (`/api/actuaciones`). Cada pantalla muestra lo suyo «En espera» (`EnEsperaLista.tsx`, `useEnEspera`)
  y relee su lista cuando sale. El guardado automático del editor también se encola (el último
  reemplaza al anterior). Una tarea nunca abierta en el equipo se abre con lo que su lista ya sabe
  (`recordarTareas`/`tareaVista` de `tareas/datos.ts`).
- *Nada se pierde al subir* (`destinoDe`): 401/428 detienen la subida y conservan la cola (antes un 401
  la descartaba); el guardado de un documento rechazado (409, 403, 422…) se aparta para «Cargar mis
  cambios»; cualquier otro rechazo va a «No enviados» (`sgdp_no_enviados`, por cuenta, con su texto y
  el motivo del servidor; «Ver» en la línea de aviso, con Copiar y Descartar). El proxy sin API (500
  sin `server: uvicorn`) detiene la subida, no rechaza.
- *Lo que exige el servidor* (`alvolver.ts`, `AvisoAlVolver.tsx`): numerar, cambiar de estado, compilar
  y subir el firmado (o un archivo: `subirArchivo` traduce el fallo de red y el 5xx del proxy a 503
  `sin_servidor`, «Subir archivos necesita el servidor…»). Se explica en una línea y se ofrece
  «Hacerlo al volver»: un recordatorio por cuenta (`sgdp_al_volver`, uno por tipo y ruta) que, con
  servidor, sale bajo la barra con «Hacer ahora». Numerar abre `/documentos/{id}?al_volver=numerar` y
  el editor empieza la numeración (la revisión de copias sigue pidiendo la confirmación de la
  persona: nada irreversible ocurre solo). No se encola a ciegas: el número oficial es único.

**Carpeta sincronizada** (`sync/carpetaLocal.ts`, `componentes/PermisoCarpeta.tsx`): la página
Sincronizar (`sync/sincronizador.ts`) baja PDF, firmados, adjuntos y, desde 2026-10-18, los PDF de
los recibidos (`Recibidos/<AAAA-MM>/…`, `servicios/sync.py::_recibidos`, url `/api/entradas/{id}/pdf`).
Al terminar deja en IndexedDB (`sgdp_sync`, clave `mapa`) el mapa «ruta de la API → ruta en la carpeta
y versión» armado con el mismo manifiesto, de la cuenta que sincronizó, y borra de «lo último visto»
las copias de esos archivos. Desde entonces:

- Sin servidor, `archivoConRespaldo` (api.ts) busca primero lo guardado en el navegador y después la
  carpeta: lee el archivo con el manejador guardado; si Chrome pide confirmar el permiso, el marco
  muestra «Abrir carpeta» (el permiso solo se concede tras un clic; uno para todos los PDF que
  esperan; «Ahora no» no vuelve a preguntar en 10 minutos). Vale para todo lo que pasa por `apiPdf`:
  bandeja, editor, vista heredada, visor de adjuntos, Mesa de Partes (recibidos). Las descargas sin
  servidor también salen de la carpeta.
- Con servidor, un PDF abierto no se guarda en el navegador si la carpeta lo tiene en la misma
  versión (`tamaño-mtime`: el `Last-Modified` de `archivos.py` es el mismo mtime del manifiesto); si
  el servidor tiene uno más nuevo, ese sí se guarda.
- El mapa se relee cada 30 s (otra pestaña pudo sincronizar) y se olvida con «Cambiar carpeta».
  Otra cuenta en el mismo equipo no lo usa.

**Límites.** Una escritura de la cola cuya respuesta se perdió (el servidor la recibió pero la red
cortó antes de contestar) se enviaría dos veces: falta un identificador del cliente en la API (vale
para el chat, los comentarios, las tareas y las actuaciones). Lo que no se abrió nunca en el equipo
no está guardado. La copia se refresca al volver a cada pantalla; una pantalla abierta no se recarga
sola al volver el servidor (salvo las listas con «En espera», que releen al salir lo suyo). Siguen sin
cola: editar una tarea ya creada, la agenda, el estado y la atención de un recibido, las semanas, los
proyectos (edición simultánea), las rendiciones y el directorio. La carpeta sincronizada solo existe
en Chrome o Edge de computadora (File System Access API; no en Android).

**Crear, salir y volver** (2026-10-18, Edison: «sin servidor no pueden generar, editar ni modificar»):
«Nuevo documento» sin servidor no crea a ciegas (el id lo da el servidor): ofrece «Hacerlo al volver»
(tipo `crear`; «Hacer ahora» abre `/documentos?nuevo=1&tipo=<tipo>` y la bandeja crea el documento). Un
documento abierto antes se edita sin red y su guardado espera en la cola (también el que se hacía al
SALIR de un borrador, que antes se perdía en silencio: `encolarSalida`). Cuando el guardado de un
documento sube, `conciliarRespaldo` compara el respaldo local `sgdp_respaldo_<id>` con lo subido: igual,
se retira; con algo más nuevo, toma la `version` que devolvió el servidor para que el editor lo ofrezca
al abrir (antes se descartaba por «hay una versión más reciente» aunque su contenido fuera el que subió;
regla pura `respaldoTrasSubir`, prueba en `pruebas/sinconexion.test.ts`).

## 32. Rendición de cuentas de viáticos

Edison, 2026-10-18: «hay dos archivos de rendición de cuenta que hicimos de la Semana de representación;
implementa eso como módulo del despacho […] que nos ayude a hacer el informe de rendición de cuenta de
manera más rápida, que nos solucione todo tipo de cosas que se puedan presentar, que todo sea
automático». Las referencias (en la carpeta del despacho, con datos reales que no entran al repo) fueron
el libro de liquidación en Excel de cada comisionado y el Word de los Anexos 3 y 4; de ellos se tomaron
solo la estructura, las fórmulas y la forma.

**Lo que dice la normativa (primero la biblioteca).**

| obra | calibre_id | lo que funda aquí |
|---|---|---|
| Directiva N.° 08-2022-DGA/CR, apoyo logístico a la Semana de representación (escaneada: se leyó por OCR) | 10092 | la semana son cinco días laborables continuos (4.1.a); el apoyo logístico del CONGRESISTA se abona tres días hábiles antes, está afecto a quinta categoría y **no está sujeto a rendición de cuenta** (4.2, 4.3); se devuelve si la semana se interrumpe o se renuncia (4.1.b, 5.4) y cómo (5.6). No fija topes de viático, porcentaje de declaración jurada, plazo ni formatos para el personal comisionado |
| Decreto Legislativo N.° 1441, Sistema Nacional de Tesorería | 10073 | art. 20.4: la documentación sustentatoria comprende boletas, tickets, facturas, comprobantes de pago y **declaración jurada**, y se conserva; art. 20.2: las rendiciones y devoluciones por menores gastos van en los plazos y condiciones de las directivas del ente rector |
| Guía de gestión de la representación política del Congreso | 10094 | solo la transparencia: recomienda publicar la rendición de cuentas de los gastos de viaje (§ transparencia, p. 82); nada operativo |

**En la biblioteca desde el 2026-10-18** (ingresadas en Calibre ese día; antes se habían leído en línea):

| norma | calibre_id | lo que funda aquí |
|---|---|---|
| D.S. N.° 007-2013-EF (MEF, El Peruano, 23-01-2013) | 10517 | art. 1: **S/ 320 por día** (escala general); una comisión de más de 4 h y hasta 24 h cuenta como un día y si dura menos se paga en proporción; art. 3: comprobantes por al menos el **70 %** y declaración jurada por no más del **30 %**; 10 días hábiles para rendir |
| Directiva DI 37-2025-DF-DGA-CR, «Otorgamiento de pasajes, viáticos y otros recursos en el territorio nacional y la rendición de cuenta» (Congreso, Departamento de Finanzas, primera versión, enero de 2025) | 10518 | 6.1.2: dos servidores por congresista reciben viáticos en la semana; 6.6.2.2 y 7.9.6.4.2 b): **10 días hábiles** desde el término de la comisión para funcionarios y servidores (15 para congresistas, 6.6.2.1; si vence en inhábil, el hábil siguiente, 7.9.6.4.3; 2 días más por excepción, 7.9.6.4.4); 6.6.4: quien tiene una rendición pendiente **no recibe nuevos viáticos**; 7.9.1.1.1-2: comprobantes **a nombre del Congreso** por no menos del 70 % y declaración jurada **solo para la movilidad** hasta el 30 % del monto otorgado (hospedaje y alimentación siempre con comprobante; pasajes terrestres y otros recursos al 100 % con comprobante); 7.9.1.1.5: el **boleto aéreo** no se rinde pero se adjunta; 7.9.1.1.6: factura de más de S/ 700 → retener el 3 %; 7.9.2.1.10: la movilidad local, en el Formato 02-VN; 7.9.3.2.2: **72 horas** para subsanar observaciones; 7.9.4.2: el **sobrante se devuelve en efectivo en la Caja de Tesorería** y la copia del recibo forma parte de la rendición; 7.8.2.3.2: vencido el plazo, descuento en la remuneración |
| Acuerdo N.° 226-2012-2013/MESA-CR (Mesa Directiva del Congreso) | 10519 | la escala del Congreso: S/ 320 por día; **S/ 380 solo para el Oficial Mayor** |

Los **parámetros** siguen editables y cada uno dice, en lenguaje simple, qué es, cuánto rige y su norma
(`servicios/rendicion.py::FABRICA`: `etiqueta`, `norma` —la cita corta que se muestra al lado del valor—,
`simple` —lo que significa en una línea— y `fuente` —la procedencia completa con su `calibre_id`—): viático
S/ 320.00 por día (D.S. 007-2013-EF, calibre 10517; Acuerdo 226-2012-2013/MESA-CR, calibre 10519), declaración
jurada 30 % (DI 37-2025-DF-DGA-CR, calibre 10518, 7.9.1.1.2), plazo 10 días hábiles (DI 37-2025, 6.6.2.2). El tope
DIARIO de S/ 96 es práctica del despacho (libro de la SR-01): la directiva limita el 30 % del TOTAL, así que pasar
el tope diario es un aviso y el 30 % del total —medido sobre lo **recibido**— es el error. Los de fábrica los
ajusta Administración (ajuste `rendicion_parametros`, «Parámetros del despacho»: también **a nombre de quién van
los comprobantes**, razón social y RUC —la directiva dice «Congreso de la República» y en 2026 salen con el RUC de
la Cámara de Diputados: es un dato del despacho, nunca un RUC literal en el código—); cada rendición puede ajustar
los suyos (`rendiciones.parametros`). Orden: rendición → despacho → fábrica. La web los muestra en una línea cada
uno, con ejemplo, y deja lo raro en «Ver más» (`modelo.ts::lineasParametros`, `ejemploMovilidad`).

**El importe recibido varía en cada comisión** (Edison, 2026-10-18: «no lo supongas igual»). Manda el anotado en
la rendición; si no, el anotado **para toda la comisión** (`rendicion_comisiones.datos.recibido_viaticos`, con
quién lo anotó); si no, el que dice el memorando vinculado (`rendicion.importe_de_texto`: la primera cifra «S/ …»
de una oración que habla de viáticos); si no, el del despacho; y si nada consta, se SUPONE viático × días (origen
`supuesto`), con el aviso «Importe recibido: no consta» y un renglón automático en los pendientes. Cada origen se
dice en la web («Del memorando MEM-0001», «Anotado para toda la comisión por Ana», «Pendiente»).

**Por confirmar**: los formatos del despacho citan en la cabecera una directiva anterior («Procedimientos para la
adquisición de pasajes aéreos, el otorgamiento de anticipos…», `\meta{directiva}` del marco, sobrescribible); la
proporción de una comisión de menos de 4 horas (D.S. 007-2013-EF, art. 1) no se calcula: cada día cuenta entero.

**Datos** (`backend/app/modelos_rendicion.py`, tablas por `create_all`): `rendiciones` (una por
comisionado y comisión; `usuario_id`, `semana_id` →`sr:N`, `documento_id` → el memorando `doc:N`,
`comision_id` → su comisión,
`estado` borrador · lista · presentada · observada · cerrada, `datos` con la cabecera que el sistema no
sabe —SIAF, comprobante de pago, solicitud de efectivo, fechas propias, lugar de firma, unidad, DJ fijada
por día—, `parametros`, `version`), `rendicion_comprobantes` (fecha, tipo, serie, número, RUC, proveedor,
concepto, importe, foto o PDF, origen manual · foto · pegado) y `rendicion_declarados` (los otros gastos sin
comprobante de cada persona). Clave `rend:N` en el resolvedor (§27) y en los vínculos de tareas y eventos.

**La movilidad es de la COMISIÓN** (Edison, 2026-10-18: «los dos trabajadores tienen los MISMOS tramos de
movilidad, porque viajan juntos con el diputado al mismo lugar y en las mismas fechas. Solo cambia el Anexo 4»;
`servicios/rendicion_comision.py`). Un solo lugar de verdad (§27):

- `rendicion_comisiones`: la comisión que comparten quienes viajaron juntos. `clave` única: `sr:<id>` (la
  Semana de representación), `cs:<inicio>_<lugar>` (otra comisión de servicio: mismo inicio y lugar = la misma)
  o `r:<id>` (una rendición sin fechas, sola). Guarda su `carpeta` (fija desde que se crea) y sus `datos`: la DJ
  del día fijada a mano (`dj_objetivo`) y el importe recibido cuando es el mismo para todos. La crea
  `comision_de` al crear o leer una rendición (`INSERT … ON CONFLICT DO NOTHING` sobre la clave); cambiar la
  semana de una rendición la pasa a otra comisión.
- `rendicion_tramos`: los tramos (fecha, hora, del, al, monto, actividad, `actualizado_por`). Salen en el Anexo 3
  de todas las rendiciones de la comisión: lo que uno registra («Huanta → Huamanga, S/ 27») aparece en la del
  otro y cualquiera lo corrige. La vista los entrega dentro de `declarados` (clase `movilidad`), así el cálculo,
  el LaTeX y el Excel no cambiaron; los controles los nombran `tramo:<id>`. API: `POST|PUT|DELETE
  /{id}/tramos[/{tid}]` (y `POST /{id}/declarados` con clase movilidad, por compatibilidad).
- `rendicion_cambios`: la **constancia de quién cambió qué**. Toda escritura en la movilidad pasa por un `Lote`
  (una acción = un lote, con su texto: «Ajustar a lo sugerido», «Corregir el tramo 24/08 Huanta → Huamanga»): cada
  fila guarda el tramo (o el dato de la comisión) antes y después, quién y desde qué rendición. `GET
  /{id}/movilidad/cambios` es el historial («Quién cambió qué»); `POST /{id}/movilidad/deshacer` vuelve atrás el
  ÚLTIMO lote (sea de quien sea), salvo lo que alguien cambió después (se cuenta y se deja); el deshacer queda como
  otro lote y no se vuelve a deshacer.
- **Fija al presentar**: cuando alguna rendición de la comisión está presentada o cerrada, la movilidad no se
  cambia (409 con el nombre de quién la presentó); Administración sí (al observarla, se reabre).
- **Migración** (`rendicion_comision.migrar`, idempotente, la llama `main.py` al arrancar tras el `ALTER TABLE
  rendiciones ADD COLUMN IF NOT EXISTS comision_id`): cada rendición se vincula a su comisión; los tramos que cada
  una guardaba pasan a la comisión, día por día los de la rendición que declaró MENOS (a igual total, el juego
  escrito a mano antes que el que «Ajustar» repartió parejo, y luego la de menor id; `elegir_tramos_por_dia`);
  lo distinto queda entero en la constancia como «Descartado»; la DJ del día fijada pasa a la comisión.

**Lo vinculado se muestra vigente (§27).** El nombre, el cargo y el DNI salen de la CUENTA del comisionado
(Mi perfil); el número y la fecha del memorando, del documento (un borrador no se imprime como
«borrador»: queda el renglón y un aviso); las fechas, el lugar (la región del ámbito o las provincias) y
el motivo, de la semana mientras nadie los cambie en la rendición (`api/rendiciones.py::efectivos`,
`origen_datos` dice de dónde sale cada uno). El PDF generado es historia: se vuelve a generar.

**El cálculo** (`servicios/rendicion.py`, puro, en céntimos; `tests/test_rendicion.py` replica el libro
con cifras ficticias): por día, A = desayuno + almuerzo + cena + otros de alimentación + hospedaje
(comprobantes de la comisión); B = movilidad + otros sin comprobante; asignado = tope diario;
reconocido = MIN(A, tope) + B; exceso = MAX(0, A − tope) (lo asume el comisionado); saldo = asignado −
reconocido; controles B ≤ tope DJ, reconocido ≤ tope, exceso = 0 → CONFORME / REVISAR. En total, el saldo
es lo **recibido** (o tope × días) menos lo reconocido, y el % de DJ sobre lo asignado contra el límite.
**Movilidad sugerida** por día, COMPARTIDA (`rendicion.movilidad_compartida`): para cada comisionado de la
comisión, el menor entre su tope DJ del día y lo que le falta para completar su viático (descontados sus otros
gastos sin comprobante); la del día es el **MENOR entre ellos**, porque la movilidad es la misma para todos y
nadie puede pasar su viático. Por eso un día no siempre llega a S/ 96: quien más gastó con comprobante lo limita.
La regla se confirmó con los dos libros de la SR-01 (hoja «Rendición», nota 4): cada uno, solo, daba otra
movilidad algún día (cada uno limitaba días distintos); los dos declararon, día por día, el mínimo de ambos. Cada día lleva la
línea que lo explica (`explicacion`: «S/ 90: Ana ya gastó S/ 230 con comprobante ese día» o «S/ 96: el
tope de declaración jurada del día»); si la movilidad del día pasa lo que alcanza a todos, el aviso
`movilidad_compartida`. Pasajes terrestres (sección B del 03-VN) y otros recursos (C) van
aparte, contra su propio importe recibido.

**Automático.**

- Al crear una rendición con semana, los tramos se **proponen** desde sus actividades (de la partida
  —«Hospedaje»— a la primera actividad, de una a otra por hora, y de vuelta) y cada día reparte la
  movilidad sugerida en soles enteros (`tramos_desde_actividades`, `repartir`) —solo si la comisión aún no tiene
  tramos: la segunda rendición usa los de la primera—. «Ajustar a lo sugerido» (`POST /{id}/movilidad/ajustar`)
  primero SIMULA (`simular: true` → `plan_ajuste`: día, antes, después, por qué) y la web lo dice en una línea
  («Pondrá lun 24/08 a S/ 96 (hoy S/ 90), repartido entre sus tramos»); un día que ya suma lo sugerido no se toca
  (se respeta cómo se repartió a mano); después, «Deshacer». «Fijar la DJ del día» es de la comisión y manda
  sobre lo sugerido solo si es MENOR: «Ajustar» nunca pasa los topes (ver «Segunda vuelta», al final).
- **Controles** visibles y breves, del más grave al más leve (un `error` impide marcarla lista):
  comprobante fuera de la comisión, repetido (en la rendición o en la de otra persona: RUC + serie +
  número), sin fecha o sin importe, concepto no válido; día sobre el viático; % de DJ sobre el límite
  (sobre lo recibido). Avisos: pendientes anotados, DJ del día sobre el tope diario del despacho, exceso que
  asume el comisionado, recibo u otro papel (no comprobante) en alimentación u hospedaje, factura de más de
  S/ 700 (retención del 3 %), pasajes u otros sin importe recibido, gasto sin comprobante que parece alimentación, tramos
  que no suman la DJ fijada, falta la foto, falta DNI o cargo, sin memorando o sin número, recibido
  distinto de tope × días, **importe recibido que no consta**, gasto sin comprobante que no es movilidad (la
  declaración jurada vale solo para la movilidad), movilidad del día sobre lo que alcanza a todos, plazo por
  vencer o vencido (días hábiles con feriados, `entradas._dias_habiles`; vencido: «no se otorgan nuevos
  viáticos», DI 37-2025, 6.6.4; solo en borrador o lista, `rendicion.corre_plazo`), desayuno, almuerzo o cena
  repetido el mismo día (`concepto_repetido`, `UNO_POR_DIA`). Informativos: el saldo a devolver (en la Caja de Tesorería, con su recibo como
  anexo), el boleto aéreo por adjuntar, «comprobantes entregados en físico» (dato `en_fisico`: la foto deja de
  pedirse).
- El **importe en letras** («Cuatrocientos treinta y siete con 00/100 soles») y los días («CINCO (05)») se
  arman solos (`importe_en_letras`, `dias_en_letras`).
- **Entrada doble** (`ElegirEntrada`): a mano, o pegando el bloque `comprobantes-gasto`
  (`esquemas/pegado/comprobantes-gasto.yml`, tipo de campo nuevo `importe`) que produce
  `prompts/06 legislativo/prompt_19_comprobantes_de_gasto` leyendo las fotos. `POST /{id}/pegar` marca
  nuevo · repetido · fuera de fecha · dudoso y `POST /{id}/lote` agrega lo aceptado: con «Subir comprobantes»
  (antes «Subir fotos») previo, las fotos sin datos se llenan en el mismo orden. El chat reconoce el bloque y lo lleva a la
  rendición abierta (`RUTA_MODULO`).
- **Varias personas en la misma semana**: una rendición por comisionado (409 si ya existe) y el resumen
  del despacho (`GET /resumen?semana_id=`) para el administrador.
- **Dos formas de trabajar** (2026-10-18): cada quien hace la suya, o un **encargado** hace las de toda la
  comisión eligiendo el comisionado al crearla (`POST /rendiciones` con `usuario_id`: cualquiera del equipo, ya no
  solo Administración). Quien la creó la ve y la edita (`_puede`: comisionado, creador o administrador); la vista
  trae los `miembros` de la comisión (con `accesible`) y `faltan` (los responsables de la semana sin rendición),
  que la web muestra como pestañas por persona y «+ Nombre». La movilidad es compartida en los dos modos.

**El documento.** Tipo nuevo del marco, `rendicion-viaticos` (clase delgada + estructura + plantilla de
test; `marco_documental/docs/decisiones.md`): Anexo N.° 3, Formato 02-VN, y Anexo N.° 4, Formato 03-VN,
en el orden y con el texto del formato de referencia, sin membrete ni marca de agua ni sello (son
formatos de la institución, como el Word), con la directiva en la cabecera y su procedencia y el folio en
el pie. La unidad sale del perfil (`despacho del \meta{cargo} \meta{autor}`) salvo que la rendición diga
otra. `servicios/rendicion_tex.py` escribe maestro, `metadata.tex` y `contenido.tex` en la carpeta de la
rendición y compila con `scripts/build.sh`; el PDF anterior se aparta y vuelve si la compilación falla; la
última sección va con la firma en una caja (nunca la firma sola en una hoja). La liquidación sale también
en **Excel** con las fórmulas del libro de referencia (`servicios/rendicion_excel.py`, `openpyxl`):
importes del día como valores editables y todo lo demás fórmulas que recalculan.

**Dónde quedan los archivos** (2026-10-18, Edison: «fuera de la carpeta de la Semana, en una carpeta propia del
despacho, con un nombre distinto de administrativo; bien organizada y general»). Raíz `RENDICIONES_DIR`
(`config.raiz_rendiciones()`; si falta, la hermana `rendiciones/` del archivo documental, `MDD_DOCUMENTOS/..`):

```
<RENDICIONES_DIR>/                                   despacho/rendiciones (sensible: fuera de git del despacho)
  2026/                                              año de la comisión
    2026-08_SR-01_<tema>/                            Semana: el mismo nombre que su expediente en representacion/
      R-003_<usuario>/                               una rendición
        comprobantes/  AAAAMMDD_SERIE-NUMERO_<huella>.jpg|pdf   (foto_<huella> mientras no tiene datos)
        anexos/        boleto_<huella>.pdf, devolucion_<huella>.jpg
        documento/     RV-SR-01_Nombre-Apellido.pdf, …_liquidacion.xlsx y las fuentes .tex
    2026-10-05_huanta/                               otra comisión de servicio: inicio + lugar
      R-007_<usuario>/…
  sin-fecha/R-NNN/…                                  una rendición sin fechas
```

La carpeta de la comisión se fija al crearla (`rendicion_comisiones.carpeta`) y la de la rendición, la primera vez
que escribe (`datos._carpeta`, RELATIVA a `RENDICIONES_DIR`): cambiar fechas o lugar no deja archivos huérfanos y
mudar la raíz no obliga a tocar la base. Una ruta ABSOLUTA guardada antes (la propuesta anterior, dentro de la
Semana) se sigue usando mientras exista; si ya no existe (se movió), se re-ancla en la estructura nueva, igual que
el PDF generado (`_ruta_pdf`) —como `carpetas.py` con `MDD_DOCUMENTOS`—. Los nombres siguen `servicios/nombres.py`
(`sanear`: sin tildes, un guion). Un mismo archivo (misma huella del contenido) se guarda una sola vez y lo
comparten los comprobantes que sustenta. La Semana **enlaza** a sus rendiciones (opción «Rendición»,
`GET /semana/{id}/equipo`); no hay copias. Nunca en el repositorio; quitar un comprobante, un anexo o la rendición
no borra sus archivos.

**Ensayo con las rendiciones reales (2026-10-18).** Se registraron por la web, en la instancia de prueba,
las tres rendiciones hechas en Word y Excel (dos de la SR-01, una de la SR-02) y la cuarta sin documentos; las
cifras coinciden con los Word (total rendido, recibido y saldo). Lo que salió de ahí:
- **Avance por sección** (`rendicion.avance`, pura): Datos, Comprobantes, Movilidad y Documento, cada una
  `pendiente` · `registrado` · `validado`, arriba de la rendición (un toque lleva a la sección) y en la tarjeta
  de la lista. Los tramos que propuso el sistema y nadie tocó cuentan como «registrado: revíselos».
- **Pendientes** (`datos.pendientes`, un renglón por pendiente): lo que falta y no consta en ningún documento;
  sale como aviso y en la lista. Lo recibido sin dato se muestra «supuesto» (viático × días) hasta confirmarlo.
- **Alta en serie**: «Guardar y otro» en comprobantes (hereda fecha, tipo y concepto) y en tramos (mismo día,
  el «Del» es el «Al» anterior); el número se escribe de una pieza («EB01-1586», «FR95 / 12841») y se parte en
  serie y número (`partir_numero`, también en el servidor); un comprobante nuevo no se pierde si el diálogo se
  cierra (borrador en `sessionStorage`).
- **Movilidad**: «Quitar los tramos» (del día o todos; `POST /{id}/movilidad/vaciar`, se puede deshacer). En la
  SR-01 los dos comisionados declararon los mismos 42 tramos: de ahí, desde el mismo día, la movilidad
  compartida. «Copiar de un compañero» (`POST /{id}/copiar`) quedó para los otros gastos sin comprobante, los
  importes y topes, el lugar de la firma y el memorando (nunca los comprobantes; la movilidad ya es la misma).
- **Otros sustentos** (`rendicion_anexos`, `POST /{id}/anexos`): boleto aéreo, recibo de devolución, otro.
- **Documento al día**: la huella de lo que se compondría (`api/rendiciones.py::huella`) se compara con la del
  último PDF; si algo cambió, «vuelva a generar antes de imprimir».
- **Resumen del despacho**: «Pendiente: falta la rendición de X» desde los responsables de la semana (sin el
  congresista), con «Crear» y «No rinde» (`POST /semana/{id}/no-rinde`, ajuste `rendicion_no_rinden`: quien
  estuvo sin viáticos). Los memorandos ya vinculados a otra semana no se sugieren.
- **Anexo 4 con los cuadritos del original**: caja redondeada tras «SIAF:» y los marcos «COMPROBANTE DE PAGO N°:» y
  «SOLICITUD DINERO EFECTIVO N°» con su recuadro y la fecha en tres casillas (`structure.tex::\datosrendicion`).

**Acceso**: todo el equipo salvo el invitado (403); cada quien ve y edita las suyas y las que creó como encargado;
el administrador ve todas, observa, cierra y cambia los parámetros. Presentada o cerrada, el comisionado ya no la
edita (y la movilidad de su comisión queda fija). Observada, se subsana en 72 horas (DI 37-2025, 7.9.3.2.2).

**Web**: módulo «Rendición de cuentas» (`navegacion.ts`, `/rendiciones`), lista en tarjetas y una
rendición por pasos (`/rendiciones/:id`: Datos, Comprobantes, Movilidad, Revisión, Documento;
`frontend/src/componentes/rendicion/`); desde la semana, la opción «Rendición» abre la suya (o, para el
encargado, la primera que hizo) o la crea. Pestañas por persona de la comisión (modo encargado). El formulario
del comprobante muestra la foto o el PDF a la DERECHA en escritorio (≥ 900 px; en el celular, debajo), como el
visor del editor y el detalle de un recibido. **Calculadora** en hoja inferior (`componentes/Calculadora.tsx`,
la cuenta en `calculadora.ts` sin `eval`, `pruebas/calculadora.test.ts`): desde la cabecera y desde cada campo de
importe (`rendicion/CampoImporte.tsx`), con «Usar S/ …». Lógica pura de la web en `componentes/rendicion/modelo.ts`
(`pruebas/rendicion.test.ts`: `textoPlan`, `lineasParametros`, `textoRecibido`…). Los cambios compartidos de la
interfaz (2026-10-18): `ElegirEntrada` (la ventana «¿Cómo quiere empezar?» de todos los módulos: subtítulo, una
línea por opción, «más rápido» en la de la IA; desde la segunda vuelta, en dos pasos; mismas props) y el campo
«Hora» de todo el sistema (`theme.ts`, `MuiInputBase`: ancho mínimo y el reloj fuera del texto).

**Segunda vuelta con producción (2026-10-18, pedido de Edison con capturas).**

- **La lista, por comisión** («parecía duplicada»: dos tarjetas de la misma Semana). `GET /rendiciones` trae
  `comision_id` y `lugar`; la web agrupa (`modelo.ts::agruparPorComision`): una tarjeta por comisión con la
  Semana, las fechas, el avance de todas (`textoAvanceComision`), el plazo y el estado si es el mismo para todos,
  y una fila por comisionado (nombre SIEMPRE, también el propio; rendido, saldo, avance, por corregir y
  pendientes). Va arriba si alguna sigue abierta.
- **El plazo corre solo en borrador o lista** (`rendicion.corre_plazo`, `ESTADOS_CON_PLAZO`; en la web,
  `correPlazo`): presentada, observada o cerrada ya no lleva «Vencida» ni el control `plazo`, ni `vencida` en la
  lista. La observada tiene su aviso de 72 horas.
- **Vínculos al modo Obsidian**: la rendición entra al mapa de relaciones (`servicios/grafo.py::unir_rendiciones`,
  nodo `rend:N` de tipo `rendicion`) con aristas a su Semana (`rendicion_semana`), a su memorando
  (`rendicion_memorando`, solo si el documento está a la vista), a su comisionado (`usuario:N`, `comisionado`) y a
  la otra rendición de su comisión (`comision`). Solo las que la cuenta puede ver
  (`api/rendiciones.py::rendiciones_visibles`, la regla de `_puede`): el mapa no revela las de otros. En el mapa
  LOCAL (`?foco=rend:N`, `agregar_sustentos`), además, un punto con sus comprobantes (lleva a la lista), cada otro
  sustento y el PDF de los Anexos, que se abren desde el mapa. La web reutiliza `grafo/MapaLocal.tsx` en el paso
  Datos (como el editor, los recibidos y los proyectos) y lo refresca con `EVENTO_RELACIONES` cuando cambian el
  memorando, los comprobantes, los sustentos o el PDF; el mapa completo (`/mapa`) muestra el tipo nuevo.
- **«Ajustar a lo sugerido» nunca pasa los topes** (Edison: «¿altera o sobrepasa los topes?»). Se revisó y había
  dos huecos: (1) una DJ del día fijada a mano se repartía tal cual aunque pasara el tope diario de declaración
  jurada o el viático de alguien; (2) el 30 % se medía solo por día (30 % del viático diario), así que quien
  recibió menos que viático × días podía pasar el 30 % de lo RECIBIDO. Ahora `plan_ajuste(dias, tramos, limites)`
  pone en cada día la movilidad que alcanza a todos (`compartida`: el tope DJ y el viático del día de CADA
  comisionado), la DJ fijada solo si es menor (`motivo` `fijada`; si es mayor, `fijada_tope` y queda en lo que
  alcanza) y, en total, `recortar_a_limites` baja de a S/ 1 el día más alto hasta que a cada uno le alcance su
  30 % de lo recibido (`motivo` `pct`, con quién limita). Los límites los arma `api/rendiciones.py::limites_dj`
  desde `_personas` (lo de cada comisionado: `tope_total` = % × recibido, `otros_total`), descontando sus otros
  gastos sin comprobante y la movilidad de los días que no se tocan. El plan solo cambia los MONTOS de los tramos
  (`Lote.cambiar(tramo, {monto})`): ni los parámetros ni la DJ fijada. `tests/test_rendicion_topes.py` lo prueba
  con 400 comisiones de 2 y 3 personas al azar (semilla fija; recibido distinto, viático de S/ 380, DJ fijada
  alta, ajuste de un solo día): tras aplicar el plan, ningún día pasa el tope DJ ni el viático de nadie y nadie
  pasa el 30 %; con el código anterior, la misma prueba falla en los dos huecos. La web lo dice en una línea
  (`modelo.ts::lineaTopes`: «Nunca pasa los topes: S/ 96 por día, S/ 320 de viático, 30 % de lo recibido. Solo
  cambia los montos de los tramos.») bajo el botón y en el diálogo; la línea de cada día explica el recorte.
- **Revisión: comparar a la comisión** (`GET /{id}/comparar`, `ficha_comparar`; solo las rendiciones que la cuenta
  puede ver, de las demás el nombre): por día, los comprobantes por concepto con cuántos hay, la movilidad, otros
  sin comprobante, lo reconocido y el saldo; y los totales (comprobantes, con comprobante, DJ, rendido, recibido,
  saldo, % de DJ). La comparación es pura (`modelo.ts::compararComision`, cada fila con `difiere`);
  `rendicion/CompararComision.tsx` la muestra a una columna por persona en escritorio (≥ 900 px) y alternando
  personas en el celular (cada valor distinto dice debajo el del otro), con «Solo lo distinto».
- **El documento a la derecha** (paso Documento): en escritorio, rejilla de dos columnas —botones e información a
  la izquierda, el visor a toda la altura y fijo al bajar—, como el editor; en el celular, debajo. Revisión y
  Documento usan hasta 1400 px de ancho.
- **`ElegirEntrada` en dos pasos** (componente compartido; mismas props): primero se elige; «Con ayuda de la IA»
  no cierra sino que muestra los tres pasos con «Copiar el prompt» y «Descargar .md» y, al final, «Pegar la
  respuesta» (`alPrompt`), con «Volver»; la opción del formulario va directo a `alManual`. Se comprobó en
  Rendición, Agenda, Documentos y Tareas.
- **Comprobantes sin repetir** (`FormComprobante.tsx`; lógica pura en `modelo.ts`: `registradosDelDia`,
  `revisarConcepto`, `siguienteConcepto`, `dondeEmpezar`, `unConcepto`): bajo la fecha, lo ya registrado ese día
  (concepto e importe); un puntito en cada concepto registrado; desayuno, almuerzo o cena repetidos el mismo día
  no se guardan (corregir el que ya estaba repetido sí: lo avisa el control); hospedaje y otros, solo aviso.
  «Guardar y siguiente» es el botón principal (también Enter en el importe) y pasa al siguiente concepto del día
  en orden —desayuno, almuerzo, cena, otros de alimentación, hospedaje— saltando las comidas ya registradas, y al
  acabar al día siguiente; un comprobante nuevo empieza en el primer día con una comida por registrar. «Subir
  fotos» se llama «Subir comprobantes».

## 33. Módulos que se apagan y datos al primer ingreso

Edison, 2026-10-18 (decisiones: «Administración en secciones, módulos que se apagan y datos al primer
ingreso»). Código: `backend/app/servicios/modulos.py`, `backend/app/api/modulos.py`,
`backend/app/servicios/perfil.py` (§ datos al primer ingreso), `backend/app/seguridad.py`
(`usuario_con_clave_propia`, `usuario_actual`), `backend/app/api/perfil.py` (`POST /api/cuenta/bienvenida`),
`backend/app/api/admin.py` (`/primer-ingreso`, `pedir_datos`), `frontend/src/modulos.ts`,
`frontend/src/componentes/usarModulos.ts`, `frontend/src/componentes/ConModulo.tsx`,
`frontend/src/paginas/Bienvenida.tsx`, `frontend/src/componentes/PasoIngreso.tsx` y
`frontend/src/componentes/admin/`. Pruebas puras: `backend/tests/test_modulos.py`,
`frontend/pruebas/modulos.test.ts`.

**Registro de módulos.** `ajustes.modulos = {id: {activo, mensaje}}`; el catálogo (`CATALOGO`) da por cada
módulo su nombre, qué es, los prefijos de su API, de qué depende y su valor de fábrica (todo encendido salvo
la mesa virtual). El estado **efectivo** aplica las dependencias: la mesa virtual necesita la Mesa de Partes.
Se lee con una caché de 10 s en el proceso (`ajuste_cacheado`), que invalida quien guarda.

| módulo | rutas que cierra |
|---|---|
| Mesa de Partes (`recibidos`) | `/api/entradas`, `/api/mesa-virtual` (lo del equipo) |
| Mesa de partes virtual | ninguna: `api/mesa_publica.py` rechaza `/enviar` (503 con el mensaje) |
| Tareas y Agenda | `/api/tareas`, `/api/agenda`, `/api/agenda.ics` |
| Chat | `/api/chat` (también el socket: cierre 4403) |
| Proyectos, Semana, Rendición | `/api/proyectos`; `/api/semanas`, `/api/informes-sr`; `/api/rendiciones` |
| Mediateca, Prensa, Mapa | `/api/fototeca`; `/api/prensa`, `/estudio`; `/api/grafo` |
| Observatorio, Contraseñas | ninguna (es una página); `/api/contrasenas` |

**El guardián** (`GuardianModulos`, middleware ASGI en `main.py`) mira el prefijo de la ruta y, si su
módulo está apagado, responde 403 `{"detail": {"codigo": "modulo_apagado", "modulo", "mensaje"}}` antes de
la autenticación. `test_modulos.py` comprueba que cada prefijo corresponde a rutas reales y que el núcleo
(documentos, directorio, perfil, `/api/modulos`, la API pública) no tiene dueño. Las reglas de eventos
(`eventos_sistema._aplicar`) no publican con el Chat apagado ni crean tareas con Tareas apagado.

**La web** guarda lo último de `GET /api/modulos` (`modulos.ts`, en `localStorage`) y lo pide el Marco una
vez por carga; un 403 `modulo_apagado` de cualquier pantalla lo pone al día (`api.ts`). Con eso:
`modulosVisibles()` saca lo apagado del menú y de Inicio, la barra inferior del celular lo omite, el
contador del chat (y su socket) no se monta, las rutas de un módulo apagado muestran su mensaje
(`ConModulo`) y los atajos de otros módulos se esconden (el «Mensaje» de una tarjeta de contacto, las
fechas de agenda de un documento, el evento de un recibido).

**Datos al primer ingreso.** `ajustes.primer_ingreso = {activo, excluir_cargos}` (de fábrica, en uso y sin
pedirlos a «Diputado»). `pide_bienvenida(u)` = en uso, `datos_completos_en` NULL y cargo no exceptuado (el
cargo de la cuenta o, en una antigua sin cargo, el de su rol). `usuario_actual` responde 428
`datos_pendientes` mientras toque; Mi perfil, la foto y la bienvenida usan `usuario_con_clave_propia`
(solo la clave), que es lo que hay que poder usar entretanto. El login y el cambio de clave devuelven
`debe_completar_datos`; la web encadena `/clave` (paso 1) y `/bienvenida` (paso 2) con la misma carcasa
(`PasoIngreso`) y, ante un 428, va a la que corresponda. `POST /api/cuenta/bienvenida` guarda como el
perfil (también la ficha del directorio) y, si no falta nada (`datos_faltantes`: nombres, apellidos,
celular, correo y cargo), marca `datos_completos_en`. En Administración, `pedir_datos` vuelve a pedirlos
o los da por hechos.

**Compartir el acceso** (`frontend/src/acceso.ts`, puro; `componentes/admin/CompartirAcceso.tsx`;
`GET /api/admin/enlace` da `SGDP_URL_PUBLICA`): el mensaje se arma en la web con la cuenta, el enlace y
la contraseña temporal recién entregada (al crear o restablecer) o generada en la ventana con
`POST /api/admin/usuarios/{id}/clave`. Pruebas: `frontend/pruebas/acceso.test.ts`.

**La vista elegida** (`frontend/src/vista.ts`, puro; `componentes/MarcoVista.tsx`, `componentes/ElegirVista.tsx`):
`main.tsx` decide antes de montar: fuera de un marco, con una vista distinta de «Automática» y fuera de
`/mesa-de-partes`, monta el marco (barra + iframe del mismo sitio) en lugar de la aplicación; dentro del
iframe, la aplicación de siempre. `marcoDe` da el ancho (390, 820, 1366), el alto y la escala, o null si
la ventana ya es de ese aparato (cortes del tema: 600 y 900 px; escritorio desde 1200). `App.tsx::SeguirRuta`
copia la dirección y el título de adentro a la ventana de afuera. Pruebas: `frontend/pruebas/vista.test.ts`.


## 34. Documentos desde un Word y notas de sustento normativo

(2026-10-18; pedidos de Edison, decisión en `docs/decisiones.md` §Doce mejoras, puntos 1 y 9.)

**Documentos desde un Word** (`backend/app/servicios/importar_word_documentos.py`, `POST
/api/documentos/importar-word`, `frontend/src/componentes/CargarWordDocumentos.tsx`): fase 0 de
`docs/plataforma/formato-word.md`. Un `.docx` se lee con el único lector de Word del sistema
(`scripts/importar_proyecto_ley.py` por `importar_word.lector()`: párrafos, numeración materializada,
notas al pie como «⟦id⟧», tablas) y se parte en documentos por su encabezado (`partir`: «OFICIO N.° …»,
«CARTA …», «MEMORANDO …»); de cada trozo `leer_campos` saca por patrones lugar y fecha, tratamiento,
destinatario, cargo e institución, asunto y referencia (los extractores de los recibidos), anexo, copias
e iniciales, y el cuerpo —de «Presente.-» (saltando los rótulos y sus continuaciones) a «Atentamente,»—
como nodos del editor con sus notas en su lugar. Lo que no se reconoce queda vacío y se avisa; nada se
adivina. El archivo espera una hora con un `token` (carpeta temporal del sistema); «Crear» hace un
borrador por índice elegido con `_nuevo_borrador` (lo mismo que `POST /api/documentos`: lugar, fecha,
formato predeterminado y copias por regla, y encima lo leído), `origen='sgdp'`, bitácora «desde un
Word». Cada documento sigue el trámite de siempre; aquí no se numera. Pruebas puras:
`backend/tests/test_importar_word_documentos.py`.

**Notas de sustento normativo** (`backend/app/servicios/notas_normativas.py`, `GET
/api/documentos/{id}/notas-sugeridas`): un catálogo de notas con dónde aplican (tipos y una señal en el
asunto o el cuerpo), cómo se reconoce que ya están, el texto fiel a la edición oficial y su fuente en la
biblioteca (`calibre_id` del archivo y clave de cita de Zotero: N 9.6). Antes de ofrecer una nota se
comprueba que la fuente exista en Calibre (`biblioteca.obtener`); sin fuente no se ofrece. El editor la
pide al abrir y tras cada guardado y la muestra bajo «Cuerpo» con «Insertar» (nota al pie editable al
final del párrafo del pedido, o al final del texto) y «Ahora no»; una ya puesta no se ofrece otra vez.
Primera nota: la reiteración del pedido de información del **artículo 159, literal e), segundo
párrafo** del Reglamento de la Cámara de Diputados (edición oficial 2026): el texto pedido hablaba de un
«literal f)» que la edición oficial no tiene; se cita lo que dice. En qué tipos se ofrece cada nota es
un **ajuste** (Edison, 2026-10-19): `ajustes.notas_normativas` {clave → tipos}, leído por
`notas_normativas.tipos_vigentes` y editado en Administración → Reglas (`ReglasNotas.tsx`,
`GET/PUT /api/ajustes/notas-normativas`, solo administrador guarda); de fábrica, solo los cuatro oficios
(Edison: «solo en oficios que piden información»).

**Formato Word, el espacio de trabajo** (fase 2, aprobada y construida el 2026-10-19;
`frontend/src/paginas/FormatoWord.tsx`, `frontend/src/componentes/word/`): la segunda modalidad de
Gestión documental («Nuevo documento → Formato Word», ruta `/documentos/word`). No es otro editor ni otra
composición: cada **sección** del espacio es un documento real (`SeccionWord`), con el editor TipTap del
formulario (`extensionesDocumento`) y su guardado (`PUT` con `version_base`; 409 → `guardarApartado` y
recarga; sin servidor → `encolar`); se ve como una **página simulada** al ancho del PDF (`modelo.ts`:
`paginaPx`, `margenCm` desde `fmt_margenes`, `marcasRegla` para la regla) con los campos del esquema del
tipo escritos en su sitio (`disposicion`: lugar y fecha, encabezado, cierre; los campos «ocultos» que la
hoja sí ubica —tratamiento, cargo, Adj.— se muestran; `fmt_*` y `anexos` no). La barra de formato e
insertar (`BarraFormato`) y el selector de estilo de párrafo actúan sobre la sección activa (la que tiene
el foco); el **panel de estructura** (`PanelEstructura`) lista las secciones (asunto, estado, «sin
guardar») y las notas al pie de la activa (un toque las selecciona y abre su editor por el evento
`sgdp-nota`). «Añadir»: documento nuevo (`POST /api/documentos`), «Desde un Word» (fase 0), «Pegar el
resultado de un prompt» (`PegarDocumento` → se crea el documento y la sección aplica campos y cuerpo al
cargar) y «Un borrador que ya existe». El espacio de cada cuenta (ids y activo) vive en
`ajustes` como `espacio_word:<usuario_id>` (`GET/PUT /api/ajustes/espacio-word`, `api/ajustes.py`). Solo
se edita un borrador `sgdp` sin número y sin firma en curso; lo demás se ve y manda al formulario
(«Formulario» en cada franja), donde siguen numeración, firma, anexos, formato y vista PDF. Celular: hoja
a todo el ancho con márgenes en proporción, estructura en hoja inferior. Pruebas puras:
`frontend/pruebas/word.test.ts`.

**Un editor para todos los módulos** (2026-10-19, Edison: «un editor documental integrado, potente y
reutilizable en todo el SGDP»): la decisión y la matriz frente a Google Docs están en
`docs/plataforma/formato-word.md` §«Editor documental integrado». En código: `useEditorWord` (local o
Yjs: `doc:<id>:<gen>` y `pl:<pid>:<parte>:<gen>`, con Collaboration y cursores), `SeccionParte` (una
parte de un proyecto de ley: `PUT /secciones/{clave}` con `version_base` y `generacion`, versiones y
restaurar con los endpoints de siempre), `ProyectoWord` (`/proyectos/:id/word`: todas las partes en
orden, Conversación de la parte activa en el panel, `GET /api/proyectos/{pid}/docx`), `ComentariosWord`
(los comentarios del documento, `useComentarios` del formulario) y el cajón de historial del
formulario desde la franja de cada sección. Lo que llega por Yjs no ensucia ni guarda
(`ySyncPluginKey`). Exportar a Word: `servicios/exportar_docx.py` (un conversor del JSON de TipTap para
documentos y proyectos; notas al pie numeradas al cierre porque python-docx no escribe notas nativas).

**Control de cambios** (2026-10-19, Edison: «modo sugerir: inserciones y supresiones por autor, aceptar
o rechazar»; `frontend/src/extensiones/ControlCambios.ts`, parte pura en `cambios.ts`): dos marcas del
esquema, `insercion` y `supresion` (`autor`, `en`), en las dos listas de `esquema.ts` (formulario,
Proyectos, Formato Word y el servidor de texto compartido las conocen; viajan por Yjs como cualquier
marca). Con «Sugerir» encendido (`BarraFormato`, por pestaña en `sessionStorage`), el plugin convierte
lo que se escribe o pega en texto con `insercion`, y lo que se borra (Retroceso, Suprimir, escribir
sobre una selección) en texto con `supresion` sin quitarlo; borrar la propia inserción sí la quita; un
tramo ya suprimido solo se salta. Comandos `aceptarCambio`/`rechazarCambio(de, a)` y `…Todos`
(aceptar: la inserción queda y la supresión se borra; rechazar, al revés). «Cambios (n)» abre
`PanelCambios` (lista por autor y fecha, ir al tramo, aceptar o rechazar). En el PDF
(`latex/serializador.py`): `\uline` y `\sout` (ulem); en Word (`exportar_docx._como_cambio`): `w:ins` y
`w:del` con `w:delText`, autor y fecha, que Word acepta o rechaza.

Segunda parte (2026-10-19, fase 6): **formato**: una tercera marca, `cambioFormato` (`autor`, `en`,
`antes`, `despues`, los dos últimos JSON por clave: `{"bold":true,"colorTexto":"A6122E","textAlign":"center"}`).
El plugin la pone en `appendTransaction`: tras cualquier transacción que añada o quite una marca seguida
(`AddMarkStep`/`RemoveMarkStep` de negrita, cursiva, subrayado, color, resaltado) o reescriba la
alineación de un párrafo (`ReplaceAroundStep` de `setNodeMarkup`), deshace ese paso y deja la marca
fundida con la que el tramo tenía (`cambios.ts::fundirFormato`: pedir dos veces lo mismo la retira). Así
se sigue cualquier camino (botón, atajo, menú, pincel). Se saltan las transacciones propias, las de
deshacer (`history$`), las de carga (`addToHistory` apagado) y las del texto compartido (`y-sync$`).
Aceptar aplica `despues` (marcas o `textAlign` del párrafo, y retira esa clave de los demás tramos del
párrafo); rechazar solo quita la marca. **Estructura**: tres atributos globales de `paragraph` (`cambio`
= `insercion` | `supresion`, `cambioAutor`, `cambioEn`): Intro divide con `tr.split` y el párrafo nuevo
nace `insercion`; Retroceso al inicio, Suprimir al final y una selección que cruza párrafos marcan el de
después como `supresion` en vez de unir (`sugerirUnion`); dividir o unir el propio párrafo sugerido lo
deshace de verdad. Solo párrafos de primer nivel (listas y tablas se editan directo). Aceptar una
`supresion` o rechazar una `insercion` une (`tr.join`); lo contrario limpia el atributo. `cambiosDe` lista
los cuatro tipos (`insercion`, `supresion`, `formato`, `parrafo`); `aceptarCambio(de, a, filtro)` admite
autor y tipo y `aceptarTodos(autor)` solo los suyos: el panel filtra por autor con chips. El PDF y el Word
ignoran `cambioFormato` y los atributos `cambio`: el documento sale como estaba. **Al publicar hay que
reiniciar el servidor de texto compartido y recargar las pestañas**: `y-prosemirror`, al convertir un
`Y.Text` con una marca que su esquema no conoce, BORRA ese tramo del documento compartido (el `catch` de
`createTextNodesFromYText`), no solo la marca; se comprobó el 2026-10-19 con el servidor de prueba viejo.

**Comentarios anclados a un tramo** (2026-10-19, fase 5; `frontend/src/extensiones/Comentario.ts`, parte
pura `anclas.ts`): una marca `comentario` con el `id` del comentario sobre el tramo elegido; el
comentario vive donde siempre (los del documento en `comentarios`, con `seccion='cuerpo'`; los del
proyecto en la Conversación, `ProyectoActividad`), y el alta devuelve su `id` para anclarlo
(`POST /api/proyectos/{pid}/comentarios` lo devuelve desde ese día). El panel (`ComentariosWord`,
`ComentariosParte`) cita el tramo (`anclasDe`, `citaDe`), lleva a él, destaca el comentario cuando se
toca su tramo en la hoja (`EVENTO_COMENTARIO` de `PaginaWord`) y retira la marca al resolverlo
(`desanclarComentario`). El PDF y el Word no imprimen la marca.

**La barra con la forma de Google Docs** (2026-10-19, Edison: «que se parezca a la imagen de Google Docs
que mandé»; `frontend/src/componentes/word/BarraWord.tsx`, modelo puro en `menus.ts`): el Formato Word
lleva los tres pisos de Google Docs sobre el mismo editor. (1) El título del documento o la parte
activa (icono, nombre, estado, «Guardado» y palabras) con historial, comentarios y «Compartir» (copia el
enlace del documento o del proyecto). (2) Los menús «Archivo · Editar · Ver · Insertar · Formato ·
Herramientas · Ayuda»: cada módulo aporta su «Archivo» (`EspacioWord` recibe `archivo: ItemMenu[]`:
nuevo, desde un Word, pegar un prompt, traer un borrador, guardar todo, PDF, historial, descargar, quitar);
lo demás se arma en la barra sobre el editor activo; los submenús se abren dentro del mismo menú
(«‹ Volver»), que funciona igual con el dedo; «Buscar en los menús» (la lupa, Alt+/) recorre ese árbol
(`buscarEnMenus`). (3) La píldora de herramientas en el orden de Google Docs: deshacer, rehacer,
imprimir (el PDF del sistema), ortografía (el corrector del navegador; se apaga y se recuerda,
`sgdp_ortografia`), copiar formato, zoom (50–200 %), estilo de párrafo, letra (la fija la plantilla: solo
se muestra), tamaño −/+ e interlineado (los campos `fmt_tamano`/`fmt_interlineado` del documento, por
`ManejadorSeccion.ponerCampo`; en un proyecto la plantilla manda), negrita, cursiva, subrayado, color de
texto, resaltador, enlace, comentario (enfoca el campo del panel, `ID_COMENTARIO_NUEVO`), imagen (la
fotografía de un proyecto, `BotonFotografia soloIcono`), referencia («@»), alinear, interlineado y
sangrías, listas, quitar formato, y a la derecha el modo **Edición · Sugerencias · Vista** (sugerir =
control de cambios; vista = `setEditable(false)` recordando cómo estaba). La píldora nunca se parte en
dos filas: si no cabe se compacta (sin rótulos) y en el celular se desplaza de lado; el chevrón pliega
el título y los menús. La lógica con estado (pincel, nota al pie, buscar, cambios, orden del pegado de
Word) es `useHerramientasEditor` en `BarraFormato.tsx`: las dos barras pintan botones distintos sobre los
mismos comandos y diálogos.

**Color de texto** (`frontend/src/extensiones/ColorTexto.ts`): una marca `colorTexto` con un hex de la
paleta cerrada de la identidad (vino, dorado, grises, rojo, azul, verde); a diferencia del resaltado,
**sale al PDF** (`\textcolor[HTML]{…}`, xcolor ya va en `marco_documental/core/config/colores.tex`; el
serializador solo acepta seis hexadecimales) y al Word (`font.color`). El color que trae un pegado de
Word se ignora, como todo estilo ajeno.

## 35. Visor rápido de la bandeja

Tocar en la bandeja un documento de después de la firma (`abreVisorRapido` de `frontend/src/visorRapido.ts`) abre
`frontend/src/componentes/VisorRapido.tsx` sin salir de `/documentos`: la imagen de la primera página del firmado (o
del PDF del sistema), dos acciones, la fila de archivos y el desplazamiento por la lista filtrada
(decisión del 2026-10-19 en `docs/decisiones.md`). Piezas:

- **Imagen de página**: `GET /api/documentos/{id}/imagen?pagina=&archivo=documento|expediente|<adjunto_id>&ancho=&formato=png|jpeg`
  (`imagen_de_pagina` de `backend/app/api/adjuntos.py` → `imagen_de_pagina` de `backend/app/servicios/imagen.py`, pdftocairo a 150 ppp
  o a la resolución que deja la A4 en `ancho` px; cabecera `X-Total-Paginas`). El navegador la pide con la sesión
  (`traerPaginaComoImagen` de `frontend/src/copiar.ts`, la misma de «Copiar como imagen») y la guarda en memoria (hasta 40 por
  sesión; la URL de blob se libera al desalojar). Un adjunto que ya es imagen (un cargo en JPG) se pide tal cual.
- **Sin rasterizar dos veces** (2026-10-19): el ETag fuerte se calcula ANTES de pdftocairo (`clave_de`: ruta, fecha y
  tamaño del PDF, página, resolución y formato; la comparación con `If-None-Match` es `coincide_etag` de
  `backend/app/api/archivos.py`, la misma de `enviar_archivo`) y un `If-None-Match` igual responde 304 con `X-Total-Paginas`;
  `Cache-Control: private, no-cache, must-revalidate` hace que el navegador guarde y pregunte siempre, así que un PDF
  recompilado (otra fecha) nunca se ve viejo. La página rasterizada se guarda además en un **caché en disco** con la
  clave como nombre (`leer_cache`/`guardar_cache`): `config.raiz_cache_imagenes()` = `IMAGENES_CACHE_DIR` o
  `$XDG_CACHE_HOME/sgdp/imagenes` (`~/.cache/sgdp/imagenes`; la instancia de prueba, `~/.local/state/sgdp-prueba/cache-imagenes`),
  nunca dentro del archivo documental ni del repo. Es desechable: **se vacía borrando la carpeta** (se recrea sola) y se
  apaga con `IMAGENES_CACHE_MB=0`; `podar` borra lo más viejo que `IMAGENES_CACHE_DIAS` (30) y lo menos usado por encima
  de `IMAGENES_CACHE_MB` (200), como mucho una vez cada cinco minutos por proceso, tras guardar una imagen nueva. El visor
  pide `formato=jpeg` (`rutaImagen(…, 'jpeg')`); «Copiar imagen» y `BotonCopiar` siguen pidiendo PNG, lo único que admite
  el portapapeles. Cifras en `docs/decisiones.md` (visor rápido, punto 10).
- **Secuencia y precarga**: `secuencia`, `vecinos` y `aPrecargar` de `visorRapido.ts` sobre `visibles` de
  `frontend/src/paginas/Bandeja.tsx`. Al mostrarse una página se piden la siguiente del mismo archivo, la primera del
  documento siguiente y la del anterior (con el `firmado_id` que ya trae el listado, sin esperar
  `GET /adjuntos`) y el PDF del archivo actual, para «Compartir».
- **Archivos**: `GET /api/documentos/{id}/adjuntos` → `archivosDe` (firmado, documento, cargos,
  recibidos, adjuntos; solo PDF e imágenes).
- **Gestos y teclas**: `interpretarGesto` (de lado = documento; de arriba abajo = página; diagonal o
  corto = nada) e `interpretarTecla`; eventos de puntero con `touch-action: none` y captura del puntero;
  doble toque = zoom 2,5× con arrastre.
- **Historial**: una entrada `{sgdpVisorRapido: true}` al abrir; `popstate` cierra; «Abrir documento»
  navega con `replace`.
- **Pantalla fija**: el papel del diálogo lleva `touch-action: none` y `overscroll-behavior: none` (y se
  anula `gesturestart` mientras está abierto), así que ni el pellizco del sistema ni el rebote mueven la
  cabecera ni la barra de acciones; la tira y las fichas declaran `pan-x`, la cuadrícula `pan-y`. En la
  tarjeta del celular, solo el cuerpo (`role="button"`) llama a `tocar`; los controles laterales no.
- **Liviano**: la imagen se pide a `anchoImagen(ancho de la lámina, devicePixelRatio)` (pasos de 128 px;
  0 = página entera), con la clave del caché por ancho; la precarga (siguiente, anterior, página 2 y el PDF
  para «Compartir») espera 300 ms tras verse la actual. La tira de miniaturas nace apagada y pide cada
  miniatura (`&ancho=160`) al entrar en la vista; el pie es una cuadrícula `minmax(0, 1fr)` para que la
  tira nunca ensanche la barra de acciones.
- **Dónde se engancha**: `tocar` de `Bandeja.tsx` (fila de la tabla, tarjeta del celular y, por
  `Ficha` de `frontend/src/componentes/VistasBandeja.tsx`, las vistas por etapa, seguimiento, institución y cronología); `abrir` sigue
  siendo la ficha completa (⋮, pulsación larga de `frontend/src/pulsacionLarga.ts`, ícono ↗, botón del visor).

Pruebas puras: `frontend/pruebas/visorRapido.test.ts`.

## 36. Partes editables de un proyecto de ley

Desde el 2026-10-19 las partes de cada proyecto se añaden, quitan, renombran y reordenan (decisión
«Partes editables en Proyectos de ley» en `docs/decisiones.md`). El modelo ya era por proyecto
(`proyecto_secciones`: clave, título, grupo, orden, obligatoria); la plantilla
(`backend/app/servicios/proyectos_plantillas.py`) solo dice con cuáles nace.

| pieza | dónde | qué hace |
|---|---|---|
| lógica pura | `backend/app/servicios/proyectos_partes.py` | clave de una parte nueva (slug del título, única, nunca una de la plantilla), partes restaurables, orden normalizado (grupos sin cruzar, fijas de la fórmula en el orden oficial), dónde se inserta una nueva |
| API | `backend/app/api/proyectos.py` | `GET /{pid}/partes-disponibles`, `POST /{pid}/secciones` (nueva o `plantilla`), `DELETE /{pid}/secciones/{clave}?confirmar=` (409 `parte_con_texto`), `PUT /{pid}/secciones-orden`; `PATCH …/secciones/{clave}` renombra todo menos `titulo` |
| generador | `backend/app/latex/proyecto_ley.py` | compone en el orden del proyecto: la fórmula legal con `_plan_formula` (fijas en orden oficial, nuevas entre ellas), la exposición en el orden del panel con marcadores `\componente` solo hacia adelante (`\proyectoenavance` si alguno se salta), complementos nuevos tras el cuadro comparativo |
| web | `frontend/src/componentes/PartesProyecto.tsx` (`usePartesProyecto`), `frontend/src/partesProyecto.ts` | un gancho para la pestaña Texto y el Formato Word: menú «Añadir», ⋮ (renombrar, subir, bajar, quitar) y arrastre; `PanelEstructura` pinta el ⋮ y el arrastre |

Invariantes: la clave no cambia (texto compartido `pl:<pid>:<clave>:<gen>`, relaciones `seccion:<clave>`,
actividad, tareas); al quitar se borran las versiones (FK en cascada) y el estado Yjs, y las citas
dejan de ser fuentes; `ver` devuelve por parte `id` (identidad estable para la web), `fija` y
`de_plantilla`. Pruebas: `backend/tests/test_proyectos_partes.py`, `backend/tests/test_proyecto_ley.py`
(orden del panel y partes nuevas), `frontend/pruebas/partesProyecto.test.ts`.

## 37. Estadísticas de uso y presencia que se apaga

Telemetría propia (2026-10-19; decisión «Estadísticas de uso propias y presencia que se puede apagar»
en `docs/decisiones.md`): `frontend/src/uso.ts` anota vistas (ruta anonimizada y duración), errores
de JavaScript y arranques, con aparato y versión, y los manda en lotes a `POST /api/uso`
(`backend/app/api/uso.py`; `navigator.sendBeacon` con la sesión en el cuerpo). La limpieza (lista
blanca, ids → `:id`, detalle solo en errores) y las consultas viven en `backend/app/servicios/uso.py`;
la tabla `uso` se purga a los 90 días. Administración → Uso (`frontend/src/componentes/admin/Uso.tsx`)
lee `GET /api/uso/resumen?dias=` y `GET /api/uso/cuentas`. La presencia (`backend/app/api/presencia.py`)
respeta `usuarios.mostrar_presencia`: apagada, los demás ven la cuenta desconectada; el administrador
ve el estado real. Pruebas: `backend/tests/test_uso.py`, `frontend/pruebas/uso.test.ts`.

