---
tipo: readme
estado: activo
---
# latex/ — imagen TeX Live del modo completo (contenedor `latex`), con `../qillqasqa/marco_documental/` montado en `/framework`

`Dockerfile` parte de `texlive/texlive` (LuaLaTeX + fontspec) y añade `python3` y `make`, las únicas
dependencias de `../qillqasqa/marco_documental/scripts/build.sh`. En el modo laptop (TeX del host) este servicio no
hace falta: la API compila directamente. Uso: `docker compose up -d --build latex` y, para la prueba
de humo, `docker compose exec latex bash -c 'cp -r /framework /tmp/fw && cd /tmp/fw && make plantillas'`.

Límite honesto: la imagen pesa ~4 GB y se descarga una sola vez; no se fija una versión de TeX Live.
