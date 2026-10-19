// Script de página de la extensión de Qillqa (2026-10-08). Hace dos cosas:
//  1. En Qillqa (la página lleva <meta name="sgdp-app">): avisa que la extensión está instalada
//     y pasa al fondo el documento que Qillqa manda al pulsar «Abrir mesa de partes».
//  2. En cualquier otra página: si el fondo tiene un documento para ella (es la pestaña que abrió
//     Qillqa o la dirección de esa mesa), muestra el PANEL DE APOYO dentro de la página, aislado
//     de su diseño (Shadow DOM): autocompletar, copiar cada dato, acceso, firmado.
// Las reglas del autocompletado son las de frontend/src/autocompletar.ts: mantenerlas a la par.

;(() => {
  if (window.__sgdpMesa) return
  window.__sgdpMesa = true

  // --- 1. En Qillqa: el puente ----------------------------------------------------------
  if (document.querySelector('meta[name="sgdp-app"]')) {
    document.documentElement.dataset.sgdpExtension = chrome.runtime.getManifest().version
    // La sesión de Qillqa (la del navegador de quien lo usa) para el módulo Contraseñas.
    const avisarSesion = () => chrome.runtime.sendMessage({ tipo: 'sesion', token: localStorage.getItem('sgdp_token') || '', api: location.origin })
    avisarSesion()
    window.addEventListener('storage', (e) => { if (e.key === 'sgdp_token') avisarSesion() })
    window.addEventListener('message', (ev) => {
      if (ev.source !== window || ev.origin !== location.origin) return
      const d = ev.data
      if (!d || d.sgdp !== 'mesa' || !d.url || !d.paquete) return
      chrome.runtime.sendMessage({ tipo: 'envio', datos: { url: d.url, paquete: d.paquete, token: d.token, api: d.api } })
    })
    return
  }

  // --- 2. En la mesa de partes: el panel ---------------------------------------------------
  const pedirAlFondo = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || {})))
  let envio = null
  let raiz = null

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.tipo === 'mostrar' && msg.envio) { envio = msg.envio; pintar() }
  })
  pedirAlFondo({ tipo: 'pedir' }).then((r) => {
    if (r.envio) { envio = r.envio; pintar() } else vigilarIngreso()
  })
  vigilarEnvios()

  // --- Aprender de lo que se envía (2026-10-10) ---------------------------------------------
  // Al enviar un formulario: si lleva clave, Qillqa lo compara con lo guardado (una cuenta nueva
  // o una clave cambiada queda pendiente de aprobar en Contraseñas); si es el formulario de una
  // mesa con documento abierto, los campos llenos que Qillqa no llenó se guardan por etiqueta
  // para el próximo autocompletado. Nada se manda dos veces en la misma página.
  const enviados = new Set()
  function vigilarEnvios() {
    const texto = (el) => {
      const propias = []
      if (el.labels) Array.from(el.labels).forEach((l) => propias.push(l.textContent || ''))
      for (const a of ['aria-label', 'placeholder', 'title']) propias.push(el.getAttribute(a) || '')
      if (!propias.join('').trim()) {
        const previo = (el.closest('td') && el.closest('td').previousElementSibling) || el.previousElementSibling || (el.parentElement && el.parentElement.previousElementSibling)
        if (previo) propias.push((previo.textContent || '').slice(0, 80))
      }
      if (!propias.join('').trim()) propias.push(el.getAttribute('name') || el.getAttribute('id') || '')
      return propias.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    }
    const recoger = (form) => {
      const campos = Array.from((form || document).querySelectorAll('input, textarea, select'))
        .filter((el) => !(raiz && raiz.contains(el)) && !/^(hidden|checkbox|radio|file|submit|button|image|reset)$/.test(el.type))
      const clave = campos.find((el) => el.type === 'password' && el.value)
      if (clave) {
        const usuario = campos.filter((el) => el.type !== 'password' && el.value && el.tagName !== 'SELECT').slice(-1)[0]
        const firma = `clave:${usuario ? usuario.value : ''}:${clave.value.length}`
        if (enviados.has(firma)) return
        enviados.add(firma)
        pedirAlFondo({ tipo: 'observado', datos: { host: location.hostname, url: location.href.slice(0, 500), usuario: usuario ? usuario.value : '', clave: clave.value } })
        return
      }
      if (!envio) return
      const propios = new Set(Object.values({ ...envio.paquete.titular, ...envio.paquete.documento }).map((v) => norm(String(v || ''))))
      const aprendidos = []
      for (const el of campos) {
        const v = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].text : '') : el.value
        if (!v || !v.trim() || v.length > 200 || propios.has(norm(v))) continue
        const etiqueta = texto(el)
        if (etiqueta.length >= 3) aprendidos.push({ etiqueta, valor: v.trim() })
      }
      if (!aprendidos.length) return
      const firma = `form:${aprendidos.map((a) => a.etiqueta).join('|')}`
      if (enviados.has(firma)) return
      enviados.add(firma)
      pedirAlFondo({ tipo: 'aprendido', datos: { host: location.hostname, campos: aprendidos.slice(0, 80) } })
    }
    document.addEventListener('submit', (e) => recoger(e.target && e.target.tagName === 'FORM' ? e.target : null), true)
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]')
      if (!b) return
      const t = norm(b.textContent || b.value || '')
      if (/enviar|ingresar|iniciar|entrar|registrar|acceder|guardar|presentar|login|submit|continuar/.test(t)) setTimeout(() => recoger(b.closest('form')), 150)
    }, true)
  }

  // --- Sin documento: autocompletar el ingreso de un sitio guardado (como Google Contraseñas) ---
  let cuentas = null
  let pastilla = null
  function hayClave() {
    return Array.from(document.querySelectorAll('input[type="password"]')).some((i) => i.offsetWidth || i.offsetHeight)
  }
  async function ofrecerIngreso() {
    if (envio || pastilla || !hayClave()) return
    if (cuentas === null) cuentas = (await pedirAlFondo({ tipo: 'cuentas' })).cuentas || []
    if (!cuentas.length || envio || pastilla) return
    pastilla = document.createElement('sgdp-acceso')
    document.documentElement.appendChild(pastilla)
    const sombra = pastilla.attachShadow({ mode: 'open' })
    const opciones = cuentas.flatMap((c) => ingresosDe(c).map((ing) => ({ c, ing })))
    // Con nodos del DOM, no innerHTML (lo pide Mozilla para firmar la extensión).
    sombra.append(el('style', {}, `
      :host{all:initial} *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      .caja{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#fff;border-radius:14px;overflow:hidden;width:290px;
        box-shadow:0 12px 40px rgba(36,31,28,.28),0 0 0 1px rgba(36,31,28,.08);color:#241F1C}
      .cab{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#4E0A18;color:#fff;font-size:13px;font-weight:700}
      .cab span{flex:1} .cab button{all:unset;cursor:pointer;padding:2px 6px;border-radius:6px} .cab button:hover{background:rgba(255,255,255,.15)}
      .op{all:unset;box-sizing:border-box;display:block;width:100%;padding:10px 14px;cursor:pointer;border-top:1px solid #E9E2D9}
      .op:hover{background:#F7F5F2} .op b{display:block;font-size:13.5px} .op span{display:block;font-size:12.5px;color:#6E655D}
      .msg{padding:8px 14px;font-size:12.5px;color:#6B4E0B;background:rgba(131,96,13,.07);display:none}`))
    sombra.append(el('div', { class: 'caja' },
      el('div', { class: 'cab' }, el('span', {}, 'Qillqa · Autocompletar acceso'), el('button', { title: 'Cerrar' }, '✕')),
      el('div', { class: 'msg' }),
      opciones.map((o, i) => el('button', { class: 'op', 'data-i': String(i) },
        el('b', {}, o.c.nombre), el('span', {}, `Entrar con ${o.ing.tipo}: ${o.ing.usuario || '—'}`))),
    ))
    const msg = sombra.querySelector('.msg')
    sombra.querySelector('.cab button').addEventListener('click', () => { pastilla.remove() })
    sombra.querySelectorAll('.op').forEach((b) => b.addEventListener('click', async () => {
      const { c, ing } = opciones[Number(b.dataset.i)]
      const r = ing.tiene_clave ? await pedirAlFondo({ tipo: 'clave-sitio', id: c.id, ingreso: ing.id }) : {}
      if (r.error) { msg.textContent = r.error; msg.style.display = 'block'; return }
      const n = rellenarIngreso(ing.usuario, r.clave || '')
      msg.textContent = n ? 'Listo: revise y pulse Ingresar.' : 'No se encontraron los campos de usuario y contraseña.'
      msg.style.display = 'block'
      if (n) setTimeout(() => pastilla && pastilla.remove(), 2500)
    }))
  }
  // El ingreso: la contraseña en el campo de clave y el usuario en el campo de texto visible que
  // está justo antes (muchas mesas lo llaman «DNI», «RUC» o «Correo», no «Usuario»).
  function rellenarIngreso(usuario, clave) {
    const ver = (i) => i.offsetWidth || i.offsetHeight
    const claveEl = Array.from(document.querySelectorAll('input[type="password"]')).find(ver)
    if (!claveEl) return 0
    const poner = (el, v) => {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      if (desc && desc.set) desc.set.call(el, v); else el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.style.outline = '2px solid #A67B10'
    }
    let n = 0
    if (clave) { poner(claveEl, clave); n++ }
    if (usuario) {
      const textos = Array.from((claveEl.form || document).querySelectorAll('input')).filter((i) =>
        ver(i) && !i.disabled && /^(text|email|tel|number|)$/.test(i.type))
      const antes = textos.filter((i) => i.compareDocumentPosition(claveEl) & Node.DOCUMENT_POSITION_FOLLOWING)
      const campo = antes[antes.length - 1] || textos[0]
      if (campo) { poner(campo, usuario); n++ }
    }
    return n
  }
  function vigilarIngreso() {
    ofrecerIngreso()
    // Los formularios de ingreso de muchas mesas se dibujan después (Angular, React).
    let veces = 0
    const obs = new MutationObserver(() => {
      if (++veces > 400 || pastilla || envio) return obs.disconnect()
      if (hayClave()) ofrecerIngreso()
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  }

  // Formas de ingreso de una cuenta (DNI, correo…); las cuentas de antes traían solo usuario y clave.
  const ingresosDe = (c) => (c.ingresos && c.ingresos.length ? c.ingresos : [{ id: '', tipo: 'Usuario', usuario: c.usuario, tiene_clave: c.tiene_clave }])

  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return } catch { /* http o sin foco */ }
    const t = document.createElement('textarea')
    t.value = texto
    t.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }

  // Llena los campos VACÍOS que reconoce; devuelve cuántos. Mismas reglas que autocompletar.ts.
  function rellenar(d) {
    const pideIdentidad = Array.from(document.querySelectorAll('select')).some((s) =>
      Array.from(s.options).some((o) => /\bdni\b|identidad/.test(norm(o.text))))
    const reglas = [
      [/apellido paterno|primer apellido|ap\.? paterno/, 'apellido_paterno'],
      [/apellido materno|segundo apellido|ap\.? materno/, 'apellido_materno'],
      [/razon social|nombre completo|nombres? y apellidos|apellidos y nombres|remitente|solicitante/, 'nombre_completo'],
      [/tipo de documento de identidad|tipo de doc.*identidad/, 'tipo_documento'],
      [/digito|verificador/, 'digito_verificador'],
      [/emision/, 'fecha_emision'],
      [/caducidad|vencimiento/, 'fecha_caducidad'],
      [/nacimiento/, 'fecha_nacimiento'],
      [/ubigeo/, 'ubigeo'],
      [/\bdni\b|d\.n\.i|documento de identidad|numero de identidad/, 'dni'],
      [/\bruc\b/, 'ruc_entidad'],
      [/correo|e-?mail/, 'correo'],
      [/celular|movil|telefono|\btel\b/, 'celular'],
      [/direccion|domicilio/, 'direccion'],
      [/departamento|region/, 'departamento'],
      [/provincia/, 'provincia'],
      [/distrito/, 'distrito'],
      [/folio/, 'folios'],
      [/asunto|sumilla/, 'asunto'],
      [/clase de documento|tipo de tramite/, 'tipo'],
      [/tipo de documento/, 'tipo_segun_opciones'],
      [/\b(nro|numero|n)\b\.? ?[°º]? ?(de |del )?(documento|oficio|expediente)/, pideIdentidad ? 'dni' : 'numero'],
      [/fecha/, 'fecha'],
      [/cargo/, 'cargo'],
      [/entidad|institucion|organizacion/, 'entidad'],
      [/^(?!.*apellido).*\bnombres?\b/, 'nombres'],
      [/usuario|user|login|cuenta/, 'usuario'],
    ]
    const descripcion = (el) => {
      const propias = []
      if (el.labels) Array.from(el.labels).forEach((l) => propias.push(l.textContent || ''))
      for (const a of ['aria-label', 'placeholder', 'title']) propias.push(el.getAttribute(a) || '')
      const etiquetada = el.getAttribute('aria-labelledby')
      if (etiquetada) etiquetada.split(' ').forEach((i) => propias.push((document.getElementById(i) || {}).textContent || ''))
      const tecnicas = ['name', 'id', 'formcontrolname'].map((a) => el.getAttribute(a) || '')
      if (!propias.join('').trim()) {
        const previo = (el.closest('td') && el.closest('td').previousElementSibling) || el.previousElementSibling || (el.parentElement && el.parentElement.previousElementSibling)
        if (previo) propias.push((previo.textContent || '').slice(0, 80))
      }
      const tec = tecnicas.join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
      return norm(`${propias.join(' ')} ${tec}`)
    }
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    let llenos = 0
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (raiz && raiz.contains(el)) return
      if (el.disabled || el.readOnly || !visible(el)) return
      if (/^(hidden|checkbox|radio|file|submit|button|image|reset)$/.test(el.type)) return
      let clave = ''
      if (el.type === 'password') clave = 'clave'
      else { const t = descripcion(el); for (const [re, k] of reglas) if (re.test(t)) { clave = k; break } }
      if (clave === 'tipo_segun_opciones') {
        const ops = el.tagName === 'SELECT' ? Array.from(el.options).map((o) => norm(o.text)).join(' ') : ''
        clave = /\bdni\b|identidad|extranjeria|pasaporte/.test(ops) ? 'tipo_documento' : pideIdentidad && el.tagName !== 'SELECT' ? 'tipo_documento' : 'tipo'
      }
      let valor = clave ? d[clave] : ''
      // Sin regla (o sin dato): lo aprendido de formularios anteriores de esta mesa, por etiqueta.
      if (!valor && d.aprendido) {
        const t = descripcion(el)
        for (const [etiqueta, v] of Object.entries(d.aprendido)) {
          const e = norm(etiqueta)
          if (e && (t === e || t.includes(e) || e.includes(t.slice(0, 40)) && t.length > 6)) { valor = v; break }
        }
      }
      if (!valor) return
      if (el.tagName === 'SELECT') {
        const v = norm(valor)
        const op = Array.from(el.options).find((o) => o.value && (norm(o.text) === v || norm(o.text).includes(v) || v.includes(norm(o.text))))
        if (!op) return
        el.value = op.value
      } else {
        if (el.value) return
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const desc = Object.getOwnPropertyDescriptor(proto, 'value')
        if (desc && desc.set) desc.set.call(el, valor); else el.value = valor
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.style.outline = '2px solid #A67B10'
      el.style.outlineOffset = '1px'
      llenos++
    })
    return llenos
  }

  // --- El panel ------------------------------------------------------------------------------
  // --- El panel (2026-10-08, Edison: «limpio, con su botón Copiar, sin muchos elementos visuales;
  // agrupado, pero todo a la vista»): fondo blanco, una fila por dato con «Copiar», sin tarjetas ni
  // íconos; arriba las acciones; luego el acceso a la mesa, el documento y el remitente.
  const ESTILO = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; }
    .panel { position: fixed; top: 16px; right: 16px; z-index: 2147483647; width: 330px; max-height: calc(100vh - 32px);
      display: flex; flex-direction: column; background: #fff; color: #241F1C; border-radius: 14px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(36,31,28,.28), 0 0 0 1px rgba(36,31,28,.08); font-size: 13.5px; }
    .cab { display: flex; align-items: center; gap: 8px; padding: 12px 10px 12px 16px; background: #4E0A18; color: #fff; cursor: move; user-select: none; }
    .cab .t { flex: 1; min-width: 0; }
    .cab small { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .8; font-weight: 600; }
    .cab strong { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cab button { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; color: #fff; font-size: 16px; }
    .cab button:hover { background: rgba(255,255,255,.14); }
    .cuerpo { overflow-y: auto; padding: 12px 12px 16px; }
    .acciones { display: grid; gap: 8px; margin-bottom: 4px; }
    .btn { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; justify-content: center;
      padding: 10px 12px; border-radius: 10px; font-weight: 600; font-size: 13.5px; text-align: center; }
    .btn.pri { background: #4E0A18; color: #fff; } .btn.pri:hover { background: #6B1426; }
    .btn.sec { background: #FBFAF8; color: #4E0A18; border: 1px solid #DCD2C6; } .btn.sec:hover { background: #F5F1EC; }
    .fila2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .aviso { margin: 8px 0 4px; padding: 8px 10px; border-radius: 8px; background: rgba(46,125,79,.07); border: 1px solid rgba(46,125,79,.3); color: #1F5A38; font-size: 12.5px; }
    .aviso.mal { background: rgba(131,96,13,.07); border-color: rgba(131,96,13,.3); color: #6B4E0B; }
    .grupo { margin-top: 12px; padding: 2px 4px 6px; border: 1px solid #EFE9E1; border-radius: 12px; }
    .sec-t { margin: 10px 6px 2px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #83600D; }
    .sec-s { margin: 0 6px 4px; font-size: 12px; color: #6E655D; }
    .dato { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
    .dato:hover { background: #F7F5F2; }
    .dato .x { flex: 1; min-width: 0; }
    .dato .e { font-size: 11.5px; color: #6E655D; }
    .dato .v { font-size: 13.5px; word-break: break-word; line-height: 1.35; }
    .dato .c { flex-shrink: 0; font-size: 12px; color: #524B45; padding: 4px 8px; border-radius: 6px; border: 1px solid #E9E2D9; background: #fff; }
    .dato.ok .c { color: #2E7D4F; border-color: rgba(46,125,79,.4); background: rgba(46,125,79,.07); }
    .entrar { margin: 4px 4px 2px; width: calc(100% - 8px); }
    .pie { padding: 8px 14px; font-size: 11.5px; color: #6E655D; border-top: 1px solid #E9E2D9; background: #FBFAF8; }
    .pastilla { all: unset; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; cursor: pointer; background: #4E0A18; color: #fff;
      padding: 10px 16px; border-radius: 999px; font-weight: 700; font-size: 13px; box-shadow: 0 6px 20px rgba(36,31,28,.3); font-family: system-ui, sans-serif; }
  `
  const DOC = [['tipo', 'Tipo de documento'], ['numero', 'Número'], ['numero_simple', 'Número (solo cifras)'], ['asunto', 'Asunto'],
    ['fecha', 'Fecha'], ['folios', 'Folios'], ['destinatario', 'Destinatario'], ['cargo_destinatario', 'Cargo del destinatario'],
    ['institucion_destino', 'Institución de destino'], ['referencia', 'Referencia']]
  const TIT = [['nombre_completo', 'Nombre completo'], ['apellido_paterno', 'Apellido paterno'], ['apellido_materno', 'Apellido materno'],
    ['nombres', 'Nombres'], ['tipo_documento', 'Documento de identidad'], ['dni', 'DNI'], ['digito_verificador', 'Dígito verificador'],
    ['fecha_emision', 'Fecha de emisión'], ['fecha_caducidad', 'Fecha de caducidad'], ['fecha_nacimiento', 'Fecha de nacimiento'],
    ['ubigeo', 'Ubigeo'], ['sexo', 'Sexo'], ['cargo', 'Cargo'], ['entidad', 'Entidad'], ['ruc_entidad', 'RUC de la entidad'],
    ['direccion', 'Dirección'], ['distrito', 'Distrito'], ['provincia', 'Provincia'], ['departamento', 'Departamento'],
    ['correo', 'Correo'], ['celular', 'Celular'], ['telefono', 'Teléfono']]

  const el = (tag, attrs = {}, ...hijos) => {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') Object.entries(v).forEach(([e, f]) => n.addEventListener(e, f))
      else if (k === 'class') n.className = v
      else n.setAttribute(k, v)
    }
    hijos.flat().forEach((h) => h != null && h !== false && n.append(h.nodeType ? h : String(h)))
    return n
  }

  function pintar() {
    if (!envio) return
    const p = envio.paquete
    if (!raiz) {
      raiz = document.createElement('sgdp-mesa-partes')
      document.documentElement.appendChild(raiz)
      raiz.attachShadow({ mode: 'open' })
    }
    const sombra = raiz.shadowRoot
    sombra.replaceChildren(el('style', {}, ESTILO))
    if (sessionStorage.getItem('sgdp-mesa-min') === '1') {
      sombra.append(el('button', { class: 'pastilla', on: { click: () => { sessionStorage.removeItem('sgdp-mesa-min'); pintar() } } }, 'Qillqa · ' + (p.documento.numero || 'datos')))
      return
    }
    const aviso = el('div', { class: 'aviso', style: 'display:none' })
    const decir = (t, mal) => {
      aviso.textContent = t
      aviso.className = mal ? 'aviso mal' : 'aviso'
      aviso.style.display = 'block'
      clearTimeout(decir.t)
      decir.t = setTimeout(() => { aviso.style.display = 'none' }, 5000)
    }
    // Una fila: etiqueta arriba, valor abajo y «Copiar» a la derecha; un clic copia.
    // Lo copiado queda marcado en verde mientras dure la sesión de esta mesa (por documento),
    // para saber qué datos ya se pegaron aunque el panel se vuelva a pintar.
    const claveCopiados = 'sgdp-copiados-' + (p.documento.id || '')
    const copiados = new Set(JSON.parse(sessionStorage.getItem(claveCopiados) || '[]'))
    const dato = (etiqueta, valor, obtener) => {
      const ya = copiados.has(etiqueta)
      const c = el('span', { class: 'c' }, ya ? 'Copiado' : 'Copiar')
      const fila = el('div', { class: ya ? 'dato ok' : 'dato', title: 'Copiar', on: { click: async () => {
        try {
          await copiar(obtener ? await obtener() : valor)
          fila.classList.add('ok'); c.textContent = 'Copiado'
          copiados.add(etiqueta)
          sessionStorage.setItem(claveCopiados, JSON.stringify([...copiados]))
        } catch (e) { decir(e.message, true) }
      } } }, el('div', { class: 'x' }, el('div', { class: 'e' }, etiqueta), el('div', { class: 'v' }, valor)), c)
      return fila
    }
    const revelar = async (cred, ing) => {
      const r = await pedirAlFondo({ tipo: 'revelar', id: cred.id, ingreso: ing ? ing.id : '' })
      if (r.error) throw new Error(r.error)
      return r.clave
    }
    const datos = { ...p.titular, ...p.documento, entidad: p.titular.entidad, cargo: p.titular.cargo, aprendido: p.aprendido || {} }
    const creds = p.credenciales || []
    const nAprendidos = Object.keys(p.aprendido || {}).length

    const cuerpo = el('div', { class: 'cuerpo' },
      el('div', { class: 'acciones' },
        el('button', { class: 'btn pri', on: { click: () => {
          const n = rellenar(datos)
          decir(n ? `${n} campo(s) llenados, con borde dorado. Revíselos antes de enviar.` : 'No se reconoció ningún campo vacío en esta página.', !n)
        } } }, nAprendidos ? `Autocompletar formulario (+${nAprendidos} aprendidos)` : 'Autocompletar formulario'),
        el('div', { class: 'fila2' },
          p.firmado ? el('button', { class: 'btn sec', on: { click: async () => {
            const r = await pedirAlFondo({ tipo: 'firmado' })
            if (r.error) return decir(r.error, true)
            const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0))
            el('a', { href: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), download: r.nombre }).click()
            decir(`Descargado: ${r.nombre}. Adjúntelo desde Descargas.`)
          } } }, 'Firmado') : null,
          el('button', { class: 'btn sec', title: 'Abre la carpeta en la computadora donde corre Qillqa', on: { click: async () => {
            const r = await pedirAlFondo({ tipo: 'ubicacion' })
            decir(r.error || 'Carpeta abierta en la computadora de Qillqa.', Boolean(r.error))
          } } }, 'Ubicación'),
        ),
      ),
      aviso,
    )

    // El acceso a la mesa: cada forma de ingreso con su usuario, su contraseña y «Entrar».
    // Cada sección, en una tarjeta sutil (borde fino, sin fondo): «tarjetas, pero sutiles».
    const grupo = (titulo, sub) => {
      const g = el('div', { class: 'grupo' }, el('div', { class: 'sec-t' }, titulo), sub ? el('div', { class: 'sec-s' }, sub) : null)
      cuerpo.append(g)
      return g
    }
    for (const cred of creds) {
      const g = grupo('Acceso a la mesa', cred.notas ? cred.notas.split('\n')[0] : '')
      ingresosDe(cred).forEach((ing) => {
        if (ing.usuario) g.append(dato(ing.tipo, ing.usuario))
        if (ing.tiene_clave) g.append(dato('Contraseña', '••••••••', () => revelar(cred, ing)))
        g.append(el('button', { class: 'btn sec entrar', on: { click: async () => {
          try {
            const n = rellenarIngreso(ing.usuario, ing.tiene_clave ? await revelar(cred, ing) : '')
            decir(n ? 'Usuario y contraseña puestos: pulse «Ingresar» en la página.' : 'Esta página no tiene campos de ingreso. ¿Ya entró?', !n)
          } catch (e) { decir(e.message, true) }
        } } }, `Entrar con ${ing.tipo}`))
      })
    }

    const gd = grupo('Documento')
    DOC.filter(([k]) => p.documento[k]).forEach(([k, e]) => gd.append(dato(e, p.documento[k])))
    if (p.firmado) gd.append(dato('Archivo firmado', p.firmado.nombre))
    if (TIT.some(([k]) => p.titular[k])) {
      const gr = grupo('Remitente')
      TIT.filter(([k]) => p.titular[k]).forEach(([k, e]) => gr.append(dato(e, p.titular[k])))
    }

    const cab = el('div', { class: 'cab' },
      el('div', { class: 't' }, el('small', {}, 'Qillqa · Mesa de partes'), el('strong', { title: p.documento.numero }, p.documento.numero)),
      el('button', { title: 'Minimizar', on: { click: () => { sessionStorage.setItem('sgdp-mesa-min', '1'); pintar() } } }, '—'),
      el('button', { title: 'Cerrar en esta pestaña', on: { click: () => { pedirAlFondo({ tipo: 'ocultar' }); raiz.remove(); raiz = null } } }, '✕'),
    )
    const panel = el('div', { class: 'panel' }, cab, cuerpo, el('div', { class: 'pie' }, 'Pulse un dato para copiarlo · el autocompletado no envía nada'))
    sombra.append(panel)

    // Arrastrar por la cabecera.
    let dx = 0, dy = 0, moviendo = false
    cab.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return
      moviendo = true
      const r = panel.getBoundingClientRect()
      dx = e.clientX - r.left; dy = e.clientY - r.top
      e.preventDefault()
    })
    window.addEventListener('mousemove', (e) => {
      if (!moviendo) return
      panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 120, e.clientX - dx))}px`
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dy))}px`
      panel.style.right = 'auto'
    })
    window.addEventListener('mouseup', () => { moviendo = false })
  }
})()
