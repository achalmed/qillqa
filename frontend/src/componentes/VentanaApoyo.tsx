// Ventana de apoyo para la Mesa de Partes (2026-10-08, Edison): «una ventanilla superpuesta de
// datos para copiar y pegar… que quede visible mientras llenamos el formulario externo y
// permanezca abierta hasta que la cerremos».
//
// Es una ventana SIEMPRE ENCIMA (Document Picture-in-Picture de Chrome y Edge); en otro navegador,
// una ventana emergente pequeña. Lleva su propia raíz de React, así que sigue abierta aunque se
// cierre el diálogo o se cambie de pantalla en Qillqa. Datos: GET /api/mesa/documentos/{id}.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Typography } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import { api, descargarArchivo } from '../api'
import { tema } from '../theme'
import { PALETA } from '../paleta'
import { enlaceMarcador, textoParaAutocompletar } from '../autocompletar'

interface IngresoCuenta { id: string; tipo: string; usuario: string; tiene_clave: boolean }
interface Credencial { id: number; nombre: string; url: string; usuario: string; tiene_clave: boolean; notas: string; ingresos?: IngresoCuenta[] }
/** Las formas de ingreso de una cuenta (las de antes traían solo usuario y clave). */
const ingresosDe = (c: Credencial): IngresoCuenta[] => c.ingresos?.length ? c.ingresos : [{ id: '', tipo: 'Usuario', usuario: c.usuario, tiene_clave: c.tiene_clave }]
interface Destino {
  destino: { nombre: string; cargo: string; institucion: string }
  institucion: { id: number; nombre: string; siglas: string } | null
  mesa_partes: string
  mesa_de: string
}
export interface PaqueteMesa {
  documento: Record<string, string>
  titular: Record<string, string>
  destinos: Destino[]
  credenciales: Credencial[]
  firmado: { id: number; nombre: string } | null
}

/** Etiquetas de lo que se copia, en el orden en que suelen pedirlo los formularios. */
const DOCUMENTO: [string, string][] = [
  ['tipo', 'Tipo de documento'], ['numero', 'Número'], ['numero_simple', 'Número (solo cifras)'],
  ['asunto', 'Asunto'], ['fecha', 'Fecha'], ['folios', 'Folios'], ['destinatario', 'Destinatario'],
  ['cargo_destinatario', 'Cargo del destinatario'], ['institucion_destino', 'Institución de destino'], ['referencia', 'Referencia'],
]
export const TITULAR: [string, string][] = [
  ['nombre_completo', 'Nombre completo'], ['apellido_paterno', 'Apellido paterno'], ['apellido_materno', 'Apellido materno'],
  ['nombres', 'Nombres'], ['tipo_documento', 'Tipo de documento de identidad'], ['dni', 'DNI'], ['digito_verificador', 'Dígito verificador'],
  ['fecha_emision', 'Fecha de emisión'], ['fecha_caducidad', 'Fecha de caducidad'], ['fecha_nacimiento', 'Fecha de nacimiento'],
  ['ubigeo', 'Ubigeo'], ['sexo', 'Sexo'], ['cargo', 'Cargo'], ['entidad', 'Entidad'], ['ruc_entidad', 'RUC de la entidad'],
  ['direccion', 'Dirección'], ['distrito', 'Distrito'], ['provincia', 'Provincia'], ['departamento', 'Departamento'],
  ['correo', 'Correo'], ['celular', 'Celular'], ['telefono', 'Teléfono'],
]

/** Copiar en la ventana dada: la de apoyo tiene su propio portapapeles y foco. */
export async function copiarEn(win: Window, texto: string): Promise<void> {
  if (win.navigator.clipboard && win.isSecureContext) {
    try {
      await win.navigator.clipboard.writeText(texto)
      return
    } catch {
      /* sin foco o sin permiso: método clásico */
    }
  }
  const t = win.document.createElement('textarea')
  t.value = texto
  t.style.position = 'fixed'
  t.style.opacity = '0'
  win.document.body.appendChild(t)
  t.select()
  win.document.execCommand('copy')
  t.remove()
}

// Lo copiado queda en verde mientras dure la sesión (por documento), para saber qué ya se pegó.
const DocumentoCopiado = createContext(0)
const claveCopiados = (doc: number) => `sgdp-copiados-${doc}`
const leerCopiados = (doc: number): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(claveCopiados(doc)) || '[]')
  } catch {
    return []
  }
}

function Fila({ etiqueta, valor, alCopiar }: { etiqueta: string; valor: string; alCopiar: () => Promise<void> }) {
  const doc = useContext(DocumentoCopiado)
  const [hecho, setHecho] = useState(() => leerCopiados(doc).includes(etiqueta))
  const copiar = async () => {
    await alCopiar()
    setHecho(true)
    try {
      sessionStorage.setItem(claveCopiados(doc), JSON.stringify([...new Set([...leerCopiados(doc), etiqueta])]))
    } catch {
      /* sin almacenamiento: queda marcado solo en pantalla */
    }
  }
  return (
    <Box
      onClick={() => void copiar()}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.4, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: PALETA.superficieTenue } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.2 }}>{etiqueta}</Typography>
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.35, wordBreak: 'break-word' }}>{valor}</Typography>
      </Box>
      <Box
        component="span"
        aria-label={`Copiar ${etiqueta}`}
        sx={{ flexShrink: 0, fontSize: 12, px: 1, py: 0.4, borderRadius: 1, border: '1px solid', borderColor: hecho ? PALETA.exitoBorde : PALETA.borde, color: hecho ? PALETA.exito : PALETA.textoSecundario, bgcolor: hecho ? PALETA.exitoFondo : PALETA.superficie }}
      >
        {hecho ? 'Copiado' : 'Copiar'}
      </Box>
    </Box>
  )
}

/** Enlace del marcador «Autocompletar Qillqa» (se arrastra a la barra de marcadores). */
export function Marcador() {
  const ref = useRef<HTMLAnchorElement>(null)
  // Por ref y no por href: React bloquea los href «javascript:».
  useEffect(() => {
    ref.current?.setAttribute('href', enlaceMarcador())
  }, [])
  return (
    <Box
      component="a"
      ref={ref}
      onClick={(e: React.MouseEvent) => e.preventDefault()}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.5, borderRadius: 1, border: '1px dashed', borderColor: 'secondary.main', color: 'secondary.dark', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'grab' }}
    >
      <AutoFixHighOutlinedIcon sx={{ fontSize: 16 }} /> Autocompletar Qillqa
    </Box>
  )
}

export function PanelApoyo({ documentoId, win }: { documentoId: number; win: Window }) {
  const [p, setP] = useState<PaqueteMesa | null>(null)
  const [error, setError] = useState('')
  const [conAcceso, setConAcceso] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(() => {
    setError('')
    api<PaqueteMesa>(`/api/mesa/documentos/${documentoId}`).then(setP).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [documentoId])
  useEffect(cargar, [cargar])
  useEffect(() => {
    if (p) win.document.title = `Mesa de partes · ${p.documento.numero}`
  }, [p, win])

  const decir = (t: string) => {
    setAviso(t)
    setTimeout(() => setAviso(''), 4000)
  }
  const copiar = (texto: string) => copiarEn(win, texto)
  const revelar = async (c: Credencial, i?: IngresoCuenta) =>
    (await api<{ clave: string }>(`/api/contrasenas/${c.id}/revelar?accion=copiar&ingreso=${encodeURIComponent(i?.id ?? '')}`, { method: 'POST' })).clave

  const preparar = async () => {
    if (!p) return
    const datos: Record<string, string> = { ...p.titular, ...p.documento, entidad: p.titular.entidad, cargo: p.titular.cargo }
    const c = p.credenciales[0]
    if (conAcceso && c) {
      datos.usuario = c.usuario
      if (c.tiene_clave) datos.clave = await revelar(c)
    }
    await copiar(textoParaAutocompletar(datos))
    decir('Listo: en la página de la mesa de partes, pulse el marcador «Autocompletar Qillqa».')
  }

  const abrirUbicacion = async () => {
    try {
      await api(`/api/mesa/documentos/${documentoId}/abrir-ubicacion`, { method: 'POST' })
      decir('Carpeta abierta en la computadora del sistema.')
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo abrir la carpeta.')
    }
  }

  if (error) return <Alert severity="error" sx={{ m: 1 }} action={<Button onClick={cargar}>Reintentar</Button>}>{error}</Alert>
  if (!p) return <Box sx={{ display: 'grid', placeItems: 'center', height: '60vh' }}><CircularProgress /></Box>
  const t = p.titular
  // Mismo estilo que el panel de la extensión (2026-10-08, Edison: «limpio, con su botón Copiar;
  // agrupado en tarjetas sutiles; todo a la vista»): el acceso primero, luego documento y remitente.
  return (
    <DocumentoCopiado.Provider value={documentoId}>
    <Box sx={{ pb: 3, bgcolor: PALETA.superficie, minHeight: '100vh' }}>
      <Box sx={{ px: 2, py: 1.25, bgcolor: PALETA.superficie, color: PALETA.texto, borderBottom: `1px solid ${PALETA.borde}` }}>
        <Typography sx={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: PALETA.textoTenue }}>Qillqa · Mesa de partes</Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{p.documento.numero}</Typography>
      </Box>
      <Box sx={{ p: 1.25, display: 'grid', gap: 1.25 }}>
        {aviso && <Alert severity="info" sx={{ py: 0 }}>{aviso}</Alert>}

        {p.credenciales.map((c) => (
          <Tarjeta key={c.id} titulo="Acceso a la mesa" sub={c.notas?.split('\n')[0] || c.nombre}>
            {ingresosDe(c).map((i) => (
              <Box key={i.id || 'unico'}>
                {i.usuario && <Fila etiqueta={i.tipo} valor={i.usuario} alCopiar={() => copiar(i.usuario)} />}
                {i.tiene_clave && <Fila etiqueta="Contraseña" valor="••••••••" alCopiar={async () => copiar(await revelar(c, i))} />}
              </Box>
            ))}
            {p.destinos.filter((d) => d.mesa_partes).slice(0, 1).map((d) => (
              <Button key={d.mesa_partes} fullWidth size="small" variant="contained" startIcon={<OpenInNewIcon />} sx={{ mt: 0.75 }} onClick={() => window.open(d.mesa_partes, '_blank', 'noopener')}>
                Abrir la mesa de partes
              </Button>
            ))}
          </Tarjeta>
        ))}

        <Tarjeta titulo="Documento">
          {DOCUMENTO.filter(([k]) => p.documento[k]).map(([k, e]) => (
            <Fila key={k} etiqueta={e} valor={p.documento[k]} alCopiar={() => copiar(p.documento[k])} />
          ))}
        </Tarjeta>

        <Tarjeta titulo="Remitente">
          {TITULAR.filter(([k]) => t[k]).map(([k, e]) => (
            <Fila key={k} etiqueta={e} valor={t[k]} alCopiar={() => copiar(t[k])} />
          ))}
          {!t.dni && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Faltan los datos del titular (Directorio → Mesas de partes).</Typography>}
        </Tarjeta>

        <Tarjeta titulo="Archivo para adjuntar" sub={p.firmado ? p.firmado.nombre : 'Aún no se subió el firmado.'}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {p.firmado && (
              <Button size="small" variant="outlined" startIcon={<DownloadOutlinedIcon />} sx={{ flex: 1 }} onClick={() => void descargarArchivo(`/api/documentos/${documentoId}/adjuntos/${p.firmado!.id}`, p.firmado!.nombre)}>
                Descargar
              </Button>
            )}
            <Button size="small" variant="outlined" startIcon={<FolderOpenOutlinedIcon />} sx={{ flex: 1 }} onClick={() => void abrirUbicacion()}>Ubicación</Button>
          </Box>
        </Tarjeta>

        <Plegable titulo="Autocompletar con el marcador">
          <Button size="small" variant="contained" startIcon={<AutoFixHighOutlinedIcon />} onClick={() => void preparar()}>Preparar autocompletado</Button>
          {p.credenciales.length > 0 && (
            <FormControlLabel
              sx={{ display: 'flex', ml: 0, mt: 0.5 }}
              control={<Checkbox size="small" checked={conAcceso} onChange={(e) => setConAcceso(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 12.5 }}>Incluir usuario y contraseña</Typography>}
            />
          )}
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
            En la mesa de partes, pulse el marcador <Marcador />. Con la extensión de Qillqa no hace falta: todo aparece dentro de la mesa.
          </Typography>
        </Plegable>
      </Box>
    </Box>
    </DocumentoCopiado.Provider>
  )
}

function Tarjeta({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: `1px solid ${PALETA.borde}`, borderRadius: 3, px: 0.75, py: 0.75 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: PALETA.dorado }}>{titulo}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 0.5 }}>{sub}</Typography>}
      {children}
    </Box>
  )
}

function Plegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const hijos = Array.isArray(children) ? children.flat().filter(Boolean) : children
  if (Array.isArray(hijos) && !hijos.length) return null
  return (
    <Box sx={{ borderTop: `1px solid ${PALETA.borde}`, mt: 0.75, pt: 0.5 }}>
      <Button size="small" onClick={() => setAbierto((v) => !v)} sx={{ px: 0.5, fontSize: 12.5 }}>{abierto ? '▾' : '▸'} {titulo}</Button>
      {abierto && <Box>{children}</Box>}
    </Box>
  )
}

// --- La ventana ---------------------------------------------------------------------------

interface DocumentPiP {
  requestWindow: (op: { width: number; height: number }) => Promise<Window>
}

let ventana: Window | null = null
let raiz: Root | null = null

function montar(win: Window, documentoId: number) {
  const doc = win.document
  doc.title = 'Mesa de partes · Qillqa'
  // Fuentes y hojas de estilo de Qillqa (las de MUI las inserta emotion en esta ventana).
  document.querySelectorAll('link[rel="stylesheet"], style:not([data-emotion])').forEach((n) => doc.head.appendChild(n.cloneNode(true)))
  doc.body.style.margin = '0'
  const contenedor = doc.createElement('div')
  doc.body.appendChild(contenedor)
  const cache = createCache({ key: 'apoyo', container: doc.head })
  raiz = createRoot(contenedor)
  raiz.render(
    <CacheProvider value={cache}>
      <ThemeProvider theme={tema}>
        <CssBaseline />
        <PanelApoyo key={documentoId} documentoId={documentoId} win={win} />
      </ThemeProvider>
    </CacheProvider>,
  )
  win.addEventListener('pagehide', () => {
    raiz?.unmount()
    raiz = null
    ventana = null
  })
}

/** Abre (o actualiza) la ventana de apoyo de un documento. Debe llamarse desde un clic. */
export async function abrirVentanaApoyo(documentoId: number): Promise<void> {
  if (ventana && !ventana.closed) {
    // Ya abierta: cambia de documento.
    raiz?.render(
      <CacheProvider value={createCache({ key: 'apoyo', container: ventana.document.head })}>
        <ThemeProvider theme={tema}>
          <CssBaseline />
          <PanelApoyo key={documentoId} documentoId={documentoId} win={ventana} />
        </ThemeProvider>
      </CacheProvider>,
    )
    ventana.focus()
    return
  }
  const pip = (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture
  let win: Window | null = null
  if (pip) {
    try {
      win = await pip.requestWindow({ width: 400, height: 720 })
    } catch {
      win = null
    }
  }
  // Sin «siempre encima» (Firefox, Safari): una ventana emergente pequeña al lado.
  win ??= window.open('', 'sgdp-apoyo-mesa', 'popup,width=420,height=760')
  if (!win) throw new Error('El navegador bloqueó la ventana: permita las ventanas emergentes de este sitio.')
  ventana = win
  montar(win, documentoId)
}
