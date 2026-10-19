---
tipo: readme
estado: activo
---
# bin/ — binario `cloudflared` (ajeno, ignorado en git) que usa `compartir.sh` para el túnel temporal

Se descarga a mano una sola vez (`compartir.sh` dice el comando: el `cloudflared-linux-amd64` de las
*releases* de Cloudflare, con permiso de ejecución). No se versiona (`.gitignore`: `bin/*` salvo este
README) ni se actualiza solo. Desde el enlace permanente (`instalar_enlace_fijo.sh`, Tailscale) es
solo un respaldo.
