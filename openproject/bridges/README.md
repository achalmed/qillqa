---
tipo: readme
estado: activo
---
# bridges/ — el puente manual SGDP → OpenProject, respaldo del reflejo vivo del SGDP, y su motor de la API

Scripts Python (solo librería estándar) que reflejan en OpenProject el trabajo registrado en otro
sistema sin duplicar la verdad: el dato vive en su sistema (el SGDP) y OpenProject refleja el
**trabajo**, enlazado por una clave estable. Hay un puente, **manual y de respaldo**,
`sync_documentos.py`, y su motor, `op_api.py`. Los ids de proyectos, tipos, estados, prioridades y
campos se resuelven desde `op_ids.json`, que `../sembrar.sh --ids` regenera en la carpeta de
operaciones; la URL y el token de API se leen del `.env` de operaciones (`OPENPROJECT_URL`,
`OPENPROJECT_TOKEN`).

## El reflejo vivo es del SGDP

El reflejo SGDP → OpenProject lo hace la propia API del SGDP
(`sgdp/backend/app/servicios/openproject_sync.py`), sin correr nada aquí; se enciende en el `.env` del
SGDP y se vigila en su panel de administración. Su alcance, sus variables y lo que vuelve de
OpenProject al SGDP están en `sgdp/docs/decisiones.md`; lo que exige de este repo (tipos, campos,
proyectos, roster, flujos), en `../seeds/README.md` §Consumidores. Usa las mismas claves en «Ruta en
disco» que `sync_documentos.py`, así que adopta lo que el puente manual creó sin duplicarlo.

`sync_documentos.py` solo hace falta con la API del SGDP detenida; con la integración encendida no se
corre.

## `sync_documentos.py` — SGDP → OpenProject (manual)

Lee la tabla `documentos` de la base de datos del SGDP (repo `sgdp`; contenedor `sgdp-db-1`, con
`docker exec … psql`, acceso por socket sin contraseña) y refleja cada documento **no anulado** como
work package tipo **Documento** en el proyecto *Producción Documental* (identificador `documentos`).

**Enlace e idempotencia.** Enlaza por el localizador estable `sgdp:doc:<id>` guardado en el campo
**Ruta en disco** (no por el número, que aparece recién al aprobar). El número oficial va en
**N° Documento** y se actualiza solo. Si el work package existe (búsqueda por ese campo), `PATCH`;
si no, `POST`. Nunca borra.

**Mapeo (SGDP → OpenProject):**

| SGDP | OpenProject |
|---|---|
| `id` | Ruta en disco = `sgdp:doc:<id>` (clave de enlace) |
| `campos.asunto` | Asunto (`subject`, hasta 250 caracteres; si falta, `<tipo> <serie> <numero>/<periodo>`) |
| `estado` | Estado: BORRADOR → Nuevo, EN_REVISION → En revisión, APROBADO → Numerado, FIRMADO → En firma, ENVIADO → Enviado, ARCHIVADO → Archivado (otro valor → Nuevo) |
| `tipo` | Tipo documental: oficio → Oficio, oficio_multiple → Oficio múltiple, memorando/memorandum → Memorando, informe, comunicado, solicitud, acta (otro → Oficio) |
| `tipo` + `numero` + `periodo` | N° Documento, p. ej. `OFICIO N° 033-2026-2027`; sin número, `(sin numerar)` |
| — | Pelota = Nuestra; prioridad = Media; proyecto = `documentos`; tipo = Documento |
| `campos.destinatario_nombre`, `pdf_archivo`, `actualizado_en` | se leen (el destinatario se muestra en el dry run); no se escriben en OpenProject |

**Frecuencia.** Bajo demanda y solo como respaldo: cuando la API del SGDP está detenida y hace falta
el reflejo (antes de una reunión de seguimiento, por ejemplo). No se programa con cron: con la
integración del SGDP encendida el reflejo ya es continuo. Es idempotente: repetirlo no duplica nada.

**Qué pasa si falla.**

| síntoma | causa y qué hacer |
|---|---|
| `No pude leer la BD de SGDP` | el contenedor `sgdp-db-1` no corre o el usuario/base cambiaron (`SGDP_DB_CONTAINER`, `SGDP_DB_USER`, `SGDP_DB_NAME`): arranque el SGDP y repita |
| `No encuentro 'docker'` | Docker no está en el `PATH` del usuario que ejecuta el puente |
| `Falta OPENPROJECT_TOKEN` | solo con `--apply`: cree un token en OpenProject (Mi cuenta → Tokens de acceso) y póngalo en el `.env` de operaciones |
| `Falta …/op_ids.json` | `../sembrar.sh --ids` (también tras aplicar cualquier seed: los ids cambian) |
| `! OFICIO N° …: 4xx …` en una fila | error de la API para ese documento (campo u opción que ya no existe en la instancia); el resto sigue; el resumen final cuenta `Errores` |
| se crean duplicados | alguien borró en OpenProject el campo «Ruta en disco» o su valor: el puente no encuentra el enlace y crea de nuevo; restaure el valor `sgdp:doc:<id>` y borre el duplicado a mano |

Un fallo a mitad de `--apply` deja aplicados los documentos ya procesados (no hay transacción entre
llamadas a la API); volver a correrlo completa el resto sin duplicar.

## Uso

```bash
python3 bridges/sync_documentos.py            # dry run (por defecto): cuántos, los 12 primeros y el resumen por estado
python3 bridges/sync_documentos.py --dry-run  # lo mismo, explícito
python3 bridges/sync_documentos.py --apply    # escribe; requiere OPENPROJECT_TOKEN en el .env de operaciones
```

Desde la raíz de la suite (`op_api.py` localiza la carpeta de operaciones igual que `config.sh`:
`OPENPROJECT_OPERACIONES` o `$DESPACHO_DIR/operaciones/openproject`, con `DESPACHO_DIR` de `core/env.py`). Antes de la primera escritura real,
`../respaldar.sh`. Variables opcionales: `SGDP_DB_CONTAINER`, `SGDP_DB_USER`, `SGDP_DB_NAME`,
`OPENPROJECT_URL`, `OPENPROJECT_IDS`.

## `op_api.py` — motor de la API v3

`OpenProject(url, token).upsert(match_cf, match_value, subject, type_name, status_name,
priority_name, project_ident, text_cfs, list_cfs, due_date)`: busca por un campo de texto (la clave
de enlace) y hace `PATCH` (con `lockVersion`) o `POST`. `cargar_entorno()` lee el `.env` de
operaciones sin pisar variables ya definidas; `ruta_ids()` localiza `op_ids.json`. Un puente nuevo
importa estas dos funciones y la clase; no habla con la API por su cuenta.

## Principio y límite honesto

- **Idempotente y no destructivo**: enlaza por clave, nunca borra; si el documento cambia de estado
  en el SGDP, el work package se actualiza. La fuente de verdad nunca es OpenProject.
- **Un solo sentido, en este puente**: `sync_documentos.py` no escribe nada en el SGDP; lo que se edite
  en OpenProject (asunto, estado) se sobrescribe en la siguiente corrida. La integración del SGDP sí
  recoge de OpenProject el cierre o la reapertura de fases y tareas de un proyecto de ley (ver
  `sgdp/docs/decisiones.md`).
- **Solo documentos**: los documentos recibidos y los proyectos de ley los refleja únicamente la
  integración del SGDP. El antiguo puente de expedientes de correo se retiró
  (`../docs/decisiones.md` §3.1); los expedientes que sincronizó siguen en la instancia como work
  packages sueltos.
- **Sin reintentos ni cola**: un error HTTP (4xx/5xx) cuenta como fila fallida y se sigue con la
  siguiente; un error de red (OpenProject inalcanzable) interrumpe la corrida entera; repetirla
  completa el resto sin duplicar.
