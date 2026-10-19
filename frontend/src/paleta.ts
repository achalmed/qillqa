/**
 * PALETA de la interfaz — una sola fuente para el tema (theme.ts), los estados
 * del documento (estados.ts) y los colores que una pieza necesita a mano.
 *
 * Rediseño tipo macOS (Edison 2026-10-19, desde el celular: «que no sea tan
 * colorido, suave nada más»; ese día pidió dejar de lado la identidad visual
 * para la web y tomar los colores que el estilo necesite; la propuesta está en
 * docs/plataforma/rediseno-macos.md). Principios:
 *   - Fondo de ventana gris claro y superficies blancas; separadores finos.
 *   - Jerarquía por peso y tamaño: la tinta (casi negra) para lo principal,
 *     grises para lo secundario; ningún título de color.
 *   - UN acento, la tinta, en la acción principal y la selección; el azul del
 *     sistema solo en enlaces y en el foco de un campo.
 *   - Color solo cuando dice algo: arena = atención, salvia = hecho, rojo
 *     apagado = error; los estados como pastillas tenues (fondo al 10 %).
 *   - Las tarjetas de la agenda en pasteles desaturados (crema, piedra, salvia,
 *     taupe, arena), como la referencia; su hora y su punto en un tono oscuro
 *     del mismo matiz (FONDO_TIPO y COLOR_TIPO en componentes/tareas/tipos.ts).
 *
 * DOS PALETAS CON LOS MISMOS ROLES (2026-10-19, segunda fase): la clara y la oscura
 * (la referencia de Edison es oscura: fondo #1E1E20, tarjetas crema, arena y piedra
 * apagadas). `PALETA` es la del modo con que arrancó la página (`apariencia.ts`):
 * todo el frontend la usa como literal y por eso cambia entera, sin modo a medias.
 * En la oscura la «tinta» es casi blanca: la acción principal se rellena en claro y
 * su texto va en `sobrePrimario`; los tonos semánticos y de estado suben de luz para
 * leerse sobre el fondo. Quien pinta un relleno de tinta con texto fijo blanco rompe
 * la oscura: usa `sobrePrimario` (o `primary.contrastText`).
 *
 * Las CLAVES se conservan por compatibilidad (las usa todo el frontend): `guinda`
 * es hoy el primario tinta y `dorado`, el arena de atención. El vino y el
 * dorado de la marca siguen en el marco LaTeX y en los PDF, no en la web.
 * Todo texto sobre su fondo da ≥ 4,5:1 (WCAG AA). Los roles que el código tiñe con
 * un sufijo de alfa (`${PALETA.exito}1A`) son hex de seis cifras en las dos
 * (lo comprueba pruebas/apariencia.test.ts).
 */
// Con extensión: node --test (pruebas puras) resuelve así; Vite y tsc lo admiten (allowImportingTsExtensions).
import { modoActual, type Modo } from './apariencia.ts'

export const PALETA_CLARA = {
  // Primario: la tinta. Botones de acción principal, botón flotante, selección.
  guinda: '#1D1D1F',
  guindaSuave: 'rgba(29, 29, 31, 0.06)',
  primario: '#1D1D1F',
  primarioSuave: 'rgba(29, 29, 31, 0.06)',
  primarioClaro: '#48484A',
  primarioOscuro: '#000000',
  // El texto sobre un relleno del primario (botón de acción, pastilla llena).
  sobrePrimario: '#FFFFFF',
  // Acento del sistema: enlaces y foco (el azul de macOS), nunca como relleno.
  acento: '#0A6BDB',
  focoVelo: 'rgba(10, 107, 219, 0.14)',

  // Atención (arena): texto, iconos y puntos; `doradoLinea` solo líneas y puntos.
  dorado: '#9A7A3C',
  doradoLinea: '#C9AD79',

  // Neutrales de macOS: fondos, bordes y textos.
  fondo: '#F5F5F7',
  superficie: '#FFFFFF',
  superficieTenue: '#FAFAFA', // zonas de solo lectura, cajas internas
  superficieMedia: '#EFEFF1', // avatares, rellenos, pastillas neutras
  borde: '#E5E5EA', // hairline
  bordeFuerte: '#D1D1D6',
  texto: '#1D1D1F',
  textoSecundario: '#515154',
  textoTenue: '#86868B',
  apagado: '#AEAEB2', // puntos y líneas de lo pendiente
  // Velos de la tinta: al pasar (hover), lo elegido y lo pulsado.
  velo: 'rgba(29, 29, 31, 0.04)',
  veloMedio: 'rgba(29, 29, 31, 0.08)',
  veloFuerte: 'rgba(29, 29, 31, 0.12)',
  // La barra de arriba, translúcida sobre el fondo.
  barra: 'rgba(255, 255, 255, 0.92)',
  // Lo que se pinta encima de una foto o un PDF (visores): siempre oscuro, en ambos modos.
  oscuroVisor: '#1D1D1F',

  // Semánticos (apagados, nunca vivos).
  aviso: '#9A7A3C',
  avisoClaro: '#C9AD79',
  avisoOscuro: '#7C5F2A',
  avisoFondo: 'rgba(154, 122, 60, 0.09)',
  avisoBorde: 'rgba(154, 122, 60, 0.3)',
  error: '#B5484D',
  exito: '#4F8A5B',
  exitoFondo: 'rgba(79, 138, 91, 0.09)',
  exitoBorde: 'rgba(79, 138, 91, 0.3)',
  info: '#5B7DB1',
  secundario: '#515154',
  // El resaltador del editor (ayuda de revisión) y el tramo comentado.
  resaltado: 'rgba(201, 173, 121, 0.35)',
  comentarioFondo: 'rgba(91, 125, 177, 0.12)',
  comentarioLinea: 'rgba(91, 125, 177, 0.55)',

  // Sombras: una sola, muy suave, para lo que flota (menús, diálogos, tarjetas al pasar).
  sombra: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06)',
  sombraFlotante: '0 2px 6px rgba(0, 0, 0, 0.08), 0 12px 32px rgba(0, 0, 0, 0.12)',

  // Estados del documento (ver estados.ts): un tono apagado cada uno.
  borrador: '#86868B', // gris
  enRevision: '#5B7DB1', // azul apagado
  observado: '#9A7A3C', // arena (el aviso)
  aprobado: '#4F8A8B', // verde azulado apagado, listo para la firma
  firmado: '#4A5C7A', // pizarra
  enviado: '#4F8A5B', // salvia
  observadoPosterior: '#B5484D', // rojo apagado
  archivado: '#515154', // gris oscuro
}

export type Paleta = { [K in keyof typeof PALETA_CLARA]: string }

/** La oscura: fondo #1E1E20 como la referencia; los mismos roles, subidos de luz. */
export const PALETA_OSCURA: Paleta = {
  guinda: '#F5F5F7',
  guindaSuave: 'rgba(245, 245, 247, 0.08)',
  primario: '#F5F5F7',
  primarioSuave: 'rgba(245, 245, 247, 0.08)',
  primarioClaro: '#FFFFFF',
  primarioOscuro: '#D1D1D6',
  sobrePrimario: '#1D1D1F',
  acento: '#5AA2FF',
  focoVelo: 'rgba(90, 162, 255, 0.22)',

  dorado: '#CFAF6E',
  doradoLinea: '#8F7A4E',

  fondo: '#1E1E20',
  superficie: '#2A2A2D',
  superficieTenue: '#242426',
  superficieMedia: '#3A3A3E',
  borde: '#38383B',
  bordeFuerte: '#4A4A4F',
  texto: '#F5F5F7',
  textoSecundario: '#B4B4B9',
  textoTenue: '#98989D',
  apagado: '#636366',
  velo: 'rgba(245, 245, 247, 0.06)',
  veloMedio: 'rgba(245, 245, 247, 0.12)',
  veloFuerte: 'rgba(245, 245, 247, 0.18)',
  barra: 'rgba(30, 30, 32, 0.88)',
  oscuroVisor: '#111113',

  aviso: '#CFAF6E',
  avisoClaro: '#8F7A4E',
  avisoOscuro: '#E0C58A',
  avisoFondo: 'rgba(207, 175, 110, 0.12)',
  avisoBorde: 'rgba(207, 175, 110, 0.35)',
  error: '#E08287',
  exito: '#86BD92',
  exitoFondo: 'rgba(134, 189, 146, 0.12)',
  exitoBorde: 'rgba(134, 189, 146, 0.35)',
  info: '#8FAEE0',
  secundario: '#B4B4B9',
  resaltado: 'rgba(207, 175, 110, 0.3)',
  comentarioFondo: 'rgba(143, 174, 224, 0.16)',
  comentarioLinea: 'rgba(143, 174, 224, 0.6)',

  sombra: '0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.4)',
  sombraFlotante: '0 2px 6px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.55)',

  borrador: '#98989D',
  enRevision: '#8FAEE0',
  observado: '#CFAF6E',
  aprobado: '#86BDBE',
  firmado: '#A3B5D2',
  enviado: '#86BD92',
  observadoPosterior: '#E08287',
  archivado: '#B4B4B9',
}

/** El modo con que arrancó esta página; `PALETA` es su paleta. */
export const MODO: Modo = modoActual()
export const PALETA: Paleta = MODO === 'oscuro' ? PALETA_OSCURA : PALETA_CLARA
