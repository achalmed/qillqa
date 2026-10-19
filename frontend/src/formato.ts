/**
 * AJUSTES DE FORMATO DEL PDF: GENERAL y por PARTE (Edison 2026-09-07; auditado
 * y reorganizado 2026-10-01).
 *
 * Regla única, la que la interfaz enseña:
 *   · FORMATO GENERAL (panel encima de la vista previa) = lo que afecta al
 *     documento COMPLETO: letra, interlineado, párrafos, espacios entre
 *     partes, márgenes, pie, firma y sello. Cada propiedad vive en UN lugar.
 *   · FORMATO DE UNA PARTE (icono ⚙ junto a destinatario, copias, asunto,
 *     cuerpo) = solo esa parte. Si una parte fija un valor propio, MANDA
 *     sobre el general; si no, lo hereda y lo dice («Igual al documento ·
 *     11 pt»).
 * La auditoría de 2026-10-01 sacó del «cuerpo» lo que era del documento
 * entero (interlineado, espacio entre párrafos, sangría: los heredan
 * destinatario y copias) y de «anexos» la letra de las tablas (también rige
 * las del cuerpo); «anexos» se quedó sin ajustes propios y ya no lleva icono.
 *
 *
 * Antes todo el formato vivía en un solo panel («Formato del documento»)
 * con una docena de controles juntos, y no había forma de tocar SOLO el
 * destinatario o SOLO las copias. Ahora cada parte del formulario tiene un
 * icono discreto de ajustes (componentes/AjusteFormato.tsx) que abre solo
 * los controles que le corresponden; el panel general conserva lo que es de
 * la PÁGINA entera (letra, folio, sello y firma).
 *
 * Cada control escribe un campo `fmt_*` del documento; el generador del
 * backend (latex/generador.py) los valida contra su lista blanca antes de
 * emitir LaTeX, así que aquí solo hay valores fijos. Un valor vacío = el
 * formato de la casa.
 */

export interface Opcion {
  v: string
  t: string
}

/** Control de opciones fijas (select). */
export interface Control {
  clave: string
  etiqueta: string
  opciones: Opcion[]
  /** Qué cambia en el papel (se lee al pasar el ratón sobre el control). */
  ayuda?: string
}

/** Ajuste fino con botones ↑/↓ (valores en cm; el backend los valida). */
export interface Fino {
  clave: string
  etiqueta: string
  base: number // valor del framework cuando el campo está vacío
  paso: number
  min: number
  max: number
  subirResta: boolean // «subir» visualmente = restar cm
  ayuda: string
}

export interface GrupoFormato {
  /** Sobre qué parte actúa («Destinatario», «Cuerpo del documento»…). */
  titulo: string
  controles: Control[]
  finos: Fino[]
  /** Una línea que dice qué abarca el grupo (opcional). */
  nota?: string
}

// Tipos que comparten la clase LaTeX del oficio (destinatario, asunto con
// sangría, copia arriba). Debe coincidir con los `_maestro_oficio` del
// generador.
export const FAMILIA_OFICIO = new Set([
  'oficio',
  'oficio_multiple',
  'oficio_multiple_bancada',
  'oficio_bancada',
  'carta',
])
// Tipos con cabecera en tabla (A / DE / ASUNTO / FECHA) y filete: su «espacio
// antes del cuerpo» es el que hay bajo el filete (structures/*/structure.tex).
const CABECERA_TABLA = new Set(['memorando', 'informe'])

// Tamaños en PUNTOS, como en Word (Edison 2026-09-07). La lista blanca del
// backend (`_PUNTOS` en generador.py) es la que manda: solo estos valores.
export const PUNTOS = ['8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13', '14']
const TAMANO_PARTE: Opcion[] = [
  { v: '', t: 'Igual al documento' },
  ...PUNTOS.map((p) => ({ v: p, t: `${p.replace('.', ',')} pt` })),
]

// Interlineados con su número, de menor a mayor (escala «tipo Word»).
const INTERLINEADO_PARTE: Opcion[] = [
  { v: '', t: 'Igual al documento' },
  { v: '0.8', t: '0,8 · muy compacto' },
  { v: '0.9', t: '0,9 · compacto' },
  { v: '1', t: '1,0 · sencillo' },
  { v: '1.15', t: '1,15' },
  { v: '1.5', t: '1,5' },
  { v: '2', t: '2,0 · doble' },
]

// --- Grupos por parte ---------------------------------------------------

const DESTINATARIO: GrupoFormato = {
  titulo: 'Destinatario',
  controles: [
    { clave: 'fmt_dest_tamano', etiqueta: 'Tamaño de letra', opciones: TAMANO_PARTE, ayuda: 'Letra del bloque Señor / nombre / cargo / institución.' },
    { clave: 'fmt_dest_interlineado', etiqueta: 'Interlineado', opciones: INTERLINEADO_PARTE, ayuda: 'Separación entre las líneas del bloque del destinatario.' },
  ],
  finos: [],
}

const copias = (tipo: string): GrupoFormato => ({
  titulo: 'Copias (c.c.)',
  controles: [
    // Interruptor de la parte entera (Edison 2026-09-08: «desactivar con
    // copia en un documento»). Va PRIMERO porque manda sobre los demás
    // controles del grupo: con «No imprimir», el tamaño y el interlineado de
    // las copias no llegan al papel. Los datos NO se borran — siguen en la
    // bandeja y en la verificación previa a numerar—; solo dejan de salir en
    // el PDF, que es justo lo que hace falta cuando el oficio va sin c.c.
    {
      clave: 'fmt_copia_mostrar',
      etiqueta: 'Copias en el documento',
      opciones: [
        { v: '', t: 'Sí · se imprimen' },
        { v: 'no', t: 'No · solo quedan registradas' },
      ],
      ayuda: 'Con «No», las copias siguen en la bandeja y en la verificación, pero no salen en el PDF.',
    },
    { clave: 'fmt_copia_tamano', etiqueta: 'Tamaño de letra', opciones: TAMANO_PARTE, ayuda: 'Letra de la lista de copias. Si no se elige, al pie va un punto menor que el texto.' },
    { clave: 'fmt_copia_interlineado', etiqueta: 'Interlineado', opciones: INTERLINEADO_PARTE, ayuda: 'Separación entre las líneas de la lista de copias.' },
    ...(FAMILIA_OFICIO.has(tipo)
      ? [
          {
            clave: 'fmt_copia_arriba',
            etiqueta: 'Ubicación',
            opciones: [
              { v: '', t: 'Al pie («c.c.:»)' },
              { v: 'si', t: 'Arriba, junto al destinatario' },
            ],
            ayuda: 'Dónde se imprime la lista: al pie, tras la firma, o arriba («Con copia a:») bajo el destinatario. Siempre una línea por persona: nombre, cargo.',
          },
        ]
      : []),
  ],
  finos: [],
})

const ASUNTO: GrupoFormato = {
  titulo: 'Asunto',
  controles: [],
  finos: [
    {
      clave: 'fmt_asunto_sangria',
      etiqueta: 'Sangría del asunto',
      base: 7.96, paso: 0.4, min: 0, max: 11, subirResta: false,
      ayuda: 'Cuánto entra el bloque ASUNTO desde la izquierda (↑ = más a la derecha). De fábrica, desde la mitad de la hoja.',
    },
  ],
}

const CUERPO: GrupoFormato = {
  titulo: 'Cuerpo del documento',
  nota: 'El interlineado, el espacio entre párrafos y la sangría son del documento entero: están en «Formato general».',
  controles: [
    {
      clave: 'fmt_cuerpo_tamano',
      etiqueta: 'Tamaño de letra del cuerpo',
      opciones: TAMANO_PARTE,
      ayuda: 'Solo los párrafos del cuerpo; la cabecera, la firma y el pie conservan la letra del documento.',
    },
  ],
  finos: [],
}

// --- FORMATO GENERAL: el documento entero, en secciones -------------------

/** Escala de espacios en líneas; el estándar del tipo va como «vacío» y no
 *  se repite como opción numérica. */
const ESPACIO_LINEAS = (estandar: string): Opcion[] => [
  { v: '', t: `${coma(estandar)} línea · estándar` },
  ...[
    { v: '0', t: 'Sin espacio' },
    { v: '0.1', t: '0,1 línea' },
    { v: '0.2', t: '0,2 línea' },
    { v: '0.4', t: '0,4 línea' },
    { v: '0.6', t: '0,6 línea' },
    { v: '0.8', t: '0,8 línea' },
    { v: '1', t: '1 línea' },
    { v: '1.5', t: '1,5 líneas' },
  ].filter((o) => o.v !== estandar),
]

/**
 * Lo que afecta al DOCUMENTO COMPLETO, en el panel «Formato general» encima
 * de la vista previa. Cuatro secciones, siempre en este orden: texto,
 * espacios, página y pie, firma y sello. Solo aparece lo que el tipo
 * entiende (el memorando no tiene saludo ni cabecera de oficio).
 */
export function formatoGeneral(tipo: string): GrupoFormato[] {
  const oficio = FAMILIA_OFICIO.has(tipo)
  const tabla = CABECERA_TABLA.has(tipo)
  const espacios: Control[] = []
  if (oficio) {
    espacios.push({
      clave: 'fmt_espacio_partes',
      etiqueta: 'Entre las partes de la cabecera',
      opciones: ESPACIO_LINEAS('0.2'),
      ayuda: 'Aire entre fecha, número, destinatario y asunto.',
    })
  }
  if (oficio || tabla) {
    espacios.push({
      clave: 'fmt_espacio_cuerpo',
      etiqueta: 'Del asunto al primer párrafo',
      opciones: ESPACIO_LINEAS(oficio ? '0.2' : '0.8'),
      ayuda: oficio
        ? 'Aire entre el bloque ASUNTO / REFERENCIA (la sumilla) y el saludo con que empieza el texto.'
        : 'Aire entre la cabecera (A, DE, ASUNTO, FECHA) y el primer párrafo.',
    })
  }
  if (oficio) {
    espacios.push({
      clave: 'fmt_espacio_saludo',
      etiqueta: 'Del saludo al primer párrafo',
      opciones: ESPACIO_LINEAS('0.1'),
      ayuda: 'Aire tras «De mi especial consideración:».',
    })
  }
  return [
    {
      titulo: 'Texto',
      controles: [
        {
          clave: 'fmt_tamano',
          etiqueta: 'Letra del documento',
          opciones: [
            { v: '10', t: '10 pt · compacta (mínimo legible)' },
            { v: '10.5', t: '10,5 pt' },
            { v: '', t: '11 pt · estándar' },
            { v: '11.5', t: '11,5 pt' },
            { v: '12', t: '12 pt · amplia' },
          ],
          ayuda:
            'Escala todo en proporción: cuerpo, asunto, tablas y notas al pie. No cambian el pie de página '
            + 'ni las partes con tamaño propio (⚙), como las copias.',
        },
        {
          clave: 'fmt_interlineado',
          etiqueta: 'Interlineado',
          opciones: [
            { v: '0.8', t: '0,8 · muy compacto' },
            { v: '0.9', t: '0,9 · compacto' },
            { v: '1', t: '1,0 · sencillo' },
            { v: '', t: '1,15 · estándar' },
            { v: '1.5', t: '1,5' },
            { v: '2', t: '2,0 · doble' },
          ],
          ayuda: 'Separación entre líneas de todo el texto. Destinatario y copias lo heredan salvo ajuste propio.',
        },
        {
          clave: 'fmt_espacioparrafos',
          etiqueta: 'Espacio entre párrafos',
          opciones: [
            { v: '0pt', t: '0 pt · sin espacio' },
            { v: '2pt', t: '2 pt · compacto' },
            { v: '', t: '4 pt · estándar' },
            { v: '6pt', t: '6 pt · amplio' },
            { v: '8pt', t: '8 pt' },
            { v: '12pt', t: '12 pt' },
          ],
          ayuda: 'Blanco que se añade entre un párrafo y el siguiente (y entre las partes).',
        },
        {
          clave: 'fmt_sangria',
          etiqueta: 'Sangría de primera línea',
          opciones: [
            { v: '0pt', t: 'Sin sangría' },
            { v: '0.6cm', t: '0,6 cm' },
            { v: '1cm', t: '1 cm' },
            { v: '', t: '1,27 cm · estándar' },
            { v: '2cm', t: '2 cm' },
          ],
          ayuda: 'Entrada de la primera línea de cada párrafo del cuerpo.',
        },
        {
          clave: 'fmt_tabla_tamano',
          etiqueta: 'Letra de las tablas',
          opciones: [
            { v: '', t: 'Un punto menor · estándar' },
            { v: 'normal', t: 'Igual al texto' },
            { v: 'muy-pequeno', t: 'Dos puntos menor' },
            { v: 'diminuto', t: 'Mínima' },
          ],
          ayuda: 'Todas las tablas: las del cuerpo y las de los anexos.',
        },
      ],
      finos: [],
    },
    ...(espacios.length
      ? [{ titulo: 'Espacios entre partes', nota: 'En líneas: siguen al interlineado.', controles: espacios, finos: [] }]
      : []),
    {
      titulo: 'Página y pie',
      controles: [
        {
          clave: 'fmt_margenes',
          etiqueta: 'Márgenes izquierdo y derecho',
          opciones: [
            { v: '2cm', t: '2 cm · más texto por hoja' },
            { v: '2.2cm', t: '2,2 cm' },
            { v: '', t: '2,54 cm · estándar' },
            { v: '3cm', t: '3 cm · más aire' },
          ],
          ayuda: 'El membrete, el pie institucional y el sello se alinean solos a los márgenes nuevos.',
        },
        {
          clave: 'fmt_folio',
          etiqueta: 'Folio (Pág. x de y)',
          opciones: [
            { v: '', t: 'Según el tipo' },
            { v: 'si', t: 'Con folio' },
            { v: 'no', t: 'Sin folio' },
          ],
          ayuda: 'Numeración de páginas en el pie institucional.',
        },
        {
          clave: 'fmt_pie_forma',
          etiqueta: 'Adjuntos y copias al pie',
          opciones: [
            { v: '', t: 'En lista, uno por línea · estándar' },
            { v: 'linea', t: 'En una sola línea' },
          ],
          ayuda: 'Cómo se componen «Adj.:» y «c.c.:» tras la firma.',
        },
      ],
      finos: [],
    },
    {
      // Notas al pie, lista Adj. e iniciales con medidas propias (Edison 2026-10-10).
      titulo: 'Notas al pie y lista de adjuntos',
      controles: [
        { clave: 'fmt_notas_tamano', etiqueta: 'Letra de las notas al pie', opciones: TAMANO_PARTE, ayuda: 'Si no se elige, dos puntos menos que el texto (escala con la letra del documento).' },
        { clave: 'fmt_pie_tamano', etiqueta: 'Letra de Adj. e iniciales', opciones: TAMANO_PARTE, ayuda: 'La lista de adjuntos y las iniciales del pie. Si no se elige, un punto menos que el texto.' },
        { clave: 'fmt_pie_espacio', etiqueta: 'Espacio sobre la lista Adj.', opciones: ESPACIO_LINEAS('0.8'), ayuda: 'Aire entre la firma y «Adj.:» (↓ = la lista sube hacia la firma).' },
      ],
      finos: [],
    },
    {
      titulo: 'Firma y sello',
      controles: [
        {
          clave: 'fmt_ajuste_auto',
          etiqueta: 'Si la firma queda sola en una hoja',
          opciones: [
            { v: '', t: 'Ajustar solo (se avisa qué cambió)' },
            { v: 'no', t: 'No tocar: mando yo' },
          ],
          ayuda: 'Con «Ajustar solo», el sistema aprieta espacios, interlineado y letra (nunca bajo 10 pt) hasta que la firma vaya acompañada; los valores que usó se ven en rojo junto a cada control. Con «No tocar», se respeta lo elegido aunque la firma quede sola.',
        },
        {
          clave: 'fmt_sello',
          etiqueta: 'Sello de consigna',
          opciones: [
            { v: '', t: 'Al pie de la hoja de la firma' },
            { v: 'no', t: 'Sin sello' },
          ],
          ayuda: 'Abajo a la derecha de la hoja que lleva la firma; si la hoja tiene notas al pie, justo encima de ellas.',
        },
      ],
      finos: [
        {
          clave: 'fmt_firma_espacio',
          etiqueta: 'Posición de la firma',
          base: 2.0, paso: 0.5, min: 0.5, max: 5.5, subirResta: true,
          ayuda: 'Espacio entre «Atentamente,» y el nombre (↑ = firma más arriba)',
        },
        {
          clave: 'fmt_sello_altura',
          etiqueta: 'Posición del sello',
          base: 0, paso: 0.2, min: -1.2, max: 1.2, subirResta: true,
          ayuda:
            'Solo en casos excepcionales: sube o baja ligeramente el sello respecto de su posición fija (↑ = más arriba)',
        },
      ],
    },
  ]
}

/** Todas las claves del formato general (para contarlas y predeterminarlas). */
export const CLAVES_GENERALES = formatoGeneral('oficio').flatMap((g) => clavesDe(g))

/**
 * Grupo de ajustes de una PARTE del formulario (clave de campo o de
 * sección). `null` = esa parte no tiene ajustes de formato propios.
 */
export function grupoDeParte(seccion: string, tipo: string): GrupoFormato | null {
  switch (seccion) {
    case 'destinatario_nombre':
      return FAMILIA_OFICIO.has(tipo) ? DESTINATARIO : null
    case 'con_copia':
      return copias(tipo)
    case 'asunto':
      return FAMILIA_OFICIO.has(tipo) ? ASUNTO : null
    case 'cuerpo':
      return CUERPO
    default:
      return null
  }
}

/** Claves de TODOS los ajustes por parte (para contarlos en el panel). */
export const CLAVES_POR_PARTE = [
  DESTINATARIO,
  copias('oficio'),
  ASUNTO,
  CUERPO,
].flatMap((g) => [...g.controles.map((c) => c.clave), ...g.finos.map((f) => f.clave)])

/**
 * ¿Las copias (c.c.) están DESACTIVADAS para este documento? El formulario
 * lo usa para avisar que lo escrito no saldrá en el PDF; el backend decide
 * lo mismo con la misma clave (`generador.py::_copias_ocultas`).
 */
export function copiasOcultas(valores: Record<string, string>): boolean {
  return (valores.fmt_copia_mostrar ?? '') === 'no'
}

/** Claves de un grupo (selects y ajustes finos). */
export function clavesDe(g: GrupoFormato): string[] {
  return [...g.controles.map((c) => c.clave), ...g.finos.map((f) => f.clave)]
}

/** Cuántos ajustes del grupo están fuera del formato de la casa. */
export function ajustesActivos(g: GrupoFormato, valores: Record<string, string>): number {
  return (
    g.controles.filter((c) => (valores[c.clave] ?? '') !== '').length +
    g.finos.filter((f) => (valores[f.clave] ?? '') !== '').length
  )
}

/** Valor numérico actual de un ajuste fino («2.5cm» → 2.5; vacío → base). */
export function valorFino(f: Fino, valores: Record<string, string>): number {
  const crudo = (valores[f.clave] ?? '').replace('cm', '')
  const n = Number(crudo)
  return crudo !== '' && Number.isFinite(n) ? n : f.base
}

/** Nuevo valor serializado al pulsar ↑ (direccion 1) o ↓ (−1). */
export function moverFino(
  f: Fino,
  valores: Record<string, string>,
  direccion: 1 | -1,
): string {
  // «subir» el elemento puede significar RESTAR cm (firma/sello).
  const delta = f.subirResta ? -direccion * f.paso : direccion * f.paso
  const nuevo = Math.min(f.max, Math.max(f.min, valorFino(f, valores) + delta))
  const redondeado = Math.round(nuevo * 100) / 100
  return redondeado === f.base ? '' : `${redondeado}cm`
}

// --- Etiquetas que dicen QUÉ valor rige (Edison 2026-09-07: «debe
// indicarme cuál es el número o la opción actual o predeterminada») ----------

/** «1.15» → «1,15»; «10.5» → «10,5». */
export function coma(v: string): string {
  return v.replace('.', ',')
}

/** Tamaño de letra del DOCUMENTO en puntos (fmt_tamano o el estándar 11). */
export function tamanoDocumento(valores: Record<string, string>): string {
  return valores.fmt_tamano || '11'
}

/** Interlineado del DOCUMENTO (fmt_interlineado o el estándar 1,15). */
export function interlineadoDocumento(valores: Record<string, string>): string {
  return valores.fmt_interlineado || '1.15'
}

/** «1» → «1,0», «1.15» → «1,15»: siempre con decimal, como en las opciones. */
export function interlineadoLegible(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return coma(v)
  return Number.isInteger(n) ? `${n},0` : coma(v)
}

const HEREDA_TAMANO = new Set(['fmt_dest_tamano', 'fmt_copia_tamano', 'fmt_cuerpo_tamano'])
const HEREDA_INTERLINEADO = new Set(['fmt_dest_interlineado', 'fmt_copia_interlineado'])

/**
 * Etiqueta de una opción con el valor RESUELTO: «Igual al documento» pasa a
 * decir qué hereda («Igual al documento · 11 pt», «· 1,0»), para que se vea
 * el número que se está usando sin abrir otra cosa.
 */
export function etiquetaOpcion(
  clave: string,
  o: Opcion,
  valores: Record<string, string>,
): string {
  if (o.v !== '') return o.t
  if (HEREDA_TAMANO.has(clave)) return `${o.t} · ${coma(tamanoDocumento(valores))} pt`
  if (HEREDA_INTERLINEADO.has(clave)) return `${o.t} · ${interlineadoLegible(interlineadoDocumento(valores))}`
  return o.t
}

/** Texto del valor predeterminado de un control (para el pie del select). */
export function etiquetaPredeterminada(
  c: Control,
  valores: Record<string, string>,
  predeterminados: Record<string, string>,
): string {
  const v = predeterminados[c.clave] ?? ''
  const o = c.opciones.find((x) => x.v === v)
  return o ? etiquetaOpcion(c.clave, o, valores) : v
}

/** Etiqueta de un valor guardado que ya no está entre las opciones (formato
 *  anterior a los tamaños en puntos, o un valor puesto por API). */
export function etiquetaLegado(v: string): string {
  const LEGADO: Record<string, string> = {
    pequeno: 'Pequeña · formato anterior (≈ 10 pt)',
    'muy-pequeno': 'Muy pequeña · formato anterior (≈ 8 pt)',
    grande: 'Grande · formato anterior (≈ 12 pt)',
    fondo: 'Fijo al pie (valor anterior «fondo»)',
  }
  return LEGADO[v] ?? `${v} (valor guardado)`
}
