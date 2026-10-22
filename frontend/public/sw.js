/**
 * Service worker de Qillqa. Dos secciones independientes, cada una con su dueño:
 *
 *   1. CACHÉ Y MODO SIN CONEXIÓN: que el sistema ABRA siempre, con o sin servidor, y que una
 *      publicación nunca deje la aplicación en blanco.
 *   2. NOTIFICACIONES (push y notificationclick, las del chat): al final del archivo.
 *
 * El build antepone `self.__QILLQA_PUBLICACION__` con la versión y la lista exacta de archivos
 * (vite.publicacion.ts): cada publicación produce un sw.js distinto y el navegador instala el
 * nuevo solo, que guarda la aplicación COMPLETA antes de tomar el control.
 */

/* ==========================================================================================
 * 1. CACHÉ Y MODO SIN CONEXIÓN
 *
 * Pedido de Edison (2026-09-05): «que los usuarios puedan continuar trabajando aunque el
 * servidor principal deje de estar disponible». Y el 2026-10-12, desde el celular, tras una
 * publicación: «no carga el sistema, no puedo acceder» — la aplicación se quedó en la pantalla
 * de inicio. La causa (docs/arquitectura.md §31): el `vite preview` contesta un archivo
 * inexistente de /assets/ con el index.html y un 200, y este worker lo guardaba como si fuera
 * el JS; como sirve /assets/ desde su caché primero, quedaba en blanco en cada apertura.
 *
 * Reglas, todas aprendidas de ese día:
 *
 *   · La APLICACIÓN se guarda entera al instalarse, por versión (`qillqa-app-<versión>`), con el
 *     index.html de ESA versión. Si algo falla, la instalación falla y sigue la anterior: nunca
 *     se activa una versión a medias.
 *   · Un archivo de /assets/ solo se guarda si es lo que dice ser: nunca un HTML en lugar de un
 *     JS. Si no existe, 404 (la página recarga una vez y toma la versión nueva; src/arranque.ts).
 *   · La NAVEGACIÓN va a la red con un plazo (ESPERA_NAVEGACION_MS): si el servidor no contesta,
 *     contesta mal o tarda, se abre el index.html guardado. El index de la red jamás se guarda
 *     encima: nombraría archivos que esta versión no tiene.
 *   · Se conservan las dos últimas versiones: una pestaña abierta antes de publicar sigue
 *     encontrando sus trozos.
 *   · La API (/api/) NO pasa por aquí: «lo último visto» lo guarda la aplicación en IndexedDB,
 *     separado por cuenta y borrado al cerrar sesión (src/cachelecturas.ts). Así este worker no
 *     guarda datos de nadie, ni tokens, ni nada de la mesa de partes pública.
 *   · Las ESCRITURAS no se interceptan: fallan y la aplicación decide qué encolar. Numerar,
 *     cambiar de estado o subir un archivo jamás ocurren sin servidor.
 * ======================================================================================== */

const PUBLICACION = self.__QILLQA_PUBLICACION__ || { version: 'desarrollo', entrada: '', archivos: [] }
const PREFIJO_APP = 'qillqa-app-'
const CACHE_APP = PREFIJO_APP + PUBLICACION.version
const CACHE_OBS = 'qillqa-obs'
/** Versiones de la aplicación que se conservan (la actual y la anterior). */
const VERSIONES_CONSERVADAS = 2
/** Lo que se espera a la red al abrir antes de abrir con lo guardado. */
const ESPERA_NAVEGACION_MS = 4000

/** ¿La respuesta es de verdad el archivo pedido? (un 200 con HTML en lugar de un JS, no). */
function esValida(respuesta, ruta) {
  if (!respuesta || !respuesta.ok || respuesta.type === 'opaque') return false
  const tipo = (respuesta.headers.get('content-type') || '').toLowerCase()
  if (ruta === '/index.html' || ruta === '/') return tipo.includes('text/html')
  return !tipo.includes('text/html')
}

async function guardarVersion() {
  const cache = await caches.open(CACHE_APP)
  // 1. El index.html de esta versión (el build lo escribe antes que este sw.js) y comprobado: debe
  //    nombrar la entrada de esta versión, o sería el de otra publicación.
  const index = await fetch('/index.html', { cache: 'reload' })
  if (!esValida(index, '/index.html')) throw new Error('index.html no disponible')
  const html = await index.clone().text()
  if (PUBLICACION.entrada && !html.includes(PUBLICACION.entrada)) throw new Error('index.html de otra publicación')
  // 2. Todos los archivos. Los de /assets/ llevan hash: si ya están en la versión anterior, se
  //    copian de ahí (las bibliotecas no se vuelven a bajar en cada publicación).
  await Promise.all(
    PUBLICACION.archivos.map(async (ruta) => {
      const inmutable = ruta.startsWith('/assets/')
      const previa = inmutable ? await caches.match(ruta) : undefined
      if (previa && esValida(previa, ruta)) return cache.put(ruta, previa)
      const respuesta = await fetch(ruta, { cache: inmutable ? 'default' : 'reload' })
      if (!esValida(respuesta, ruta)) {
        if (inmutable) throw new Error(`falta ${ruta}`)
        return undefined // un ícono que falta no impide abrir el sistema
      }
      return cache.put(ruta, respuesta)
    }),
  )
  // El index, al final: con él guardado, la versión está completa.
  await cache.put('/index.html', index)
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      if (PUBLICACION.version === 'desarrollo') return
      await guardarVersion()
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const claves = await caches.keys()
      const versiones = claves.filter((k) => k.startsWith(PREFIJO_APP)).sort().reverse()
      const conservar = new Set([CACHE_APP, ...versiones.filter((k) => k <= CACHE_APP).slice(0, VERSIONES_CONSERVADAS), CACHE_OBS])
      await Promise.all(
        claves
          // Las de este worker: las versiones viejas y el caché anterior a 2026-10-13 (qillqa-v1-*,
          // que guardaba /api sin separar por cuenta). Otras cachés no son de esta sección.
          // y las del nombre viejo (sgdp-app-*, sgdp-v1-*, hasta el 2026-10-22).
          .filter((k) => (k.startsWith(PREFIJO_APP) || k.startsWith('qillqa-v1') || k.startsWith('sgdp-')) && !conservar.has(k))
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (evento) => {
  // Compatibilidad: la aplicación lo manda al cerrar sesión. Desde 2026-10-13 este worker no
  // guarda /api; se borra el caché viejo por si quedó de antes.
  // Con el nombre viejo lo manda una pestaña abierta antes del 2026-10-22 (sgdp:limpiar-api, caché sgdp-v1-api).
  if (evento.data === 'qillqa:limpiar-api' || evento.data === 'sgdp:limpiar-api') {
    evento.waitUntil(Promise.all([caches.delete('qillqa-v1-api'), caches.delete('sgdp-v1-api')]))
  }
})

/** El index.html guardado: el de esta versión o, si no, el más reciente que haya. */
async function indexGuardado() {
  const propio = await (await caches.open(CACHE_APP)).match('/index.html')
  if (propio) return propio
  const versiones = (await caches.keys()).filter((k) => k.startsWith(PREFIJO_APP)).sort().reverse()
  for (const v of versiones) {
    const r = await (await caches.open(v)).match('/index.html')
    if (r) return r
  }
  return undefined
}

/** Navegación: la red con plazo; si no contesta, contesta mal o tarda, lo guardado. */
function navegar(peticion) {
  return new Promise((resolver) => {
    let resuelto = false
    const fin = (respuesta) => {
      if (resuelto) return
      resuelto = true
      resolver(respuesta)
    }
    // Pasado el plazo se abre lo guardado; sin nada guardado (primera visita) se sigue esperando.
    const plazo = setTimeout(async () => {
      const guardado = await indexGuardado()
      if (guardado) fin(guardado)
    }, ESPERA_NAVEGACION_MS)
    fetch(peticion)
      .then(async (respuesta) => {
        clearTimeout(plazo)
        if (respuesta.ok && (respuesta.headers.get('content-type') || '').includes('text/html')) return fin(respuesta)
        // 404/500 de un servidor a medio publicar o de un proxy sin aplicación: lo guardado y, si
        // no hay nada guardado, lo que dijo el servidor.
        fin((await indexGuardado()) || respuesta)
      })
      .catch(async () => {
        clearTimeout(plazo)
        fin((await indexGuardado()) || new Response('Sin conexión y sin copia guardada del sistema.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
      })
  })
}

/** /assets/: lo guardado (en cualquier versión conservada) y, si no, la red, validada. */
async function asset(peticion, ruta) {
  const guardada = await caches.match(ruta)
  if (guardada) return guardada
  try {
    const respuesta = await fetch(peticion)
    if (esValida(respuesta, ruta)) {
      const copia = respuesta.clone()
      caches.open(CACHE_APP).then((c) => c.put(ruta, copia))
      return respuesta
    }
  } catch {
    /* sin red: abajo */
  }
  // Nunca un HTML en lugar del JS: un 404 claro, que la aplicación sabe manejar (recarga una vez).
  return new Response('', { status: 404, statusText: 'No existe en esta versión' })
}

/** Lo demás estático (manifiesto, íconos, favicon): lo guardado al instante, refrescado detrás. */
async function estatico(peticion, ruta) {
  const guardada = await caches.match(ruta)
  const enRed = fetch(peticion)
    .then((respuesta) => {
      if (esValida(respuesta, ruta)) {
        const copia = respuesta.clone()
        caches.open(CACHE_APP).then((c) => c.put(ruta, copia))
      }
      return respuesta
    })
    .catch(() => guardada || new Response('', { status: 504 }))
  return guardada || enRed
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return
  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return

  // OBSERVATORIO (/api/observatorio/, desde Qhawana Q1; antes /obs/): la página de datos y su estado.
  // Va antes que la API y que la navegación porque su marco pide la página como una: sin red se
  // devolvería la aplicación DENTRO del marco. Red primero y, sin conexión, la última copia (una
  // sola, por ruta, sin ?v=).
  if (url.pathname.startsWith('/api/observatorio/') || url.pathname.startsWith('/obs/')) {
    evento.respondWith(
      caches.open(CACHE_OBS).then((cache) =>
        fetch(peticion)
          .then((respuesta) => {
            if (respuesta.ok) cache.put(url.pathname, respuesta.clone())
            return respuesta
          })
          .catch(async () => (await cache.match(url.pathname)) || new Response('Sin conexión.', { status: 503 })),
      ),
    )
    return
  }

  // API: la resuelve la aplicación («lo último visto», por cuenta, en IndexedDB). Incluye la mesa
  // de partes pública (/api/publico/), que jamás se guarda en el equipo.
  if (url.pathname.startsWith('/api/')) return
  // Edición simultánea (WebSocket; por si algún navegador lo pasara por aquí).
  if (url.pathname.startsWith('/colab')) return

  // NAVEGACIÓN: el router vive en el cliente («/documentos/148» no es un archivo); sin red se
  // devuelve el index guardado y el router resuelve la ruta en el navegador.
  if (peticion.mode === 'navigate') {
    evento.respondWith(navegar(peticion))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(asset(peticion, url.pathname))
    return
  }

  if (url.pathname === '/sw.js' || url.pathname === '/version.json') return
  evento.respondWith(estatico(peticion, url.pathname))
})

/* ==========================================================================================
 * 2. NOTIFICACIONES (push y notificationclick)
 * Sección del chat: va aquí, debajo, sin tocar la sección 1.
 * ======================================================================================== */

// Sección del chat (2026-10-13; servidor en backend/app/servicios/push.py, suscripción en
// src/componentes/chat/avisosPush.ts). El aviso llega cifrado y trae su propio aspecto: título,
// cuerpo, la ruta que abre, la etiqueta que lo agrupa (`chat-<canal>`: una conversación, un aviso
// que se renueva), la vibración propia de Qillqa, el ícono y la insignia. El SONIDO lo pone el
// sistema operativo (en Android, el canal de notificaciones de Chrome): la Web no puede elegirlo.

const VIBRACION_QILLQA = [90, 60, 90, 60, 220] // la misma de servicios/push.py, por si el aviso no la trae

self.addEventListener('push', (evento) => {
  let d = {}
  try {
    d = evento.data ? evento.data.json() : {}
  } catch {
    d = { cuerpo: evento.data ? evento.data.text() : '' }
  }
  const tag = d.tag || 'qillqa'
  evento.waitUntil(
    (async () => {
      // Varios mensajes de la misma conversación: un solo aviso que cuenta cuántos van.
      const previos = await self.registration.getNotifications({ tag })
      const n = previos.reduce((m, x) => Math.max(m, (x.data && x.data.n) || 1), 0) + 1
      const titulo = (d.titulo || 'Qillqa') + (d.clase === 'chat' && n > 1 ? ` · ${n} mensajes` : '')
      await self.registration.showNotification(titulo, {
        body: d.cuerpo || '',
        icon: d.icono || '/notificaciones/icono-192.png',
        badge: d.insignia || '/notificaciones/insignia-96.png',
        tag,
        renotify: true,
        vibrate: d.vibrar || VIBRACION_QILLQA,
        timestamp: d.enviado_en ? Date.parse(d.enviado_en) : Date.now(),
        lang: 'es-PE',
        data: { url: d.url || '/', clase: d.clase || 'aviso', n },
      })
      if (self.navigator && 'setAppBadge' in self.navigator) self.navigator.setAppBadge().catch(() => {})
      // Acuse de llegada al dispositivo (el segundo ✓ de quien escribió): sin sesión, con la firma del aviso.
      if (d.acuse) {
        await fetch('/api/push/recibido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d.acuse) }).catch(() => {})
      }
    })(),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL((evento.notification.data && evento.notification.data.url) || '/', self.location.origin).href
  evento.waitUntil(
    (async () => {
      if (self.navigator && 'clearAppBadge' in self.navigator) self.navigator.clearAppBadge().catch(() => {})
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin)
      if (propia) {
        // Qillqa ya está abierto: se trae al frente y la propia aplicación va a la conversación
        // (sin recargar: ContadorChat escucha `qillqa:abrir`).
        await propia.focus().catch(() => undefined)
        propia.postMessage({ tipo: 'qillqa:abrir', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
