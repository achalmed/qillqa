"""Envío de archivos de la entidad (PDF, adjuntos, expediente) al navegador.

Existe por un fallo real (Edison 2026-09-08, OM-0016): se corrigió la hora de
una reunión, el PDF de la carpeta quedó bien y el VISOR siguió mostrando la
versión anterior durante más de una hora.

El servidor no tenía la culpa —`FileResponse` lee el archivo del disco en cada
petición, no hay copia ni índice intermedio—, pero la respuesta no decía nada
sobre su caducidad. Cuando falta `Cache-Control`, HTTP autoriza al navegador a
INVENTARSE cuánto tiempo sigue fresca la respuesta: la heurística habitual es
~10 % del tiempo transcurrido desde `Last-Modified`. Un PDF generado ayer se
da por bueno durante más de una hora, y el navegador ni siquiera pregunta
(peticiones con `transferSize: 0`). De ahí que el síntoma pareciera aleatorio
—en un documento recién creado no pasa— y que recargar la página no lo
arreglara: no hay petición que revalidar.

`no-cache` NO significa «no guardes»: significa «guarda, pero pregunta SIEMPRE
antes de usarlo». Con el `ETag` que `FileResponse` ya envía, comprobar cuesta
un 304 de unos bytes cuando el archivo no cambió, y trae el archivo nuevo en
cuanto cambió. El PDF de la carpeta vuelve a ser la única fuente de verdad
también para el navegador.

`private` es lo otro que faltaba: estos archivos son documentos autenticados y
el sistema se publica por un túnel (Cloudflare/Tailscale Funnel), que es una
caché COMPARTIDA de por medio. Sin `private`, un intermediario podría guardar
el oficio de un usuario y entregárselo a otro.

Y la revalidación se responde aquí: `FileResponse` de Starlette MANDA un ETag
pero nunca lo COMPARA, así que sin esto cada apertura del visor volvería a
bajar el PDF entero por el túnel. Con el 304, preguntar cuesta unos bytes y
solo se transfiere el archivo cuando de verdad cambió.

Desde el 2026-10-20 (fase 10.2b) la implementación vive en Tiqsi (`tiqsi.web`), para que todo módulo de la
plataforma la use sin importar a Qillqa; aquí se reexporta: la regla sigue siendo la misma.
"""

from tiqsi.web import CACHE_ARCHIVOS, coincide_etag, enviar_archivo, rango_pedido  # noqa: F401
