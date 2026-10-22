---
tipo: readme
estado: activo
---
# sistema/ — plantilla de la unidad systemd de usuario `qillqa.service` (arranque y publicación al encender)

La unidad real (`qillqa.service`, en la carpeta de unidades de usuario de systemd) la escribe `instalar_enlace_fijo.sh`
(paso 4) con la ruta del repo; `qillqa.service.ejemplo` es la misma unidad con `%h/Documents/qillqa`
(systemd expande `%h` al *home* del usuario) para instalarla a mano o comprobar la existente.

## Uso

```bash
sed "s#%h/Documents/qillqa#$PWD#g" sistema/qillqa.service.ejemplo > ~/.config/systemd/user/qillqa.service
systemctl --user daemon-reload && systemctl --user enable --now qillqa.service
sudo loginctl enable-linger "$USER"        # arranca al encender, sin sesión gráfica
systemctl --user status qillqa.service        # active (exited) = arrancó y publicó
journalctl --user -u qillqa.service -n 50     # y arranque.log en la raíz del repo
```

`ExecStart` llama a `arranque_automatico.sh`, que espera hasta 20 minutos a internet, Docker y
Tailscale y reintenta `enlace.sh`; `ExecStop` llama a `detener.sh`. Las rutas van entre comillas
por si la carpeta tuviera espacios. `TimeoutStartSec=3600` porque la espera es deliberada.

## Límite honesto

- Es una unidad de **usuario**: si otra cuenta enciende la laptop, no arranca (de ahí el *linger*).
- El servicio no tiene el PATH del terminal: `iniciar.sh` resuelve `npm` por su cuenta.
