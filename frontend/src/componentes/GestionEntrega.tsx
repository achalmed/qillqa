import { ACEPTA_FIRMADO, subirFirmado } from '../firmados'
import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DrawIcon from '@mui/icons-material/Draw'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'
import { api, subirArchivo, descargarArchivo } from '../api'
import { avisoSiCorresponde } from '../descargas'
import { etapaDe, type Etapa } from '../flujo'
import BotonPaso from './BotonPaso'
import FilaArchivo, { Vacio } from './FilaArchivo'
import { excedeLimite } from './Adjuntos'
import { confirmar } from './Dialogos'

// Adjunto de las categorías «firmado» / «recepcion» (constancia de entrega).
interface AdjEntrega {
  id: number
  nombre: string
  categoria: string
  etiqueta: string
}

// Deriva la lista de destinatarios de los campos con el MISMO criterio que el
// backend (bandeja `listar`): líneas «Nombre — Cargo» en destinatario_nombre,
// tomando el texto antes de « — ». Devuelve [] cuando hay un solo destinatario
// (o ninguno), lo que activa el modo de constancia única.
export function destinatariosDe(campos: Record<string, string> | undefined): string[] {
  return (campos?.destinatario_nombre || '')
    .split('\n')
    .map((l) => l.split(' — ')[0].trim())
    .filter(Boolean)
}

// Abre el selector de archivos y resuelve con los elegidos (sin montar un
// <input> permanente: cada acción crea el suyo, como en la bandeja).
function pedirArchivos(multiple = false, acepta = '.pdf,.jpg,.jpeg,.png'): Promise<File[]> {
  return new Promise((resolver) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = acepta
    input.multiple = multiple
    input.onchange = () => resolver(input.files ? Array.from(input.files) : [])
    input.click()
  })
}

/**
 * Gestión de la ENTREGA de un documento desde su propia vista interna: subir
 * el documento ya firmado y registrar las constancias de entrega (recepción).
 * Sirve para TODOS los tipos (se embebe tanto en el editor de plataforma como
 * en la vista heredada) y cubre el caso de un destinatario y el de varios
 * (oficio múltiple → una constancia por destinatario, con avance n/m).
 *
 * No requiere backend nuevo: usa `POST /api/documentos/{id}/adjuntos` con
 * categoria=firmado|recepcion y etiqueta=<destinatario>, que ya renombra el
 * archivo a la convención de la entidad.
 */
export default function GestionEntrega({
  documentoId,
  destinatarios,
  etapas,
  parte = 'ambas',
  compacto = false,
  alAvisar,
  alActualizar,
  alContar,
}: {
  /** Sin textos de vacío ni iconos: solo el botón (si falta) o las filas del
   *  archivo (si existe). Lo pide PanelArchivos, que ya rotula la pieza. */
  compacto?: boolean
  documentoId: string
  destinatarios: string[]
  /** Qué pintar: solo el firmado, solo los cargos de recepción, o ambos.
   *  PanelArchivos los pone en DOS secciones separadas (Edison 2026-09-05:
   *  «separar claramente los documentos firmados de los cargos»). */
  parte?: 'firmado' | 'recepcion' | 'ambas'
  // Ruta del proceso, para numerar «Subir firmado» (paso 4) y «Subir
  // constancia» (paso 6) igual que el resto del sistema (ver flujo.ts).
  etapas?: Etapa[]
  alAvisar?: (tipo: 'success' | 'error', texto: string) => void
  // Permite al contenedor (editor) refrescar su visor de firmado/constancias.
  alActualizar?: () => void
  // Informa el avance de la entrega para el encabezado de la sección que lo
  // contiene (PanelArchivos), sin repetir la consulta de adjuntos.
  alContar?: (r: { firmado: boolean; recepciones: number; requeridas: number }) => void
}) {
  const [adj, setAdj] = useState<AdjEntrega[]>([])
  const [ocupado, setOcupado] = useState('')

  const recargar = useCallback(() => {
    api<AdjEntrega[]>(`/api/documentos/${documentoId}/adjuntos`)
      .then((lista) => {
        const piezas = (lista || []).filter(
          (a) => a.categoria === 'firmado' || a.categoria === 'recepcion',
        )
        setAdj(piezas)
        alContar?.({
          firmado: piezas.some((a) => a.categoria === 'firmado'),
          recepciones: piezas.filter((a) => a.categoria === 'recepcion').length,
          requeridas: Math.max(1, destinatarios.length),
        })
      })
      .catch(() => setAdj([]))
  }, [documentoId, destinatarios.length, alContar])

  useEffect(recargar, [recargar])
  // Un cambio en otra parte (anexos, edición) puede anular la firma y pasar
  // los cargos a «versión anulada» (servicios/vigencia.py): se vuelve a leer.
  useEffect(() => {
    window.addEventListener('sgdp:adjuntos', recargar)
    return () => window.removeEventListener('sgdp:adjuntos', recargar)
  }, [recargar])

  const firmado = adj.find((a) => a.categoria === 'firmado') || null
  const recepciones = adj.filter((a) => a.categoria === 'recepcion')
  const multiple = destinatarios.length > 1

  const subirUno = async (
    categoria: 'firmado' | 'recepcion',
    etiqueta: string,
    file: File,
  ): Promise<{ envio_automatico?: boolean } | null> => {
    const fd = new FormData()
    fd.append('archivo', file)
    fd.append('categoria', categoria)
    if (etiqueta) fd.append('etiqueta', etiqueta)
    const ruta = `/api/documentos/${documentoId}/adjuntos`
    // El firmado pasa por la validación (firmados.ts); una constancia, no.
    return categoria === 'firmado'
      ? subirFirmado<{ envio_automatico?: boolean }>(ruta, fd)
      : subirArchivo<{ envio_automatico?: boolean }>(ruta, fd)
  }

  // Un solo archivo → una categoría (firmado o una constancia concreta).
  const elegirYSubir = async (categoria: 'firmado' | 'recepcion', etiqueta = '') => {
    const [file] = await pedirArchivos(false, categoria === 'firmado' ? ACEPTA_FIRMADO : undefined)
    if (!file) return
    const exceso = excedeLimite(file)
    if (exceso) {
      alAvisar?.('error', exceso)
      return
    }
    setOcupado(`${categoria}:${etiqueta}`)
    try {
      const r = await subirUno(categoria, etiqueta, file)
      if (r === null) return // el administrador no quiso forzar el firmado
      recargar()
      alActualizar?.()
      if (r?.envio_automatico) {
        alAvisar?.(
          'success',
          'El documento se marcó como «Enviado» automáticamente (firmado + constancias completas).',
        )
      } else {
        alAvisar?.(
          'success',
          categoria === 'firmado'
            ? 'Documento firmado registrado.'
            : `Constancia de entrega registrada${etiqueta ? ` — ${etiqueta}` : ''}.`,
        )
      }
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo subir el archivo.')
    } finally {
      setOcupado('')
    }
  }

  // Varios archivos de una vez → se asignan EN ORDEN a los destinatarios que
  // aún no tienen constancia (útil en oficios múltiples). Los que sobren se
  // suben sin destinatario (quedan como constancias extra).
  const elegirYSubirVarias = async () => {
    const files = await pedirArchivos(true)
    if (!files.length) return
    const pendientes = destinatarios.filter(
      (d) => !recepciones.some((r) => r.etiqueta === d),
    )
    setOcupado('varias')
    let auto = false
    try {
      for (let i = 0; i < files.length; i++) {
        const r = await subirUno('recepcion', pendientes[i] ?? '', files[i])
        if (r?.envio_automatico) auto = true
      }
      recargar()
      alActualizar?.()
      alAvisar?.(
        'success',
        auto
          ? `Se registraron ${files.length} constancia(s); el documento se marcó como «Enviado» automáticamente.`
          : `Se registraron ${files.length} constancia(s) de entrega.`,
      )
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudieron subir los archivos.')
    } finally {
      setOcupado('')
    }
  }

  const descargar = (a: AdjEntrega, comoNombre: string) => {
    descargarArchivo(`/api/documentos/${documentoId}/adjuntos/${a.id}`, comoNombre)
      .then((destino) => {
        const aviso = avisoSiCorresponde(destino, comoNombre)
        if (aviso) alAvisar?.('success', aviso)
      })
      .catch((e) => alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo descargar.'))
  }

  const eliminar = async (a: AdjEntrega, que: string) => {
    if (!(await confirmar(`¿Eliminar ${que}? Podrá volver a subirlo.`, { aceptar: 'Eliminar', peligro: true }))) return
    try {
      await api(`/api/documentos/${documentoId}/adjuntos/${a.id}`, { method: 'DELETE' })
      recargar()
      alActualizar?.()
    } catch (e) {
      alAvisar?.('error', e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  // Controles de una pieza ya subida: descargar + eliminar (reemplazar =
  // eliminar y volver a subir). `subir` pinta el botón de carga.
  const subir = (categoria: 'firmado' | 'recepcion', etiqueta: string, texto: string) => {
    // En modo compacto la FILA ya lleva el círculo del paso: el botón va sin
    // número para no repetirlo (Edison 2026-09-05).
    const paso = compacto ? null : etapaDe(etapas, categoria)
    return (
      <BotonPaso
        paso={paso}
        size="small"
        variant="outlined"
        startIcon={paso ? undefined : <UploadFileIcon fontSize="small" />}
        disabled={ocupado !== ''}
        onClick={() => elegirYSubir(categoria, etiqueta)}
        // En la tarjeta de la pieza (compacto), el botón general ocupa el ancho como una zona para
        // subir, con borde punteado; el «Subir» de cada destinatario sigue pequeño.
        fullWidth={compacto && !etiqueta}
        sx={compacto && !etiqueta ? { borderStyle: 'dashed', py: 1.1, '&:hover': { borderStyle: 'dashed' } } : undefined}
      >
        {texto}
      </BotonPaso>
    )
  }

  const n = recepciones.length
  const m = destinatarios.length

  const bloqueFirmado = (
    <Box>
      {firmado ? (
        <FilaArchivo
          hecho
          nombre={firmado.nombre}
          detalle={compacto ? undefined : 'Documento firmado'}
          alDescargar={() => descargar(firmado, firmado.nombre)}
          alEliminar={() => void eliminar(firmado, 'el documento firmado')}
        />
      ) : compacto ? (
        subir('firmado', '', 'Subir documento firmado')
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 0.75 }}>
          <DrawIcon fontSize="small" sx={{ color: 'text.disabled' }} />
          <Vacio>Todavía no se sube el documento firmado.</Vacio>
          <Box sx={{ flexGrow: 1 }} />
          {subir('firmado', '', 'Subir documento firmado')}
        </Box>
      )}
    </Box>
  )

  const bloqueRecepcion = !multiple ? (
    // Un solo destinatario: una constancia.
    recepciones[0] ? (
      <FilaArchivo
        hecho
        nombre={recepciones[0].nombre}
        detalle={compacto ? undefined : 'Cargo de recepción'}
        alDescargar={() => descargar(recepciones[0], recepciones[0].nombre)}
        alEliminar={() => void eliminar(recepciones[0], 'la constancia de entrega')}
      />
    ) : compacto ? (
      subir('recepcion', '', 'Subir cargo de recepción')
    ) : (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 0.75 }}>
        <MarkEmailReadOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        <Vacio>Todavía no hay cargo de recepción.</Vacio>
        <Box sx={{ flexGrow: 1 }} />
        {subir('recepcion', '', 'Subir cargo de recepción')}
      </Box>
    )
  ) : (
    // Varios destinatarios: una constancia por cada uno (seguimiento).
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
        <Button
          size="small"
          startIcon={<UploadFileIcon fontSize="small" />}
          disabled={ocupado !== '' || n >= m}
          onClick={elegirYSubirVarias}
        >
          Subir varias ({n}/{m})
        </Button>
      </Box>
      {destinatarios.map((dest) => {
        const c = recepciones.find((r) => r.etiqueta === dest)
        return c ? (
          <FilaArchivo
            key={dest}
            hecho
            nombre={dest}
            detalle={c.nombre}
            alDescargar={() => descargar(c, c.nombre)}
            alEliminar={() => void eliminar(c, `la constancia de «${dest}»`)}
          />
        ) : (
          <FilaArchivo
            key={dest}
            icono={<MarkEmailReadOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
            nombre={dest}
            detalle="Sin cargo todavía"
            extra={subir('recepcion', dest, 'Subir')}
          />
        )
      })}
      {/* Constancias sin destinatario reconocible (extras). */}
      {recepciones
        .filter((r) => !destinatarios.includes(r.etiqueta))
        .map((r) => (
          <FilaArchivo
            key={`extra-${r.id}`}
            hecho
            nombre={r.etiqueta || 'Constancia (sin destinatario)'}
            detalle={r.nombre}
            alDescargar={() => descargar(r, r.nombre)}
            alEliminar={() => void eliminar(r, 'la constancia')}
          />
        ))}
    </Box>
  )

  return (
    // El título y la explicación de qué va aquí los pone PanelArchivos, que es
    // quien agrupa y diferencia las clases de archivo (Edison 2026-09-05).
    <Box>
      {parte !== 'recepcion' && bloqueFirmado}
      {parte === 'ambas' && <Box sx={{ my: 1 }} />}
      {parte !== 'firmado' && bloqueRecepcion}
    </Box>
  )
}
