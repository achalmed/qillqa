/**
 * PRESENCIA EN LOS FORMULARIOS (Edison 2026-10-05: «no veo la etiqueta con el
 * nombre cuando edito en simultáneo, como en Google Docs; que se vea en todos
 * los formularios: semana de representación, proyectos de ley y documentos»).
 *
 * Cada página abre una SALA en el servidor de edición simultánea
 * (`sala:sr:<id>`, `sala:pl:<id>`, `sala:doc:<id>`): no guarda nada, solo
 * reparte por awareness de Yjs quién está y en qué campo tiene el cursor. Cada
 * campo envuelto en <ConPresencia clave="…"> anuncia el foco y muestra encima
 * la etiqueta con el nombre y el color de quien lo está editando (el mismo
 * color de su cursor en el texto compartido).
 *
 * Sin servidor de colaboración, simplemente no aparecen etiquetas: el
 * formulario funciona igual.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import { colorDe } from './textoCompartido'
import { PALETA } from '../paleta'

interface Persona {
  name: string
  color: string
  campo: string | null
}

interface Sala {
  /** Quiénes (otros) están en cada campo. */
  porCampo: Map<string, Persona[]>
  /** Todos los demás que tienen la página abierta. */
  presentes: Persona[]
  enfocar: (campo: string | null) => void
}

const SalaContexto = createContext<Sala | null>(null)

const urlColab = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/colab`

/** Abre la sala de presencia de una página (null = sin sala). */
export function useSala(nombre: string | null): Sala {
  const [otros, setOtros] = useState<Persona[]>([])
  const proveedor = useRef<HocuspocusProvider | null>(null)
  const yo = localStorage.getItem('sgdp_nombre') ?? 'Yo'

  useEffect(() => {
    if (!nombre) return
    const doc = new Y.Doc()
    const p = new HocuspocusProvider({
      url: urlColab(),
      name: nombre,
      document: doc,
      token: localStorage.getItem('sgdp_token') ?? '',
    })
    proveedor.current = p
    const aw = p.awareness
    aw?.setLocalStateField('user', { name: yo, color: colorDe(yo) })
    aw?.setLocalStateField('campo', null)
    const ver = () => {
      const lista: Persona[] = []
      aw?.getStates().forEach((st, id) => {
        const u = (st as { user?: { name: string; color: string }; campo?: string | null })
        if (id !== aw.clientID && u.user?.name) lista.push({ ...u.user, campo: u.campo ?? null })
      })
      setOtros(lista)
    }
    aw?.on('change', ver)
    return () => {
      aw?.off('change', ver)
      proveedor.current = null
      p.destroy()
      doc.destroy()
      setOtros([])
    }
  }, [nombre, yo])

  return useMemo(() => {
    const porCampo = new Map<string, Persona[]>()
    otros.forEach((o) => {
      if (o.campo) porCampo.set(o.campo, [...(porCampo.get(o.campo) ?? []), o])
    })
    return {
      porCampo,
      presentes: otros,
      enfocar: (campo: string | null) => proveedor.current?.awareness?.setLocalStateField('campo', campo),
    }
  }, [otros])
}

/** Pone la sala a disposición de los campos de la página. */
export function ProveedorSala({ sala, children }: { sala: Sala; children: ReactNode }) {
  return <SalaContexto.Provider value={sala}>{children}</SalaContexto.Provider>
}

/** «María Quispe Rojas» → «María Quispe»: nombre y primer apellido, como las
 *  iniciales del equipo (EquipoEnLinea.tsx). */
const nombreCorto = (n: string) => {
  const partes = n.split(/\s+/).filter(Boolean)
  return partes.length >= 3 ? `${partes[0]} ${partes[partes.length - 2]}` : partes.join(' ')
}

/** Etiquetas de nombre, del color del cursor de cada persona. */
export function Etiquetas({ personas, sx }: { personas: Persona[]; sx?: object }) {
  if (!personas.length) return null
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pointerEvents: 'none', ...sx }}>
      {personas.map((p, i) => (
        <Box
          key={`${p.name}-${i}`}
          component="span"
          sx={{
            bgcolor: p.color, color: '#fff', fontSize: 11, fontWeight: 650, lineHeight: 1.5,
            px: 0.75, borderRadius: '4px 4px 4px 0', whiteSpace: 'nowrap', boxShadow: PALETA.sombra,
          }}
        >
          {nombreCorto(p.name)}
        </Box>
      ))}
    </Box>
  )
}

/**
 * Envuelve un campo (o un grupo de campos): anuncia cuándo esta persona tiene
 * el cursor dentro y, si otra lo tiene, lo enmarca con su color y pone su
 * nombre encima. Sin sala (fuera de un ProveedorSala), deja el campo tal cual.
 */
export function ConPresencia({ clave, children, sx }: {
  clave: string
  children: ReactNode
  /** Estilos del envoltorio: dentro de un contenedor flexible de alto fijo
   *  (el editor de una parte en tres columnas) debe seguir la cadena flex, o
   *  el contenido se desborda y tapa lo que va debajo. */
  sx?: object
}) {
  const sala = useContext(SalaContexto)
  if (!sala) return <>{children}</>
  const aqui = sala.porCampo.get(clave) ?? []
  const color = aqui[0]?.color
  return (
    <Box
      onFocusCapture={() => sala.enfocar(clave)}
      onBlurCapture={(e) => {
        // Solo al salir del grupo, no al pasar de un campo a otro dentro de él.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) sala.enfocar(null)
      }}
      sx={{
        position: 'relative',
        borderRadius: 1.5,
        ...sx,
        transition: 'box-shadow .2s',
        ...(color ? { boxShadow: `0 0 0 2px ${color}` } : {}),
      }}
    >
      {aqui.length > 0 && (
        <Tooltip title={`${aqui.map((p) => p.name).join(', ')} está${aqui.length > 1 ? 'n' : ''} escribiendo aquí`}>
          <Box sx={{ position: 'absolute', top: -11, right: 8, zIndex: 3 }}>
            <Etiquetas personas={aqui} />
          </Box>
        </Tooltip>
      )}
      {children}
    </Box>
  )
}

/** ¿Quién más tiene abierta esta página? (para un resumen en la cabecera). */
export function usePresentes(): Persona[] {
  return useContext(SalaContexto)?.presentes ?? []
}
