---
tipo: readme
titulo: "Extensión «Qillqa · Mesa de partes» para Chrome y Edge"
estado: activo
---
# extension/ — extensión «Qillqa · Mesa de partes» para Chrome, Edge, Zen y Firefox

Muestra los datos de un documento de Qillqa **dentro de la página de la mesa de partes** de la
entidad, para copiarlos de un clic o autocompletar el formulario (pedido de Edison, 2026-10-08).
Hace falta una extensión porque una página web, como Qillqa, no puede dibujar ni escribir en la
página de otra entidad: el navegador lo impide.

## Cómo funciona

1. En Qillqa, «Abrir mesa de partes» de un documento abre la mesa en una pestaña y pasa los datos
   a la extensión (`frontend/src/mesaExtension.ts` → `window.postMessage`).
2. `contenido.js`, en la página de Qillqa (reconocida por `<meta name="sgdp-app">`), avisa que la
   extensión está instalada (`data-sgdp-extension`) y pasa el envío a `fondo.js`.
3. `fondo.js` lo guarda en `chrome.storage.session` (se borra al cerrar el navegador) y reconoce la
   pestaña de la mesa: la que abrió Qillqa, aunque cambie de dirección, y cualquier pestaña con la
   dirección de esa mesa durante 12 horas.
4. En esa pestaña, `contenido.js` dibuja el panel en un Shadow DOM (no lo afecta el diseño de la
   página). Tiene autocompletar el formulario o el ingreso (usuario y clave), copiar cada dato,
   descargar el firmado y abrir su ubicación. La clave, el firmado y la ubicación se piden a la API
   de Qillqa con la sesión de quien abrió la mesa (`/api/mesa/…`).
5. **Sin documento** (como Google Contraseñas): en cualquier página con un campo de contraseña,
   `contenido.js` pregunta a `fondo.js` por las cuentas del sitio (`GET /api/contrasenas/sitio`,
   con la sesión que Qillqa le pasó al abrirse) y, si hay, ofrece «Autocompletar acceso». La
   clave se pide recién al elegir la cuenta (queda registrada como «autocompletar»).

Las reglas del autocompletado son las de `../frontend/src/autocompletar.ts`: si se cambia una, se
cambia la otra.

## Instalación (una vez por computadora)

1. En Qillqa, Directorio → Mesas de partes → «Descargar la extensión» (`GET /api/mesa/extension.zip`),
   y descomprimir el archivo en una carpeta que no se vaya a borrar.
2. En Chrome, abrir `chrome://extensions` (en Edge, `edge://extensions`) y activar **Modo de
   desarrollador**.
3. Pulsar **Cargar descomprimida** y elegir la carpeta `sgdp-mesa-de-partes`.
4. Recargar Qillqa (F5).

**Zen y Firefox** (`?navegador=firefox`, un `.xpi`): en `about:config`, `xpinstall.signatures.required`
en `false` (la extensión no está firmada por Mozilla); en `about:addons`, ⚙ → «Instalar complemento
desde archivo»; en sus permisos, permitir el acceso a todos los sitios. Si el navegador no admite
extensiones sin firmar, `about:debugging` → «Cargar complemento temporal» la carga hasta cerrarlo; la
salida permanente es firmarla en addons.mozilla.org como «sin publicar». El manifiesto de Firefox lo
arma el endpoint: fondo como `scripts` (Firefox no admite `service_worker`) e id gecko.

Para actualizarla, se descarga de nuevo, se reemplaza la carpeta y se pulsa ↻ en `chrome://extensions`.

## Archivos

| archivo | qué hace |
|---|---|
| `manifest.json` | Manifiesto V3: permisos `storage` y `tabs`, acceso a todas las páginas (las mesas de partes son de muchas entidades) |
| `fondo.js` | Guarda los envíos, reconoce la pestaña de la mesa y habla con la API de Qillqa |
| `contenido.js` | El puente en Qillqa y el panel en la mesa de partes |
| `iconos/` | Íconos de 16, 48 y 128 px |
