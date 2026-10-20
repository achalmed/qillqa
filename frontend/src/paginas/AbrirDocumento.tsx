import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { api } from '../api'
import Marco from '../componentes/Marco'
import ElegirModalidad from '../componentes/ElegirModalidad'
import { editableEnWord } from '../componentes/word/modelo'
import { guardarPreferencia, leerPreferencias, modalidadAlAbrir, type Modalidad } from '../preferencias'
import EditorDocumento from './EditorDocumento'
import VistaHeredada from './VistaHeredada'

// Decide qué interfaz mostrar: los documentos nacidos en la plataforma
// se editan con TipTap; los importados del archivo y los elaborados fuera
// del sistema (PDF de Word incorporado) se muestran en modo heredado: su
// contenido no se edita aquí, solo se consulta y se tramita.
// Modalidad (2026-10-19): un borrador del sistema que el Formato Word puede editar (sin número, sin
// firma en curso) se abre en el formulario o en el Formato Word según la preferencia de la cuenta
// (`?modalidad=` manda); sin preferencia, se pregunta. Lo demás va siempre al formulario o a la
// vista heredada.
export default function AbrirDocumento() {
  const { id } = useParams()
  const navegar = useNavigate()
  const [doc, setDoc] = useState<{ origen: string; numero: number | null; firma_en_curso?: boolean } | null>(null)
  const [modalidad, setModalidad] = useState<Modalidad | null>(null)

  useEffect(() => {
    setDoc(null)
    setModalidad(null)
    let vivo = true
    Promise.all([
      api<{ origen: string; numero: number | null; firma_en_curso?: boolean }>(`/api/documentos/${id}`).catch(() => ({ origen: 'sgdp', numero: null })),
      leerPreferencias(),
    ]).then(([d, pr]) => {
      if (!vivo) return
      setDoc(d)
      const enWord = (d.origen ?? 'sgdp') === 'sgdp' && editableEnWord(d)
      setModalidad(enWord ? modalidadAlAbrir(pr.modalidad_documentos, new URLSearchParams(window.location.search)) : 'formulario')
    })
    return () => { vivo = false }
  }, [id])
  useEffect(() => {
    if (modalidad === 'word') navegar(`/documentos/word?doc=${id}`, { replace: true })
  }, [modalidad, id, navegar])

  if (doc === null || modalidad === null || modalidad === 'word' || modalidad === '') {
    // Con la carcasa ya puesta: el editor o la vista heredada entran sin que
    // la barra parpadee.
    return (
      <Marco modulo="documentos" volver="/documentos" sinBarraInferior>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
        <ElegirModalidad abierto={modalidad === ''} modulo="documentos" alElegir={(m, recordar) => { if (recordar) void guardarPreferencia('modalidad_documentos', m); setModalidad(m) }} />
      </Marco>
    )
  }
  return doc.origen === 'framework' || doc.origen === 'manual' ? <VistaHeredada /> : <EditorDocumento />
}
