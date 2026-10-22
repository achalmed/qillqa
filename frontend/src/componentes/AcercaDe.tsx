/**
 * La ventana «Acerca de Qillqa» (2026-10-19), como la de cualquier programa: el ícono, el nombre,
 * la versión, los enlaces al código y al sitio de la demo, el autor y la licencia, y las versiones
 * de lo que sostiene a la web y al servidor. «Copiar información» deja todo en texto para un reporte.
 * Datos y textos: src/acercaDe.ts. La monta una vez el Marco; la abren los menús con abrirAcercaDe().
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import GitHubIcon from '@mui/icons-material/GitHub'
import LanguageIcon from '@mui/icons-material/Language'
import { api } from '../api'
import { copiarTexto } from '../copiar'
import { avisoBreve } from '../avisoBreve'
import { QILLQA, alAbrirAcercaDe, enFuncionamiento, fechaHora, textoParaCopiar, versionConCommit, type FichaServidor } from '../acercaDe'

/** Una columna de componentes: el título, una línea de contexto y las filas nombre · versión. */
function Componentes({ titulo, detalle, filas }: { titulo: string; detalle: string; filas: [string, string | null][] }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>{titulo}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 0.75 }}>{detalle}</Typography>
      {filas.map(([nombre, version]) => (
        <Box key={nombre} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, py: 0.35, borderTop: '1px solid', borderColor: 'divider', fontSize: 13 }}>
          <Box component="span">{nombre}</Box>
          <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', color: version ? 'text.primary' : 'text.disabled', textAlign: 'right' }}>
            {version ?? 'no instalado'}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export default function AcercaDe() {
  const [abierta, setAbierta] = useState(false)
  const [servidor, setServidor] = useState<FichaServidor | null>(null)
  const [sinServidor, setSinServidor] = useState(false)
  useEffect(() => alAbrirAcercaDe(() => setAbierta(true)), [])
  useEffect(() => {
    if (!abierta) return
    setSinServidor(false)
    api<FichaServidor>('/api/sistema/acerca').then(setServidor).catch(() => setSinServidor(true))
  }, [abierta])

  const c = QILLQA.construccion
  const copiar = async () => {
    try {
      await copiarTexto(textoParaCopiar(servidor))
      avisoBreve('Información copiada.')
    } catch {
      avisoBreve('No se pudo copiar.')
    }
  }
  // Web y servidor de commits distintos: la API sigue con el código de antes hasta reiniciarla.
  const desfase = servidor?.commit && c.commit && servidor.commit !== c.commit

  return (
    <Dialog open={abierta} onClose={() => setAbierta(false)} maxWidth="sm" fullWidth aria-labelledby="acerca-titulo">
      <DialogContent sx={{ pt: { xs: 2, sm: 3.5 } }}>
        <Box sx={{ textAlign: 'center' }}>
          <Box component="img" src="/iconos/icono.svg" alt="" sx={{ width: 72, height: 72, display: 'block', mx: 'auto', mb: 1.25 }} />
          <Typography id="acerca-titulo" component="h2" sx={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.2 }}>{QILLQA.nombre}</Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{QILLQA.lema} · {QILLQA.significado}</Typography>
          <Typography sx={{ fontSize: 13, mt: 0.75, fontVariantNumeric: 'tabular-nums' }}>Versión {versionConCommit(c.version, c.commit)}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{enFuncionamiento()}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1, mt: 2 }}>
            <Button size="small" variant="outlined" startIcon={<GitHubIcon />} href={QILLQA.repositorio} target="_blank" rel="noopener">Código en GitHub</Button>
            <Button size="small" variant="outlined" startIcon={<LanguageIcon />} href={QILLQA.sitio} target="_blank" rel="noopener">Sitio de la demo</Button>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 2 }}>
            © {new Date(c.construida).getFullYear()} {QILLQA.autor} · Licencia {QILLQA.licencia}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 2, sm: 3 }, mt: 3 }}>
          <Componentes titulo="Web" detalle={`Construida el ${fechaHora(c.construida)}`} filas={c.bibliotecas} />
          {servidor ? (
            <Componentes
              titulo="Servidor"
              detalle={`${versionConCommit(servidor.version, servidor.commit)}, en marcha desde el ${fechaHora(servidor.arranque)}`}
              filas={servidor.componentes.map((x) => [x.nombre, x.version])}
            />
          ) : (
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Servidor</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{sinServidor ? 'Sin respuesta del servidor.' : 'Consultando…'}</Typography>
            </Box>
          )}
        </Box>
        {desfase && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5 }}>
            La web y el servidor vienen de versiones distintas del código: el servidor se pone al día al reiniciarlo.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button startIcon={<ContentCopyIcon />} onClick={() => void copiar()}>Copiar información</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={() => setAbierta(false)}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}
