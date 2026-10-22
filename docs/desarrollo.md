---
tipo: doc
titulo: "Desarrollo de Qillqa: entorno, pruebas, migraciones de esquema y despliegue de cambios"
estado: activo
---
# Desarrollo de Qillqa

Cómo se levanta el entorno, cómo se prueban los cambios y cómo se llevan a la máquina que sirve al
despacho. Las decisiones de fondo están en `docs/arquitectura.md`; la operación diaria, en
`docs/manual-de-uso.md`.

## Piezas y versiones

| pieza | tecnología | dónde |
|---|---|---|
| API | Python 3.12, FastAPI 0.115, SQLAlchemy 2 (asyncpg), pydantic-settings, PyJWT | `backend/app/` |
| Base de datos | PostgreSQL 16 en Docker (`docker-compose.yml`, servicio `db`) | volumen `db-data` |
| Web | React 18 + TypeScript + MUI + TipTap, Vite; PWA (`frontend/public/sw.js`) | `frontend/` |
| Motor de formato | LuaLaTeX (TeX Live del host, o el contenedor `latex`) + `../qillqasqa/marco_documental/` | `MDD_RUTA` |
| Utilidades | `pdfunite`, `pdftocairo`, `pdftoppm` (poppler) para expediente, copia como imagen y folios; `magick` (ImageMagick) para las miniaturas de las fotos de la semana y para abrir en la Fototeca lo que Pillow no lee (HEIC) | host |
| Edición simultánea | Node 24, Hocuspocus 2.15 + Yjs (TipTap 3 con colaboración); puerto 8001, detrás de `/colab` | `../qillqasqa/web/colab/servidor.ts` |

## Entorno de desarrollo (modo laptop)

```bash
cp .env.example .env                 # claves y rutas; MDD_RUTA obligatoria
docker compose up -d db              # solo PostgreSQL
python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt \
  -r backend/requirements-dev.txt
backend/.venv/bin/pip install --no-deps -e ../tiqsi -e ../rikchay -e ../wayra -e ../ruray -e ../tullpu -e ../kuyuy -e ../awana -e ../qhawana -e ../yupay -e ../minka -e ../rimay -e ../punku -e ../qillqasqa   # los proyectos de la plataforma, desde su carpeta hermana
cd backend && DATABASE_URL="postgresql+asyncpg://qillqa:<clave>@127.0.0.1:5432/qillqa" \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
cd frontend && npm install && VITE_API_PROXY=http://127.0.0.1:8000 npm run dev
```

Los proyectos que ya salieron de Qillqa (Tiqsi; desde el 2026-10-21, Rikchay, la Mediateca; Wayra, el kit de OBS;
Ruray, la base de los editores; Tullpu, el editor de fotos; Kuyuy, el de videos, Awana, el de piezas; Qhawana, el Observatorio; Yupay, la Rendición; Minka, Tareas y Agenda; Rimay, el chat; Punku, la Mesa de Partes; desde el 2026-10-22, Qillqasqa: Gestión documental, Proyectos de ley y la
Semana, con el marco documental —`MDD_RUTA` apunta a `../qillqasqa/marco_documental`— y el servidor de edición
simultánea, `../qillqasqa/web/colab/servidor.ts`) viven en su carpeta hermana: el backend los instala en modo editable (`--no-deps`: sus versiones son las de Qillqa) y la web,
como `file:../../<proyecto>/web` en `frontend/package.json`. El servidor de desarrollo los trata como código
(`optimizeDeps.exclude` en `frontend/vite.config.ts`, que preempaqueta todo lo de npm que ellos importan: el editor de
Qillqasqa trae TipTap y Yjs) y no vigila sus archivos: tras tocarlos, borrar `frontend/node_modules/.vite` y reiniciarlo.

O, con un solo comando, `QILLQA_DEV=1 ./iniciar.sh` (web en modo desarrollo). Sin `QILLQA_DEV`,
`iniciar.sh` sirve el **build** (`vite preview`) porque el service worker no convive con la recarga en
caliente. `iniciar.sh` exporta todo el `.env` (`set -a; source .env`), así que las variables llegan a
la API, al build de la web (`VITE_*`) y a `build.sh` del marco. La API de `iniciar.sh` corre **sin
`--reload`**: tras cambiar el backend, `pkill -f "uvicorn app.main:app"` y `./iniciar.sh`.

Variables de entorno (`.env.example` trae las del despliegue; las demás se nombran aquí): `POSTGRES_*`, `JWT_SECRET`, `MDD_RUTA` (marco),
`MDD_PERFIL` (perfil del despacho; sin él, `../qillqasqa/marco_documental/core/perfil-defecto/`), `MDD_DOCUMENTOS`
(archivo documental; sin él, `MDD_RUTA/documentos`), `BOOKMARKS_RUTA` (directorio institucional de
origen), `ISR_RAIZ` (expedientes de las semanas de representación; sin ella, `representacion/` junto al
archivo documental), `FOTOTECA_DIR` (originales y derivados de la Fototeca; sin ella, `fototeca/` junto al archivo
documental), `RENDICIONES_DIR` (rendiciones de cuentas: PDF, Excel y comprobantes, por año y comisión; sin ella,
`rendiciones/` junto al archivo documental), `ZONA_HORARIA` (con la que se leen las fechas del EXIF; por defecto `America/Lima`), `ISR_PYTHON` (python con jinja2, matplotlib y Pillow con el que la web genera el ISR;
sin ella, el `python3` del PATH, que el arranque automático no suele traer), `CALIBRE_DB` y `DATAFW_CATALOGO` (fuentes enlazadas de los proyectos, solo lectura; sin ellas,
las del workspace vía `core/env.py`; `CALIBRE_DB` alimenta además la búsqueda en la biblioteca y las citas APA 7,
`/api/biblioteca`, que sin base queda apagada), `VITE_NOMBRE_DESPACHO` (título de la interfaz), `ADMIN_USUARIO`/`ADMIN_CLAVE` (cuenta
administradora que la siembra crea si no existe; sin clave, la inicial es el usuario y se cambia al
primer ingreso), `SIGLAS`/`PERIODO`/`LUGAR` (identidad del número oficial; hoy con valor por defecto en
`config.py`), `OPENPROJECT_URL`/`OPENPROJECT_TOKEN`/`OPENPROJECT_URL_PUBLICA`/`QILLQA_URL_PUBLICA`/
`OPENPROJECT_INTERVALO` (reflejo en OpenProject; sin URL o sin token, apagado), `VITE_URL_TAREAS`/
`VITE_URL_IDENTIDAD` (tarjetas de Inicio hacia OpenProject e Identidad Visual; la de tareas la da la
API si falta; no están en `.env.example`), `TELEGRAM_TOKEN`/`TELEGRAM_CHAT` (aviso del
enlace; solo `enlace.sh`), `QILLQA_DEV`. El servidor de edición simultánea (`node frontend/colab/servidor.ts`) lee
`JWT_SECRET` (de ella deriva su credencial ante la API), `QILLQA_API` y `COLAB_PUERTO`; `iniciar.sh` se
las pasa, y la web lo alcanza por el proxy `/colab` (`VITE_COLAB_PROXY` lo cambia). El backend las lee solo a través de `backend/app/config.py` (`pydantic-settings`:
el nombre de la variable es el del campo en mayúsculas); ningún módulo lee `os.environ`.

## Pruebas

```bash
( cd backend && .venv/bin/python -m pytest -q tests ) # pruebas puras, sin base de datos
make -C marco_documental plantillas                   # todas las plantillas del marco compilan
( cd frontend && npm run build )                      # tsc (web y colab/) + vite: PUBLICA en producción
backend/.venv/bin/python scripts/colab_ida_y_vuelta.py   # edición simultánea: JSON → Yjs → JSON y LaTeX, toda la base (solo lee)
QILLQA_USUARIO=prueba QILLQA_CLAVE="$(cat ~/.local/state/qillqa-prueba/clave_admin)" \
  node frontend/colab/prueba_dos_clientes.ts          # dos clientes Yjs contra la instancia de prueba (~2 min)
```

Para comprobar que la web compila **sin publicarla**: `npx tsc && npx tsc -p colab && npx vite build
--outDir <carpeta temporal>` dentro de `frontend/`.

`backend/tests/` reúne pruebas puras, un módulo por área (rutas y re-anclaje, asunto, ronda de usabilidad,
proyectos y proyecto de ley, comparativo, catálogos, fuentes, edición simultánea, OpenProject con un
servidor simulado, informes y semanas de representación con datos sintéticos); cada uno fija
`DATABASE_URL` y `JWT_SECRET` ficticios antes de importar `app`. Un cambio de la interfaz se verifica a
mano en la instancia de prueba y mirando el PDF (`docs/procesar-un-documento.md` §6). Para un cambio en
`core/` del marco, además de las plantillas, recompilar un documento real del archivo.

### Línea base y recorrido: que nada se pierda

La red de seguridad de la separación en proyectos (fase 0 de `docs/plataforma/propuesta-repositorios.md`,
2026-10-20). Va en dos piezas:

- **La foto** (`backend/tests/linea_base.py` → `backend/tests/linea_base/funciones.json`, una línea por
  ruta). Retrata cada ruta de la API con su método, sus parámetros, los campos de su cuerpo y su acceso
  (público, con sesión, solo administración), cada pantalla de `frontend/src/App.tsx` con lo que la
  guarda, el menú de `frontend/src/navegacion.ts` y los módulos encendibles. `backend/tests/test_linea_base.py`,
  que corre con las demás pruebas, falla si algo desaparece o cambia de acceso. Lo nuevo no cuenta. Si
  se retira algo a propósito, la foto se rehace y su diff va en el mismo commit, explicado:
  `( cd backend && .venv/bin/python -m tests.linea_base --aplicar )`. Sin `--aplicar`, solo muestra qué
  cambió.
- **El recorrido** (`backend/tests/recorrido.py`), contra la instancia de prueba y nunca contra
  producción. Hace un barrido de cada consulta de la foto (ninguna puede responder 5xx) y nueve flujos de
  punta a punta (`backend/tests/recorrido_flujos.py`): oficio numerado con su PDF; recibido con
  responsable y respuesta; chat con adjunto; foto en la Mediateca; tarea y evento; rendición con
  comprobante; semana con su informe y una foto citada de la Mediateca; proyecto con una parte; y dos
  personas editando a la vez. Tarda poco más de un minuto:
  `( cd backend && .venv/bin/python -m tests.recorrido )` (`--solo barrido|flujos`,
  `--flujos documentos,chat`).

### Lo que llega de producción hasta el corte

Mientras dure la migración, producción sigue recibiendo arreglos y el verde no puede perder ninguno
(`docs/plataforma/propuesta-repositorios.md` §7.2). `produccion` es el remoto de solo lectura de esta copia;
`scripts/portar_produccion.py` lo trae y lista los commits que faltan, con el destino de cada archivo: lo que sigue en
Qillqa (con sus renombres del verde) y lo que salió a un proyecto hermano, según la tabla «De Qillqa a X: dónde quedó
cada archivo» de su README. Un commit cuenta como portado si está en la historia del verde o si un commit del verde o
de un hermano lleva la línea `Porta: produccion <hash>`.

1. `python3 scripts/portar_produccion.py` (simula; avisa si producción tiene cambios sin commit: no se tocan, se portan
   cuando se confirmen).
2. Si todo cae en Qillqa: `git merge produccion/main`, con una línea `Porta: produccion <hash>` por commit en el mensaje.
3. Si toca archivos movidos (desde el 2026-10-22 el marco, el generador del informe de la semana y Gestión documental
   están en Qillqasqa): `python3 scripts/portar_produccion.py <hash>` ensaya el parche con las rutas traducidas en
   cada repo y `--aplicar` lo deja en sus copias de trabajo (lo que no entra, en `.rej`); se prueba y se hace un commit
   por repo con `Porta: produccion <hash>`. Lo de negocio manda producción; lo de estructura (rutas, imports a paquetes), el
   verde.
4. Se verifica como cualquier cambio (pruebas, recorrido) y, si toca el informe de la semana, compilando uno en el
   verde.

## Migraciones de esquema

No hay Alembic. El esquema se crea y actualiza **al arrancar la API** (`backend/app/main.py`,
`ciclo_de_vida`): `Base.metadata.create_all` crea las tablas que faltan y, a continuación, una lista
de `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (y algún `ALTER COLUMN`) añade las columnas nuevas de
forma idempotente sin perder datos. Para añadir un campo:

1. Declararlo en `backend/app/modelos.py` (así lo tendrán las instalaciones nuevas por `create_all`).
2. Añadir su `ALTER TABLE <tabla> ADD COLUMN IF NOT EXISTS <columna> <tipo>` en `main.py`, junto a
   los existentes, para las bases que ya existen.
3. Reiniciar la API y comprobar en los registros que arrancó (`api.log` (en `logs/`)).

Los estados de documento son `String(20)` sin enum: un estado nuevo no necesita migración, solo
`flujo.py` (matriz de transiciones) y `estados.ts` en el frontend. Un cambio que exija transformar
datos (no solo añadir columnas) se escribe como script en `scripts/` con `--dry-run`, se prueba
sobre un respaldo (`./respaldar.sh`) y se anota en `docs/decisiones.md`; modelo:
`scripts/siembra/renombrar_archivos.py`.

## Llevar un cambio al despacho

1. Confirmar en git y traer los cambios en la laptop-servidor (`git pull`).
2. Fuera de horario de trabajo, o avisando: `./detener.sh` y `./iniciar.sh` (recompila la web y
   reinicia la API; el esquema se migra solo al arrancar). Pedir a quien tenga pestañas abiertas que
   recargue (F5): las pestañas viejas no mandan `version_base`.
3. Si cambió `frontend/package.json`, `iniciar.sh` reinstala; en modo Docker,
   `docker compose up -d --build -V web` (la `-V` renueva el volumen de `node_modules`).
4. Comprobar `curl -s http://127.0.0.1:8000/api/health` y, desde otro dispositivo, el enlace público.

## Modo completo (todo en contenedores)

`docker compose up -d --build` levanta `db`, `api`, `web` y `latex` (imagen `texlive/texlive`,
~4 GB, una sola vez). Ahí la API corre con `--reload` y la web con el servidor de desarrollo de Vite
(`npm run dev`, sin service worker ni modo sin conexión), no con el build que sirve `iniciar.sh`. El
marco se monta en `/framework` desde `MDD_RUTA`, en lectura-escritura; la API
compila ejecutando `build.sh` en su propio proceso (`../qillqasqa/qillqasqa/latex/compilador.py`), pero la imagen de
`backend/Dockerfile` (`python:3.12-slim`) no instala TeX: tal como está, este modo no compila (pendiente en
`docs/decisiones.md`). El modo laptop es el habitual.

## Convenciones del código

- Backend: `api/` (routers, un archivo por recurso), `servicios/` (reglas: numeración, trámite,
  envío, revisión, firma, nombres…), `latex/` (generador, serializador TipTap → LaTeX, lector),
  `tipos.py` (registro de tipos, campos, series y carpetas), `flujo.py` (quién puede qué). La
  guarda de permisos vive en el servidor; ocultar botones en la web es cosmético.
- Frontend: `paginas/` (bandeja, editor, heredada, directorio, estadísticas, sincronizar),
  `componentes/`, `sync/` (sincronización a carpeta local), `sinconexion.ts` y `cachelecturas.ts`
  (modo sin conexión), `formato.ts` (ajustes `fmt_*`), `numeracion.ts` y `flujo.ts` (una sola
  escala de pasos).
- Comentarios en español con el porqué y la fecha del pedido; cabeceras según
  `meta/docs/historial/NORMATIVA_ARCHIVOS.md`.
