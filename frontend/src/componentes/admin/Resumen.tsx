/**
 * ADMINISTRACIÓN → RESUMEN (2026-10-18): lo que pide atención y el estado del sistema en una mirada.
 * Cada cifra lleva a su sección; lo pendiente va primero y con un punto arena junto al rótulo
 * (2026-10-19: sin caja teñida ni cifra en color, rediseño tipo macOS).
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { api } from '../../api'
import type { EstadoModulo } from '../../modulos'
import { PALETA } from '../../paleta'
import type { SolicitudClave, UsuarioAdmin } from './Cuentas'

interface Cifra { clave: string; valor: string; rotulo: string; detalle?: string; aviso?: boolean; seccion: string }

function Ficha({ c, alIr }: { c: Cifra; alIr: (seccion: string) => void }) {
  return (
    <ButtonBase
      onClick={() => alIr(c.seccion)}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left',
        p: { xs: 1.5, sm: 2 }, borderRadius: 2, border: '1px solid',
        borderColor: PALETA.borde, bgcolor: PALETA.superficie,
        '&:hover': { borderColor: PALETA.bordeFuerte }, minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 600, lineHeight: 1.1, color: PALETA.texto }}>
        {c.valor}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {c.aviso && <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: PALETA.aviso, flexShrink: 0 }} />}
        {c.rotulo}
      </Typography>
      {c.detalle && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: 'anywhere' }}>{c.detalle}</Typography>
      )}
    </ButtonBase>
  )
}

export default function Resumen({ usuarios, solicitudes, modulos, alIr }: {
  usuarios: UsuarioAdmin[]
  solicitudes: SolicitudClave[]
  modulos: EstadoModulo[] | null
  alIr: (seccion: string) => void
}) {
  const [aviso, setAviso] = useState<string | null | undefined>(undefined)
  const [reglas, setReglas] = useState<{ activas: number; total: number } | null>(null)
  useEffect(() => {
    api<{ anuncio: { texto: string } | null }>('/api/anuncios/vigente').then((r) => setAviso(r.anuncio?.texto ?? null)).catch(() => setAviso(undefined))
    api<{ reglas: { activa: boolean }[] }>('/api/reglas')
      .then((r) => setReglas({ activas: r.reglas.filter((x) => x.activa).length, total: r.reglas.length }))
      .catch(() => setReglas(null))
  }, [])

  const activas = usuarios.filter((u) => u.activo)
  const temporales = activas.filter((u) => u.debe_cambiar_clave).length
  const datos = activas.filter((u) => u.datos_pendientes).length
  const apagados = (modulos ?? []).filter((m) => !m.efectivo)

  const cifras: Cifra[] = [
    ...(solicitudes.length ? [{ clave: 'olvido', valor: String(solicitudes.length), rotulo: 'Olvidaron su contraseña', detalle: solicitudes.map((s) => s.nombre_usuario).join(', '), aviso: true, seccion: 'cuentas' }] : []),
    { clave: 'cuentas', valor: String(activas.length), rotulo: 'Cuentas activas', detalle: temporales ? `${temporales} con clave temporal` : 'Todas con su clave', seccion: 'cuentas' },
    { clave: 'datos', valor: String(datos), rotulo: 'Datos pendientes', detalle: datos ? 'Los confirmarán al entrar' : 'Nadie pendiente', aviso: datos > 0, seccion: 'cuentas' },
    ...(modulos ? [{ clave: 'modulos', valor: String(modulos.length - apagados.length), rotulo: `Módulos encendidos de ${modulos.length}`, detalle: apagados.length ? `Apagados: ${apagados.map((m) => m.nombre).join(', ')}` : 'Todos encendidos', seccion: 'modulos' }] : []),
    ...(aviso !== undefined ? [{ clave: 'aviso', valor: aviso ? '1' : '0', rotulo: 'Aviso a todos', detalle: aviso ? `«${aviso}»` : 'Ninguno vigente', seccion: 'avisos' }] : []),
    ...(reglas ? [{ clave: 'reglas', valor: String(reglas.activas), rotulo: `Reglas activas de ${reglas.total}`, detalle: 'Lo que el sistema hace solo', seccion: 'reglas' }] : []),
  ]

  return (
    <Box sx={{ display: 'grid', gap: { xs: 1, sm: 1.5 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' } }}>
      {cifras.map((c) => <Ficha key={c.clave} c={c} alIr={alIr} />)}
    </Box>
  )
}
