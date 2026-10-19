---
tipo: decision
titulo: "Decisiones del repo openproject_despacho (tareas): despliegue, carpeta compartida con el vault y puentes, con sus pendientes"
estado: activo
---
# Decisiones de `tareas` (openproject_despacho)

Registro único y acumulativo: cada decisión vigente, con su fecha, bajo su tema. Una decisión nueva
se añade al final de su sección; una que deja de regir lleva al inicio «Superada por §X» y no se
borra ni se renumera. Lo pendiente, al final. El diseño original (2026-08) está en `historial/`.

## 1. Despliegue

**1.1 Configuración como código** (2026-08-17). La instancia no se configura a mano: los seeds
(`../seeds/`) construyen estados, tipos, campos, roles, flujos, proyectos, vistas, tableros,
plantillas, usuarios y guía de forma idempotente, con simulación por transacción. Lo que se corrige a
mano en OpenProject (un renombre, una opción retirada) es deriva, porque los seeds no renombran ni
borran. Fundamento: `historial/roadmap.md`.

**1.2 El repo es reutilizable; el despliegue vive en el despacho** (2026-09-15). El `.env`, los
respaldos, `op_ids.json`, `estado.md` y el perfil están en la carpeta de operaciones del despacho
(`$DESPACHO_DIR/operaciones/openproject`, por `core/env.sh`; hasta la ola 8, un enlace `operaciones` ignorado por git) y en su `perfil/`. Aquí solo hay plantillas neutras
(`../.env.example`, `../perfil.ejemplo/openproject.yml`) y `config.sh` es el único que resuelve rutas.
Lo comprueba D12 del doctor. Los demás sistemas del despacho son repos propios (`sgdp`, con `marco_documental`
dentro; `identidad-visual`).

**1.3 Un contenedor «all-in-one», serie 17 fijada** (2026-08-17). Un solo punto de arranque,
detención y respaldo; volúmenes con nombre fijo para que los respaldos los encuentren.
`actualizar.sh` sube dentro de la serie; cambiar de serie es editar `../docker-compose.yml`.

## 2. Carpeta y vault

**2.1 La carpeta es a la vez el repo y `tareas` del vault** (2026-09-15, decisión del autor). Las
notas de tareas del vault (rutina, tableros, listas del día, temarios generados) viven en la raíz y se
versionan con el repo. Son notas del vault (NORMATIVA §10): llevan su frontmatter, se editan desde
Obsidian y no son documentación del repo. Es la **excepción a la lista blanca de la raíz**
(NORMATIVA §15.11): un `.md` en la raíz que no sea `README.md` o `CLAUDE.md` es nota del vault; la
documentación nueva del repo va a `docs/`.

## 3. Puentes e integración con el SGDP

**3.1 El puente de correo se retiró** (2026-09-15). El componente de correo y su puente
(sync_expedientes) desaparecieron; registrar documentos recibidos es función del SGDP (serie
`REC`). El proyecto *Correspondencia* y el tipo *Expediente* se conservan.

**3.2 El SGDP sincroniza solo; `bridges/sync_documentos.py` queda como respaldo manual**
(2026-10-02). El reflejo SGDP → OpenProject lo hace la API del SGDP
(`sgdp/backend/app/servicios/openproject_sync.py`) con las mismas claves en «Ruta en disco», así que
adopta lo que el puente manual creó. La decisión y su detalle son del SGDP
(`sgdp/docs/decisiones.md`); lo que el SGDP exige de este repo está en `../seeds/README.md`
§Consumidores. El puente manual sigue en un solo sentido y no hace falta correrlo con la integración
encendida.

## Pendientes

- **2026-10-04 · programa de reingeniería (`meta/programa/`)**: respaldo diario ahora por timer de usuario de systemd (`respaldo-{sgdp,openproject}.timer`, `Persistent=true`: se recupera al encender si la laptop estaba apagada) con copia al SSD externo cuando está montado; los dos crons se retiraron. Verificado el 2026-10-04 (copia local y externa). Unidades en `~/.config/systemd/user/`; registro en `meta/programa/01-aseguramiento/respaldo.md`.
| pendiente | fecha (plazo, o fecha en que se anotó) | dueño |
|---|---|---|
| Respaldo externo: los `.tar.gz` viven en el mismo disco que la instancia (`respaldos.externo: null` en el `despacho.yml` del despacho). Copiarlos a un disco externo o a la nube y declararlo. | plazo 2026-10-31 | el autor |
| `config.sh` toma por defecto el perfil en `<operaciones>/perfil.yml`, mientras la documentación lo sitúa en `<despacho>/perfil/openproject.yml` vía `OPENPROJECT_PERFIL`. Hallazgo de código: alinear el valor por defecto o documentarlo; hoy funciona porque el `.env` fija la variable. | anotado 2026-10-04, sin plazo | el autor |
| `docs/restaurar.md` no se ha ensayado en una instancia distinta de la de origen; la primera vez, anotarlo en `operaciones/estado.md`. | anotado 2026-09-20, sin plazo | el autor |
| `seeds/60_plantillas.rb` crea la plantilla «Informe CIL» en el proyecto `cil-investigacion`, que `perfil.ejemplo/openproject.yml` no declara (el perfil de ejemplo y `50_vistas.rb` usan `cil`): con ese perfil la plantilla se salta. Hallazgo de código: alinear el identificador en el seed o en la plantilla del perfil. | anotado 2026-10-04, sin plazo | el autor |
| `config.sh` (mensaje cuando no encuentra la carpeta de operaciones) remite a la sección «Cómo se conecta con un despacho» del README, que ya no existe: lo que describe está en `README.md` §Qué es y en `despliegue.md`. Hallazgo de código: corregir el texto del mensaje. | anotado 2026-10-04, sin plazo | el autor |
