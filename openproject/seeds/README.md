---
tipo: readme
estado: activo
---
# seeds/ — la configuración de OpenProject como código: seeds Ruby idempotentes y su prelude

Cada seed es un script `rails runner` que `../sembrar.sh` ejecuta dentro del contenedor, precedido
por `_prelude.rb`: carga el perfil del despacho (`PERFIL`, `perfil("despacho", "nombre")`), abre una
transacción y al terminar la **revierte** (dry run, por defecto) o la **confirma** (`--aplicar`). Un
seed que aborta también se revierte. Todos son idempotentes: correrlos dos veces no duplica nada;
cambiar un nombre en el perfil no renombra lo que ya existe (solo afecta a lo que se crea). Se
ejecutan en orden numérico; `./sembrar.sh --aplicar` sin argumentos los corre todos (`[1-9]*.rb`).

## Qué construye cada uno

| seed | qué construye | lee del perfil |
|---|---|---|
| `05_volcar_ids.rb` | `op_ids.json` para los puentes (solo lectura; lo corre `../sembrar.sh --ids`) | — |
| `10_estados.rb` · `11_tipos.rb` · `12_prioridades.rb` | estados propios además de los nativos; tipos de work package además de Tarea e Hito; prioridades semáforo (Normal → Media) | — |
| `13_campos_personalizados.rb` | claves de enlace (N° Documento, Código EXP, Código Reporte, Ruta en disco, Enlace Gmail), Pelota, Cuadrante, los clasificadores de lista (Tipo documental, Origen, Distrito/Provincia) y los textos Comisión y Fuente / Fecha de corte | `campos.origen`, `campos.distrito`, `campos.tipo_documental` (si faltan, la lista se omite) |
| `14_roles.rb` · `15_workflows.rb` | roles del despacho clonando permisos de los nativos; transiciones estado × tipo × rol (sin ellas un work package no sale de «Nuevo»; `15` va después de `14`) | — |
| `20_proyectos.rb` · `30_activacion_por_proyecto.rb` | jerarquía de proyectos con sus módulos; tipos habilitados por proyecto; archiva los proyectos demo | `despacho` (`nombre`, `identificador`, `descripcion`), `proyectos[]` (`identificador`, `nombre`, `descripcion`, `padre`, `tipos`) |
| `50_vistas.rb` · `51_tableros.rb` · `60_plantillas.rb` | vistas guardadas públicas, tableros Kanban por estado, jerarquías `[PLANTILLA]` que el equipo copia | — (usan los identificadores del modelo: `coordinacion`, `correspondencia`, `documentos`, `cil`, `legislativo`, `representacion` y, solo `60`, `cil-investigacion`, que el perfil de ejemplo no declara; se saltan los proyectos ausentes) |
| `70_usuarios.rb` | usuarios y membresías; contraseña temporal `OP_TEMP_PASSWORD` del `.env` (se cambia en el primer ingreso); salta las filas cuyo correo empieza por `TODO` | `usuarios[]`, `roles_proyectos` |
| `80_wiki_guia.rb` | guía de uso del equipo en el wiki del proyecto raíz | `despacho.nombre`, `despacho.identificador`, `proyectos[]` |

La plantilla del perfil, con todas las claves comentadas, es `../perfil.ejemplo/openproject.yml`.

## Uso

```bash
./sembrar.sh                                   # dry run de todos, en orden: nada cambia
./sembrar.sh seeds/20_proyectos.rb             # dry run de uno (--dry-run lo hace explícito)
./sembrar.sh --aplicar                         # aplica todos (instancia nueva)
./sembrar.sh --aplicar seeds/13_campos_personalizados.rb   # aplica uno, tras cambiar el perfil
./sembrar.sh --ids                             # regenera op_ids.json (después de aplicar cualquier seed)
ruby -c seeds/*.rb                             # sintaxis (el runner real es el del contenedor)
```

Desde la raíz del repo (`sembrar.sh` hace `cd` a ella y espera las rutas como `seeds/NN_*.rb`); el
contenedor debe estar `healthy` (`estado.sh` (en la raíz de la suite)).

## Cómo se escribe un seed nuevo

1. Nombre `NN_tema.rb` con el número que fije su lugar en el orden (los de `10`–`15` son el modelo
   base; `20`–`30`, proyectos; `50`–`60`, vistas y plantillas; `70`–`80`, personas y guía).
2. Línea 1 de identidad (NORMATIVA §6): `# seeds/NN_tema.rb — openproject_despacho: <qué construye> (idempotente).`
3. Idempotente: `find_or_initialize_by` / `find_by` antes de crear; nunca borra ni renombra lo que
   ya existe. Mensajes con el prefijo de la convención: `+` creado, `=` ya existía, `!` error,
   `⏭` omitido.
4. Lo que dependa del despacho se lee del perfil con `perfil("clave", "subclave", defecto: …)`; si
   la clave falta, el seed omite esa parte y lo dice (`⏭`), no aborta.
5. No abrir transacciones propias ni salir con `exit` a medio camino: el prelude ya abrió la
   transacción y la cierra en `at_exit`; para fallar, `abort "mensaje"`; para terminar, `return`.
6. Probar en dry run (`../sembrar.sh seeds/NN_tema.rb`), documentarlo en la tabla de arriba y, si
   añade claves al perfil, en `../perfil.ejemplo/openproject.yml` y en el perfil de cada despacho.

## `_prelude.rb`

Define `DRY_RUN` (`OP_DRY_RUN=1`), `PERFIL` (el YAML del despacho, que `sembrar.sh` pasa por la
variable `OP_PERFIL_YAML`; `{}` si no se pasó) y `perfil(*claves, defecto:)`. Abre la transacción con
`begin_transaction(joinable: true)` y en `at_exit` hace rollback si es dry run o si el seed abortó,
y commit si terminó bien con `--aplicar`. Los `save!` de los seeds usan transacciones anidadas que se
unen a esta.

## Límite honesto

- Los seeds no borran ni renombran (la única excepción es `12_prioridades.rb`, que renombra la
  prioridad nativa Normal a Media una sola vez): la deriva entre perfil e instancia (un proyecto
  renombrado, una opción retirada) se corrige a mano en OpenProject.
- Dependen de la serie de OpenProject fijada en `../docker-compose.yml` (`14_roles.rb` cae de
  `ProjectRole` a `Role` si la clase no existe; `12_prioridades.rb` supone las prioridades nativas).
- No hay pruebas: la comprobación es `ruby -c` y el dry run contra la instancia viva.

## Consumidores

El modelo que estos seeds construyen es un contrato: la integración del SGDP
(`sgdp/backend/app/servicios/openproject_sync.py`, decisión en `sgdp/docs/decisiones.md`) escribe en
OpenProject resolviendo por **nombre** lo que sigue; del lado del SGDP, los nombres están en
`sgdp/backend/app/servicios/openproject_mapa.py`. Renombrar o retirar cualquiera de estas piezas en
un seed o en el perfil rompe el reflejo del SGDP; se cambia en los dos repos a la vez.

| pieza | nombre que el SGDP espera | la crea |
|---|---|---|
| tipos | «Documento», «Solicitud recibida», «Proyecto de Ley» | `11_tipos.rb` |
| campos | «Ruta en disco» (clave de enlace `sgdp:doc:<id>`, `sgdp:pl:<id>`, `sgdp:pl-fase:<id>`, `sgdp:pl-tarea:<id>`), «N° Documento», «Pelota», «Tipo documental» | `13_campos_personalizados.rb` (las opciones de «Tipo documental», del perfil) |
| estados | los de cada tipo («Nuevo», «En revisión», «Presentado»…), que el SGDP asigna por nombre | `10_estados.rb` |
| proyectos | identificadores `documentos`, `correspondencia`, `legislativo` (por defecto; configurables en `sgdp/backend/app/config.py`) | `20_proyectos.rb` desde el perfil |
| personas | el correo (o el nombre de usuario) de cada fila de `usuarios` del perfil coincide con el de su cuenta del SGDP | `70_usuarios.rb` |
| flujos | el token del SGDP es de una cuenta administradora porque `15_workflows.rb` solo deja avanzar o retroceder un paso, o cerrar | `15_workflows.rb` |

El puente manual de este repo (`../bridges/README.md`) usa el mismo modelo, por ids de `op_ids.json`.
