---
tipo: readme
estado: activo
---
# qillqa/openproject/ — OpenProject para un despacho, como código (suite `openproject_despacho`, anidada en el repo `qillqa`)

<!-- suite:inicio -->
**Suite `openproject_despacho`** · objetivo *sistema* · estado *activo* · - · interfaz cli+gui

Despliegue Docker de OpenProject Community (un contenedor) con configuración como código: seeds rails runner idempotentes que construyen el modelo de gestión del despacho desde un perfil YAML (dry run por transacción), respaldo con rotación y puente Qillqa → OpenProject; el despliegue (.env, respaldos, ids) vive en la carpeta de operaciones del despacho.

- Escribe en: sistema, archivos · simula por defecto: no
- Entrada: OPENPROJECT_OPERACIONES (.env, respaldos, op_ids.json) y OPENPROJECT_PERFIL (perfil/openproject.yml del despacho)
- Depende de: docker, python3, qillqa (puente)
- Timer: `respaldo-openproject.timer (usuario, 02:00, Persistent)`
- Nota: Suite anidada del repo qillqa desde la ola 8 (2026-10-10; antes, raíz de la carpeta tareas del vault). El despliegue vive en $DESPACHO_DIR/operaciones/openproject (o OPENPROJECT_OPERACIONES), nunca por enlace. sembrar.sh y el puente simulan por defecto; iniciar, detener y respaldar actúan sin simulación.

Comandos:

```bash
iniciar.sh
detener.sh
estado.sh
respaldar.sh [--silencioso]
sembrar.sh [--aplicar] [--ids] [seeds/NN_*.rb ...]
bridges/sync_documentos.py [--dry-run|--apply]
```

<sub>Bloque generado desde `suite.yml` por `core/suites.py generar` (2026-10-10); no se edita a mano.</sub>
<!-- suite:fin -->

<!-- suites:inicio -->
Suites de esta carpeta (1); índice global en `meta/INDICE_SCRIPTS.md`. Patrón: M main · C config · L lib.

| Suite | Carpeta | Objetivo | Escribe en | Simula | Timer | Estado | Patrón |
|---|---|---|---|---|---|---|---|
| `openproject_despacho` | [05 tasks](./) | sistema | sistema, archivos | no | respaldo-openproject.timer (usuario, 02:00, Persistent) | activo | `·C·` |

<sub>Bloque generado desde los `suite.yml` por `core/suites.py generar` (2026-10-10); no se edita a mano.</sub>
<!-- suites:fin -->

## Qué es

Despliegue reutilizable de **OpenProject Community** (Docker, un solo contenedor) más su
**configuración como código**: seeds `rails runner` idempotentes que construyen el modelo de gestión
de un despacho parlamentario (proyectos, tipos de trabajo, estados, flujos, roles, campos, vistas,
tableros, plantillas, usuarios, guía) leyendo un **perfil YAML** del despacho. El trabajo registrado
en Qillqa lo refleja en OpenProject la propia API de Qillqa; aquí queda un **puente manual** de
respaldo (`bridges/`). Software libre (GPLv3), datos 100 % en local.

**Nada de un despacho concreto vive aquí**: el perfil, el `.env`, los respaldos y `op_ids.json`
están en la carpeta de operaciones del despacho (regla 8 del `CLAUDE.md` raíz; el doctor lo
comprueba, D12). Lo que aquí hay de un despacho es la plantilla neutra `perfil.ejemplo/openproject.yml`.

```
qillqa/openproject/                   (esta suite: compose, scripts, seeds, puente, docs)
   $DESPACHO_DIR/operaciones/openproject/   (core/env.sh; u OPENPROJECT_OPERACIONES)
                                ├── .env          host, hosts adicionales, secreto, perfil, URL, token, retención, contraseña temporal
                                ├── respaldos/    openproject_<fecha>.tar.gz (rotación)
                                ├── op_ids.json   ids de la instancia (./sembrar.sh --ids)
                                └── estado.md     qué hay vivo en esta instancia
   OPENPROJECT_PERFIL  ─────▶  <despacho>/perfil/openproject.yml   (proyectos, campos, roster)
```

`config.sh` (lo cargan todos los scripts) localiza la carpeta de operaciones por
`OPENPROJECT_OPERACIONES` o, por defecto, en `$DESPACHO_DIR/operaciones/openproject` (carga `core/env.sh`
del workspace; nunca un enlace entre repos, ola 8), carga su `.env` y define
`compose` = `docker compose --project-directory <repo> --env-file <operaciones>/.env`. Cómo se monta,
se da de alta un despacho y se opera con seguridad: `docs/despliegue.md`.

Desde la ola 8 (2026-10-10) es una **suite anidada del repo `qillqa`** (como `marco_documental`); hasta entonces
fue el repo `openproject_despacho` en la carpeta `tareas` del vault, cuyo historial está en
`$RESPALDOS_DIR/renombres/2026-10-10-05-tasks-separacion/`. Las notas de tareas del vault viven ahora en
`~/Documents/tareas/` (sección «Las notas de tareas»). El `id` de la suite sigue siendo `openproject_despacho`;
el manifiesto, `suite.yml`.

## Uso

```bash
./iniciar.sh                                   # arrancar (primer arranque: varios minutos de migraciones)
./detener.sh                                   # detener conservando los datos
./estado.sh                                    # estado, salud, consumo, despliegue
docker logs -f openproject                     # logs en vivo
./respaldar.sh [--silencioso]                  # respaldo consistente con rotación (--silencioso: para cron)
./actualizar.sh                                # última imagen de la serie fijada en docker-compose.yml, con respaldo previo
./sembrar.sh                                   # dry run de TODOS los seeds en orden: nada cambia
./sembrar.sh --aplicar [seeds/NN_*.rb …]       # aplica (todos, o los que se indiquen)
./sembrar.sh --ids                             # regenera op_ids.json en operaciones/ (solo lectura)
python3 bridges/sync_documentos.py             # puente manual Qillqa → OpenProject, simula por defecto
python3 bridges/sync_documentos.py --apply     # escribe; solo con la API de Qillqa detenida (bridges/README.md)
```

El respaldo diario va por cron a las 02:00 (la línea, en `docs/despliegue.md` §Respaldo diario).
**Copie los `.tar.gz` fuera del equipo**: un respaldo en el mismo disco no protege ante robo o falla.
Cómo se vuelve a un respaldo: `docs/restaurar.md`.

## Estructura

| carpeta o archivo | qué es | dueño / generador |
|---|---|---|
| `docker-compose.yml` | el contenedor, sus volúmenes con nombre fijo y el healthcheck; lo de un despliegue viene del `.env` de operaciones | a mano |
| `config.sh` | el único sitio que resuelve rutas (operaciones, `.env`, perfil, respaldos, ids) y define `compose`; lo cargan todos los scripts | a mano |
| `iniciar.sh` · `detener.sh` · `estado.sh` · `respaldar.sh` · `actualizar.sh` | operación del contenedor; solo orquestan | a mano |
| `sembrar.sh` | ejecuta los seeds como `rails runner` dentro del contenedor, con `seeds/_prelude.rb` delante; simula por defecto | a mano |
| `seeds/` | configuración como código: seeds Ruby idempotentes + `_prelude.rb`; qué construye cada uno, cómo se escribe uno nuevo y qué consume Qillqa, en `seeds/README.md` | a mano |
| `bridges/` | puente manual `sync_documentos.py` (Qillqa → OpenProject) y `op_api.py` (API v3), solo librería estándar; `bridges/README.md` | a mano |
| `perfil.ejemplo/openproject.yml` | plantilla neutra del perfil de un despacho (nombre, proyectos, opciones de campos, roster sin contraseñas) | a mano; el perfil real vive en el despacho |
| `.env.example` | plantilla del `.env` de operaciones | a mano; el `.env` real vive en el despacho |
| `suite.yml` | manifiesto de la suite (`core/suite.schema.yml`) | a mano; los bloques de este README los genera `core/suites.py generar --aplicar` |
| `docs/` | despliegue, restauración y decisiones; el diseño de 2026-08 en `docs/historial/`; índice en `docs/README.md` | a mano; el índice, `core/docs.py indice` |

## Las notas de tareas

Hasta la ola 8 esta suite compartía la carpeta `tareas` con las notas de **tareas** del vault de Obsidian
(`task.md`, `kanban-cursos.md`, `temarios-cursos.md`, `2026-07-15-tareas.md`, `enter-references-from-screening-cuba.md`),
por la decisión de `docs/decisiones.md` §2.1. Desde el 2026-10-10 las notas viven en `~/Documents/tareas/`
(almacén del vault, `TASKS_DIR` de `core/env.sh`; su `README.md` las describe) y esta suite solo contiene código y
documentación: ninguna nota es leída por el código. `temarios-cursos.md` lo sigue generando `docencia/scripts/temario.py`
en `TASKS_DIR`.

## Documentación

| documento | para qué leerlo |
|---|---|
| `CLAUDE.md` | reglas para el asistente: perfil y operaciones, protocolo de seeds, dónde va cada cosa nueva |
| `docs/despliegue.md` | montaje, alta de un despacho, respaldo diario, actualización, seguridad operativa, problemas |
| `docs/restaurar.md` | cómo se vuelve a un respaldo (`openproject_<fecha>.tar.gz`) |
| `docs/decisiones.md` | por qué el repo es como es, y los pendientes con fecha y dueño |
| `seeds/README.md` | qué construye cada seed, qué lee del perfil, cómo se escribe uno nuevo y qué consume Qillqa |
| `bridges/README.md` | el puente manual `sync_documentos.py`: mapeo de campos, cuándo se usa, qué pasa si falla |
| `docs/README.md` | índice de `docs/` (generado) |
| `perfil.ejemplo/openproject.yml` · `.env.example` | los dos contratos con un despacho, comentados línea a línea |
| `meta/INDICE_SCRIPTS.md` | la suite entre las del workspace (generado) |

## Límite honesto

- **No hay pruebas automáticas**: la comprobación es `bash -n`, `ruby -c`, `py_compile` y el dry run
  de `sembrar.sh` contra la instancia viva (los seeds necesitan el contenedor `healthy`).
- **Los seeds no renombran ni borran**: cambiar un nombre en el perfil solo afecta a lo que se crea;
  lo que ya existe en la instancia se corrige a mano en OpenProject.
- **`iniciar.sh`, `respaldar.sh` y `actualizar.sh` no simulan** (`simula_por_defecto: false` en
  `suite.yml`); `respaldar.sh` detiene el contenedor unos segundos.
- **El puente de este repo va en un solo sentido** (Qillqa → OpenProject); la integración de Qillqa,
  que es la que está encendida, sí recoge de OpenProject el cierre o la reapertura de fases y tareas
  de un proyecto de ley (`qillqa/docs/decisiones.md`).
- **HTTP plano en la LAN**: no hay TLS ni acceso remoto (`docs/despliegue.md` §Seguridad operativa).
- **No hay respaldo externo**: los `.tar.gz` viven en el mismo disco que la instancia
  (`docs/decisiones.md` §Pendientes).
