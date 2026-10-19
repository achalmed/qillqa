/* Qillqa — sitio de demostración: pestañas de módulos, recorrido del trámite, contador sin huecos,
   tablero arrastrable, mesa de partes simulada, carrusel y visor. Sin dependencias. */
'use strict'
document.documentElement.classList.add('js')

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const calma = matchMedia('(prefers-reduced-motion: reduce)').matches
const guardar = (k, v) => { try { localStorage.setItem(k, v) } catch {} }

/* ---------------------------------------------------------------- íconos (trazo, 24 × 24) */
const ICONOS = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5',
  documentos: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4',
  editor: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l2 2',
  seguimiento: 'M3 12h4l2.5-6 5 12 2.5-6h4',
  recibidos: 'M3 13.5 6 5h12l3 8.5V19H3zM3 13.5h5l1.5 2.5h5l1.5-2.5h5',
  tareas: 'M5 4h4v16H5zM10 4h4v10h-4zM15 4h4v13h-4z',
  matriz: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  agenda: 'M4 6h16v14H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5',
  chat: 'M4 5h16v11H10l-5 4v-4H4z',
  proyectos: 'M12 3.5 21 8.5l-9 5-9-5zM3 13l9 5 9-5',
  directorio: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 20a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M20.5 20a5.5 5.5 0 0 0-3.5-5.1',
  estadisticas: 'M5 20v-7M11 20V5M17 20v-9M3 20h18',
  mapa: 'M6 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6',
  mesa: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9s1.2-6.4 3.7-9z',
  firma: 'M3 18c3-6 5-8 6-6s-2 6 1 4 4-7 6-6-1 5 2 4 3-2 3-2M3 21h18',
  pdf: 'M7 3h7l5 5v13H7zM14 3v5h5M9.5 17v-4h1.5a1.3 1.3 0 0 1 0 2.6H9.5',
  nube: 'M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 18zM12 11v5M10 14l2 2 2-2',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.6a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  foto: 'M4 7h3l2-2.5h6L17 7h3v12H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  dinero: 'M4 7h16v10H4zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 7v10M17 7v10',
  informe: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
}
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[k]}"/></svg>`

/* ---------------------------------------------------------------- módulos */
const MODULOS = [
  { id: 'inicio', nombre: 'Inicio', titulo: 'Todo el día en una pantalla',
    texto: 'Al entrar, cada persona ve lo suyo: lo que espera su firma o su revisión, los plazos que vencen, las reuniones del día y los avisos del equipo.',
    puntos: ['Pendientes ordenados por urgencia', 'Accesos a cada módulo, como aplicaciones', 'Avisos agrupados, sin ruido'] },
  { id: 'bandeja', icono: 'documentos', nombre: 'Documentos', titulo: 'La bandeja de documentos',
    texto: 'Cada oficio, memorando o informe con su número, su estado y su destinatario. Se filtra por pestaña y se busca también dentro del contenido.',
    puntos: ['Estados claros: borrador, en revisión, por firmar, enviado', 'Visor rápido del PDF sin salir de la lista', 'Selección múltiple para acciones en lote'] },
  { id: 'editor', nombre: 'Editor', titulo: 'Redactar sin pelear con el formato',
    texto: 'Un formulario por tipo de documento y un cuerpo que se escribe como en un procesador de textos. El PDF se recompone en cada guardado.',
    puntos: ['Destinatario, asunto, referencia y copias en su sitio', 'Revisión formal automática al numerar', 'Dos personas no se pisan: cada guardado verifica la versión'] },
  { id: 'seguimiento', nombre: 'Seguimiento', titulo: 'Qué pasó con cada oficio',
    texto: 'El trámite completo de un documento: cuándo salió, quién lo recibió, el expediente en la otra entidad, los plazos y la respuesta.',
    puntos: ['Cargo de recepción y número de expediente', 'Plazos legales que avisan antes de vencer', 'La respuesta queda ligada al oficio que la pidió'] },
  { id: 'recibidos', nombre: 'Mesa de partes', titulo: 'Lo que llega, registrado y asignado',
    texto: 'Los documentos recibidos se registran con su remitente, su responsable y su plazo. El sistema lee la ficha del PDF para ahorrar tipeo.',
    puntos: ['Responsable y plazo desde el registro', 'Respuesta con un clic: nace el oficio ya referido', 'Mesa de partes virtual pública con cargo en PDF'] },
  { id: 'tablero', icono: 'tareas', nombre: 'Tareas', titulo: 'Un tablero para el equipo',
    texto: 'Las tareas del equipo en columnas, con su responsable, su plazo y el documento al que pertenecen. Lo que se mueve aquí se ve en la agenda.',
    puntos: ['Tablero, lista y matriz de prioridades', 'Tareas que nacen solas de un recibido o un plazo', 'Comentarios y avance por tarea'] },
  { id: 'matriz', nombre: 'Prioridades', titulo: 'Urgente e importante, por separado',
    texto: 'La matriz reparte las tareas en cuatro cuadrantes para decidir qué se hace hoy, qué se programa, qué se delega y qué se deja.',
    puntos: ['Se arrastra de un cuadrante a otro', 'Usa los mismos datos del tablero', 'Ayuda a la coordinación a repartir la semana'] },
  { id: 'agenda', nombre: 'Agenda', titulo: 'La semana del equipo',
    texto: 'Reuniones, plazos y actividades en vista de mes, semana o día. Un evento puede nacer de un documento y llevar su enlace.',
    puntos: ['Cruces de horario marcados', 'Por confirmar, confirmado y realizado', 'Pensada primero para el celular'] },
  { id: 'chat', nombre: 'Chat', titulo: 'Conversaciones con contexto',
    texto: 'Conversaciones directas y grupos del equipo. Un documento compartido aparece como tarjeta con su número, su asunto y su estado.',
    puntos: ['Adjuntos, respuestas y menciones', 'Tarjetas del sistema cuando algo cambia', 'Reemplaza el grupo de mensajería suelto'] },
  { id: 'proyecto', icono: 'proyectos', nombre: 'Proyectos', titulo: 'Trabajos largos, escritos entre varios',
    texto: 'Un reglamento, una norma o un informe extenso se divide en partes, con fases y responsables. Varias personas escriben a la vez sin pisarse.',
    puntos: ['Edición simultánea en tiempo real', 'Fases y responsables por parte', 'Versiones para volver atrás'] },
  { id: 'directorio', nombre: 'Directorio', titulo: 'Instituciones y personas',
    texto: 'El directorio de instituciones, autoridades y contactos que usan los documentos. Los organigramas se navegan como un árbol.',
    puntos: ['Cargos y tratamientos listos para el oficio', 'Organigramas navegables', 'Aviso cuando cambia una autoridad'] },
  { id: 'estadisticas', nombre: 'Estadísticas', titulo: 'Cuánto se produce y cuánto se responde',
    texto: 'Documentos por estado, por tipo y por mes, y la correspondencia con cada institución: enviados, respondidos y días de respuesta.',
    puntos: ['Cada cifra abre su lista', 'Oficios sin respuesta a la vista', 'Unidas al mapa de relaciones'] },
  { id: 'mapa', nombre: 'Mapa', titulo: 'Cómo se citan los documentos',
    texto: 'Un grafo con los documentos, las instituciones y las personas: quién respondió a qué, qué oficio cita a cuál y qué quedó sin respuesta.',
    puntos: ['Se explora con el dedo o el ratón', 'Ficha de cada nodo con sus cifras', 'Encuentra el hilo de un expediente'] },
  { id: 'mesa-virtual', icono: 'mesa', nombre: 'Mesa virtual', titulo: 'Atención al público sin ventanilla',
    texto: 'Una página pública, sin cuenta, donde cualquier persona presenta un escrito y recibe su cargo. Lo presentado entra directo a la mesa de partes.',
    puntos: ['Cargo en PDF con número de expediente', 'Consulta del estado con ese número', 'Lo recibido queda asignado y con plazo'] },
]

function iniciarModulos() {
  const dock = $('#dock'), img = $('#modulo-imagen'), titulo = $('#modulo-titulo')
  const caja = $('.explicacion'), nombre = $('#modulo-nombre'), grupo = $('#modulo-grupo')
  const texto = $('#modulo-texto'), puntos = $('#modulo-puntos')
  let actual = 0
  dock.innerHTML = MODULOS.map((m, i) => `<button type="button" role="tab" id="dock-${m.id}" aria-selected="${i === 0}">
    ${svg(m.icono || m.id)}<span>${m.nombre}</span></button>`).join('')
  const botones = $$('button', dock)
  // Precarga discreta: la imagen siguiente ya está lista cuando se pide.
  const precargar = (i) => { const m = MODULOS[(i + MODULOS.length) % MODULOS.length]; new Image().src = `img/${m.id}.webp` }

  function mostrar(i, enfocar = false) {
    actual = (i + MODULOS.length) % MODULOS.length
    const m = MODULOS[actual]
    botones.forEach((b, j) => { b.setAttribute('aria-selected', j === actual); b.tabIndex = j === actual ? 0 : -1 })
    if (enfocar) { botones[actual].focus(); dock.scrollTo({ left: botones[actual].offsetLeft - dock.clientWidth / 2 + botones[actual].offsetWidth / 2, behavior: calma ? 'auto' : 'smooth' }) }
    img.classList.add('cambiando')
    const nueva = new Image()
    nueva.onload = nueva.onerror = () => {
      img.src = nueva.src; img.alt = `${m.nombre}: ${m.titulo}`
      requestAnimationFrame(() => img.classList.remove('cambiando'))
    }
    nueva.src = `img/${m.id}.webp`
    titulo.textContent = `Qillqa · ${m.nombre}`
    grupo.textContent = m.nombre; nombre.textContent = m.titulo; texto.textContent = m.texto
    puntos.innerHTML = m.puntos.map((p) => `<li>${p}</li>`).join('')
    caja.classList.remove('entra'); void caja.offsetWidth; caja.classList.add('entra')
    precargar(actual + 1)
  }
  botones.forEach((b, i) => b.addEventListener('click', () => { parar(); mostrar(i) }))
  dock.addEventListener('keydown', (e) => {
    const paso = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (paso) { e.preventDefault(); parar(); mostrar(actual + paso, true) }
    if (e.key === 'Home') { e.preventDefault(); parar(); mostrar(0, true) }
    if (e.key === 'End') { e.preventDefault(); parar(); mostrar(MODULOS.length - 1, true) }
  })
  $('#modulo-ant').addEventListener('click', () => { parar(); mostrar(actual - 1) })
  $('#modulo-sig').addEventListener('click', () => { parar(); mostrar(actual + 1) })

  // Avance solo mientras la ventana se ve y nadie la ha tocado.
  let reloj = null
  function parar() { clearInterval(reloj); reloj = null }
  if (!calma) {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && reloj === null && !dock.dataset.tocado) reloj = setInterval(() => mostrar(actual + 1), 6000)
      else if (!e.isIntersecting) parar()
    }, { threshold: .4 }).observe($('#ventana-modulo'))
    const tocar = () => { dock.dataset.tocado = '1'; parar() }
    dock.addEventListener('pointerdown', tocar); dock.addEventListener('focusin', tocar)
  }
  mostrar(0)
}

/* ---------------------------------------------------------------- recorrido del trámite */
const PASOS = [
  { nombre: 'Redactar', breve: 'Formulario y cuerpo', estado: ['Borrador', ''], clase: '',
    texto: 'Ana elige «Oficio», llena destinatario y asunto, y escribe el cuerpo en el editor. Todavía no hay número: un borrador nunca consume la serie.' },
  { nombre: 'Revisar', breve: 'Observaciones', estado: ['En revisión', 'revision'], clase: 'observada',
    texto: 'Luis, de coordinación, lo revisa y deja una observación sobre el texto. Ana corrige; el historial guarda quién pidió qué y cuándo.' },
  { nombre: 'Numerar', breve: 'Contador transaccional', estado: ['Numerado', 'aprobado'], clase: '', numero: true,
    texto: 'Aprobado, el sistema le da el siguiente número de la serie en una sola transacción y compone el PDF con LuaLaTeX: membrete, pie e iniciales.' },
  { nombre: 'Firmar', breve: 'Firma y sello', estado: ['Firmado', 'firmado'], clase: 'firmada', numero: true,
    texto: 'El titular firma. El PDF firmado se sube y reemplaza al de trabajo; el documento pasa solo a «Firmado».' },
  { nombre: 'Enviar', breve: 'Cargo de recepción', estado: ['Enviado', 'enviado'], clase: 'firmada enviada', numero: true,
    texto: 'Se envía y se registra el cargo: fecha, hora y número de expediente en la entidad de destino. Desde aquí corren los plazos.' },
  { nombre: 'Archivar', breve: 'Respuesta y archivo', estado: ['Archivado', 'archivado'], clase: 'firmada archivada', numero: true,
    texto: 'Llega la respuesta y queda ligada al oficio. El expediente se archiva con nombres de archivo uniformes y se encuentra buscando en su contenido.' },
]

function iniciarTramite() {
  const lista = $('#pasos'), hoja = $('#hoja'), estado = $('#hoja-estado'), numero = $('#hoja-numero')
  const titulo = $('#paso-titulo'), texto = $('#paso-texto'), auto = $('#paso-auto')
  const DURACION = 5200
  let actual = 0, reloj = null, corriendo = !calma, visible = false
  lista.innerHTML = PASOS.map((p, i) => `<li><button type="button" role="tab" aria-selected="${i === 0}">
    <span class="num">${i + 1}</span><span>${p.nombre}<small>${p.breve}</small><span class="barra"><i></i></span></span></button></li>`).join('')
  const botones = $$('button', lista)
  lista.style.setProperty('--duracion', `${DURACION}ms`)

  function mostrar(i) {
    actual = (i + PASOS.length) % PASOS.length
    const p = PASOS[actual]
    botones.forEach((b, j) => {
      b.setAttribute('aria-selected', j === actual)
      b.classList.toggle('hecho', j < actual)
      const barra = $('.barra i', b); barra.classList.remove('corre')
      if (j === actual && corriendo) { void barra.offsetWidth; barra.classList.add('corre') }
    })
    hoja.className = `hoja ${p.clase}`
    estado.textContent = p.estado[0]; estado.className = `estado ${p.estado[1]}`
    const conNumero = 'OFICIO N.° 0142-2026-ABC'
    const tenia = numero.textContent === conNumero
    numero.textContent = p.numero ? conNumero : 'OFICIO N.° ____-2026-ABC'
    numero.classList.toggle('nuevo', p.numero && !tenia)
    titulo.textContent = `${actual + 1}. ${p.nombre}`; texto.textContent = p.texto
  }
  function programar() {
    clearTimeout(reloj)
    if (corriendo && visible) reloj = setTimeout(() => { mostrar(actual + 1); programar() }, DURACION)
  }
  function alternar(valor) {
    corriendo = valor
    auto.textContent = corriendo ? 'Pausar' : 'Reproducir'; auto.setAttribute('aria-pressed', corriendo)
    mostrar(actual); programar()
  }
  botones.forEach((b, i) => b.addEventListener('click', () => { mostrar(i); programar() }))
  $('#paso-ant').addEventListener('click', () => { alternar(false); mostrar(actual - 1) })
  $('#paso-sig').addEventListener('click', () => { alternar(false); mostrar(actual + 1) })
  auto.addEventListener('click', () => alternar(!corriendo))
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { mostrar(actual) } programar() }, { threshold: .35 }).observe($('.tramite'))
  alternar(corriendo)
}

/* ---------------------------------------------------------------- contador sin huecos */
const PERSONAS = [
  { ini: 'AT', nombre: 'Ana Torres' },
  { ini: 'LM', nombre: 'Luis Mamani' },
  { ini: 'RQ', nombre: 'Rosa Quispe' },
]
const ASUNTOS = ['Solicita información sobre obras', 'Remite informe de la comisión', 'Invita a mesa de trabajo',
  'Traslada pedido ciudadano', 'Reitera pedido de información', 'Comunica acuerdo de reunión', 'Solicita opinión técnica']

function iniciarContador() {
  const series = { OFICIO: { ultimo: 141, docs: [] }, MEMORANDO: { ultimo: 37, docs: [] }, INFORME: { ultimo: 12, docs: [] } }
  let serie = 'OFICIO', ocupado = false, n = 0
  const lista = $('#contador-lista'), ultimo = $('#contador-ultimo'), aviso = $('#contador-aviso')
  const cuatro = (x) => String(x).padStart(4, '0')
  const nombreSerie = { OFICIO: 'Oficio', MEMORANDO: 'Memorando', INFORME: 'Informe' }

  function pintar() {
    const s = series[serie]
    ultimo.textContent = cuatro(s.ultimo)
    if (!s.docs.length) { lista.innerHTML = '<li class="esperando"><span class="que"><small>Aún no hay pedidos en esta serie. Pide números para ver cómo los asigna el contador.</small></span></li>'; return }
    lista.innerHTML = s.docs.map((d) => {
      const p = PERSONAS[d.p]
      const num = d.numero ? `${nombreSerie[serie]} N.° ${cuatro(d.numero)}-2026-ABC` : `${nombreSerie[serie]} — pidiendo número`
      const accion = d.estado === 'emitido' ? `<button type="button" data-retirar="${d.id}" aria-label="Retirar ${num}">Retirar</button>`
        : d.estado === 'archivado' ? '<span class="marca">archivado</span>' : ''
      const recien = d.recien; d.recien = false
      return `<li class="${d.estado}${recien ? ' recien' : ''}"><span class="avatar">${p.ini}</span>
        <span class="que"><b>${num}</b><small>${p.nombre} · ${d.asunto}</small></span>${accion}</li>`
    }).join('')
  }
  async function pedir(cuantas) {
    if (ocupado) return
    ocupado = true; aviso.textContent = ''
    const s = series[serie]
    const nuevos = Array.from({ length: cuantas }, (_, k) => ({ id: ++n, p: (n + k) % 3, asunto: ASUNTOS[n % ASUNTOS.length], estado: 'esperando', recien: true }))
    s.docs.unshift(...nuevos.slice().reverse()); s.docs.splice(8)
    pintar()
    // El contador atiende los pedidos de uno en uno: la fila del contador serializa.
    for (const d of nuevos) {
      await new Promise((r) => setTimeout(r, calma ? 0 : 650))
      s.ultimo += 1; d.numero = s.ultimo; d.estado = 'emitido'; d.recien = true
      ultimo.classList.remove('salta'); void ultimo.offsetWidth; ultimo.classList.add('salta')
      pintar()
    }
    if (cuantas > 1) aviso.textContent = `${cuantas} pedidos simultáneos, ${cuantas} números consecutivos: ninguno repetido, ninguno saltado.`
    ocupado = false
  }
  function retirar(id) {
    const s = series[serie], d = s.docs.find((x) => x.id === id)
    if (!d || d.estado !== 'emitido') return
    const num = cuatro(d.numero)
    if (d.numero === s.ultimo) {
      s.docs = s.docs.filter((x) => x !== d)
      const vivos = s.docs.filter((x) => x.estado === 'emitido' && x.numero).map((x) => x.numero)
      const archivados = s.docs.filter((x) => x.estado === 'archivado').map((x) => x.numero)
      s.ultimo = Math.max(d.numero - 1, ...vivos, ...archivados)
      aviso.textContent = `El ${num} era el último de la serie: se elimina y el contador vuelve a ${cuatro(s.ultimo)}. El siguiente pedido reutiliza ese número.`
    } else {
      d.estado = 'archivado'; d.recien = true
      aviso.textContent = `El ${num} está en medio de la serie: no se borra, se archiva como «no utilizado». La serie conserva todos sus números.`
    }
    pintar()
  }
  lista.addEventListener('click', (e) => { const b = e.target.closest('[data-retirar]'); if (b) retirar(Number(b.dataset.retirar)) })
  $('#contador-tres').addEventListener('click', () => pedir(3))
  $('#contador-uno').addEventListener('click', () => pedir(1))
  $$('#series button').forEach((b) => b.addEventListener('click', () => {
    if (ocupado) return
    serie = b.dataset.serie; aviso.textContent = ''
    $$('#series button').forEach((x) => x.setAttribute('aria-checked', x === b))
    pintar()
  }))
  $('#series').addEventListener('keydown', (e) => {
    const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!paso) return
    const bs = $$('#series button'), i = bs.findIndex((x) => x.getAttribute('aria-checked') === 'true')
    const sig = bs[(i + paso + bs.length) % bs.length]; sig.click(); sig.focus()
  })
  pintar()
}

/* ---------------------------------------------------------------- tablero arrastrable */
const TARJETAS = [
  ['pendiente', 'Responder el pedido de la Dirección Regional', 'Vence hoy', 'rojo', 0],
  ['pendiente', 'Preparar la agenda de la mesa de trabajo', 'Jueves', 'ambar', 1],
  ['pendiente', 'Registrar los recibidos del lunes', 'Mesa de partes', 'azul', 2],
  ['curso', 'Informe de la semana de campo', 'Proyecto', 'azul', 0],
  ['curso', 'Oficio múltiple a las municipalidades', 'Viernes', 'ambar', 1],
  ['revision', 'Memorando sobre viáticos', 'Observado', 'ambar', 1],
  ['revision', 'Acta de la reunión del martes', 'Por firmar', 'azul', 2],
  ['hecho', 'Cargo del oficio 0139 archivado', 'Listo', 'verde', 2],
]

function iniciarTablero() {
  const tablero = $('#tablero'), progreso = $('#tablero-progreso')
  const columnas = $$('.columna', tablero)
  const orden = columnas.map((c) => c.dataset.columna)
  for (const [col, titulo, etiqueta, color, p] of TARJETAS) {
    const li = document.createElement('li')
    li.className = 'tarjeta'; li.tabIndex = 0
    li.innerHTML = `<b>${titulo}</b><span class="meta"><span class="etiqueta ${color}">${etiqueta}</span>
      <span class="quien" title="${PERSONAS[p].nombre}">${PERSONAS[p].ini}</span></span>`
    $(`[data-columna="${col}"] ul`, tablero).append(li)
  }
  function contar() {
    columnas.forEach((c) => { $('h3 span', c).textContent = $$('.tarjeta', c).length })
    const total = $$('.tarjeta', tablero).length, hechas = $$('[data-columna="hecho"] .tarjeta', tablero).length
    progreso.textContent = hechas === total ? '¡Todo hecho! El equipo cerró la semana sin pendientes.' : `${hechas} de ${total} tareas hechas.`
  }
  function anunciar(t) {
    const c = t.closest('.columna')
    progreso.textContent = `«${$('b', t).textContent}» pasó a ${$('h3', c).firstChild.textContent.trim()}.`
    setTimeout(contar, 1800)
  }

  // Arrastre con eventos de puntero: funciona igual con ratón, lápiz y dedo.
  let arr = null
  tablero.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tarjeta'); if (!t || e.button > 0) return
    const r = t.getBoundingClientRect()
    arr = { t, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, ancho: r.width, moviendo: false, id: e.pointerId }
    t.setPointerCapture(e.pointerId)
  })
  tablero.addEventListener('pointermove', (e) => {
    if (!arr || e.pointerId !== arr.id) return
    if (!arr.moviendo) {
      if (Math.hypot(e.clientX - arr.x, e.clientY - arr.y) < 6) return
      arr.moviendo = true
      arr.copia = arr.t.cloneNode(true); arr.copia.classList.add('volando'); arr.copia.style.width = `${arr.ancho}px`
      document.body.append(arr.copia); arr.t.classList.add('fantasma')
    }
    arr.copia.style.left = `${e.clientX - arr.dx}px`; arr.copia.style.top = `${e.clientY - arr.dy}px`
    const debajo = document.elementFromPoint(e.clientX, e.clientY)
    const col = debajo && debajo.closest('.columna')
    columnas.forEach((c) => c.classList.toggle('encima', c === col))
    if (col) {
      const ul = $('ul', col)
      const despues = $$('.tarjeta:not(.fantasma)', ul).find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 })
      if (despues) ul.insertBefore(arr.t, despues); else ul.append(arr.t)
    }
  })
  const soltar = (e) => {
    if (!arr || e.pointerId !== arr.id) return
    if (arr.moviendo) { arr.copia.remove(); arr.t.classList.remove('fantasma'); anunciar(arr.t) }
    columnas.forEach((c) => c.classList.remove('encima'))
    arr = null; contar()
  }
  tablero.addEventListener('pointerup', soltar)
  tablero.addEventListener('pointercancel', soltar)

  // Teclado: ← → cambian de columna, ↑ ↓ ordenan dentro de la columna.
  tablero.addEventListener('keydown', (e) => {
    const t = e.target.closest('.tarjeta'); if (!t) return
    const col = t.closest('.columna'), i = orden.indexOf(col.dataset.columna)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const j = i + (e.key === 'ArrowRight' ? 1 : -1); if (j < 0 || j >= orden.length) return
      e.preventDefault(); $(`[data-columna="${orden[j]}"] ul`, tablero).append(t); t.focus(); anunciar(t)
    } else if (e.key === 'ArrowUp' && t.previousElementSibling) { e.preventDefault(); t.previousElementSibling.before(t); t.focus() }
    else if (e.key === 'ArrowDown' && t.nextElementSibling) { e.preventDefault(); t.nextElementSibling.after(t); t.focus() }
  })
  contar()
}

/* ---------------------------------------------------------------- mesa de partes simulada */
function iniciarMesa() {
  const form = $('#mesa-form'), error = $('#mesa-error'), cargo = $('#cargo'), vacio = $('#cargo-vacio')
  let correlativo = 1287
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const campos = $$('input', form)
    let primero = null
    for (const c of campos) {
      const mal = !c.value.trim() || (c.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.value))
      c.setAttribute('aria-invalid', mal); if (mal && !primero) primero = c
    }
    if (primero) { error.textContent = 'Completa los campos marcados.'; primero.focus(); return }
    error.textContent = ''
    const datos = Object.fromEntries(new FormData(form))
    const ahora = new Date()
    correlativo += 1
    const exp = `EXP-2026-${String(correlativo).padStart(6, '0')}`
    $('#cargo-exp').textContent = exp
    $('#cargo-fecha').textContent = ahora.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' })
    $('#cargo-nombre').textContent = datos.nombre.trim()
    $('#cargo-asunto').textContent = datos.asunto.trim()
    $('#cargo-correo').textContent = datos.correo.trim()
    codigo($('#cargo-codigo'), exp + ahora.getTime())
    vacio.hidden = true; cargo.hidden = false
    cargo.style.animation = 'none'; void cargo.offsetWidth; cargo.style.animation = ''
    if (matchMedia('(max-width: 760px)').matches) cargo.scrollIntoView({ behavior: calma ? 'auto' : 'smooth', block: 'center' })
  })
}
// Un patrón cuadrado determinista a partir del texto (decorativo: no es un código legible).
function codigo(svgEl, texto) {
  let h = 2166136261
  const azar = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296 }
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const N = 21, celdas = []
  const ojo = (x, y) => x < 7 && y < 7 || x >= N - 7 && y < 7 || x < 7 && y >= N - 7
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let negro
    if (ojo(x, y)) {
      const cx = x < 7 ? x : x - (N - 7), cy = y < 7 ? y : y - (N - 7)
      negro = cx === 0 || cx === 6 || cy === 0 || cy === 6 || (cx >= 2 && cx <= 4 && cy >= 2 && cy <= 4)
    } else negro = azar() > .52
    if (negro) celdas.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`)
  }
  svgEl.innerHTML = celdas.join('')
}

/* ---------------------------------------------------------------- funciones */
const FUNCIONES = [
  ['documentos', 'Documentos', 'Bandeja con estados, nuevo documento por tipo, incorporar lo hecho fuera del sistema, versiones y búsqueda en el contenido.'],
  ['recibidos', 'Mesa de partes', 'Recibidos con responsable, plazo y respuesta; mesa de partes virtual pública con cargo en PDF.'],
  ['tareas', 'Tareas y agenda', 'Mis tareas, tablero, matriz urgente e importante y calendario por mes, semana y día.'],
  ['chat', 'Chat', 'Conversaciones directas y grupos, tarjetas de documentos y avisos del sistema.'],
  ['proyectos', 'Proyectos', 'Trabajos largos divididos en partes, con fases, responsables y edición simultánea.'],
  ['informe', 'Informes de actividades', 'Semanas de trabajo de campo: actividades, pedidos, fotos y su informe en PDF.'],
  ['dinero', 'Rendición de cuentas', 'Viáticos por comisión: comprobantes, declaración jurada, saldo y anexos.'],
  ['foto', 'Mediateca', 'Fotos y videos del equipo con revisión, favoritos y papelera.'],
  ['directorio', 'Directorio', 'Instituciones, personas y organigramas navegables, listos para el oficio.'],
  ['mapa', 'Mapa de relaciones', 'Cómo se citan y responden los documentos entre sí, con sus cifras.'],
  ['nube', 'Sin conexión', 'Aplicación instalable: se sigue redactando cuando el servidor no responde.'],
  ['ajustes', 'Administración', 'Cuentas, roles, módulos activos, reglas automáticas y parámetros.'],
]
function iniciarFunciones() {
  $('#rejilla').innerHTML = FUNCIONES.map(([i, t, d]) =>
    `<article class="funcion vidrio"><span class="icono">${svg(i)}</span><h3>${t}</h3><p>${d}</p></article>`).join('')
}

/* ---------------------------------------------------------------- carrusel */
function iniciarCarrusel() {
  const pista = $('#carrusel'), puntos = $('#carrusel-puntos'), tels = $$('.telefono', pista)
  puntos.innerHTML = tels.map(() => '<i></i>').join('')
  const marcas = $$('i', puntos)
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) marcas.forEach((m, i) => m.classList.toggle('activo', tels[i] === e.target))
  }), { root: pista, threshold: .6 })
  tels.forEach((t) => io.observe(t))
  pista.addEventListener('keydown', (e) => {
    const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!paso) return
    e.preventDefault(); pista.scrollBy({ left: paso * (tels[0].offsetWidth + 28), behavior: calma ? 'auto' : 'smooth' })
  })
}

/* ---------------------------------------------------------------- utilidades de página */
function iniciarTema() {
  const raiz = document.documentElement
  $('#tema').addEventListener('click', () => {
    const oscuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    raiz.dataset.theme = oscuro ? 'light' : 'dark'
    guardar('qillqa-tema', raiz.dataset.theme)
  })
}
function iniciarCabecera() {
  const menu = $('#menu')
  const marcar = () => menu.classList.toggle('con-borde', scrollY > 8)
  addEventListener('scroll', marcar, { passive: true }); marcar()
}
function iniciarRevelar() {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return
    e.target.classList.add('visible'); io.unobserve(e.target)
    $$('[data-contar]', e.target).forEach(contarHasta)
  }), { threshold: .12, rootMargin: '0px 0px -40px 0px' })
  $$('.revelar').forEach((el) => io.observe(el))
}
function contarHasta(el) {
  const fin = Number(el.dataset.contar), suf = el.dataset.sufijo || ''
  if (calma || fin === 0) { el.textContent = fin + suf; return }
  el.textContent = 0 + suf
  const t0 = performance.now(), dur = 1100
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur), v = Math.round(fin * (1 - Math.pow(1 - k, 3)))
    el.textContent = v + suf; if (k < 1) requestAnimationFrame(paso)
  }
  requestAnimationFrame(paso)
}
function iniciarMenuActivo() {
  const enlaces = $$('.menu-nav a'), mapa = new Map(enlaces.map((a) => [a.getAttribute('href').slice(1), a]))
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) enlaces.forEach((a) => a.classList.toggle('activo', a === mapa.get(e.target.id)))
  }), { rootMargin: '-45% 0px -50% 0px' })
  mapa.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s) })
}
function iniciarVisor() {
  const visor = $('#visor'), img = $('#visor-imagen')
  if (typeof visor.showModal !== 'function') return
  document.addEventListener('click', (e) => {
    const fuente = e.target.closest('img[data-ampliar]'); if (!fuente) return
    img.src = fuente.currentSrc || fuente.src; img.alt = fuente.alt
    visor.showModal()
  })
  visor.addEventListener('click', (e) => { if (e.target !== img) visor.close() })
  $('#visor-cerrar').addEventListener('click', () => visor.close())
}
function iniciarCopiar() {
  $$('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
    const texto = $(`#${b.dataset.copiar}`).innerText.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => l.replace(/\s+#.*$/, '')).join('\n')
    try { await navigator.clipboard.writeText(texto); b.textContent = 'Copiado' }
    catch {
      const t = document.createElement('textarea'); t.value = texto; document.body.append(t); t.select()
      try { document.execCommand('copy'); b.textContent = 'Copiado' } catch { b.textContent = 'Selecciona y copia' }
      t.remove()
    }
    setTimeout(() => { b.textContent = 'Copiar' }, 1800)
  }))
}

for (const f of [iniciarTema, iniciarCabecera, iniciarModulos, iniciarTramite, iniciarContador, iniciarTablero, iniciarMesa,
  iniciarFunciones, iniciarCarrusel, iniciarVisor, iniciarCopiar, iniciarRevelar, iniciarMenuActivo]) {
  try { f() } catch (err) { console.error(`[qillqa] ${f.name}:`, err) }
}
