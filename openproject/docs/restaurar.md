---
tipo: procedimiento
estado: activo
titulo: "Restaurar un respaldo de OpenProject (openproject_<fecha>.tar.gz) en los volúmenes del contenedor"
---
# Restaurar un respaldo de OpenProject

Qué hace `./respaldar.sh` (y por tanto qué hay dentro de un respaldo): detiene el contenedor
(`compose stop`), archiva los dos volúmenes con nombre fijo, `openproject_pgdata` (base de datos
PostgreSQL) y `openproject_assets` (adjuntos), en un solo
`<operaciones>/respaldos/openproject_<fecha>.tar.gz` con las carpetas `pgdata/` y `assets/` en su
raíz, reinicia el contenedor (`compose start`) y conserva los `OPENPROJECT_RESPALDOS_CONSERVAR` (14)
más recientes. `./actualizar.sh` llama a `./respaldar.sh --silencioso` antes de descargar la imagen
nueva, así que siempre hay un respaldo inmediatamente anterior a una actualización.

Restaurar es **volver los dos volúmenes al contenido del `.tar.gz`**: se pierde todo lo escrito en la
instancia después de ese respaldo. Es una operación manual (ningún script del repo la hace) y no se
simula.

## Antes

1. Elija el archivo: `ls -1t "$DESPACHO_DIR/operaciones/openproject/respaldos"/openproject_*.tar.gz` (el más
   reciente primero; la carpeta de operaciones del despacho, `DESPACHO_DIR` de `core/env.sh`).
2. Si la instancia actual todavía sirve, haga un respaldo de ella antes (`./respaldar.sh`): la
   restauración borra los volúmenes vigentes.
3. La imagen debe ser de la misma serie con la que se hizo el respaldo (`openproject/openproject:17`
   en `docker-compose.yml`): un respaldo de una serie más nueva no vuelve a una anterior.

## Pasos

Desde la raíz del repo (`tareas/`), con `FECHA` sustituido por el sello del archivo elegido:

```bash
./detener.sh
# Borra los volúmenes actuales (¡esto elimina los datos vigentes!)
docker volume rm openproject_pgdata openproject_assets
docker volume create openproject_pgdata
docker volume create openproject_assets
docker run --rm \
  -v openproject_pgdata:/data/pgdata \
  -v openproject_assets:/data/assets \
  -v "$DESPACHO_DIR/operaciones/openproject/respaldos":/backup \
  alpine sh -c "tar xzf /backup/openproject_FECHA.tar.gz -C /data"
./iniciar.sh
```

Los volúmenes se montan en `/data/pgdata` y `/data/assets` porque el `.tar.gz` se creó con
`tar czf … -C /data pgdata assets`: al extraer en `/data` cada carpeta cae en su volumen.

## Después

1. `./estado.sh` hasta `healthy` (el arranque tras una restauración puede tardar como el primero).
2. Entre por el navegador y compruebe un work package reciente y un adjunto.
3. Si desde el respaldo se aplicó algún seed, vuelva a aplicarlo (`./sembrar.sh --aplicar`: son
   idempotentes) y regenere los ids para los puentes (`./sembrar.sh --ids`).
4. Si el respaldo se copió desde otro equipo, revise `OPENPROJECT_HOST_NAME` y
   `OPENPROJECT_HOSTS_ADICIONALES` en el `.env` de operaciones antes de `./iniciar.sh`.

## Límite honesto

- No hay restauración parcial (solo la base o solo los adjuntos): el archivo lleva las dos carpetas
  y los dos volúmenes se recrean juntos.
- El respaldo vive en el mismo disco que la instancia mientras no haya respaldo externo
  (`decisiones.md` §Pendientes): ante robo o falla del disco no hay de dónde restaurar.
- El procedimiento no se ha ensayado en una instancia vacía distinta de la de origen
  (`decisiones.md` §Pendientes).
