/**
 * ADMINISTRACIÓN → MÓDULOS (2026-10-18): encender y apagar cada módulo (`PUT /api/modulos/{id}`,
 * backend/app/servicios/modulos.py). Apagado, sale del menú de todos, su página muestra el mensaje y su
 * API no responde; la mesa de partes virtual, además, deja de recibir trámites y muestra su mensaje al
 * público. Debajo, la configuración de la mesa virtual (AdminMesaVirtual).
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined'
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined'
import { api } from '../../api'
import { recordarModulos, type EstadoModulo } from '../../modulos'
import { PALETA } from '../../paleta'
import AdminMesaVirtual from '../AdminMesaVirtual'
import { confirmar } from '../Dialogos'
import { EstadoPieza } from '../Estilo'
import Tarjeta from './Tarjeta'

type Avisar = (tipo: 'success' | 'error', texto: string) => void

/** El mensaje de un módulo, con su propio «Guardar» (solo cuando cambió). */
function Mensaje({ m, rotulo, alGuardar }: { m: EstadoModulo; rotulo: string; alGuardar: (texto: string) => Promise<void> }) {
  const [texto, setTexto] = useState(m.mensaje)
  useEffect(() => setTexto(m.mensaje), [m.mensaje])
  const cambio = texto.trim() !== m.mensaje
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap', mt: 1 }}>
      <TextField
        size="small" multiline minRows={2} label={rotulo} value={texto} onChange={(e) => setTexto(e.target.value)}
        inputProps={{ maxLength: 400 }} placeholder={m.mensaje_por_omision} sx={{ flex: '1 1 260px' }}
        helperText={`${texto.length}/400 · vacío: el de siempre`}
      />
      <Button variant="outlined" disabled={!cambio} onClick={() => void alGuardar(texto.trim())} sx={{ mt: 0.25 }}>Guardar</Button>
    </Box>
  )
}

export default function Modulos({ lista, alCambiar, alAvisar }: { lista: EstadoModulo[] | null; alCambiar: (l: EstadoModulo[]) => void; alAvisar: Avisar }) {
  const cambiar = async (m: EstadoModulo, cuerpo: { activo?: boolean; mensaje?: string }, aviso: string) => {
    try {
      const nueva = await api<EstadoModulo[]>(`/api/modulos/${m.id}`, { method: 'PUT', body: JSON.stringify(cuerpo) })
      recordarModulos(nueva)
      alCambiar(nueva)
      alAvisar('success', aviso)
    } catch (e) {
      alAvisar('error', e instanceof Error ? e.message : 'No se pudo cambiar el módulo.')
    }
  }
  const alternar = async (m: EstadoModulo) => {
    if (m.activo) {
      const quien = m.publico ? 'deja de recibir y muestra su mensaje al público' : 'sale del menú de todos y su página muestra el mensaje'
      if (!(await confirmar(`¿Apagar «${m.nombre}»? ${quien[0].toUpperCase()}${quien.slice(1)}. Se enciende aquí mismo.`, { aceptar: 'Apagar', peligro: true }))) return
    }
    await cambiar(m, { activo: !m.activo }, `${m.nombre}: ${m.activo ? 'apagado' : 'encendido'}.`)
  }

  if (!lista) return null
  const mesa = lista.find((m) => m.id === 'mesa_virtual')
  const apagados = lista.filter((m) => !m.efectivo).length

  return (
    <>
      <Tarjeta
        icono={<ToggleOnOutlinedIcon />}
        titulo="Módulos"
        accion={<Typography variant="caption" color="text.secondary">{apagados ? `${apagados} apagado(s)` : 'Todos encendidos'}</Typography>}
        texto="Un módulo apagado sale del menú de todos, su página muestra el mensaje y deja de funcionar. Gestión documental, Directorio y Administración no se apagan."
      >
        {lista.map((m) => {
          const bloqueado = m.activo && !m.efectivo
          const requiere = lista.find((x) => x.id === m.requiere)
          return (
            <Box key={m.id} sx={{ py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14.5 }}>{m.nombre}</Typography>
                    {m.publico && <PublicOutlinedIcon titleAccess="Página pública" sx={{ fontSize: 16, color: PALETA.textoTenue }} />}
                    <EstadoPieza
                      estado={m.efectivo ? 'completo' : bloqueado ? 'parcial' : 'neutro'}
                      texto={m.efectivo ? 'Encendido' : bloqueado ? `Apagado: necesita ${requiere?.nombre ?? m.requiere}` : 'Apagado'}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" component="div">{m.que}</Typography>
                </Box>
                <Switch checked={m.activo} onChange={() => void alternar(m)} inputProps={{ 'aria-label': `${m.activo ? 'Apagar' : 'Encender'} ${m.nombre}` }} />
              </Box>
              {/* El mensaje se edita donde se ve: si el módulo está apagado, o siempre en la mesa pública. */}
              {(!m.efectivo || m.publico) && (
                <Mensaje
                  m={m}
                  rotulo={m.publico ? 'Mensaje al público cuando está apagada' : 'Mensaje mientras está apagado'}
                  alGuardar={(texto) => cambiar(m, { mensaje: texto }, 'Mensaje guardado.')}
                />
              )}
            </Box>
          )
        })}
      </Tarjeta>
      {mesa && (
        <Tarjeta
          icono={<PublicOutlinedIcon />}
          titulo="Mesa de partes virtual: configuración"
          accion={<EstadoPieza estado={mesa.efectivo ? 'completo' : 'neutro'} texto={mesa.efectivo ? 'Recibiendo' : 'Apagada'} />}
        >
          <AdminMesaVirtual />
        </Tarjeta>
      )}
    </>
  )
}
