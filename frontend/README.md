---
tipo: readme
estado: activo
---
# frontend/ — interfaz web de Qillqa (React + TypeScript + MUI + TipTap, Vite): bandeja, editor, directorio, PWA sin conexión

## Uso

```bash
npm install
VITE_API_PROXY=http://127.0.0.1:8000 npm run dev      # desarrollo con recarga en caliente
npm run build && npm run preview -- --host            # el build que sirve iniciar.sh (con service worker)
```

`npm run build` publica SIN dejar a nadie en blanco (`vite.publicacion.ts`, `docs/arquitectura.md` §31): no
vacía `dist/`, escribe `index.html` y `sw.js` al final y de golpe, precomprime y retira lo de builds viejos
pasados tres días. Para comprobar un build sin publicarlo: `npx vite build --outDir <otra carpeta>`. Un cambio de
`vite.config.ts` o de `vite.publicacion.ts` exige reiniciar el `vite preview` (lo hace `iniciar.sh`).

`VITE_NOMBRE_DESPACHO` (en el `.env` de la raíz, que `iniciar.sh` exporta) fija el nombre del
despacho que se muestra en el login y en la barra de Inicio; sin él, «Despacho parlamentario».
Cambiarlo exige recompilar la web (`iniciar.sh` lo hace en cada arranque).

## Estructura

| carpeta o archivo | qué es | dueño / generador |
|---|---|---|
| `src/navegacion.ts`, `src/componentes/Marco.tsx` | el mapa ÚNICO de módulos y sus opciones (rutas con consulta) y la carcasa común de toda pantalla con sesión: menú lateral, barra con el módulo, franja contextual, cuenta y barra inferior del celular. Un módulo u opción nueva se añade en `navegacion.ts`. Bajo 900 px las opciones del módulo no van en pestañas sino en `src/componentes/BotonModulo.tsx` (botón flotante + hoja de círculos de color; `sinBotonModulo` lo oculta, `sinReservaFlotante` no le guarda sitio al final) y la barra dice «Módulo · sección» | este repo |
| `src/componentes/HojaInferior.tsx`, `src/componentes/BotonAyuda.tsx` | el lenguaje común de lo que se abre desde abajo en el celular (papel, asa, `Circulo` de color; lo usan `BotonModulo` y el «+» del chat, `../../rimay/web/src/componentes/chat/MenuMas.tsx`) y el «?» de una sección: ventanita en escritorio, hoja inferior en el celular. Una ayuda nueva va en `BotonAyuda`, breve | este repo |
| `src/directorio.ts` | modelo del directorio: tipos, etiquetas y qué datos usa el sistema de cada ficha (lo «por completar»), avisos de formato y posibles duplicados | este repo |
| `src/paginas/` | `Inicio` (la entrada, `/`), `Bandeja` (`/documentos`), `EditorDocumento`, `VistaHeredada`, `Directorio`, `Estadisticas`, `Sincronizar`, `CambiarClave`, `Login`, `PanelAdmin`, `AbrirDocumento`, `Proyectos` y `Proyecto` (proyectos de ley: partes, fases, tareas, fuentes, archivos), `Observatorio` (`/observatorio`: la página de `public/obs/` en un marco; ver `scripts/observatorio.py`), `InformesSR` (`/informes`: las semanas y «Nueva semana»), `SemanaSR` (`/informes/:id`: una semana de punta a punta; sus secciones en `../../qillqasqa/web/src/componentes/semana/`), `Entradas` (`/recibidos`: el módulo Recibidos, con `../../punku/web/src/componentes/entradas/`), `Prensa` (`/prensa`: las pantallas de los editores del estudio, que llegan por su manifiesto; `?ver=piezas`, las piezas registradas del editor de piezas, que llegan de Awana: `../awana/web/src/componentes/piezas/Piezas.tsx`), `Chat` (`/chat`: lista, conversación, hilos y ficha de la entidad; sus piezas en `../../rimay/web/src/componentes/chat/`, su lógica pura en `../../rimay/web/src/componentes/chat/mensajes.ts` y el socket en `../../rimay/web/src/componentes/chat/socket.ts`), `Rendiciones` (`/rendiciones`: la lista, el resumen de la entidad y los parámetros) y `Rendicion` (`/rendiciones/:id`: una rendición por pasos; sus piezas, desde el 2026-10-22, en Yupay: `../../yupay/web/src/componentes/rendicion/`, la lógica pura en `modelo.ts` con prueba en `../../yupay/web/pruebas/rendicion.test.ts`; la calculadora en hoja inferior, en Yupay: `../../yupay/web/src/componentes/rendicion/Calculadora.tsx` con `calculadora.ts` y `../../yupay/web/pruebas/calculadora.test.ts`) | este repo |
| `src/componentes/` | piezas compartidas: `VisorDocumento` (pestañas), `VisorPdf` (un PDF dentro de la página: vista previa del proyecto, informes), `VisorRapido` (el visor rápido de la bandeja: la página como imagen, deslizar entre documentos; lógica en `../../qillqasqa/web/src/visorRapido.ts`), `EquipoEnLinea` (con `src/avisoLlegadas.ts`: tono de llegadas solo para el administrador), `PanelSeguimiento`, `PanelArchivos`, `FormularioCampos`, `AjusteFormato`, `Paso`/`BotonPaso`, `Organigrama`, `EditorParteCompartida` (una parte de proyecto en edición simultánea), `BarraFormato` (la barra de redacción común y el menú de tablas; `useHerramientasEditor` es su lógica con estado), `word/` (el Formato Word: `EspacioWord`, `BarraWord` con la forma de Google Docs y `menus.ts`, `SeccionWord`, `SeccionParte`, `PaginaWord`, `PanelEstructura`, `ComentariosWord`)… | este repo |
| `src/pegar.ts`, `src/pegado.ts`, `src/componentes/PegarResultado.tsx`, `src/componentes/ElegirEntrada.tsx` | pegar el resultado de un prompt (fases 6 y 9): la parte pura (`pegado.ts`, con prueba en `pruebas/pegar.test.ts`), la que habla con la API (`pegar.ts`: lectura, constancia, prompt del formato, texto de un mensaje del chat), el componente de la tabla de diferencias y la entrada doble de cada «Nuevo» (formulario o prompt; copiar o bajar el prompt). Cada módulo lee `?pegar=<id de mensaje>` y abre su diálogo con el texto ya leído | este repo |
| `src/extensiones/` | extensiones TipTap (tablas, sangrías, notas al pie) y `esquema.ts`, la lista ÚNICA que fija el esquema del texto (la usan los editores y el servidor de colaboración) | este repo |
| `../../qillqasqa/web/colab/` | edición simultánea (fase 5): `servidor.ts` (Hocuspocus; `node colab/servidor.ts`, puerto 8001, detrás de `/colab`), `ida_y_vuelta.ts` y `prueba_dos_clientes.ts` (pruebas). Vive aquí para compartir `node_modules`: una sola copia de TipTap, ProseMirror y Yjs | este repo |
| `src/sync/` | sincronización a una carpeta local (File System Access API): `sincronizador.ts` (baja PDF, firmados, adjuntos y recibidos, y deja el mapa de lo sincronizado), `almacen.ts` (manejadores y mapa en IndexedDB) y `carpetaLocal.ts` (sin servidor, abre el PDF de la carpeta; con servidor, evita guardarlo otra vez en el navegador). El permiso, con `src/componentes/PermisoCarpeta.tsx` | este repo |
| `src/sinconexion.ts`, `src/cachelecturas.ts`, `src/alvolver.ts`, `src/avisoBreve.ts`, `public/sw.js`, `src/componentes/FranjaSinConexion.tsx`, `AvisoAlVolver.tsx`, `AvisoBreve.tsx`, `EnEsperaLista.tsx` | modo sin conexión (`docs/arquitectura.md` §31): cola por cuenta (guardados del editor, mensajes del chat, comentarios y observaciones, tareas nuevas, actuaciones; lo rechazado va a «No enviados», nunca se tira), «lo último visto» de cada lectura y de los PDF abiertos en IndexedDB (por cuenta, borrado al cerrar sesión; nunca `/api/publico/` ni tokens), «hacerlo al volver» para lo que exige el servidor (numerar, estado, compilar, firmado), el aviso breve del momento, los «En espera» de cada pantalla, la franja «Sin conexión · mostrando lo guardado a las HH:MM» (solo el administrador; los demás, `IndicadorConexion` si algo suyo espera) y el service worker. `public/sw.js` tiene dos secciones con dueño: 1, caché de la aplicación; 2, notificaciones del chat. Pruebas puras en `pruebas/sinconexion.test.ts` y `pruebas/continuidad.test.ts` | este repo |
| `vite.publicacion.ts`, `src/arranque.ts`, `src/componentes/PantallaCarga.tsx` | publicación segura (build sin vaciar `dist/`, `index.html` y `sw.js` al final, precompresión, `/assets/` con 404 de verdad y caché inmutable en el preview, trozos por biblioteca) y arranque que nunca queda en blanco (pantalla de carga, vigía con «Reintentar», páginas con `React.lazy` que recargan una vez si su trozo ya no existe) | este repo |
| `src/paleta.ts`, `src/theme.ts` | la paleta ÚNICA sobre la identidad visual (vino, dorado oscuro y neutrales cálidos; apoyo azul/verde/petróleo solo para estados; sin naranja ni rosa) y su conexión al tema de MUI. Un color nuevo se añade en `paleta.ts`, no a mano. El tema fija el aspecto ÚNICO de lo repetido: botón delineado siempre en vino (también `color="inherit"`, salvo en la barra superior), acciones de un aviso en vino, diálogos como hoja inferior en el celular (< 600 px, con asa), ventanitas nunca más anchas que la pantalla y la sombra del botón flotante. Se ajusta ahí, no pantalla por pantalla | este repo |
| `../../qillqasqa/web/src/formato.ts`, `../../qillqasqa/web/src/numeracion.ts`, `../../qillqasqa/web/src/flujo.ts`, `../../qillqasqa/web/src/estados.ts` | ajustes `fmt_*`, una sola escala de pasos, estados y colores | este repo |
| `src/api.ts`, `src/descargas.ts`, `src/copiar.ts` | cliente HTTP (409/428, caché), descargas a carpeta elegida, copiar como imagen | este repo |
| `public/manifest.webmanifest`, `index.html`, `public/iconos/`, `public/favicon.svg` | PWA instalable; el título genérico se cambia aquí. Íconos: ver §Íconos | este repo |
| `../../punku/web/src/paginas/MesaVirtual.tsx`, `../../punku/web/src/componentes/mesa/` | mesa de partes virtual PÚBLICA (`/mesa-de-partes`, sin `Marco` ni sesión): enviar por pasos, cargo, seguimiento y subsanación; `modelo.ts` es su cliente sin token ni caché. Dentro de Recibidos, `../../punku/web/src/componentes/entradas/PanelMesaVirtual.tsx`; en Administración, `../../punku/web/src/componentes/AdminMesaVirtual.tsx` | este repo |
| `dist/` | build (ignorado) | `npm run build` |

## Íconos

`public/iconos/icono.svg` (esquinas propias, «any»), `icono-maskable.svg` (fondo a sangre, la hoja dentro de la
zona segura del 80 %) e `icono-monocromo.svg` (silueta para los íconos temáticos de Android) son la fuente; los PNG
se generan con Inkscape, desde `frontend/public/iconos/`:

```bash
for t in 192 512; do
  inkscape icono.svg --export-type=png --export-filename=icono-$t.png -w $t -h $t
  inkscape icono-maskable.svg --export-type=png --export-filename=icono-maskable-$t.png -w $t -h $t
done
inkscape icono-monocromo.svg --export-type=png --export-filename=icono-monocromo-512.png -w 512 -h 512
inkscape icono-maskable.svg --export-type=png --export-filename=apple-touch-icon.png -w 180 -h 180
```

Colores de la marca (`src/paleta.ts`): vino `#4E0A18` (con un degradado a puka 800), dorado qillu 500 y neutral
100; sin naranja. `public/favicon.svg` es el mismo dibujo con trazos más gruesos.

## Límite honesto

- Sin pruebas automáticas de la interfaz: `npm run build` (tsc de la web y de `../../qillqasqa/web/colab/`) es la comprobación; la edición simultánea tiene su prueba de dos clientes (`../../qillqasqa/web/colab/prueba_dos_clientes.ts`).
- El service worker no corre en el navegador integrado del asistente; se prueba con Chrome sin ventana
  (`google-chrome --headless=new --remote-debugging-port=…`) manejado por CDP, o en Chrome a mano. Los
  selectores nativos de carpeta, copiar como imagen y la sincronización requieren Chromium + HTTPS.
