---
tipo: readme
estado: activo
---
# sistema/ — plantilla de la unidad systemd de usuario `sgdp.service` (arranque y publicación al encender)

La unidad real vive en `~/.config/systemd/user/sgdp.service` y la escribe `instalar_enlace_fijo.sh`
(paso 4) con la ruta del repo; `sgdp.service.ejemplo` es la misma unidad con `%h/Documents/sgdp`
(systemd expande `%h` al *home* del usuario) para instalarla a mano o comprobar la existente.

## Uso

```bash
sed "s#%h/Documents/sgdp#$PWD#g" sistema/sgdp.service.ejemplo > ~/.config/systemd/user/sgdp.service
systemctl --user daemon-reload && systemctl --user enable --now sgdp.service
sudo loginctl enable-linger "$USER"        # arranca al encender, sin sesión gráfica
systemctl --user status sgdp.service        # active (exited) = arrancó y publicó
journalctl --user -u sgdp.service -n 50     # y arranque.log en la raíz del repo
```

`ExecStart` llama a `arranque_automatico.sh`, que espera hasta 20 minutos a internet, Docker y
Tailscale y reintenta `enlace.sh`; `ExecStop` llama a `detener.sh`. Las rutas van entre comillas
por si la carpeta tuviera espacios. `TimeoutStartSec=3600` porque la espera es deliberada.

## Límite honesto

- Es una unidad de **usuario**: si otra cuenta enciende la laptop, no arranca (de ahí el *linger*).
- El servicio no tiene el PATH del terminal: `iniciar.sh` resuelve `npm` por su cuenta.
