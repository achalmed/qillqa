/**
 * PARTES EDITABLES de un proyecto de ley (2026-10-19; Edison: «añadir, quitar, renombrar y reordenar
 * las partes de cada proyecto, con el mayor control posible»). Un solo gancho para las dos
 * modalidades —la pestaña Texto (`paginas/Proyecto.tsx`) y el Formato Word (`ProyectoWord.tsx`)—:
 * el menú «Añadir» (partes de la plantilla que faltan, o una parte nueva con nombre y grupo), el
 * menú ⋮ de cada parte (renombrar, subir, bajar, quitar) y el arrastre, todo contra la API
 * (`POST/DELETE /api/proyectos/{pid}/secciones[/{clave}]`, `PUT …/secciones-orden`). Reglas que la
 * API hace cumplir y aquí solo se reflejan: la clave no cambia; el título de la ley no se renombra
 * ni se quita; las obligatorias no se quitan; las partes fijas de la fórmula legal (las de la
 * plantilla) no se mueven; los grupos no se cruzan; quitar una parte con texto pide confirmación.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import RestoreIcon from '@mui/icons-material/Restore'
import { api, ErrorApi } from '../api'
import { confirmar, pedirTexto } from './Dialogos'
import { MenuAnidado } from './word/BarraWord'
import { SEPARADOR, type ItemMenu } from './word/menus'
import { esTitulo, moverA, puedeMover, type ParteBasica } from '../partesProyecto'

export type { ParteBasica }

interface Disponibles { plantilla: { clave: string; titulo: string; grupo: string }[]; grupos: { clave: string; nombre: string }[] }

export function usePartesProyecto({ pid, partes, recargar, avisar, soloLectura = false }: {
  pid: number
  partes: ParteBasica[]
  /** El proyecto cambió en el servidor: releerlo. */
  recargar: () => Promise<unknown> | void
  avisar: (tipo: 'success' | 'error' | 'info', texto: string) => void
  soloLectura?: boolean
}) {
  const [anclaAnadir, setAnclaAnadir] = useState<HTMLElement | null>(null)
  const [disponibles, setDisponibles] = useState<Disponibles | null>(null)
  const [nueva, setNueva] = useState<{ titulo: string; grupo: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const fallo = useCallback((e: unknown, texto: string) => avisar('error', e instanceof Error ? e.message : texto), [avisar])

  const abrirAnadir = useCallback((ancla: HTMLElement) => {
    setAnclaAnadir(ancla)
    api<Disponibles>(`/api/proyectos/${pid}/partes-disponibles`).then(setDisponibles).catch(() => setDisponibles({ plantilla: [], grupos: [] }))
  }, [pid])

  const restaurar = useCallback(async (clave: string) => {
    try {
      await api(`/api/proyectos/${pid}/secciones`, { method: 'POST', body: JSON.stringify({ plantilla: clave }) })
      await recargar()
      avisar('success', 'Parte restaurada (vacía).')
    } catch (e) { fallo(e, 'No se pudo restaurar la parte.') }
  }, [pid, recargar, avisar, fallo])

  const crear = useCallback(async () => {
    if (!nueva) return
    setGuardando(true)
    try {
      await api(`/api/proyectos/${pid}/secciones`, { method: 'POST', body: JSON.stringify({ titulo: nueva.titulo, grupo: nueva.grupo }) })
      setNueva(null)
      await recargar()
      avisar('success', `Parte «${nueva.titulo.trim()}» añadida.`)
    } catch (e) { fallo(e, 'No se pudo añadir la parte.') } finally { setGuardando(false) }
  }, [nueva, pid, recargar, avisar, fallo])

  const renombrar = useCallback(async (p: ParteBasica) => {
    const t = await pedirTexto('Nombre de la parte (así sale en el PDF; en las disposiciones, el bloque lo rotula la técnica legislativa):', { inicial: p.titulo, etiqueta: 'Nombre', aceptar: 'Renombrar' })
    if (t === null || !t.trim() || t.trim() === p.titulo) return
    try {
      await api(`/api/proyectos/${pid}/secciones/${p.clave}`, { method: 'PATCH', body: JSON.stringify({ titulo: t.trim() }) })
      await recargar()
      avisar('success', 'Parte renombrada.')
    } catch (e) { fallo(e, 'No se pudo renombrar.') }
  }, [pid, recargar, avisar, fallo])

  const quitar = useCallback(async (p: ParteBasica) => {
    const pedir = async (confirmado: boolean): Promise<void> => {
      try {
        await api(`/api/proyectos/${pid}/secciones/${p.clave}${confirmado ? '?confirmar=true' : ''}`, { method: 'DELETE' })
        await recargar()
        avisar('success', `Parte «${p.titulo}» quitada.`)
      } catch (e) {
        const detalle = e instanceof ErrorApi ? (e.detalle as { codigo?: string; palabras?: number } | undefined) : undefined
        if (e instanceof ErrorApi && e.estado === 409 && detalle?.codigo === 'parte_con_texto' && !confirmado) {
          const ok = await confirmar(`«${p.titulo}» tiene ${detalle.palabras} palabras. ¿Quitarla con su texto y sus versiones?`, { aceptar: 'Quitar', peligro: true })
          if (ok) await pedir(true)
          return
        }
        fallo(e, 'No se pudo quitar la parte.')
      }
    }
    if (!(await confirmar(`¿Quitar la parte «${p.titulo}»?${p.palabras ? ` Tiene ${p.palabras} palabras.` : ''}`, { aceptar: 'Quitar', peligro: true }))) return
    await pedir(Boolean(p.palabras))
  }, [pid, recargar, avisar, fallo])

  const ordenar = useCallback(async (claves: string[]) => {
    try {
      await api(`/api/proyectos/${pid}/secciones-orden`, { method: 'PUT', body: JSON.stringify({ claves }) })
      await recargar()
    } catch (e) { fallo(e, 'No se pudo reordenar.') }
  }, [pid, recargar, fallo])

  /** Mueve `clave` al lugar de `destino` (arrastre). */
  const mover = useCallback((clave: string, destino: string) => {
    if (!puedeMover(partes, clave, destino)) return
    void ordenar(moverA(partes, clave, destino))
  }, [partes, ordenar])

  const vecino = useCallback((p: ParteBasica, paso: -1 | 1): ParteBasica | undefined => {
    const i = partes.findIndex((x) => x.clave === p.clave)
    const v = partes[i + paso]
    return v && puedeMover(partes, p.clave, v.clave) && !v.fija ? v : undefined
  }, [partes])

  /** Los items del menú ⋮ de una parte. */
  const menuDe = useCallback((p: ParteBasica): ItemMenu[] => {
    if (soloLectura) return []
    const arriba = vecino(p, -1)
    const abajo = vecino(p, 1)
    const titulo = esTitulo(p)
    return [
      { texto: 'Renombrar', icono: <DriveFileRenameOutlineIcon fontSize="small" />, deshabilitado: titulo, accion: () => void renombrar(p) },
      { texto: 'Subir', icono: <ArrowUpwardIcon fontSize="small" />, deshabilitado: !arriba, accion: () => { if (arriba) void ordenar(moverA(partes, p.clave, arriba.clave)) } },
      { texto: 'Bajar', icono: <ArrowDownwardIcon fontSize="small" />, deshabilitado: !abajo, accion: () => { if (abajo) void ordenar(moverA(partes, p.clave, abajo.clave)) } },
      SEPARADOR,
      { texto: p.obligatoria || titulo ? 'Quitar (es obligatoria)' : 'Quitar', icono: <DeleteOutlineIcon fontSize="small" />, deshabilitado: p.obligatoria || titulo, accion: () => void quitar(p) },
    ]
  }, [soloLectura, vecino, renombrar, ordenar, partes, quitar])

  const itemsAnadir: ItemMenu[] = useMemo(() => {
    const pl = disponibles?.plantilla ?? []
    return [
      { texto: 'Parte nueva…', icono: <AddIcon fontSize="small" />, accion: () => setNueva({ titulo: '', grupo: 'exposicion' }) },
      ...(pl.length ? [SEPARADOR, ...pl.map((x) => ({ texto: x.titulo, icono: <RestoreIcon fontSize="small" />, accion: () => void restaurar(x.clave) }))] : []),
    ]
  }, [disponibles, restaurar])

  useEffect(() => { if (!anclaAnadir) setDisponibles(null) }, [anclaAnadir])

  const grupos = disponibles?.grupos ?? [{ clave: 'formula', nombre: 'Fórmula legal' }, { clave: 'exposicion', nombre: 'Exposición de motivos' }, { clave: 'final', nombre: 'Complementos' }]
  const elementos: ReactNode = (
    <>
      <MenuAnidado ancla={anclaAnadir} items={itemsAnadir} alCerrar={() => setAnclaAnadir(null)} titulo={disponibles && disponibles.plantilla.length ? 'Añadir o restaurar' : 'Añadir'} />
      <Dialog open={nueva !== null} onClose={() => setNueva(null)} fullWidth maxWidth="xs">
        <DialogTitle>Parte nueva</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField autoFocus size="small" label="Nombre (así sale en el PDF)" value={nueva?.titulo ?? ''} onChange={(e) => setNueva((n) => (n ? { ...n, titulo: e.target.value } : n))} onKeyDown={(e) => { if (e.key === 'Enter' && (nueva?.titulo.trim().length ?? 0) >= 3) void crear() }} />
          <TextField select size="small" label="Dónde va" value={nueva?.grupo ?? 'exposicion'} onChange={(e) => setNueva((n) => (n ? { ...n, grupo: e.target.value } : n))}>
            {grupos.map((g) => <MenuItem key={g.clave} value={g.clave}>{g.nombre}</MenuItem>)}
          </TextField>
          <Typography variant="caption" color="text.secondary">Nace vacía, al final de su grupo; luego se arrastra o se sube y baja desde ⋮. En la fórmula legal lleva artículos; en la exposición, su número de sección.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNueva(null)}>Cancelar</Button>
          <Button variant="contained" disabled={guardando || (nueva?.titulo.trim().length ?? 0) < 3} onClick={() => void crear()}>Añadir</Button>
        </DialogActions>
      </Dialog>
    </>
  )
  return { abrirAnadir, menuDe, mover, elementos }
}
