---
tipo: doc
titulo: "Desplegar y operar una instancia de OpenProject: montaje, alta de un despacho, respaldo diario, actualización, seguridad operativa y problemas"
estado: activo
---
# Desplegar y operar una instancia de OpenProject

Guía de tarea para quien pone en marcha u opera la instancia. Qué es el repo y los comandos, en
`../README.md`; cómo se vuelve a un respaldo, en `restaurar.md`.

## Montaje

OpenProject corre como **un solo contenedor «all-in-one»** (`openproject/openproject:17`, fijado en
`../docker-compose.yml`): base de datos PostgreSQL, caché, servidor web y workers dentro. Un solo
punto para arrancar, detener y respaldar.

| pieza | valor | de dónde sale |
|---|---|---|
| acceso | HTTP en el puerto **8080**, desde la LAN (`0.0.0.0:8080:80`) | `docker-compose.yml` |
| host | `OPENPROJECT_HOST_NAME` y `OPENPROJECT_HOSTS_ADICIONALES` | `.env` de operaciones |
| secreto de sesión | `OPENPROJECT_SECRET_KEY_BASE` | `.env` de operaciones |
| datos | volúmenes con nombre fijo `openproject_pgdata` (base) y `openproject_assets` (adjuntos) | `docker-compose.yml` |
| procesos web | 2 (`OPENPROJECT_WEB__WORKERS`), para limitar la RAM | `docker-compose.yml` |
| salud | `curl` a `/health_checks/default`; `start_period` de 600 s por las migraciones del primer arranque | `docker-compose.yml` |
| opcionales | `OPENPROJECT_CONTENEDOR` (nombre del contenedor, `openproject`), `OPENPROJECT_IDS` (ruta de `op_ids.json`), `OPENPROJECT_URL` (`http://localhost:8080`); los demás, en `../.env.example` | `../config.sh` (valores por defecto) |

```
Otros equipos del despacho ──(WiFi/LAN)──▶  http://<host>:8080
                                                     │
                                        Contenedor "openproject"
                                    ┌────────────────────────────┐
                                    │ web + workers + PostgreSQL  │
                                    └────────────────────────────┘
                                     volúmenes: pgdata / assets
```

## Un despacho nuevo

1. Crear la carpeta de operaciones del despacho y copiar allí `../.env.example` como `.env`;
   completarlo (el secreto, con `openssl rand -hex 64`) y dejarlo con permisos `600`.
2. Si no es `$DESPACHO_DIR/operaciones/openproject` (`core/env.sh`), exportar `OPENPROJECT_OPERACIONES`
   (sin enlaces simbólicos entre repos).
3. Copiar `../perfil.ejemplo/openproject.yml` al despacho, completarlo y apuntar `OPENPROJECT_PERFIL`
   a él en el `.env`.
4. `./iniciar.sh` y esperar `healthy` con `./estado.sh` (el primer arranque descarga la imagen y
   migra la base: varios minutos).
5. Entrar como `admin`/`admin`: OpenProject obliga a cambiar la clave.
6. `./sembrar.sh` (simulación) y, si el resultado es el esperado, `./sembrar.sh --aplicar`.
7. `./sembrar.sh --ids` para que el puente manual tenga `op_ids.json`.

## Respaldo diario

La suite declara el respaldo como timer de usuario `respaldo-openproject.timer` (02:00, `Persistent=true`,
instalado en `~/.config/systemd/user/` en la Puerta P1 del programa, con copia al SSD si está montado). Su
unidad trabaja en `%h/Documents/qillqa/openproject` y ejecuta `respaldar.sh --silencioso`:

```
systemctl --user list-timers respaldo-openproject.timer
journalctl --user -u respaldo-openproject.service -n 20
```

`respaldar.sh` detiene el contenedor unos segundos, archiva los dos volúmenes en
`operaciones/respaldos/openproject_<fecha>.tar.gz` y conserva los `OPENPROJECT_RESPALDOS_CONSERVAR`
(14 por defecto) más recientes. **Copie los `.tar.gz` fuera del equipo**: un respaldo en el mismo
disco no protege ante robo o falla (el respaldo externo está en `decisiones.md` §Pendientes).

## Actualizar

`./actualizar.sh` respalda primero (`respaldar.sh --silencioso`), descarga la última imagen de la
serie fijada y recrea el contenedor; las migraciones corren solas. Cambiar de serie (de 17 a 18) es
editar `docker-compose.yml`, y un respaldo de una serie nueva no vuelve a una anterior.

## Seguridad operativa

- **Solo en redes de confianza.** Sirve por HTTP sin cifrado: bien para la LAN del despacho, nunca
  en un WiFi público.
- **Cambie la clave `admin` de inmediato.** `OP_TEMP_PASSWORD` es solo la contraseña inicial de los
  usuarios sembrados (`seeds/70_usuarios.rb`); se fuerza el cambio en el primer ingreso.
- **No lo exponga a internet** abriendo puertos en el router: exigiría HTTPS y, preferiblemente, una
  VPN, que este repo no configura.
- **El `.env` de operaciones** contiene el secreto de sesión y el token de API: permisos `600`, fuera
  de git (`../.gitignore` ignora `.env` y `operaciones`).
- **El token de API** que usa Qillqa es de una cuenta administradora (lo exige su integración); se
  revoca en OpenProject, Mi cuenta → Tokens de acceso.

Si la IP del equipo cambia (DHCP), edite `OPENPROJECT_HOST_NAME` en el `.env` y `./iniciar.sh`;
mejor aún, use el nombre mDNS `<equipo>.local:8080` (en `OPENPROJECT_HOSTS_ADICIONALES`) o pida una
reserva DHCP.

## Solución de problemas

| síntoma | qué hacer |
|---|---|
| `./estado.sh` dice `starting` mucho rato | Normal en el primer arranque (migraciones). `docker logs -f openproject`. |
| `config.sh` no encuentra operaciones | Defina `OPENPROJECT_OPERACIONES` o compruebe `DESPACHO_DIR` (`core/env.sh --print`). |
| No entra desde otro equipo | Verifique la IP (`hostname -I`), que el equipo no esté suspendido, el cortafuegos (`sudo ufw status`) y `OPENPROJECT_HOSTS_ADICIONALES`. |
| «We're sorry, but something went wrong» | `docker logs --tail=100 openproject`. |
| Un seed falla | Se revierte solo; corrija el perfil y repita. `./sembrar.sh seeds/NN_*.rb` prueba uno. |
| Consume mucha RAM | Ya está limitado a 2 procesos web (`OPENPROJECT_WEB__WORKERS`). |
| Hay que volver a un respaldo | `restaurar.md` (borra los volúmenes vigentes: léalo entero antes). |

## Límite honesto

- HTTP plano en la LAN: no hay TLS ni acceso remoto.
- `iniciar.sh`, `respaldar.sh` y `actualizar.sh` no simulan; `respaldar.sh` detiene el contenedor.
- Los respaldos viven en el mismo disco que la instancia mientras no haya respaldo externo
  (`decisiones.md` §Pendientes).
