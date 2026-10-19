---
tipo: readme
estado: activo
---
# docs/ — documentación permanente de `tareas` (procedimientos vivos y el diseño archivado)

Orden de lectura, tipo y estado de cada documento (NORMATIVA §15.6). Lo vivo es `despliegue.md`
(montar y operar), `restaurar.md` (volver a un respaldo) y `decisiones.md` (por qué, y los
pendientes); `historial/` guarda el diseño de 2026-08, archivado: se lee para saber por qué, no como
mapa de la instancia (el mapa es la tabla de `../seeds/README.md`).

<!-- docs:inicio -->
| documento | tipo | estado | qué es |
|---|---|---|---|
| [decisiones.md](decisiones.md) | `decision` | `activo` | Decisiones del repo openproject_despacho (tareas): despliegue, carpeta compartida con el vault y puentes, con sus pendientes |
| [despliegue.md](despliegue.md) | `doc` | `activo` | Desplegar y operar una instancia de OpenProject: montaje, alta de un despacho, respaldo diario, actualización, seguridad operativa y problemas |
| [restaurar.md](restaurar.md) | `procedimiento` | `activo` | Restaurar un respaldo de OpenProject (openproject_<fecha>.tar.gz) en los volúmenes del contenedor |
| [historial/README.md](historial/README.md) | `readme` | `activo` | docs/historial/ — el diseño de 2026-08 (diagnóstico, modelo y hoja de ruta), archivado |
| [historial/diagnostico-2026-08-17.md](historial/diagnostico-2026-08-17.md) | `diagnostico` | `archivado` | Diagnóstico de integración OpenProject × despacho: qué existe, qué falta y cómo conectar (2026-08-17) |
| [historial/modelo-de-integracion.md](historial/modelo-de-integracion.md) | `doc` | `archivado` | Modelo de integración de OpenProject del despacho: los 16 componentes que implementan los seeds (2026-08-17) |
| [historial/roadmap.md](historial/roadmap.md) | `plan` | `archivado` | Hoja de ruta de la implementación de OpenProject por fases, configuración como código (2026-08-17) |

<sub>Bloque generado por `core/docs.py indice` desde el frontmatter de docs/ (2026-10-10); no se edita a mano.</sub>
<!-- docs:fin -->
