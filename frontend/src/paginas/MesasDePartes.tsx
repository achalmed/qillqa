// Datos para las mesas de partes (2026-10-08, Edison): los datos del titular, ESTRUCTURADOS
// (apellido paterno, materno, nombres, DNI, fechas…), y la extensión de Qillqa que los muestra
// dentro de la página de la mesa. Los usuarios y claves viven en el módulo Contraseñas
// (paginas/Contrasenas.tsx). Todo el equipo menos el invitado ve y copia; solo el
// administrador edita.
import { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, LinearProgress, TextField, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined'
import Marco from '../componentes/Marco'
import { api } from '../api'
import { extensionInstalada } from '../mesaExtension'
import { InstalarExtension } from '../componentes/InstalarExtension'
import { esAdmin } from '../navegacion'
import { copiarEn, Marcador, TITULAR } from '../componentes/VentanaApoyo'

// El nombre completo se arma solo: no se edita.
const CAMPOS_TITULAR = TITULAR.filter(([k]) => k !== 'nombre_completo')

function Titular({ admin, alAvisar }: { admin: boolean; alAvisar: (t: string, e?: boolean) => void }) {
  const [datos, setDatos] = useState<Record<string, string> | null>(null)
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    api<{ datos: Record<string, string> }>('/api/mesa/titular').then((r) => setDatos(r.datos)).catch((e) => alAvisar(e.message, true))
  }, [alAvisar])
  const guardar = async () => {
    try {
      const r = await api<{ datos: Record<string, string> }>('/api/mesa/titular', { method: 'PUT', body: JSON.stringify({ datos }) })
      setDatos(r.datos)
      setEditando(false)
      alAvisar('Datos del titular guardados.')
    } catch (e) {
      alAvisar(e instanceof Error ? e.message : 'No se pudo guardar.', true)
    }
  }
  if (!datos) return <LinearProgress />
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Datos del titular</Typography>
          {admin && !editando && <Button startIcon={<EditOutlinedIcon />} onClick={() => setEditando(true)}>Editar</Button>}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Para los formularios que piden los datos personales del remitente. Fechas como dd/mm/aaaa.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 1.25 }}>
          {CAMPOS_TITULAR.map(([k, etiqueta]) =>
            editando ? (
              <TextField key={k} size="small" label={etiqueta} value={datos[k] ?? ''} onChange={(e) => setDatos({ ...datos, [k]: e.target.value })} />
            ) : (
              <Box key={k} sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{etiqueta}</Typography>
                  <Typography sx={{ fontSize: 14, wordBreak: 'break-word' }}>{datos[k] || '—'}</Typography>
                </Box>
                {datos[k] && (
                  <IconButton size="small" aria-label={`Copiar ${etiqueta}`} onClick={() => void copiarEn(window, datos[k]).then(() => alAvisar(`${etiqueta} copiado.`))}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ),
          )}
        </Box>
        {editando && (
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button variant="contained" onClick={() => void guardar()}>Guardar</Button>
            <Button onClick={() => setEditando(false)}>Cancelar</Button>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

export default function MesasDePartes() {
  const admin = esAdmin()
  const instalada = extensionInstalada()
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null)
  const alAvisar = useCallback((texto: string, error = false) => {
    setAviso({ texto, error })
    if (!error) setTimeout(() => setAviso(null), 3000)
  }, [])
  return (
    <Marco modulo="directorio" titulo="Mesas de partes">
      <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'grid', gap: 2, maxWidth: 1100 }}>
        {aviso && <Alert severity={aviso.error ? 'error' : 'success'} onClose={() => setAviso(null)}>{aviso.texto}</Alert>}
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <ExtensionOutlinedIcon color="primary" />
              {/* `1 1 auto`: en el celular el chip baja a otra línea en vez de apretar el título. */}
              <Typography variant="h6" sx={{ flex: '1 1 auto', minWidth: 0 }}>Extensión de Qillqa para las mesas de partes</Typography>
              {instalada
                ? <Chip size="small" color="success" variant="outlined" label="Instalada en este navegador" />
                : <Chip size="small" variant="outlined" label="No instalada en este navegador" />}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Con ella, al pulsar «Abrir mesa de partes» en un documento, los datos aparecen solos dentro de la
              página de la mesa: autocompletar el formulario o el ingreso, copiar cada dato y adjuntar el firmado.
            </Typography>
            <InstalarExtension alError={(t) => alAvisar(t, true)} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Sin extensión (por ejemplo, en otra computadora): use «Ventana de apoyo» y este marcador, que se arrastra a la
              barra de marcadores: <Marcador />
            </Typography>
          </CardContent>
        </Card>
        <Titular admin={admin} alAvisar={alAvisar} />
        <Card variant="outlined">
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="h6">Usuarios y contraseñas de las mesas</Typography>
              <Typography variant="body2" color="text.secondary">Viven en el módulo Contraseñas, cifradas.</Typography>
            </Box>
            <Button variant="outlined" startIcon={<KeyOutlinedIcon />} component={RouterLink} to="/contrasenas">Abrir Contraseñas</Button>
          </CardContent>
        </Card>
      </Box>
    </Marco>
  )
}
