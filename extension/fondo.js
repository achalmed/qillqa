// Proceso de fondo de la extensión de Qillqa (2026-10-08). Guarda el documento que Qillqa mandó
// al pulsar «Abrir mesa de partes», reconoce la pestaña de la mesa (la que se abrió desde el
// Qillqa, aunque luego cambie de dirección, y cualquier pestaña con la dirección de esa mesa) y
// habla con la API de Qillqa con la sesión de quien lo mandó: revelar una clave, descargar el
// firmado, abrir su ubicación. Todo vive en chrome.storage.session: se borra al cerrar el
// navegador.

const VIGENCIA_MS = 12 * 60 * 60 * 1000 // un envío sirve medio día
const ESPERA_PESTANA_MS = 15000 // la pestaña de la mesa se abre en este plazo tras el envío

const leer = async () => (await chrome.storage.session.get({ envios: [], pestanas: {}, ocultas: {}, sesion: null }))
const guardar = (datos) => chrome.storage.session.set(datos)
const origenDe = (url) => { try { return new URL(url).origin } catch { return '' } }

async function envioPara(tabId, url) {
  const { envios, pestanas, ocultas } = await leer()
  if (ocultas[tabId]) return null
  const vivos = envios.filter((e) => Date.now() - e.en < VIGENCIA_MS)
  const porPestana = pestanas[tabId] && vivos.find((e) => e.id === pestanas[tabId])
  if (porPestana) return porPestana
  const origen = origenDe(url)
  return vivos.filter((e) => e.origen === origen).sort((a, b) => b.en - a.en)[0] || null
}

async function mostrarEn(tabId, envio) {
  try { await chrome.tabs.sendMessage(tabId, { tipo: 'mostrar', envio: publico(envio) }) } catch { /* aún cargando */ }
}

// Lo que ve la página de la mesa: sin la sesión de Qillqa.
const publico = (e) => ({ id: e.id, url: e.url, paquete: e.paquete })

// Cuentas por sitio, cinco minutos (el contenido pregunta en cada página).
const cuentasCache = new Map()

chrome.tabs.onCreated.addListener(async (tab) => {
  const { envios, pestanas } = await leer()
  const reciente = envios.find((e) => e.desde === tab.openerTabId && Date.now() - e.en < ESPERA_PESTANA_MS && !e.pestana)
  if (!reciente) return
  reciente.pestana = tab.id
  pestanas[tab.id] = reciente.id
  await guardar({ envios, pestanas })
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { pestanas, ocultas } = await leer()
  delete pestanas[tabId]
  delete ocultas[tabId]
  await guardar({ pestanas, ocultas })
})

async function llamar(envio, ruta, metodo = 'GET', cuerpo = null) {
  if (!envio || !envio.token) throw new Error('Abra Qillqa en este navegador para usar las contraseñas.')
  const headers = { Authorization: `Bearer ${envio.token}` }
  if (cuerpo) headers['Content-Type'] = 'application/json'
  const r = await fetch(envio.api + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  if (!r.ok) {
    let detalle = `Error ${r.status}`
    try { const j = await r.json(); detalle = typeof j.detail === 'string' ? j.detail : detalle } catch { /* sin cuerpo */ }
    if (r.status === 401) detalle = 'La sesión de Qillqa venció: vuelva a abrir la mesa desde Qillqa.'
    throw new Error(detalle)
  }
  return r
}

chrome.runtime.onMessage.addListener((msg, remitente, responder) => {
  ;(async () => {
    const tabId = remitente.tab && remitente.tab.id
    if (msg.tipo === 'envio') {
      // Desde la página de Qillqa: el documento para la mesa que se está abriendo.
      const d = msg.datos
      const { envios, pestanas } = await leer()
      const envio = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        en: Date.now(), url: d.url, origen: origenDe(d.url), paquete: d.paquete, token: d.token, api: d.api, desde: tabId,
      }
      const restantes = envios.filter((e) => Date.now() - e.en < VIGENCIA_MS && e.origen !== envio.origen).slice(-30)
      // La pestaña ya pudo abrirse antes de que llegaran los datos.
      const abiertas = await chrome.tabs.query({})
      const asociadas = new Set(Object.keys(pestanas).map(Number))
      const nueva = abiertas.filter((t) => t.openerTabId === tabId && !asociadas.has(t.id)).sort((a, b) => b.id - a.id)[0]
      if (nueva) { envio.pestana = nueva.id; pestanas[nueva.id] = envio.id }
      await guardar({ envios: [...restantes, envio], pestanas })
      for (const t of abiertas) {
        if (t.id === envio.pestana || origenDe(t.url || '') === envio.origen) await mostrarEn(t.id, envio)
      }
      responder({ ok: true })
    } else if (msg.tipo === 'sesion') {
      // Desde la página de Qillqa, al cargar: la sesión para el módulo Contraseñas.
      await guardar({ sesion: msg.token ? { token: msg.token, api: msg.api, en: Date.now() } : null })
      cuentasCache.clear()
      responder({ ok: true })
    } else if (msg.tipo === 'cuentas') {
      // Las cuentas guardadas de este sitio (sin claves), como Google Contraseñas.
      const { sesion } = await leer()
      const host = (() => { try { return new URL(remitente.url).hostname } catch { return '' } })()
      if (!sesion || !host) return responder({ cuentas: [] })
      const guardadas = cuentasCache.get(host)
      if (guardadas && Date.now() - guardadas.en < 5 * 60 * 1000) return responder({ cuentas: guardadas.lista })
      try {
        const r = await llamar(sesion, `/api/contrasenas/sitio?host=${encodeURIComponent(host)}`)
        const lista = await r.json()
        cuentasCache.set(host, { en: Date.now(), lista })
        responder({ cuentas: lista })
      } catch (e) {
        responder({ cuentas: [], error: e.message })
      }
    } else if (msg.tipo === 'clave-sitio') {
      const { sesion } = await leer()
      try {
        const r = await llamar(sesion, `/api/contrasenas/${msg.id}/revelar?accion=autocompletar&ingreso=${encodeURIComponent(msg.ingreso || '')}`, 'POST')
        responder({ clave: (await r.json()).clave })
      } catch (e) {
        responder({ error: e.message })
      }
    } else if (msg.tipo === 'observado' || msg.tipo === 'aprendido') {
      // Lo que la página vio al ENVIAR un formulario (2026-10-10): un ingreso con clave
      // (Contraseñas lo deja pendiente de aprobar) o los campos llenos de una mesa (para que el
      // próximo autocompletado sea más completo). Con el documento abierto o con la sesión.
      const envio = (await envioPara(tabId, remitente.url || '')) || (await leer()).sesion
      try {
        if (msg.tipo === 'observado') await llamar(envio, '/api/contrasenas/observadas', 'POST', msg.datos)
        else await llamar(envio, '/api/mesa/aprendido', 'POST', msg.datos)
        responder({ ok: true })
      } catch (e) {
        responder({ error: e.message })
      }
    } else if (msg.tipo === 'pedir') {
      const envio = await envioPara(tabId, remitente.url || '')
      responder(envio ? { envio: publico(envio) } : {})
    } else if (msg.tipo === 'ocultar') {
      const { ocultas } = await leer()
      ocultas[tabId] = true
      await guardar({ ocultas })
      responder({ ok: true })
    } else if (msg.tipo === 'revelar' || msg.tipo === 'firmado' || msg.tipo === 'ubicacion') {
      const envio = await envioPara(tabId, remitente.url || '')
      if (!envio) return responder({ error: 'No hay un documento de Qillqa para esta página.' })
      try {
        if (msg.tipo === 'revelar') {
          const r = await llamar(envio, `/api/contrasenas/${msg.id}/revelar?accion=autocompletar&ingreso=${encodeURIComponent(msg.ingreso || '')}`, 'POST')
          responder({ clave: (await r.json()).clave })
        } else if (msg.tipo === 'ubicacion') {
          await llamar(envio, `/api/mesa/documentos/${envio.paquete.documento.id}/abrir-ubicacion`, 'POST')
          responder({ ok: true })
        } else {
          const f = envio.paquete.firmado
          const r = await llamar(envio, `/api/documentos/${envio.paquete.documento.id}/adjuntos/${f.id}`)
          const bytes = new Uint8Array(await r.arrayBuffer())
          let bin = ''
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          responder({ base64: btoa(bin), nombre: f.nombre })
        }
      } catch (e) {
        responder({ error: e.message || 'No se pudo.' })
      }
    }
  })()
  return true // respuesta asíncrona
})
