// Autocompletado de los formularios de mesa de partes (2026-10-08, Edison: «que tenga la
// capacidad de autocompletar automáticamente, y opcionalmente copiar y pegar»).
//
// Una página web no puede escribir en los formularios de OTRO sitio (el navegador lo impide):
// por eso el autocompletado es un MARCADOR («Autocompletar Qillqa») que se guarda una vez en la
// barra de marcadores. En la página de la mesa de partes se pulsa el marcador: lee del
// portapapeles lo que preparó la ventana de apoyo («Preparar autocompletado») y llena los
// campos vacíos que reconoce por su etiqueta, nombre o texto de ayuda. No envía nada: la
// persona revisa y envía. Los campos que llenó quedan marcados con un borde dorado.

/** Lo que el marcador lee del portapapeles: `{ sgdp: 1, datos: { clave: valor } }`. */
export function textoParaAutocompletar(datos: Record<string, string>): string {
  const limpio: Record<string, string> = {}
  for (const [k, v] of Object.entries(datos)) if (v) limpio[k] = v
  return JSON.stringify({ sgdp: 1, datos: limpio })
}

// OJO: esta función se convierte en texto (toString) y corre DENTRO de la página de la mesa
// de partes: no puede usar nada de fuera (ni imports ni constantes del módulo).
function rellenarConSgdp() {
  const avisar = (texto: string) => {
    const caja = document.createElement('div')
    caja.textContent = texto
    caja.style.cssText =
      'position:fixed;z-index:2147483647;top:12px;right:12px;max-width:360px;background:#1D1D1F;color:#fff;'
      + 'padding:10px 14px;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3)'
    document.body.appendChild(caja)
    setTimeout(() => caja.remove(), 6000)
  }
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')
  navigator.clipboard.readText().then((texto) => {
    let paquete: { sgdp?: number; datos?: Record<string, string> } | null = null
    try { paquete = JSON.parse(texto) } catch { paquete = null }
    const d = paquete && paquete.sgdp === 1 ? paquete.datos : null
    if (!d) { avisar('Qillqa: primero pulse «Preparar autocompletado» en la ventana de apoyo.'); return }
    // ¿El formulario pide un documento de IDENTIDAD? (un «Tipo de documento» con DNI entre sus
    // opciones): entonces «Número de documento» es el DNI, no el número del oficio.
    const pideIdentidad = Array.from(document.querySelectorAll('select')).some((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => /\bdni\b|identidad/.test(norm(o.text))))
    const reglas: [RegExp, string][] = [
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
    const descripcion = (el: HTMLElement) => {
      // Lo PROPIO del campo (su etiqueta, aria, placeholder, título); el nombre y el id, que
      // suelen ser abreviaturas, al final.
      const propias: string[] = []
      const conEtiquetas = el as HTMLInputElement
      if (conEtiquetas.labels) Array.from(conEtiquetas.labels).forEach((l) => propias.push(l.textContent || ''))
      for (const a of ['aria-label', 'placeholder', 'title']) propias.push(el.getAttribute(a) || '')
      const etiquetada = el.getAttribute('aria-labelledby')
      if (etiquetada) etiquetada.split(' ').forEach((i) => propias.push(document.getElementById(i)?.textContent || ''))
      const tecnicas = ['name', 'id', 'formcontrolname'].map((a) => el.getAttribute(a) || '')
      // Solo si el campo no dice nada propio: el texto de la celda o del bloque anterior (si
      // no, la etiqueta del campo VECINO contamina: «Celular» se llenaba con el correo).
      if (!propias.join('').trim()) {
        const previo = el.closest('td')?.previousElementSibling || el.previousElementSibling || el.parentElement?.previousElementSibling
        if (previo) propias.push((previo.textContent || '').slice(0, 80))
      }
      // camelCase y guiones de los nombres técnicos → palabras («apMaterno» → «ap materno»).
      const tec = tecnicas.join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
      return norm(`${propias.join(' ')} ${tec}`)
    }
    const visible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    let llenos = 0
    document.querySelectorAll('input, textarea, select').forEach((nodo) => {
      const el = nodo as HTMLInputElement
      if (el.disabled || el.readOnly || !visible(el)) return
      if (/^(hidden|checkbox|radio|file|submit|button|image|reset)$/.test(el.type)) return
      let clave = ''
      if (el.type === 'password') clave = 'clave'
      else {
        const t = descripcion(el)
        for (const [re, k] of reglas) if (re.test(t)) { clave = k; break }
      }
      // «Tipo de documento»: si sus opciones traen DNI es el de identidad; si no, el del trámite.
      if (clave === 'tipo_segun_opciones') {
        const ops = el.tagName === 'SELECT' ? Array.from((el as unknown as HTMLSelectElement).options).map((o) => norm(o.text)).join(' ') : ''
        clave = /\bdni\b|identidad|extranjeria|pasaporte/.test(ops) ? 'tipo_documento' : pideIdentidad && el.tagName !== 'SELECT' ? 'tipo_documento' : 'tipo'
      }
      const valor = clave ? d[clave] : ''
      if (!valor) return
      if (el.tagName === 'SELECT') {
        const sel = el as unknown as HTMLSelectElement
        const v = norm(valor)
        const op = Array.from(sel.options).find((o) => o.value && (norm(o.text) === v || norm(o.text).includes(v) || v.includes(norm(o.text))))
        if (!op) return
        sel.value = op.value
      } else {
        if (el.value) return
        // Con el «setter» nativo: los formularios hechos con React o Angular ven el cambio.
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valor)
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.style.outline = '2px solid #9A7A3C'
      llenos++
    })
    avisar(llenos
      ? `Qillqa: ${llenos} campo(s) completado(s), con borde dorado. Revíselos antes de enviar.`
      : 'Qillqa: no se reconoció ningún campo vacío en esta página.')
  }).catch(() => avisar('Qillqa: el navegador no dejó leer el portapapeles. Permítalo y vuelva a pulsar el marcador.'))
}

/** El enlace del marcador (javascript:…) para arrastrarlo a la barra de marcadores. */
export function enlaceMarcador(): string {
  return `javascript:${encodeURIComponent(`(${rellenarConSgdp.toString()})()`)}`
}
